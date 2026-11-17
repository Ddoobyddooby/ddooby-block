// start-run 처리 로직 (PLAN 7절): 토큰 확인 → 규칙 버전 비교 → 서버 seed 발급 → runs 저장 → {runId, seed}.
// Deno·Supabase에 의존하지 않는 순수 핸들러라 Vitest에서 가짜 deps로 시험한다. 실제 연결은 adapter.ts·index.ts가 넣어 준다.
// pang의 start-run/handler.ts에서 복사해 규칙 버전(int)·seed 범위(uint32)·본문 상한·Origin 정책을 block에 맞췄다.
// 이 파일은 Deno(deno check)와 tsc(Vitest 경유) 둘 다 읽는다
import { isRulesVersion, weekKey } from '../_shared/replay.js';
import {
  bearerToken,
  corsHeaders,
  earlyResponse,
  json,
  parseJson,
  drainUnread,
  readBodyText,
} from '../_lib/http.ts';

/** 요청 본문 상한 (바이트). 정상 요청은 `{"version":1}` 몇 바이트다 */
export const MAX_BODY_BYTES = 1024;

export interface NewRun {
  userId: string;
  /** 0~4294967295 정수 */
  seed: number;
  rulesVersion: number;
  /** 발급 시각의 주 (SPEC 8.1: 며칠에 걸친 판도 시작한 주로 등록한다) */
  weekKey: string;
  /** 발급 시각. submit-score의 시간 판정이 같은 시계로 비교하도록 DB 기본값 대신 이 값을 쓴다 (ms 정밀도) */
  createdAtMs: number;
}

export interface StartRunDeps {
  /** 브라우저가 보내는 요청 헤더 허용 목록 (supabase-js의 corsHeaders 값) */
  allowHeaders: string;
  /** 서버 번들의 RULES_VERSION */
  rulesVersion: number;
  now(): number;
  /** 토큰이 유효하면 사용자 ID, 무효하면 null. 인증 서버 장애처럼 판정하지 못하면 throw */
  getUserId(token: string): Promise<string | null>;
  /** 0~4294967295 정수 (crypto.getRandomValues) */
  randomSeed(): number;
  /** runs에 넣고 새 run ID를 돌려준다 */
  insertRun(run: NewRun): Promise<string>;
  /** 500으로 바꾼 예외를 서버 로그에 남긴다 (응답에는 싣지 않는다) */
  reportError?(error: unknown): void;
}

/** 응답을 보내기 전에 읽지 않은 요청 본문을 상한까지 버린다 (http.ts DRAIN_LIMIT_BYTES: 큰 본문을 남긴 채 응답하면 Edge가 응답을 내보내지 않는다) */
export async function handleStartRun(deps: StartRunDeps, req: Request): Promise<Response> {
  const res = await respondStartRun(deps, req);
  await drainUnread(req);
  return res;
}

async function respondStartRun(deps: StartRunDeps, req: Request): Promise<Response> {
  const cors = corsHeaders(deps.allowHeaders, req.headers.get('Origin'));
  const early = earlyResponse(req, cors);
  if (early) return early;

  try {
    // CORS·Origin과 별개로 토큰을 검사한다 (SPEC 8절)
    const token = bearerToken(req);
    const userId = token ? await deps.getUserId(token) : null;
    if (!userId) return json(401, { code: 'unauthorized' }, cors);

    const text = await readBodyText(req, MAX_BODY_BYTES);
    if (text === 'too-large') return json(413, { code: 'too-large' }, cors);
    const body = parseJson(text);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return json(400, { code: 'payload-invalid' }, cors);
    }
    const version = (body as { version?: unknown }).version;
    if (!isRulesVersion(version)) return json(400, { code: 'version-invalid' }, cors);
    // 규칙이 다르면 리플레이 점수가 달라질 수 있다 → 새로고침 안내 (submit-score와 같은 코드). run을 발급하지 않는다
    if (version !== deps.rulesVersion) return json(409, { code: 'version-mismatch' }, cors);

    const now = deps.now();
    const seed = deps.randomSeed();
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new Error('seed가 uint32가 아니다');
    }
    const week = weekKey(now);
    const runId = await deps.insertRun({
      userId,
      seed,
      rulesVersion: version,
      weekKey: week,
      createdAtMs: now,
    });
    return json(200, { runId, seed, version, weekKey: week }, cors);
  } catch (e) {
    deps.reportError?.(e);
    return json(500, { code: 'server' }, cors);
  }
}
