// 권한 시험(rls-check.ts)의 순수 판정 로직. 네트워크·파일을 쓰지 않아 Vitest로 시험한다 (tests/supabase/report.test.ts)

export interface Outcome {
  pass: boolean;
  /** true면 FAIL이 아니라 "시험 불가": 서버에 닿지 못했거나 인증이 거부돼 권한 여부를 판정하지 못했다. pass는 false다 */
  unverified?: boolean;
  detail: string;
}

export interface Row {
  id: string;
  label: string;
  expect: string;
  outcome: Outcome;
}

/** supabase-js 응답에서 판정에 필요한 부분만 */
export interface Res {
  data: unknown;
  error: { code?: string; message: string } | null;
  /** HTTP 상태. supabase-js는 네트워크 실패를 reject 대신 status 0, code ""인 error 응답으로 바꾼다 */
  status?: number;
}

/** PostgreSQL insufficient_privilege. 테이블 GRANT가 없을 때 대상 행 유무와 관계없이 이 코드가 난다 */
export const PERMISSION_DENIED = '42501';

export interface CheckEnv {
  url: string;
  key: string;
}

export const ENV_URL = 'VITE_SUPABASE_URL';
export const ENV_KEY = 'VITE_SUPABASE_PUBLISHABLE_KEY';

export function rowsOf(res: Res): unknown[] {
  return Array.isArray(res.data) ? res.data : [];
}

/**
 * 오류의 code·status만 적는다. message는 쓰지 않는다 (네트워크 오류 문구에 URL이 섞일 수 있고,
 * 키·URL·토큰 값은 표에 남기지 않는다)
 */
export function errText(res: Res): string {
  return `code ${res.error?.code || '없음'}, status ${res.status ?? '?'}`;
}

/** 서버가 응답하지 않았거나(네트워크) 인증이 거부돼(401·5xx) 권한 여부를 판정할 수 없는 오류 */
function cannotJudge(res: Res): boolean {
  const status = res.status;
  return status === 0 || status === 401 || (status !== undefined && status >= 500);
}

/**
 * 쓰기·접근 차단: 권한 거부(42501)일 때만 PASS.
 * 이 프로젝트는 anon·authenticated에 INSERT·UPDATE·DELETE GRANT를 주지 않으므로 대상 행이 없어도 42501이 난다.
 * 그 밖의 오류(제약 위반·테이블 미노출 등)는 FAIL, 네트워크·인증 오류는 시험 불가, 오류 없는 성공 응답(0행 포함)은 FAIL
 */
export function denied(res: Res): Outcome {
  if (res.error) {
    if (res.error.code === PERMISSION_DENIED) return { pass: true, detail: errText(res) };
    if (cannotJudge(res)) {
      return { pass: false, unverified: true, detail: `시험 불가: ${errText(res)}` };
    }
    return { pass: false, detail: `권한 거부가 아닌 오류: ${errText(res)}` };
  }
  const detail =
    res.data === null || res.data === undefined
      ? '성공 응답 (data 없음)'
      : `성공 응답 (${rowsOf(res).length}행)`;
  return { pass: false, detail: `차단되지 않음: ${detail}` };
}

/** 읽기 허용: 오류가 없어야 통과 (0행도 "읽을 수 있다"는 확인) */
export function readable(res: Res): Outcome {
  if (res.error) {
    return { pass: false, ...(cannotJudge(res) ? { unverified: true } : {}), detail: errText(res) };
  }
  return { pass: true, detail: `${rowsOf(res).length}행` };
}

/**
 * 오류 없이 0행이어야 통과. 시험 run을 만들 수 없는 지금의 예상 결과일 뿐 RLS의 본인 허용·타인 차단을
 * 증명하지 못한다 (fixture가 없다). W3-03에서 start-run으로 양성·음성 대조를 더한다
 */
export function expectNoRowsNow(res: Res): Outcome {
  if (res.error) return { pass: false, detail: errText(res) };
  const n = rowsOf(res).length;
  return { pass: n === 0, detail: `${n}행 (권한 증명 아님)` };
}

