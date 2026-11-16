// start-run·submit-score handler 시험용 가짜 DB. SQL 함수 commit_submission의 규칙을 그대로 따른다
// (run 소유 확인 → 이미 확정이면 existing → 통과면 주간 최고 점수 갱신 → 결과 저장). 실제 SQL은 PGlite로 따로 확인했다 (W3-03 보고).
import type { ContentVerdict } from '../../src/replay/judge';
import type { StartRunDeps } from '../../supabase/functions/start-run/handler';
import type {
  CommitResult,
  RunRow,
  SubmitScoreDeps,
} from '../../supabase/functions/submit-score/handler';

export interface StoredRun extends RunRow {
  userId: string;
  submittedAtMs: number | null;
}

export interface WeeklyRow {
  best: number;
  runId: string;
}

export const HEADERS = 'authorization, x-client-info, apikey, content-type';
export const ORIGIN = 'https://ddoobyddooby.github.io';

export class FakeRunsDb {
  runs = new Map<string, StoredRun>();
  /** `${userId}|${weekKey}` → 행 */
  weekly = new Map<string, WeeklyRow>();
  commits = 0;
  getRunCalls: [string, string][] = [];
  /** getRun을 읽은 뒤 commit 사이에 다른 요청이 끼어들 틈을 준다 */
  yieldMs = 0;
  clock = 1_800_000_000_000;
  errors: unknown[] = [];
  /** commit에서 던질 오류 */
  commitError: unknown = null;
  /** 토큰 → 사용자 */
  users: Record<string, string> = { tokenA: 'user-a', tokenB: 'user-b' };
  getUserError: unknown = null;
  rulesVersion = 1;

  addRun(id: string, userId: string, seed: number, over: Partial<StoredRun> = {}): StoredRun {
    const run: StoredRun = {
      id,
      userId,
      seed,
      rulesVersion: 1,
      weekKey: '2026-W46',
      createdAtMs: this.clock,
      submissionHash: null,
      result: null,
      submittedAtMs: null,
      ...over,
    };
    this.runs.set(id, run);
    return run;
  }

  best(userId: string, week = '2026-W46'): WeeklyRow | undefined {
    return this.weekly.get(`${userId}|${week}`);
  }

  deps(): SubmitScoreDeps {
    return {
      allowHeaders: HEADERS,
      rulesVersion: this.rulesVersion,
      now: () => this.clock,
      getUserId: async (token) => {
        if (this.getUserError) throw this.getUserError;
        return this.users[token] ?? null;
      },
      getRun: async (runId, userId) => {
        this.getRunCalls.push([runId, userId]);
        const run = this.runs.get(runId);
        // 읽는 시점의 모습을 복사해 돌려준다 (이후 확정돼도 이 요청은 옛 모습을 본다)
        const snapshot = run && run.userId === userId ? { ...run } : null;
        if (this.yieldMs > 0) await new Promise((r) => setTimeout(r, this.yieldMs));
        return snapshot;
      },
      commit: async ({ runId, userId, hash, verdict, submittedAtMs }) =>
        this.commit(runId, userId, hash, verdict, submittedAtMs),
      reportError: (e) => this.errors.push(e),
    };
  }

  /** start-run 시험·로컬 리허설용: 발급한 run이 같은 가짜 DB에 들어간다 */
  startDeps(seeds: () => number): StartRunDeps {
    let n = 0;
    return {
      allowHeaders: HEADERS,
      rulesVersion: this.rulesVersion,
      now: () => this.clock,
      getUserId: async (token) => this.users[token] ?? null,
      randomSeed: seeds,
      insertRun: async (run) => {
        n += 1;
        const id = `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
        this.addRun(id, run.userId, run.seed, {
          rulesVersion: run.rulesVersion,
          weekKey: run.weekKey,
          createdAtMs: run.createdAtMs,
        });
        return id;
      },
      reportError: (e) => this.errors.push(e),
    };
  }

  private async commit(
    runId: string,
    userId: string,
    hash: string,
    verdict: ContentVerdict,
    submittedAtMs: number,
  ): Promise<CommitResult> {
    if (this.commitError) throw this.commitError;
    // 한 트랜잭션: 아래는 await 없이 끝난다 (실제로는 run 행 잠금)
    const run = this.runs.get(runId);
    if (!run || run.userId !== userId) return { status: 'not-found' };
    if (run.submissionHash !== null) {
      return { status: 'existing', hash: run.submissionHash, result: run.result };
    }
    this.commits += 1;
    let result: unknown;
    if (verdict.ok) {
      const key = `${run.userId}|${run.weekKey}`;
      const cur = this.weekly.get(key);
      if (cur === undefined || verdict.score > cur.best) {
        this.weekly.set(key, { best: verdict.score, runId: run.id });
      }
      const row = this.weekly.get(key) as WeeklyRow;
      result = { ok: true, score: verdict.score, best: row.best, isNewBest: row.runId === run.id };
    } else {
      result = verdict;
    }
    run.submissionHash = hash;
    run.result = result;
    run.submittedAtMs = submittedAtMs;
    return { status: 'committed', hash, result };
  }
}

/** POST 요청 */
export function post(
  url: string,
  body: unknown,
  init: { token?: string | null; origin?: string | null; raw?: string } = {},
): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = init.token === undefined ? 'tokenA' : init.token;
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  const origin = init.origin === undefined ? ORIGIN : init.origin;
  if (origin !== null) headers.Origin = origin;
  return new Request(url, {
    method: 'POST',
    headers,
    body: init.raw ?? JSON.stringify(body),
  });
}
