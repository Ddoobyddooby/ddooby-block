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
 * 읽지 않은 본문을 버리는 읽기의 상한. 이 바이트까지만 읽어 버리고, 시간도 DRAIN_TIMEOUT_MS까지만 쓴다 (자원 고갈 방지).
 * Supabase Edge에서는 응답을 보낼 때 요청 본문이 약 60만 바이트 넘게 남아 있으면 응답이 나가지 않고 매달린다
 * (W3-03 후속 원격 실험: 끝까지 읽은 1,500,000바이트는 0.35초에 응답, 읽지 않은 채 응답한 100만 바이트는 응답 없음.
 * 토큰이 없는 401·405 같은 일찍 보내는 응답도 같다). 그래서 응답 전에 남은 본문을 이 상한까지 읽어 버린다
 */
export const DRAIN_LIMIT_BYTES = 8 * 1024 * 1024;
export const DRAIN_TIMEOUT_MS = 3000;

/** 한 번의 drain에서 reader.read()를 부르는 횟수 상한. 정상 본문은 수백 번이면 끝난다 (8MiB ÷ 수십 KB 청크). 1바이트·빈 청크 반복 대비 */
export const DRAIN_MAX_READS = 10_000;

/**
 * reader의 남은 본문을 버린다 (모으지 않으므로 메모리는 늘지 않는다). alreadyRead는 이미 읽은 바이트.
 * 끝났거나 바이트·시간·읽기 횟수 상한을 넘으면 돌아온다. 넘으면 남은 본문을 취소하되 **취소를 기다리지 않는다**
 * (Edge에서 취소 Promise가 끝나지 않는 일이 있었다). 오류는 삼킨다.
 * 시간 제한은 **작업 전체에 타이머 하나**다: read마다 같은 미완료 Promise와 race하면 청크 수만큼 reaction이 쌓인다
 * (W3-03 후속 리뷰 지적 1: 1바이트 × 200,000 → 힙 약 112~136MiB). read마다 새 Promise를 만들고 타이머는 그 자리(wake)만 깨운다.
 * 시계 검사도 매 반복에 둔다: 청크가 계속 바로 준비되면 타이머 콜백이 돌 틈이 없다
 */
async function discardRest(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  alreadyRead: number,
): Promise<void> {
  let total = alreadyRead;
  let expired = false;
  let wake: (() => void) | null = null;
  const startedAt = performance.now();
  const timer = setTimeout(() => {
    expired = true;
    wake?.();
  }, DRAIN_TIMEOUT_MS);
  try {
    for (let reads = 0; ; reads++) {
      if (expired || performance.now() - startedAt > DRAIN_TIMEOUT_MS || reads >= DRAIN_MAX_READS) {
        break;
      }
      const next = await new Promise<ReadableStreamReadResult<Uint8Array> | null>(
        (resolve, reject) => {
          wake = () => resolve(null); // 시간 만료
          reader.read().then(resolve, reject);
        },
      );
      wake = null;
      if (next === null) break;
      if (next.done) return;
      total += next.value.byteLength;
      if (total > DRAIN_LIMIT_BYTES) break;
    }
  } catch {
    return; // 읽기 오류(연결 끊김)
  } finally {
    clearTimeout(timer);
  }
  try {
    void reader.cancel().catch(() => undefined);
  } catch {
    // 이미 끝난 스트림
  }
}

/**
 * 응답을 보내기 전에 아직 읽지 않은 요청 본문을 상한까지 버린다 (위 DRAIN_LIMIT_BYTES 설명).
 * 일찍 응답하는 모든 경로(401·403·405·413·400)에서 부른다. 이미 읽었거나 본문이 없으면 아무 일도 안 한다
 */
export async function drainUnread(req: Request): Promise<void> {
  try {
    if (!req.body || req.bodyUsed || req.body.locked) return;
    await discardRest(req.body.getReader(), 0);
  } catch {
    // 이미 잠겼거나 끝난 스트림
  }
}

/**
 * 본문을 maxBytes까지만 읽는다 (읽는 동안 바이트를 세므로 Content-Length가 없거나 거짓이어도 상한을 넘기면 멈춘다).
 * 넘으면 'too-large'. 그렇지 않으면 UTF-8로 읽은 문자열
 */
export async function readBodyText(req: Request, maxBytes: number): Promise<string | 'too-large'> {
  const declared = Number(req.headers.get('Content-Length'));
  const reader = req.body?.getReader();
  if (!reader) return '';
  if (Number.isFinite(declared) && declared > maxBytes) {
    // 선언이 이미 상한을 넘었다. 응답 전에 남은 본문을 상한까지 버린다 (선언이 상한의 몇 배여도 버리는 양은 DRAIN_LIMIT_BYTES까지)
    await discardRest(reader, 0);
    return 'too-large';
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await discardRest(reader, total);
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
