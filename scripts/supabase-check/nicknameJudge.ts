// 원격 set-nickname 시험(`npm run supabase:check -- --nickname`)의 순수 판정 로직. 네트워크를 쓰지 않아 Vitest로 시험한다.
// 판정은 정확한 status·code·헤더로만 PASS한다 (W3-01 권한 시험과 같은 원칙: 허위 PASS 금지).
// - 서버에 닿지 못했다(status 0)·5xx·인증 서버 오류는 "시험 불가"(unverified), 기대와 다른 응답은 FAIL
// - 오류 message·토큰·키·URL은 상세에 남기지 않는다 (status·code·헤더 이름만)
import type { SupabaseClient } from '@supabase/supabase-js';
import { errText, type Outcome, type Res } from './report.ts';

/**
 * 브라우저가 set-nickname을 부를 때 보내는 헤더 (supabase-js 2.119.0의 functions.invoke: authorization·apikey·content-type·x-client-info.
 * SDK의 corsHeaders 목록에는 postgrest용 x-retry-count·trace 헤더가 더 있지만 함수 호출에는 쓰이지 않는다).
 * 원격 preflight 요청의 Access-Control-Request-Headers와 응답 판정에 같이 쓴다
 */
export const REQUIRED_REQUEST_HEADERS: readonly string[] = [
  'authorization',
  'apikey',
  'content-type',
  'x-client-info',
];

/** 함수 호출 결과. status 0은 연결 실패(네트워크·시간 초과) */
export interface FnRes {
  status: number;
  /** 본문 JSON. JSON이 아니면 null */
  body: unknown;
  /** 응답 헤더 (소문자 이름 → 값). 없으면 null */
  header(name: string): string | null;
}

/** 서버에 닿지 못했거나 서버 오류라 기대 동작을 판정할 수 없다 */
function cannotJudge(res: FnRes): boolean {
  return res.status === 0 || res.status >= 500;
}

function describeRes(res: FnRes): string {
  const code = codeOf(res.body);
  return `status ${res.status}${code === null ? '' : `, code ${code}`}`;
}

function codeOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const code = (body as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function unverified(res: FnRes): Outcome {
  return { pass: false, unverified: true, detail: `시험 불가: ${describeRes(res)}` };
}

function isTag(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 9999;
}

/** 200 + 요청한 이름 + 0~9999 정수 태그. 태그는 뒤 항목이 쓰도록 돌려준다 */
export function judgeSet(res: FnRes, name: string): Outcome & { tag?: number } {
  if (cannotJudge(res)) return unverified(res);
  const body = res.body as { nickname?: unknown; tag?: unknown } | null;
  if (res.status === 200 && body !== null && typeof body === 'object') {
    if (body.nickname === name && isTag(body.tag)) {
      return { pass: true, detail: `status 200, tag ${body.tag}`, tag: body.tag };
    }
    return { pass: false, detail: '200이지만 이름·태그(0~9999 정수)가 기대와 다름' };
  }
  return { pass: false, detail: `기대 200, 실제 ${describeRes(res)}` };
}

/** 기대한 status와 code가 정확히 일치 (400 규칙 코드, 409 already-set, 403 origin 등) */
export function judgeCode(res: FnRes, status: number, code: string): Outcome {
  if (cannotJudge(res)) return unverified(res);
  if (res.status === status && codeOf(res.body) === code) {
    return { pass: true, detail: describeRes(res) };
  }
  return { pass: false, detail: `기대 status ${status}, code ${code}. 실제 ${describeRes(res)}` };
}

/**
 * 인증 실패: 401만 PASS. 함수가 막으면 code unauthorized, 플랫폼 게이트웨이(verify_jwt)가 먼저 막으면 다른 본문이다.
 * 둘을 상세에서 구분한다 (게이트웨이만 막으면 함수의 토큰 검사는 이 시험으로 증명되지 않는다)
 */
export function judgeUnauthorized(res: FnRes): Outcome {
  if (cannotJudge(res)) return unverified(res);
  if (res.status !== 401) return { pass: false, detail: `기대 401, 실제 ${describeRes(res)}` };
  return {
    pass: true,
    detail:
      codeOf(res.body) === 'unauthorized'
        ? 'status 401, 함수가 거부'
        : 'status 401, 게이트웨이가 거부',
  };
}

/** 쉼표 목록 헤더 값 → 공백 제거·소문자로 정리한 토큰 (`x-authorization`이 `authorization`으로 보이지 않게 부분 문자열이 아니라 토큰으로 비교한다) */
function tokens(value: string | null): string[] {
  return (value ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t !== '');
}

/** 허용 출처의 preflight: 204 + 그 출처 + POST + 필수 요청 헤더 전부 + Vary: Origin. 헤더만 맞고 status가 다르면 FAIL */
export function judgePreflightAllowed(res: FnRes, origin: string): Outcome {
  if (cannotJudge(res)) return unverified(res);
  const problems: string[] = [];
  if (res.status !== 204) problems.push(`status ${res.status} (기대 204)`);
  if (res.header('access-control-allow-origin') !== origin)
    problems.push('Allow-Origin이 요청 출처와 다름');
  if (!tokens(res.header('access-control-allow-methods')).includes('post')) {
    problems.push('Allow-Methods에 POST 없음');
  }
  const headers = tokens(res.header('access-control-allow-headers'));
  for (const need of REQUIRED_REQUEST_HEADERS) {
    if (!headers.includes(need)) problems.push(`Allow-Headers에 ${need} 없음`);
  }
  if (!tokens(res.header('vary')).includes('origin')) problems.push('Vary: Origin 없음');
  return problems.length === 0
    ? { pass: true, detail: 'status 204, 출처·POST·필수 헤더 허용' }
    : { pass: false, detail: problems.join(', ') };
}

/** 허용 안 된 출처의 preflight: 403 + 허용 헤더 없음 (404·500이라 우연히 헤더가 없는 응답은 PASS가 아니다) */
export function judgePreflightDenied(res: FnRes): Outcome {
  if (cannotJudge(res)) return unverified(res);
  const origin = res.header('access-control-allow-origin');
  if (res.status === 403 && origin === null)
    return { pass: true, detail: 'status 403, 허용 헤더 없음' };
  return {
    pass: false,
    detail: `기대 403·허용 헤더 없음. 실제 status ${res.status}${origin === null ? '' : ', Allow-Origin 있음'}`,
  };
}

/** 정확한 status·code에 더해 허용 출처의 Allow-Origin이 오류 응답에도 붙어 있다 (브라우저가 network 오류로만 보지 않게) */
export function judgeCors(res: FnRes, origin: string, status: number, code: string): Outcome {
  const base = judgeCode(res, status, code);
  if (!base.pass) return base;
  return res.header('access-control-allow-origin') === origin
    ? { pass: true, detail: `${describeRes(res)}, Allow-Origin 일치` }
    : { pass: false, detail: `${describeRes(res)}, Allow-Origin이 요청 출처와 다름` };
}

/** 성공(200) 응답에도 허용 출처의 Allow-Origin이 붙어 있다 */
export function judgeSuccessCors(res: FnRes, origin: string): Outcome {
  if (cannotJudge(res)) return unverified(res);
  if (res.status !== 200) return { pass: false, detail: `기대 200, 실제 ${describeRes(res)}` };
  return res.header('access-control-allow-origin') === origin
    ? { pass: true, detail: 'status 200, Allow-Origin 일치' }
    : { pass: false, detail: 'status 200, Allow-Origin이 요청 출처와 다름' };
}

/** profiles 재조회 결과가 기대한 이름·태그와 같다 */
export function judgeProfile(row: unknown, name: string, tag: number | undefined): Outcome {
  const r = row as { nickname?: unknown; tag?: unknown } | null;
  if (r !== null && typeof r === 'object' && r.nickname === name && r.tag === tag && isTag(tag)) {
    return { pass: true, detail: `재조회 일치, tag ${tag}` };
  }
  return { pass: false, detail: '재조회한 이름·태그가 함수 응답과 다름' };
}

/** 규칙 거부 뒤 profiles에 이름이 생기지 않았다 (행이 없거나 nickname이 null) */
export function judgeNoNickname(row: unknown): Outcome {
  if (row === null || row === undefined) return { pass: true, detail: '행 없음' };
  const r = row as { nickname?: unknown };
  return r !== null && typeof r === 'object' && r.nickname === null
    ? { pass: true, detail: 'nickname null' }
    : { pass: false, detail: '거부했는데 이름이 저장됨' };
}

/** 같은 이름의 두 번째 사용자는 다른 태그를 받는다. 첫 사용자 단계가 실패했으면 비교할 수 없다(FAIL) */
export function judgeDifferentTag(first: number | undefined, second: number | undefined): Outcome {
  if (first === undefined || second === undefined) {
    return { pass: false, detail: '앞 단계(정상 설정)가 실패해 비교할 수 없음' };
  }
  return first !== second
    ? { pass: true, detail: `태그가 다름 (${first} ≠ ${second})` }
    : { pass: false, detail: `같은 이름·같은 태그 ${first}` };
}

/**
 * 같은 사용자의 동시 두 요청: 정확히 하나는 200(이름·태그가 유효하고 그 요청이 보낸 이름), 하나는 409 already-set.
 * 승자의 200 본문이 비정상이면 다른 하나가 409여도 FAIL. 승자 정보는 뒤의 최종 profiles 확인이 쓴다
 */
export function judgeRace(
  a: FnRes,
  b: FnRes,
  names: readonly [string, string],
): Outcome & { winner?: { nickname: string; tag: number } } {
  if (cannotJudge(a) || cannotJudge(b)) return unverified(cannotJudge(a) ? a : b);
  const [win, lose, name] =
    a.status === 200 ? [a, b, names[0]] : b.status === 200 ? [b, a, names[1]] : [null, null, ''];
  if (win === null || lose === null)
    return { pass: false, detail: `기대 200 하나·409 하나. 실제 ${a.status}, ${b.status}` };
  const body = win.body as { nickname?: unknown; tag?: unknown } | null;
  if (lose.status !== 409 || codeOf(lose.body) !== 'already-set') {
    return { pass: false, detail: `기대 200 하나·409 하나. 실제 ${a.status}, ${b.status}` };
  }
  if (body === null || typeof body !== 'object' || body.nickname !== name || !isTag(body.tag)) {
    return { pass: false, detail: '승자 200의 이름·태그(0~9999 정수)가 기대와 다름' };
  }
  return {
    pass: true,
    detail: 'status 200 하나, 409 already-set 하나',
    winner: { nickname: name, tag: body.tag },
  };
}

/** profiles 조회 응답. SDK의 error를 버리지 않고 그대로 넘긴다 */
export async function readProfile(client: SupabaseClient, id: string): Promise<Res> {
  const { data, error, status } = await client
    .from('profiles')
    .select('nickname, tag')
    .eq('id', id)
    .maybeSingle();
  return { data, error, status };
}

/**
 * 조회가 실패했으면(오류 응답) 그 판정, 성공이면 null. 오류 없는 응답의 null만 "행 없음"이다.
 * 네트워크·인증·서버 오류는 시험 불가, 그 밖의 오류(권한 없음 포함)는 FAIL — 조회하지 못한 것을 "이름이 없다"로 확정하지 않는다
 */
export function judgeProfileReadError(res: Res): Outcome | null {
  if (!res.error) return null;
  const status = res.status;
  const unverified = status === 0 || status === 401 || (status !== undefined && status >= 500);
  return {
    pass: false,
    ...(unverified ? { unverified: true } : {}),
    detail: `profiles 조회 실패: ${errText(res)}`,
  };
}
