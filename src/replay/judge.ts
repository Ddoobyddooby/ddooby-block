// submit-score 서버 판정 (SPEC 8.1, PLAN 7절). 순수 함수만 둔다 (DB·HTTP·현재 시각을 모른다).
// 서버(Edge Function, `npm run server:shared`가 묶은 번들)와 시험(Vitest)이 같은 코드를 쓴다.
//
// 판정 순서는 handler가 정한다: 형식(parseSubmission) → 재제출(해시) → 규칙 버전 → 내용(verifyContent) → 시간(checkElapsed) → 확정.
// 내용 거부는 시간과 무관하게 결정되므로 run에 저장하고(같은 내용 재제출은 같은 거부), 시간 거부(too-fast)는 저장하지 않는다
// (저장하면 같은 내용의 정상 재시도까지 영구히 막힌다). ddooby-pang src/replay/judge.ts의 구조를 가져와 block 규칙에 맞췄다:
// 58초·30분·60초 같은 고정 시간 기준은 쓰지 않는다 (시간 제한이 없는 게임). 시간 판정은 `마지막 t ≤ 제출 시각 − 발급 시각` 하나다.

import { REPLAY, SAVE } from '../config';
import { checkIntervals, replay } from '../core/replay';
import type { Placement } from '../core/types';

export const JUDGE = {
  /** 한 판의 배치 수 상한. 클라이언트 저장 한도(SAVE.maxRunPlacements)와 같다: 넘는 판은 클라이언트가 제출하지 않는다 */
  maxPlacements: SAVE.maxRunPlacements,
  /** DB `weekly_scores.best_score`가 int(부호 있는 32비트)라서 이 점수를 넘는 판은 등록하지 않는다 (자르거나 되감지 않는다) */
  maxScore: 2_147_483_647,
  /** DB `runs.rules_version`·요청 `version`의 상한 (Postgres int) */
  maxRulesVersion: 2_147_483_647,
  /** seed는 부호 없는 32비트 */
  maxSeed: 0xffffffff,
  /**
   * 요청 본문 상한(바이트). 정상 로그는 배치 하나가 `{"trayIndex":2,"row":7,"col":7,"t":9007199254740991}` 53바이트(쉼표 포함) 이하라
   * 20,000배치가 약 1.06MB이고 거기에 seed·version·clientScore·runId가 150바이트쯤 더해진다. 공백 여유를 두고 1.5MB로 정한다
   */
  maxBodyBytes: 1_500_000,
} as const;

/** 형식이 틀린 요청 (run에 아무것도 저장하지 않는다) */
export type FormatCode =
  | 'payload-invalid'
  | 'version-invalid'
  | 'client-score-invalid'
  | 'placements-invalid'
  | 't-invalid'
  | 'too-large';

export interface Submission {
  readonly seed: number;
  readonly version: number;
  readonly clientScore: number;
  readonly placements: readonly Placement[];
}

export type ParseResult = { ok: true; submission: Submission } | { ok: false; code: FormatCode };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 안전한 정수 (NaN·Infinity·소수·2^53 이상은 아니다) */
const isSafeInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);

/** `version` 필드로 쓸 수 있는 값: 1 이상 Postgres int 이하의 정수 */
export function isRulesVersion(v: unknown): v is number {
  return isSafeInt(v) && v >= 1 && v <= JUDGE.maxRulesVersion;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** run ID 모양. 이 모양이 아니면 DB에 묻지 않는다 (형식 오류가 DB 변환 오류·500이 되지 않게) */
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v);
}

/**
 * 요청 본문(JSON)을 제출로 바꾼다. 타입을 믿지 않고 하나씩 본다. 값은 새 객체로 복사해 돌려주므로
 * 이후 원본이 바뀌어도 해시·리플레이 입력은 그대로다.
 * 좌표 범위·슬롯이 합법인지는 여기서 보지 않는다 (엔진이 replay에서 판정한다). 모르는 필드는 버린다.
 */
export function parseSubmission(body: unknown): ParseResult {
  if (!isRecord(body)) return { ok: false, code: 'payload-invalid' };
  const { seed, version, clientScore, placements } = body;
  if (!isRulesVersion(version)) return { ok: false, code: 'version-invalid' };
  if (!isSafeInt(seed) || seed < 0 || seed > JUDGE.maxSeed) {
    return { ok: false, code: 'payload-invalid' };
  }
  if (!isSafeInt(clientScore) || clientScore < 0)
    return { ok: false, code: 'client-score-invalid' };
  if (!Array.isArray(placements)) return { ok: false, code: 'placements-invalid' };
  if (placements.length > JUDGE.maxPlacements) return { ok: false, code: 'too-large' };

  const log: Placement[] = [];
  for (const item of placements as unknown[]) {
    if (!isRecord(item)) return { ok: false, code: 'placements-invalid' };
    if (!isSafeInt(item.t) || item.t < 0) return { ok: false, code: 't-invalid' };
    if (!isSafeInt(item.trayIndex) || !isSafeInt(item.row) || !isSafeInt(item.col)) {
      return { ok: false, code: 'placements-invalid' };
    }
    // `+ 0`: JSON의 -0을 0으로 (엔진은 같은 값으로 보고, 해시는 같은 내용으로 본다)
    log.push({
      trayIndex: item.trayIndex + 0,
      row: item.row + 0,
      col: item.col + 0,
      t: item.t + 0,
    });
  }
  return { ok: true, submission: { seed, version, clientScore, placements: log } };
}

