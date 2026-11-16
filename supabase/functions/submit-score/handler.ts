// submit-score 처리 로직 (SPEC 8.1, PLAN 7절): 토큰 → 본문 → 본인 run → 같은 내용인지(해시) → 규칙 버전 → 내용 판정(리플레이) →
// 시간 판정 → 확정(DB 함수 하나: run 확정 + 주간 최고 점수). Deno·Supabase에 의존하지 않는 순수 핸들러라 Vitest에서 가짜 deps로 시험한다.
// pang의 submit-score/handler.ts에서 복사해 다음을 바꿨다:
// - 확정이 REST 호출 세 번(claim → 기록 → 결과 저장)이 아니라 DB 함수 하나(commit_submission, 한 트랜잭션)다. 응답 유실·동시 요청 뒤에도
//   "확정은 됐는데 점수는 안 올라간" 상태가 없다. 나중 요청은 확정된 결과를 `existing`으로 받아 해시로 같은 내용인지 본다
// - 만료·고정 시간 기준이 없다. 시간 판정은 `마지막 t ≤ 제출 시각 − 발급 시각` 하나이고 저장하지 않는다 (too-fast)
// - 규칙 버전은 RULES_VERSION(int), 빈 로그·끝나지 않은 판은 not-over
// 이 파일은 Deno(deno check)와 tsc(Vitest 경유) 둘 다 읽는다
import {
  checkElapsed,
  isUuid,
  JUDGE,
  parseSubmission,
  readStoredResult,
  resubmitDecision,
  submissionHash,
  verifyContent,
  type ContentVerdict,
  type StoredResult,
} from '../_shared/replay.js';
import {
  bearerToken,
  corsHeaders,
  earlyResponse,
  json,
  parseJson,
  readBodyText,
  type Cors,
} from '../_lib/http.ts';

export interface RunRow {
  id: string;
  seed: number;
  /** start-run 때의 RULES_VERSION */
  rulesVersion: number;
  /** 발급 시각 기준의 주 (며칠 뒤 제출해도 이 주에 기록한다) */
  weekKey: string;
  /** start-run 발급 시각 (ms) */
  createdAtMs: number;
  submissionHash: string | null;
  /** 확정된 결과 (모양은 믿지 않고 readStoredResult로 읽는다) */
  result: unknown;
}

/** commit이 돌려주는 값. result·hash는 DB에 저장된 것이다 (모양은 믿지 않는다) */
export type CommitResult =
  | { status: 'not-found' }
  | { status: 'existing'; hash: string; result: unknown }
  | { status: 'committed'; hash: string; result: unknown };

export interface SubmitScoreDeps {
  /** 브라우저가 보내는 요청 헤더 허용 목록 (supabase-js의 corsHeaders 값) */
  allowHeaders: string;
  /** 서버 번들의 RULES_VERSION */
  rulesVersion: number;
  now(): number;
  /** 토큰이 유효하면 사용자 ID, 무효하면 null. 인증 서버 장애처럼 판정하지 못하면 throw */
  getUserId(token: string): Promise<string | null>;
  /** id와 user_id가 모두 맞는 run. 없거나 남의 run이면 null (둘을 구분하지 않는다) */
  getRun(runId: string, userId: string): Promise<RunRow | null>;
  /**
   * DB 함수 commit_submission: run 소유 확인 + 한 번만 확정 + (통과면) 주간 최고 점수를 한 트랜잭션으로.
   * verdict는 통과(`{ok:true, score}`)나 내용 거부. 이미 확정된 run이면 저장된 해시·결과를 돌려준다 (existing)
   */
  commit(input: {
    runId: string;
    userId: string;
    hash: string;
    verdict: ContentVerdict;
    submittedAtMs: number;
  }): Promise<CommitResult>;
  /** 500으로 바꾼 예외를 서버 로그에 남긴다 (응답에는 싣지 않는다) */
  reportError?(error: unknown): void;
}

/** 형식 오류 코드 → HTTP 상태. 본문·배치 수 초과는 413, 나머지는 400 */
function formatStatus(code: string): number {
  return code === 'too-large' ? 413 : 400;
}

/** 확정된 결과 → 응답. 통과는 200, 내용 거부는 400 (같은 내용 재제출도 같은 응답) */
function respond(stored: StoredResult, weekKey: string, cors: Cors): Response {
  if (stored.ok) {
    return json(
      200,
      { ok: true, score: stored.score, best: stored.best, weekKey, isNewBest: stored.isNewBest },
      cors,
    );
  }
  const body: Record<string, unknown> = { ok: false, code: stored.code };
  if (stored.code === 'replay-invalid') {
    body.index = stored.index;
    body.reason = stored.reason;
  }
  return json(400, body, cors);
}

