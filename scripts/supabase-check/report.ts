// 권한 시험(rls-check.ts)의 순수 판정 로직. 네트워크·파일을 쓰지 않아 Vitest로 시험한다 (tests/supabase/report.test.ts)

export interface Outcome {
  pass: boolean;
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
}

export interface CheckEnv {
  url: string;
  key: string;
}

export const ENV_URL = 'VITE_SUPABASE_URL';
export const ENV_KEY = 'VITE_SUPABASE_PUBLISHABLE_KEY';

export function rowsOf(res: Res): unknown[] {
  return Array.isArray(res.data) ? res.data : [];
}

export function errText(res: Res): string {
  return `${res.error?.code ?? '?'} ${res.error?.message ?? ''}`.trim();
}

/** 쓰기 차단: 오류(권한·RLS)가 나거나, 반영된 행이 0개면 통과 */
export function denied(res: Res): Outcome {
  if (res.error) return { pass: true, detail: errText(res) };
  const n = rowsOf(res).length;
  return { pass: n === 0, detail: n === 0 ? '오류 없음, 반영 0행' : `반영 ${n}행` };
}

/** 읽기 허용: 오류가 없어야 통과 */
export function readable(res: Res): Outcome {
  if (res.error) return { pass: false, detail: errText(res) };
  return { pass: true, detail: `${rowsOf(res).length}행` };
}

/** 오류 없이 0행이어야 통과 (남의 데이터가 안 보임) */
export function emptyRead(res: Res): Outcome {
  if (res.error) return { pass: false, detail: errText(res) };
  const n = rowsOf(res).length;
  return { pass: n === 0, detail: `${n}행` };
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
    const verdict = r.outcome.pass ? 'PASS' : 'FAIL';
    lines.push(
      `| ${cell(r.id)} | ${cell(r.label)} | ${cell(r.expect)} | ${verdict} | ${cell(r.outcome.detail)} |`,
    );
  }
  const failCount = rows.filter((r) => !r.outcome.pass).length;
  lines.push('', `${rows.length}개 중 PASS ${rows.length - failCount}, FAIL ${failCount}`);
  return lines;
}

/**
 * 종료 코드: 모두 PASS면 0, FAIL이 있으면 1.
 * 항목이 하나도 없으면 아무것도 확인하지 못한 것이므로 통과로 보지 않는다 (1)
 */
export function exitCodeOf(rows: readonly Row[]): 0 | 1 {
  return rows.length > 0 && rows.every((r) => r.outcome.pass) ? 0 : 1;
}

/** 환경 변수에서 접속 정보를 꺼낸다. 비어 있거나 자리표시면 빠진 변수 이름을 알려 준다 */
export function parseCheckEnv(
  env: Readonly<Record<string, string | undefined>>,
): { ok: true; env: CheckEnv } | { ok: false; missing: string[] } {
  const url = env[ENV_URL]?.trim();
  const key = env[ENV_KEY]?.trim();
  const missing: string[] = [];
  if (!url) missing.push(ENV_URL);
  if (!key) missing.push(ENV_KEY);
  if (missing.length > 0 || !url || !key) return { ok: false, missing };
  return { ok: true, env: { url, key } };
}

/** 설정이 없을 때 (exit 2) 보여 주는 안내 */
export function setupGuide(path: string, reason: 'no-file' | 'missing', missing: string[]): string {
  const why =
    reason === 'no-file'
      ? `환경 파일을 읽을 수 없다: ${path}`
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
