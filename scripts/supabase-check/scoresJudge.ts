// 원격 start-run·submit-score 시험(`npm run supabase:check -- --scores`)의 순수 판정 로직. 네트워크를 쓰지 않아 Vitest로 시험한다.
// 판정은 정확한 status·code·본문 필드와 DB 상태로만 PASS한다 (허위 PASS 금지):
// - 서버에 닿지 못했다(status 0)·5xx는 "시험 불가", 기대와 다른 응답은 FAIL. 오류 message·토큰·키·URL·전체 로그는 상세에 남기지 않는다
import { judgeCode, type FnRes } from './nicknameJudge.ts';
import { errText, rowsOf, type Outcome, type Res } from './report.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WEEK = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;

function cannotJudge(res: FnRes): boolean {
  return res.status === 0 || res.status >= 500;
}

function body(res: FnRes): Record<string, unknown> {
  return typeof res.body === 'object' && res.body !== null && !Array.isArray(res.body)
    ? (res.body as Record<string, unknown>)
    : {};
}

function describe(res: FnRes): string {
  const code = body(res).code;
  return `status ${res.status}${typeof code === 'string' ? `, code ${code}` : ''}`;
}

function unverified(res: FnRes): Outcome {
  return { pass: false, unverified: true, detail: `시험 불가: ${describe(res)}` };
}

const isSeed = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
const isCount = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

export interface Started {
  runId: string;
  seed: number;
  weekKey: string;
}

/** start-run 200: UUID runId, uint32 seed(숫자), 서버 규칙 버전, 주 형식 */
export function judgeStarted(res: FnRes, rulesVersion: number): Outcome & { started?: Started } {
  if (cannotJudge(res)) return unverified(res);
  const b = body(res);
  if (res.status !== 200) return { pass: false, detail: `기대 200, 실제 ${describe(res)}` };
  const { runId, seed, version, weekKey } = b;
  if (typeof runId !== 'string' || !UUID.test(runId)) {
    return { pass: false, detail: '200이지만 runId가 UUID가 아님' };
  }
  if (!isSeed(seed))
    return { pass: false, detail: '200이지만 seed가 0~4294967295 정수(숫자)가 아님' };
  if (version !== rulesVersion)
    return { pass: false, detail: '200이지만 version이 서버 규칙 버전과 다름' };
  if (typeof weekKey !== 'string' || !WEEK.test(weekKey)) {
    return { pass: false, detail: '200이지만 weekKey 형식이 다름' };
  }
  return {
    pass: true,
    detail: `status 200, seed ${seed}, ${weekKey}`,
    started: { runId, seed, weekKey },
  };
}

export interface OkExpect {
  score: number;
  weekKey: string;
  /** 알면 그 값과 정확히 같아야 한다 */
  best?: number;
  isNewBest?: boolean;
}

/** submit-score 200: ok·score(검증 점수)·best·weekKey(run을 발급한 주)·isNewBest */
export function judgeSubmitOk(
  res: FnRes,
  expect: OkExpect,
): Outcome & { best?: number; isNewBest?: boolean } {
  if (cannotJudge(res)) return unverified(res);
  if (res.status !== 200) return { pass: false, detail: `기대 200, 실제 ${describe(res)}` };
  const b = body(res);
  const problems: string[] = [];
  if (b.ok !== true) problems.push('ok가 true가 아님');
  if (b.score !== expect.score) problems.push(`score ${String(b.score)} ≠ ${expect.score}`);
  if (b.weekKey !== expect.weekKey)
    problems.push(`weekKey ${String(b.weekKey)} ≠ ${expect.weekKey}`);
  if (!isCount(b.best) || b.best < expect.score) problems.push('best가 점수 이상의 정수가 아님');
  else if (expect.best !== undefined && b.best !== expect.best) {
    problems.push(`best ${b.best} ≠ ${expect.best}`);
  }
  if (typeof b.isNewBest !== 'boolean') problems.push('isNewBest가 boolean이 아님');
  else if (expect.isNewBest !== undefined && b.isNewBest !== expect.isNewBest) {
    problems.push(`isNewBest ${b.isNewBest} ≠ ${expect.isNewBest}`);
  }
  if (problems.length > 0) return { pass: false, detail: problems.join(', ') };
  return {
    pass: true,
    detail: `status 200, score ${expect.score}, best ${String(b.best)}, isNewBest ${String(b.isNewBest)}`,
    best: b.best as number,
    isNewBest: b.isNewBest as boolean,
  };
}

/** 거부: 정확한 status·code. replay-invalid면 index·reason까지 */
export function judgeReject(
  res: FnRes,
  status: number,
  code: string,
  extra?: { index: number; reason: string },
): Outcome {
  const base = judgeCode(res, status, code);
  if (!base.pass || extra === undefined) return base;
  const b = body(res);
  return b.index === extra.index && b.reason === extra.reason && b.ok === false
    ? { pass: true, detail: `${base.detail}, index ${extra.index}, reason ${extra.reason}` }
    : {
        pass: false,
        detail: `${base.detail}이지만 index·reason이 기대(${extra.index}, ${extra.reason})와 다름`,
      };
}