export async function handleSubmitScore(deps: SubmitScoreDeps, req: Request): Promise<Response> {
  const cors = corsHeaders(deps.allowHeaders, req.headers.get('Origin'));
  const early = earlyResponse(req, cors);
  if (early) return early;

  try {
    // CORS·Origin과 별개로 토큰을 검사한다 (SPEC 8절)
    const token = bearerToken(req);
    const userId = token ? await deps.getUserId(token) : null;
    if (!userId) return json(401, { code: 'unauthorized' }, cors);

    const text = await readBodyText(req, JUDGE.maxBodyBytes);
    if (text === 'too-large') return json(413, { code: 'too-large' }, cors);
    const body = parseJson(text);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return json(400, { ok: false, code: 'payload-invalid' }, cors);
    }
    const runId = (body as { runId?: unknown }).runId;
    if (typeof runId !== 'string') return json(400, { ok: false, code: 'payload-invalid' }, cors);
    // UUID가 아닌 값은 DB에 묻지 않는다 (형식 오류가 DB 변환 오류·500이 되지 않게). 없는 run과 같은 응답이다
    if (!isUuid(runId)) return json(404, { ok: false, code: 'not-found' }, cors);

    const parsed = parseSubmission(body);
    if (!parsed.ok) {
      return json(formatStatus(parsed.code), { ok: false, code: parsed.code }, cors);
    }
    const sub = parsed.submission;

    const run = await deps.getRun(runId, userId);
    if (!run) return json(404, { ok: false, code: 'not-found' }, cors);

    const hash = await submissionHash(sub);
    const decision = resubmitDecision(run.submissionHash, hash);
    if (decision === 'conflict') return json(409, { ok: false, code: 'resubmit-conflict' }, cors);
    if (decision === 'same') {
      // 같은 내용 재제출(멱등): 확정된 결과를 그대로 돌려준다. 이후 다른 run이 최고 점수를 올렸어도 그때의 응답이다.
      // 규칙 버전이 그 뒤 바뀐 run도 이미 확정됐다면 그대로 돌려준다 (새 판정은 하지 않는다)
      const stored = readStoredResult(run.result);
      if (!stored) throw new Error('저장된 결과를 읽을 수 없다');
      return respond(stored, run.weekKey, cors);
    }

    // 새 제출. 규칙이 다르면 리플레이 점수가 달라질 수 있다 → 새로고침 안내. 저장하지 않는다 (맞는 배포가 되면 다시 시도할 수 있다)
    if (
      sub.version !== deps.rulesVersion ||
      run.rulesVersion !== deps.rulesVersion ||
      sub.version !== run.rulesVersion
    ) {
      return json(409, { ok: false, code: 'version-mismatch' }, cors);
    }

    const submittedAtMs = deps.now();
    const verdict = verifyContent(sub, { seed: run.seed });
    if (verdict.ok) {
      // 내용이 맞다: 이제 시간. 마지막 t(누적 플레이 시간)는 발급부터의 실제 경과를 넘을 수 없다
      const lastT = sub.placements[sub.placements.length - 1]?.t ?? 0;
      const timing = checkElapsed(lastT, run.createdAtMs, submittedAtMs);
      if (timing === 'clock') throw new Error('제출 시각이 발급 시각보다 앞선다');
      // 시간 거부는 저장하지 않는다: 같은 내용이 시간이 흐른 뒤 정상 통과해야 한다
      if (timing === 'too-fast') return json(400, { ok: false, code: 'too-fast' }, cors);
    }

    const committed = await deps.commit({ runId: run.id, userId, hash, verdict, submittedAtMs });
    if (committed.status === 'not-found') return json(404, { ok: false, code: 'not-found' }, cors);
    // existing: 다른 요청이 먼저 확정했다. 같은 내용이면 그 결과, 다르면 충돌
    if (committed.status === 'existing' && committed.hash !== hash) {
      return json(409, { ok: false, code: 'resubmit-conflict' }, cors);
    }
    const stored = readStoredResult(committed.result);
    if (!stored) throw new Error('확정된 결과를 읽을 수 없다');
    return respond(stored, run.weekKey, cors);
  } catch (e) {
    deps.reportError?.(e);
    return json(500, { code: 'server' }, cors);
  }
}
