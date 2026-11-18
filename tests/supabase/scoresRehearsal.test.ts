import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { RULES_VERSION } from '../../src/config';
import type { FnRes } from '../../scripts/supabase-check/nicknameJudge';
import { formatTable, exitCodeOf, type Row } from '../../scripts/supabase-check/report';
import { runScores, type ScoresClients, type ScoresIo } from '../../scripts/supabase-check/scores';
import { handleStartRun } from '../../supabase/functions/start-run/handler';
import { handleSubmitScore } from '../../supabase/functions/submit-score/handler';
import { FakeRunsDb, HEADERS, ORIGIN } from '../functions/fakeRunsDb';

// 원격 `--scores` 시험의 로컬 리허설: 실제 handler(start-run·submit-score) + 번들 + 가짜 DB·가짜 시계에 시험 스크립트를 돌려
// 스크립트의 기대 status·code·DB 상태가 우리 서버 코드와 맞는지, 스크립트가 허위 PASS를 내지 않는지 본다.
// 이것은 원격 통과가 아니다 (실제 Supabase·Edge 런타임·RLS·PostgREST는 쓰지 않았다). 실제 원격 실행은 별도 승인 뒤.

interface FakeRest {
  client: SupabaseClient;
}

/** 가짜 REST 클라이언트: RLS처럼 authenticated는 본인 runs만, anon은 runs 거부, 쓰기·RPC는 42501 */
function fakeClient(db: FakeRunsDb, userId: string | null): FakeRest {
  const denied = {
    data: null,
    error: { code: '42501', message: 'permission denied' },
    status: 403,
  };
  const builder = (table: string) => {
    const filters: [string, unknown][] = [];
    let mode: 'select' | 'write' = 'select';
    const chain = {
      select() {
        return chain;
      },
      insert() {
        mode = 'write';
        return chain;
      },
      update() {
        mode = 'write';
        return chain;
      },
      delete() {
        mode = 'write';
        return chain;
      },
      eq(col: string, v: unknown) {
        filters.push([col, v]);
        return chain;
      },
      limit() {
        return chain;
      },
      then(resolve: (v: unknown) => void) {
        if (mode === 'write') return resolve(denied);
        if (table === 'runs') {
          if (userId === null) return resolve(denied);
          const rows = [...db.runs.values()]
            .filter((r) => r.userId === userId)
            .map((r) => ({
              id: r.id,
              user_id: r.userId,
              seed: r.seed,
              rules_version: r.rulesVersion,
              week_key: r.weekKey,
              created_at: new Date(r.createdAtMs).toISOString(),
              submitted_at:
                r.submittedAtMs === null ? null : new Date(r.submittedAtMs).toISOString(),
              submission_hash: r.submissionHash,
              result: r.result,
            }))
            .filter((r) => filters.every(([c, v]) => (r as Record<string, unknown>)[c] === v));
          return resolve({ data: rows, error: null, status: 200 });
        }
        if (table === 'weekly_scores') {
          const rows = [...db.weekly.entries()]
            .map(([k, w]) => {
              const [user, week] = k.split('|');
              return { user_id: user, week_key: week, best_score: w.best, run_id: w.runId };
            })
            .filter((r) => filters.every(([c, v]) => (r as Record<string, unknown>)[c] === v));
          return resolve({ data: rows, error: null, status: 200 });
        }
        return resolve({ data: [], error: null, status: 200 });
      },
    };
    return chain;
  };
  return {
    client: { from: builder, rpc: () => Promise.resolve(denied) } as unknown as SupabaseClient,
  };
}