/** 같은 내용 재제출: 둘 다 200이고 본문이 같다 (최초 확정 응답 그대로) */
export function judgeSame(first: FnRes, again: FnRes): Outcome {
  if (cannotJudge(first)) return unverified(first);
  if (cannotJudge(again)) return unverified(again);
  if (first.status !== again.status) {
    return { pass: false, detail: `status가 다름 (${first.status}, ${again.status})` };
  }
  return JSON.stringify(first.body) === JSON.stringify(again.body)
    ? { pass: true, detail: `둘 다 status ${first.status}, 본문 같음` }
    : { pass: false, detail: '본문이 다름' };
}

/**
 * 같은 run에 서로 다른 내용을 동시에 낸 두 응답: 정확히 하나는 409 resubmit-conflict이고 다른 하나는 확정을 이긴 쪽
 * (정상 로그면 200, 점수가 틀린 로그면 400 score-mismatch). 둘 다 이기거나 둘 다 지는 것은 FAIL
 */
export function judgeConflictRace(a: FnRes, b: FnRes): Outcome & { winner?: 'first' | 'second' } {
  if (cannotJudge(a)) return unverified(a);
  if (cannotJudge(b)) return unverified(b);
  const isConflict = (r: FnRes): boolean =>
    r.status === 409 && body(r).code === 'resubmit-conflict';
  const isWin = (r: FnRes): boolean =>
    r.status === 200 || (r.status === 400 && body(r).code === 'score-mismatch');
  if (isConflict(b) && isWin(a)) {
    return { pass: true, detail: `${a.status}, 409 resubmit-conflict`, winner: 'first' };
  }
  if (isConflict(a) && isWin(b)) {
    return { pass: true, detail: `409 resubmit-conflict, ${b.status}`, winner: 'second' };
  }
  return { pass: false, detail: `기대 확정 하나·409 하나. 실제 ${describe(a)} / ${describe(b)}` };
}

export interface RunExpect {
  userId: string;
  seed: number;
  rulesVersion: number;
  weekKey: string;
  /** true면 제출 확정됨(submitted_at·submission_hash·result가 모두 있음), false면 셋 다 null */
  submitted: boolean;
}

/** 본인 run을 REST로 읽은 결과: 오류 없이 정확히 1행이고 값이 맞다 (0행은 PASS가 아니다) */
export function judgeOwnRun(res: Res, expect: RunExpect): Outcome {
  if (res.error) return { pass: false, detail: `runs 조회 실패: ${errText(res)}` };
  const rows = rowsOf(res);
  if (rows.length !== 1) return { pass: false, detail: `기대 1행, 실제 ${rows.length}행` };
  const r = rows[0] as Record<string, unknown>;
  const problems: string[] = [];
  if (r.user_id !== expect.userId) problems.push('user_id');
  if (r.seed !== expect.seed) problems.push('seed');
  if (r.rules_version !== expect.rulesVersion) problems.push('rules_version');
  if (r.week_key !== expect.weekKey) problems.push('week_key');
  if (typeof r.created_at !== 'string' || Number.isNaN(Date.parse(r.created_at)))
    problems.push('created_at');
  const filled = [r.submitted_at, r.submission_hash, r.result].map(
    (v) => v !== null && v !== undefined,
  );
  const expected = expect.submitted;
  if (filled.some((f) => f !== expected)) {
    problems.push(
      expected ? '제출 필드가 모두 채워지지 않음' : '미제출인데 제출 필드가 채워져 있음',
    );
  }
  return problems.length === 0
    ? { pass: true, detail: `1행 일치, ${expected ? '제출 확정' : '미제출'}` }
    : { pass: false, detail: `불일치: ${problems.join(', ')}` };
}

/** 다른 사용자가 같은 run을 읽으면 오류 없이 0행이다 (본인 읽기가 1행이었다는 양성 대조가 있어야 의미가 있다) */
export function judgeOtherRun(res: Res): Outcome {
  if (res.error) return { pass: false, detail: `runs 조회 실패: ${errText(res)}` };
  const n = rowsOf(res).length;
  return n === 0
    ? { pass: true, detail: '오류 없음, 0행' }
    : { pass: false, detail: `${n}행이 보임 (남의 run)` };
}

/** 주간 점수 행: 정확히 1행, best_score가 기대와 같고 run_id가 허용된 run 중 하나 */
export function judgeWeekly(
  res: Res,
  expectBest: number,
  allowedRunIds: readonly string[],
): Outcome {
  if (res.error) return { pass: false, detail: `weekly_scores 조회 실패: ${errText(res)}` };
  const rows = rowsOf(res);
  if (rows.length !== 1) return { pass: false, detail: `기대 1행, 실제 ${rows.length}행` };
  const r = rows[0] as Record<string, unknown>;
  if (r.best_score !== expectBest) {
    return { pass: false, detail: `best_score ${String(r.best_score)} ≠ ${expectBest}` };
  }
  if (typeof r.run_id !== 'string' || !allowedRunIds.includes(r.run_id)) {
    return { pass: false, detail: 'run_id가 최고 점수를 낸 run이 아님' };
  }
  return { pass: true, detail: `1행, best_score ${expectBest}` };
}