export function failed(e: unknown): Outcome {
  return { pass: false, detail: `예외: ${e instanceof Error ? e.message : String(e)}` };
}

/** 표의 셀 안에서 줄이 깨지지 않게 `|`와 줄바꿈을 치환한다 */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** 결과 표(마크다운)와 요약 줄. 마지막 줄이 요약이다 */
export function formatTable(rows: readonly Row[]): string[] {
  const lines = ['| # | 항목 | 기대 | 결과 | 상세 |', '|---|---|---|---|---|'];
  for (const r of rows) {
    const verdict = r.outcome.pass ? 'PASS' : r.outcome.unverified ? '시험 불가' : 'FAIL';
    lines.push(
      `| ${cell(r.id)} | ${cell(r.label)} | ${cell(r.expect)} | ${verdict} | ${cell(r.outcome.detail)} |`,
    );
  }
  const unverified = rows.filter((r) => !r.outcome.pass && r.outcome.unverified).length;
  const failCount = rows.filter((r) => !r.outcome.pass && !r.outcome.unverified).length;
  lines.push(
    '',
    `${rows.length}개 중 PASS ${rows.length - failCount - unverified}, FAIL ${failCount}, 시험 불가 ${unverified}`,
  );
  return lines;
}

/**
 * 종료 코드: 모두 PASS면 0, FAIL이나 시험 불가가 하나라도 있으면 1 (권한을 확인하지 못한 항목은 통과가 아니다).
 * 항목이 하나도 없으면 아무것도 확인하지 못한 것이므로 통과로 보지 않는다 (1)
 */
export function exitCodeOf(rows: readonly Row[]): 0 | 1 {
  return rows.length > 0 && rows.every((r) => r.outcome.pass) ? 0 : 1;
}

/** 새 형식 publishable key 접두어. 레거시 anon JWT는 service_role JWT와 겉모양으로 구분할 수 없어 받지 않는다 */
export const PUBLISHABLE_PREFIX = 'sb_publishable_';

/**
 * 환경 변수에서 접속 정보를 꺼낸다. 비어 있으면 빠진 이름을, publishable 형식이 아니면(secret·JWT 포함) 거부한다.
 * 거부 결과에는 키 값을 싣지 않는다
 */
export function parseCheckEnv(
  env: Readonly<Record<string, string | undefined>>,
): { ok: true; env: CheckEnv } | { ok: false; missing: string[]; badKey?: true } {
  const url = env[ENV_URL]?.trim();
  const key = env[ENV_KEY]?.trim();
  const missing: string[] = [];
  if (!url) missing.push(ENV_URL);
  if (!key) missing.push(ENV_KEY);
  if (missing.length > 0 || !url || !key) return { ok: false, missing };
  if (!key.startsWith(PUBLISHABLE_PREFIX) || key.length === PUBLISHABLE_PREFIX.length) {
    return { ok: false, missing: [], badKey: true };
  }
  return { ok: true, env: { url, key } };
}

/** 설정이 없을 때 (exit 2) 보여 주는 안내 */
export function setupGuide(
  path: string,
  reason: 'no-file' | 'missing' | 'bad-key',
  missing: string[],
): string {
  const why =
    reason === 'no-file'
      ? `환경 파일을 읽을 수 없다: ${path}`
      : reason === 'bad-key'
        ? `${path}의 ${ENV_KEY}가 publishable key(${PUBLISHABLE_PREFIX}…)가 아니다. secret·service_role 키나 JWT는 쓰지 않는다`
        : `${path}에 ${missing.join(', ')} 값이 없다`;
  return [
    `권한 시험을 시작할 수 없다. ${why}`,
    '',
    '1. 전용 Supabase 프로젝트가 있어야 한다 (원격 적용 절차: supabase/README.md)',
    `2. .env.example을 .env.local로 복사해 ${ENV_URL}·${ENV_KEY}를 채운다`,
    '   (publishable key만 넣는다. secret·service_role 키는 넣지 않는다)',
    '3. 대시보드에서 Anonymous Sign-ins를 켠다',
    '4. 다시 실행: npm run supabase:check [-- <env 파일 경로>]',
  ].join('\n');
}