function setup(over: { sloppyServer?: boolean } = {}) {
  const db = new FakeRunsDb();
  db.rulesVersion = RULES_VERSION; // 규칙 버전은 서버 번들과 같게 (가짜 DB 기본값 1에 묶지 않는다)
  let seedCounter = 1_000;
  const startDeps = db.startDeps(() => (seedCounter = (seedCounter * 1103515245 + 12345) >>> 0));
  const io: ScoresIo = {
    async call(fn, init) {
      const headers: Record<string, string> = {};
      if (init.origin !== null) headers.Origin = init.origin;
      if (init.token !== null) headers.Authorization = `Bearer ${init.token}`;
      const hasBody = init.method === 'POST';
      const req = new Request(`https://f.example/${fn}`, {
        method: init.method,
        headers,
        ...(hasBody ? { body: init.rawBody ?? JSON.stringify(init.body ?? {}) } : {}),
      });
      const res =
        fn === 'start-run'
          ? await handleStartRun(startDeps, req)
          : await handleSubmitScore(db.deps(), req);
      let body: unknown = null;
      try {
        body = JSON.parse(await res.text());
      } catch {
        // 본문 없음 (204·403 preflight)
      }
      return { status: res.status, body, header: (n) => res.headers.get(n) } satisfies FnRes;
    },
    // 가짜 시계: 기다림은 시계를 앞으로 돌린다 (서버의 now와 같은 시계)
    sleep: async (ms) => {
      db.clock += ms;
    },
    now: () => db.clock,
  };
  const clients: ScoresClients = {
    anon: fakeClient(db, null).client,
    a: fakeClient(db, 'user-a').client,
    b: fakeClient(db, 'user-b').client,
    idA: 'user-a',
    idB: 'user-b',
    tokenA: 'tokenA',
    tokenB: 'tokenB',
  };
  void over;
  return { db, io, clients };
}

describe('--scores 로컬 리허설 (실제 handler + 가짜 DB·시계)', () => {
  it('우리 서버 코드에 대해 모든 항목이 PASS하고 종료 코드 0이다', async () => {
    const { io, clients } = setup();
    const rows: Row[] = [];
    await runScores(clients, io, rows, { parity: 6 });
    const failures = rows
      .filter((r) => !r.outcome.pass)
      .map((r) => `${r.id} ${r.label}: ${r.outcome.detail}`);
    expect(failures).toEqual([]);
    expect(exitCodeOf(rows)).toBe(0);
    // 항목 수가 충분하다 (빈 목록이 통과로 보이지 않는다)
    expect(rows.length).toBeGreaterThan(60);
    const ids = new Set(rows.map((r) => r.id));
    for (const id of ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫'])
      expect(ids.has(id), id).toBe(true);
    expect(formatTable(rows).at(-1)).toMatch(/FAIL 0, 시험 불가 0$/);
  });

  it('서버가 점수 검증을 하지 않으면(clientScore 그대로 신뢰) 스크립트가 FAIL을 낸다', async () => {
    const { db, io, clients } = setup();
    // 일부러 망가뜨린 서버: 점수가 틀려도 통과시키도록 submit 응답을 가로챈다
    const real = io.call;
    io.call = async (fn, init) => {
      const res = await real(fn, init);
      const body = init.body as { clientScore?: number } | undefined;
      if (
        fn === 'submit-score' &&
        res.status === 400 &&
        (res.body as { code?: string } | null)?.code === 'score-mismatch'
      ) {
        return {
          status: 200,
          body: {
            ok: true,
            score: body?.clientScore ?? 0,
            best: 1,
            weekKey: '2026-W46',
            isNewBest: true,
          },
          header: () => ORIGIN,
        };
      }
      return res;
    };
    void db;
    const rows: Row[] = [];
    await runScores(clients, io, rows);
    expect(exitCodeOf(rows)).toBe(1);
    expect(rows.some((r) => r.label.includes('clientScore') && !r.outcome.pass)).toBe(true);
  });

  it('함수 호출이 전부 연결 실패(status 0)면 시험 불가가 되어 종료 코드 1이다 (허위 PASS 없음)', async () => {
    const { io, clients } = setup();
    io.call = async () => ({ status: 0, body: null, header: () => null });
    const rows: Row[] = [];
    await runScores(clients, io, rows);
    expect(exitCodeOf(rows)).toBe(1);
    expect(rows.filter((r) => r.outcome.pass).length).toBeLessThan(rows.length);
    // 시험 불가·FAIL 뒤에 예외로 끝나지 않고 표가 만들어진다
    expect(formatTable(rows).length).toBeGreaterThan(5);
  });

  it('시험 요청에 쓰는 허용 출처는 함수가 실제로 허용하는 출처다', () => {
    expect(HEADERS).toContain('authorization');
  });
});
