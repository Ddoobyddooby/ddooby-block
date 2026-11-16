// start-run·submit-score 공통 HTTP 처리: CORS 허용 출처, JSON 응답, Bearer 토큰, 본문 읽기(바이트 상한).
// set-nickname(W3-02)과 같은 규칙이다 (허용 출처 목록이 같은지는 tests/functions/http.test.ts가 지킨다).
// Deno·Supabase에 의존하지 않아 Vitest에서도 읽는다. 이 폴더(_lib)는 배포 함수가 아니라 함수들이 가져다 쓰는 코드다.

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

export type Cors = Record<string, string>;

export function isAllowedOrigin(origin: string | null): origin is string {
  return origin !== null && ALLOWED_ORIGINS.includes(origin);
}

export function corsHeaders(allowHeaders: string, origin: string | null): Cors {
  if (!isAllowedOrigin(origin)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': allowHeaders,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function json(status: number, body: unknown, cors: Cors): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization');
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

/**
 * 본문을 읽기 전에 줄 응답. 줄 응답이 없으면(POST이고 출처가 허용됨) null.
 * - OPTIONS: 허용 출처만 204. 허용 안 된 출처의 preflight에는 허용 헤더를 주지 않는다 → 브라우저가 본 요청을 막는다
 * - POST 아님: 405
 * - Origin이 있는데 허용 목록에 없으면 403 (브라우저의 다른 사이트). Origin이 없는 요청(앱·서버)은 토큰 검사만 한다.
 *   Origin은 비브라우저가 꾸며 보낼 수 있으므로 이것은 인증이 아니다. 토큰 검사는 어느 쪽이든 한다
 */
export function earlyResponse(req: Request, cors: Cors): Response | null {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: isAllowedOrigin(origin) ? 204 : 403, headers: cors });
  }
  if (req.method !== 'POST') return json(405, { code: 'method' }, cors);
  if (origin !== null && !isAllowedOrigin(origin)) return json(403, { code: 'origin' }, cors);
  return null;
}

/**
 * 본문을 maxBytes까지만 읽는다 (읽는 동안 바이트를 세므로 Content-Length가 없거나 거짓이어도 상한을 넘기면 멈춘다).
 * 넘으면 'too-large'. 그렇지 않으면 UTF-8로 읽은 문자열
 */
export async function readBodyText(req: Request, maxBytes: number): Promise<string | 'too-large'> {
  const declared = Number(req.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await req.body?.cancel().catch(() => undefined);
    return 'too-large';
  }
  const reader = req.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return 'too-large';
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** JSON 문자열을 읽는다. 깨졌으면 'bad-json' */
export function parseJson(text: string): unknown | 'bad-json' {
  try {
    return JSON.parse(text);
  } catch {
    return 'bad-json';
  }
}