/**
 * 제출 내용의 해시(sha256 hex): seed·version·clientScore와 순서를 지킨 배치 로그를 키 순서를 고정한 JSON으로 만든다.
 * parseSubmission을 통과한 값만 넣는다. 문자열은 동기로 만들고 나서 기다리므로(await) 그 사이 입력이 바뀌어도 상관없다.
 * 해시는 비밀·서명이 아니다: 같은 내용 재제출(멱등)과 다른 내용 재사용(충돌)을 가르는 데만 쓴다
 */
export async function submissionHash(submission: Submission): Promise<string> {
  const canonical = JSON.stringify({
    seed: submission.seed,
    version: submission.version,
    clientScore: submission.clientScore,
    placements: submission.placements.map((p) => ({
      trayIndex: p.trayIndex,
      row: p.row,
      col: p.col,
      t: p.t,
    })),
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** run에 저장된 해시와 비교: 처음이면 new, 같은 내용이면 same(저장된 결과를 그대로), 다른 내용이면 conflict */
export function resubmitDecision(
  storedHash: string | null,
  newHash: string,
): 'new' | 'same' | 'conflict' {
  if (storedHash === null) return 'new';
  return storedHash === newHash ? 'same' : 'conflict';
}

export type ReplayReason = 'over' | 'emptySlot' | 'blocked' | 'invalid';

/** 내용 거부: 시간과 무관하게 결정되고, run에 저장한다 */
export type ContentRejection =
  | { ok: false; code: 'seed-mismatch' }
  | { ok: false; code: 'gap-too-short' }
  | { ok: false; code: 'replay-invalid'; index: number; reason: ReplayReason }
  | { ok: false; code: 'not-over' }
  | { ok: false; code: 'score-overflow' }
  | { ok: false; code: 'score-mismatch' };

export type ContentVerdict = { ok: true; score: number } | ContentRejection;

/**
 * 내용 판정: seed(발급한 값) → 간격 → 리플레이 → 게임 오버인지 → 점수.
 * seed는 요청이 아니라 runs 기록의 값으로 리플레이한다 (SPEC 8.1). 빈 로그·끝나지 않은 판은 `not-over`
 * (게임 오버 판만 등록한다: 점수가 맞다는 이유만으로 등록하지 않는다)
 */
export function verifyContent(submission: Submission, run: { seed: number }): ContentVerdict {
  if (submission.seed !== run.seed) return { ok: false, code: 'seed-mismatch' };
  if (!checkIntervals(submission.placements, REPLAY.minIntervalMs)) {
    return { ok: false, code: 'gap-too-short' };
  }
  const result = replay(run.seed, submission.placements);
  if (!result.ok) {
    return { ok: false, code: 'replay-invalid', index: result.index, reason: result.reason };
  }
  if (!result.state.over) return { ok: false, code: 'not-over' };
  const score = result.state.score;
  if (score > JUDGE.maxScore) return { ok: false, code: 'score-overflow' };
  if (score !== submission.clientScore) return { ok: false, code: 'score-mismatch' };
  return { ok: true, score };
}

/**
 * 시간 판정 (저장하지 않는 거부): 마지막 `t`(누적 플레이 시간)가 발급부터 제출까지의 서버 경과보다 크면 `too-fast`.
 * 플레이 시간은 실제 경과를 넘을 수 없다 (일시정지·숨김 시간은 빠지므로 더 작다). 그 밖의 시간 제한(만료·하한)은 없다.
 * 제출 시각이 발급 시각보다 앞서면(서버 시계 이상) 클라이언트 탓이 아니므로 `clock`이고 서버 오류로 처리한다
 */
export function checkElapsed(
  lastT: number,
  issuedAtMs: number,
  submittedAtMs: number,
): 'ok' | 'too-fast' | 'clock' {
  const elapsed = submittedAtMs - issuedAtMs;
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'clock';
  return lastT > elapsed ? 'too-fast' : 'ok';
}

/** run에 저장하는 확정 결과 (`runs.result`). 성공은 확정 시점의 그 주 최고 점수까지 */
export type StoredResult =
  { ok: true; score: number; best: number; isNewBest: boolean } | ContentRejection;

const REJECT_CODES: readonly string[] = [
  'seed-mismatch',
  'gap-too-short',
  'replay-invalid',
  'not-over',
  'score-overflow',
  'score-mismatch',
];
const REPLAY_REASONS: readonly string[] = ['over', 'emptySlot', 'blocked', 'invalid'];

/** DB에서 읽은 `runs.result`를 믿지 않고 모양을 확인한다. 이상하면 null (서버 오류로 처리한다) */
export function readStoredResult(raw: unknown): StoredResult | null {
  if (!isRecord(raw)) return null;
  if (raw.ok === true) {
    const { score, best, isNewBest } = raw;
    if (!isSafeInt(score) || score < 0 || !isSafeInt(best) || best < 0) return null;
    if (typeof isNewBest !== 'boolean') return null;
    return { ok: true, score, best, isNewBest };
  }
  if (raw.ok !== false || typeof raw.code !== 'string' || !REJECT_CODES.includes(raw.code)) {
    return null;
  }
  if (raw.code === 'replay-invalid') {
    if (!isSafeInt(raw.index) || raw.index < 0) return null;
    if (typeof raw.reason !== 'string' || !REPLAY_REASONS.includes(raw.reason)) return null;
    return {
      ok: false,
      code: 'replay-invalid',
      index: raw.index,
      reason: raw.reason as ReplayReason,
    };
  }
  return { ok: false, code: raw.code } as ContentRejection;
}
