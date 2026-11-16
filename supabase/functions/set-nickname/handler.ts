// set-nickname 처리 로직 (PLAN 7절). Deno·Supabase에 의존하지 않는 순수 핸들러라 Vitest에서 가짜 deps로 시험한다.
// 실제 연결(사용자 확인·DB·난수)은 adapter.ts·index.ts가 넣어 준다. pang의 set-nickname/handler.ts에서 복사해 Origin 정책·본문 크기 상한을 고쳤다.
// 이 파일은 Deno(deno check)와 tsc(Vitest 경유) 둘 다 읽으므로 상대 import에 .js(생성 파일)·.ts(손으로 쓴 파일) 확장자를 그대로 쓴다
import { checkNickname, TAG_MAX_ATTEMPTS } from '../_shared/nicknameRules.js';

/**
 * CORS 허용 출처: GitHub Pages, Capacitor 앱, 개발 서버(메인 5180, 구현 탭 5181).
 * 정확히 같은 문자열만 허용한다. 와일드카드·접두 일치 금지
 */
export const ALLOWED_ORIGINS: readonly string[] = [
  'https://ddoobyddooby.github.io',
  'https://localhost',
  'http://localhost:5180',
  'http://127.0.0.1:5180',
  'http://localhost:5181',
  'http://127.0.0.1:5181',
];

/** 요청 본문 상한 (바이트). 정상 요청은 `{"nickname":"…"}` 수십 바이트다 */
export const MAX_BODY_BYTES = 1024;

export type SaveResult = 'ok' | 'tag-taken' | 'already-set';

export interface SetNicknameDeps {
  /** 브라우저가 보내는 요청 헤더 허용 목록 (supabase-js의 corsHeaders 값) */
  allowHeaders: string;
  /** 토큰이 유효하면 사용자 ID, 무효하면 null. 인증 서버 장애처럼 판정하지 못하면 throw */
  getUserId(token: string): Promise<string | null>;
  /** 이미 정한 닉네임. 없거나 profiles 행이 없으면 null */
  getNickname(userId: string): Promise<string | null>;
  /** 닉네임이 아직 없을 때만 저장. (nickname, tag) unique 위반이면 'tag-taken' */
  saveNickname(userId: string, nickname: string, tag: number): Promise<SaveResult>;
  /** 0~9999 정수 */
  randomTag(): number;
  /** 500으로 바꾼 예외를 서버 로그에 남긴다 (응답에는 싣지 않는다) */
  reportError?(error: unknown): void;
}

function isAllowedOrigin(origin: string | null): origin is string {
  return origin !== null && ALLOWED_ORIGINS.includes(origin);
}

function corsHeaders(deps: SetNicknameDeps, origin: string | null): Record<string, string> {
  if (!isAllowedOrigin(origin)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': deps.allowHeaders,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization');
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

/** 본문을 상한까지만 읽는다. 넘으면 'too-large', JSON이 아니면 'bad-json' */
async function readJson(req: Request): Promise<unknown | 'too-large' | 'bad-json'> {
  const declared = Number(req.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return 'too-large';
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return 'too-large';
  try {
    return JSON.parse(text);
  } catch {
    return 'bad-json';
  }
}

export async function handleSetNickname(deps: SetNicknameDeps, req: Request): Promise<Response> {
  const origin = req.headers.get('Origin');
  const cors = corsHeaders(deps, origin);

  if (req.method === 'OPTIONS') {
    // 허용 안 된 출처의 preflight에는 허용 헤더를 주지 않는다 → 브라우저가 본 요청을 막는다
    return new Response(null, { status: isAllowedOrigin(origin) ? 204 : 403, headers: cors });
  }
  if (req.method !== 'POST') return json(405, { code: 'method' }, cors);

  // Origin이 있는데 허용 목록에 없으면 거부한다 (브라우저의 다른 사이트). Origin이 없는 요청(앱·서버)은 토큰 검사만 한다.
  // Origin은 비브라우저가 꾸며 보낼 수 있으므로 이것은 인증이 아니다. 토큰 검사는 어느 쪽이든 한다
  if (origin !== null && !isAllowedOrigin(origin)) return json(403, { code: 'origin' }, cors);

  try {
    const token = bearerToken(req);
    const userId = token ? await deps.getUserId(token) : null;
    if (!userId) return json(401, { code: 'unauthorized' }, cors);

    const body = await readJson(req);
    if (body === 'too-large') return json(413, { code: 'too-large' }, cors);
    if (body === 'bad-json') return json(400, { code: 'bad-request' }, cors);
    // nickname만 읽는다. id·tag·role 같은 다른 필드는 무시한다 (대상은 항상 검증된 토큰의 사용자)
    const name =
      typeof body === 'object' && body !== null && !Array.isArray(body)
        ? (body as { nickname?: unknown }).nickname
        : undefined;
    if (typeof name !== 'string') return json(400, { code: 'bad-request' }, cors);

    const check = checkNickname(name);
    if (!check.ok) return json(400, { code: check.code }, cors);

    if ((await deps.getNickname(userId)) !== null) return json(409, { code: 'already-set' }, cors);

    for (let i = 0; i < TAG_MAX_ATTEMPTS; i++) {
      const tag = deps.randomTag();
      const saved = await deps.saveNickname(userId, check.nickname, tag);
      if (saved === 'ok') return json(200, { nickname: check.nickname, tag }, cors);
      if (saved === 'already-set') return json(409, { code: 'already-set' }, cors);
      // tag-taken: 다시 뽑는다
    }
    return json(500, { code: 'server' }, cors);
  } catch (e) {
    deps.reportError?.(e);
    return json(500, { code: 'server' }, cors);
  }
}
