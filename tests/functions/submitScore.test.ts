import { describe, expect, it } from 'vitest';
import { JUDGE } from '../../src/replay/judge';
import { handleSubmitScore } from '../../supabase/functions/submit-score/handler';
import { games, withTimes } from '../helpers/randomBot';
import { FakeRunsDb, HEADERS, ORIGIN, post } from './fakeRunsDb';

const URL_ = 'https://f.example/submit-score';
const RUN_A = '10000000-0000-4000-8000-00000000000a';
const RUN_B = '10000000-0000-4000-8000-00000000000b';

const game = (seed: number) => {
  const g = games()[seed - 1];
  if (!g) throw new Error(`seed ${seed} 없음`);
  return g;
};

/** 봇 판(seed)의 정상 제출 본문 */
function bodyFor(runId: string, seed: number, over: Record<string, unknown> = {}) {
  const g = game(seed);
  return {
    runId,
    seed,
    version: 1,
    clientScore: g.state.score,
    placements: withTimes(g.log),
    ...over,
  };
}

/** 마지막 t가 서버 경과 안에 들어오도록 발급 시각을 맞춘 run */
function setup(seed = 1, user = 'user-a', runId = RUN_A) {
  const db = new FakeRunsDb();
  const g = game(seed);
  const lastT = withTimes(g.log).at(-1)?.t ?? 0;
  // 발급 시각 = 지금 − (마지막 t + 5초)
  db.addRun(runId, user, seed, { createdAtMs: db.clock - lastT - 5000 });
  return { db, lastT, g };
}

async function submit(db: FakeRunsDb, body: unknown, init: Parameters<typeof post>[2] = {}) {
  const res = await handleSubmitScore(db.deps(), post(URL_, body, init));
  return {
    status: res.status,
    body: (await res.json().catch(() => null)) as Record<string, unknown> | null,
    res,
  };
}

describe('submit-score: 정상', () => {
  it('종료된 판을 제출하면 200과 점수·최고 점수·주·isNewBest', async () => {
    const { db, g } = setup();
    const r = await submit(db, bodyFor(RUN_A, 1));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      ok: true,
      score: g.state.score,
      best: g.state.score,
      weekKey: '2026-W46',
      isNewBest: true,
    });
    expect(db.best('user-a')).toEqual({ best: g.state.score, runId: RUN_A });
    expect(db.runs.get(RUN_A)?.submissionHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('봇 로그 200개 모두 같은 점수로 200 (분모는 200, 예외·건너뛴 판 없음)', async () => {
    let done = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { db, g } = setup(seed);
      const r = await submit(db, bodyFor(RUN_A, seed));
      expect(r.status, `seed ${seed}`).toBe(200);
      expect(r.body?.score, `seed ${seed}`).toBe(g.state.score);
      expect(r.body?.best, `seed ${seed}`).toBe(g.state.score);
      done += 1;
    }
    expect(done).toBe(200);
  });

  it('응답은 CORS 헤더(허용 출처)를 싣는다', async () => {
    const { db } = setup();
    const { res } = await submit(db, bodyFor(RUN_A, 1));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });
});

describe('submit-score: 같은 run 재제출', () => {
  it('같은 내용은 최초 응답과 같고 다시 확정·기록하지 않는다 (키 순서·공백이 달라도)', async () => {
    const { db } = setup();
    const first = await submit(db, bodyFor(RUN_A, 1));
    expect(db.commits).toBe(1);
    const again = await submit(db, bodyFor(RUN_A, 1));
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    // 키 순서를 바꾼 원문
    const b = bodyFor(RUN_A, 1);
    const reordered = JSON.stringify({
      placements: b.placements,
      version: 1,
      seed: 1,
      clientScore: b.clientScore,
      runId: RUN_A,
    });
    const third = await handleSubmitScore(db.deps(), post(URL_, null, { raw: reordered }));
    expect(third.status).toBe(200);
    expect(await third.json()).toEqual(first.body);
    expect(db.commits).toBe(1);
  });

  it('이후 다른 run이 최고 점수를 올려도 같은 내용 재제출은 그때의 응답 그대로', async () => {
    const { db, g } = setup(1);
    const first = await submit(db, bodyFor(RUN_A, 1));
    // 같은 사용자의 더 높은 판
    const higher = games().find((x) => x.state.score > g.state.score);
    expect(higher).toBeDefined();
    const lastT = withTimes(higher!.log).at(-1)!.t;
    db.addRun(RUN_B, 'user-a', higher!.seed, { createdAtMs: db.clock - lastT - 5000 });
    const second = await submit(db, bodyFor(RUN_B, higher!.seed));
    expect(second.body).toMatchObject({ best: higher!.state.score, isNewBest: true });
    const replayFirst = await submit(db, bodyFor(RUN_A, 1));
    expect(replayFirst.body).toEqual(first.body);
  });

  it('다른 내용으로 이미 쓴 run을 다시 쓰면 409 resubmit-conflict, 기존 결과·최고 점수는 그대로', async () => {
    const { db, g } = setup();
    await submit(db, bodyFor(RUN_A, 1));
    const before = structuredClone(db.best('user-a'));
    const changes: Record<string, unknown>[] = [
      { clientScore: g.state.score + 1 },
      { placements: withTimes(g.log, 260) },
      { placements: withTimes(g.log).slice(0, -1) },
      { version: 2 },
    ];
    for (const change of changes) {
      const r = await submit(db, bodyFor(RUN_A, 1, change));
      expect(r.status, JSON.stringify(Object.keys(change))).toBe(409);
      expect(r.body).toEqual({ ok: false, code: 'resubmit-conflict' });
    }
    expect(db.best('user-a')).toEqual(before);
    expect(db.commits).toBe(1);
  });

  it('저장된 거부와 같은 내용은 같은 거부, 다른 내용은 409', async () => {
    const { db, g } = setup();
    const wrong = bodyFor(RUN_A, 1, { clientScore: g.state.score + 1 });
    const first = await submit(db, wrong);
    expect(first.status).toBe(400);
    expect(first.body).toEqual({ ok: false, code: 'score-mismatch' });
    expect(db.best('user-a')).toBeUndefined();
    const same = await submit(db, wrong);
    expect(same.status).toBe(400);
    expect(same.body).toEqual(first.body);
    // 맞는 점수로 고쳐서 다시 → 이미 소비된 run
    const fixed = await submit(db, bodyFor(RUN_A, 1));
    expect(fixed.status).toBe(409);
    expect(db.best('user-a')).toBeUndefined();
  });
});

describe('submit-score: 거부', () => {
  const reject = async (
    over: Record<string, unknown>,
    seed = 1,
  ): Promise<{ status: number; body: Record<string, unknown> | null; db: FakeRunsDb }> => {
    const { db } = setup(seed);
    const r = await submit(db, bodyFor(RUN_A, seed, over));
    return { status: r.status, body: r.body, db };
  };

  it('clientScore ±1 → 400 score-mismatch (저장, 주간 불변)', async () => {
    const g = game(1);
    for (const d of [-1, 1]) {
      const r = await reject({ clientScore: g.state.score + d });
      expect([r.status, r.body]).toEqual([400, { ok: false, code: 'score-mismatch' }]);
      expect(r.db.runs.get(RUN_A)?.submissionHash).not.toBeNull();
      expect(r.db.best('user-a')).toBeUndefined();
    }
  });

  it('seed가 발급 seed와 다르면 400 seed-mismatch, 범위·타입이 틀리면 400 payload-invalid', async () => {
    expect((await reject({ seed: 2 })).body).toEqual({ ok: false, code: 'seed-mismatch' });
    for (const seed of [-1, 4294967296, 1.5, '1', null]) {
      const r = await reject({ seed });
      expect([r.status, r.body], String(seed)).toEqual([
        400,
        { ok: false, code: 'payload-invalid' },
      ]);
      expect(r.db.runs.get(RUN_A)?.submissionHash).toBeNull();
    }
  });

  it('간격 199ms → 400 gap-too-short, 같은 t·줄어드는 t도', async () => {
    const g = game(1);
    const mk = (gap: number) => {
      const p = withTimes(g.log);
      for (let i = 1; i < p.length; i++) p[i] = { ...p[i]!, t: p[0]!.t + gap + (i - 1) * 250 };
      return p;
    };
    expect((await reject({ placements: mk(199) })).body).toEqual({
      ok: false,
      code: 'gap-too-short',
    });
    expect((await reject({ placements: mk(200) })).status).toBe(200);
    expect((await reject({ placements: mk(0) })).body).toEqual({
      ok: false,
      code: 'gap-too-short',
    });
    expect((await reject({ placements: mk(-100) })).body).toEqual({
      ok: false,
      code: 'gap-too-short',
    });
  });

  it('로그가 틀리면 400 replay-invalid와 index·reason, 게임 오버 뒤 배치는 reason over', async () => {
    const g = game(1);
    const p = withTimes(g.log);
    const blocked = p.map((x, i) => (i === 2 ? { ...x, row: 99 } : x));
    const r1 = await reject({ placements: blocked });
    expect([r1.status, r1.body]).toEqual([
      400,
      { ok: false, code: 'replay-invalid', index: 2, reason: 'blocked' },
    ]);
    const more = withTimes([...g.log, g.log[0]!, g.log[1]!]);
    const r2 = await reject({ placements: more });
    expect(r2.body).toEqual({
      ok: false,
      code: 'replay-invalid',
      index: g.log.length,
      reason: 'over',
    });
    expect(r2.db.best('user-a')).toBeUndefined();
  });

  it('빈 로그·끝나지 않은 판은 400 not-over (저장, 주간 불변)', async () => {
    const g = game(1);
    const empty = await reject({ placements: [], clientScore: 0 });
    expect([empty.status, empty.body]).toEqual([400, { ok: false, code: 'not-over' }]);
    expect(empty.db.runs.get(RUN_A)?.submissionHash).not.toBeNull();
    const prefix = await reject({ placements: withTimes(g.log.slice(0, -1)), clientScore: 0 });
    expect(prefix.body).toEqual({ ok: false, code: 'not-over' });
    expect(prefix.db.best('user-a')).toBeUndefined();
  });

  it('형식 오류 코드와 상태 (저장하지 않는다)', async () => {
    const cases: [Record<string, unknown>, number, string][] = [
      [{ version: '1' }, 400, 'version-invalid'],
      [{ version: null }, 400, 'version-invalid'],
      [{ clientScore: -1 }, 400, 'client-score-invalid'],
      [{ clientScore: 1.5 }, 400, 'client-score-invalid'],
      [{ clientScore: '10' }, 400, 'client-score-invalid'],
      [{ placements: null }, 400, 'placements-invalid'],
      [{ placements: [null] }, 400, 'placements-invalid'],
      [{ placements: [{ trayIndex: 0, row: 0, col: 0, t: -1 }] }, 400, 't-invalid'],
      [{ placements: [{ trayIndex: 0, row: 0, col: 0, t: 1.5 }] }, 400, 't-invalid'],
      [{ placements: [{ trayIndex: 0, row: 'x', col: 0, t: 1 }] }, 400, 'placements-invalid'],
    ];
    for (const [over, status, code] of cases) {
      const r = await reject(over);
      expect([r.status, r.body], JSON.stringify(over)).toEqual([status, { ok: false, code }]);
      expect(r.db.runs.get(RUN_A)?.submissionHash).toBeNull();
      expect(r.db.commits).toBe(0);
    }
  });

  it('clientScore 1e309(JSON)는 client-score-invalid', async () => {
    const { db } = setup();
    const text = JSON.stringify(bodyFor(RUN_A, 1)).replace(
      /"clientScore":\d+/,
      '"clientScore":1e309',
    );
    const res = await handleSubmitScore(db.deps(), post(URL_, null, { raw: text }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, code: 'client-score-invalid' });
  });

  it('깨진 JSON·root가 null·배열·숫자·runId 누락은 400 payload-invalid', async () => {
    const { db } = setup();
    for (const raw of ['{"runId":', 'null', '[]', '5', '"x"', '{}', '{"runId":5}']) {
      const res = await handleSubmitScore(db.deps(), post(URL_, null, { raw }));
      expect([res.status, await res.json()], raw).toEqual([
        400,
        { ok: false, code: 'payload-invalid' },
      ]);
    }
    expect(db.commits).toBe(0);
  });

  it('요청 version·run의 version·서버 version이 하나라도 다르면 409 version-mismatch (저장하지 않음)', async () => {
    const a = setup();
    const r1 = await submit(a.db, bodyFor(RUN_A, 1, { version: 2 }));
    expect([r1.status, r1.body]).toEqual([409, { ok: false, code: 'version-mismatch' }]);
    expect(a.db.runs.get(RUN_A)?.submissionHash).toBeNull();

    const b = setup();
    b.db.runs.get(RUN_A)!.rulesVersion = 0; // 발급 때의 버전이 지금과 다르다
    const r2 = await submit(b.db, bodyFor(RUN_A, 1));
    expect(r2.body).toEqual({ ok: false, code: 'version-mismatch' });

    const c = setup();
    c.db.rulesVersion = 2; // 서버가 새 버전으로 배포됐다
    const r3 = await submit(c.db, bodyFor(RUN_A, 1));
    expect(r3.body).toEqual({ ok: false, code: 'version-mismatch' });
    expect(c.db.commits + a.db.commits + b.db.commits).toBe(0);
    // 맞는 배포로 돌아오면 같은 run을 다시 낼 수 있다
    c.db.rulesVersion = 1;
    expect((await submit(c.db, bodyFor(RUN_A, 1))).status).toBe(200);
  });

  it('규칙이 바뀐 뒤에도 이미 확정된 run의 같은 내용 재제출은 저장된 결과를 돌려준다', async () => {
    const { db } = setup();
    const first = await submit(db, bodyFor(RUN_A, 1));
    db.rulesVersion = 2;
    db.runs.get(RUN_A)!.rulesVersion = 1;
    const again = await submit(db, bodyFor(RUN_A, 1));
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
  });
});

describe('submit-score: 소유자·run', () => {
  it('B가 A의 run을 제출하면 404 not-found, 없는 UUID도 같은 응답, A의 run·주간은 그대로', async () => {
    const { db } = setup();
    const other = await submit(db, bodyFor(RUN_A, 1), { token: 'tokenB' });
    expect([other.status, other.body]).toEqual([404, { ok: false, code: 'not-found' }]);
    const missing = await submit(db, bodyFor('10000000-0000-4000-8000-0000000000ff', 1));
    expect([missing.status, missing.body]).toEqual([404, { ok: false, code: 'not-found' }]);
    expect(db.runs.get(RUN_A)?.submissionHash).toBeNull();
    expect(db.commits).toBe(0);
    expect(db.best('user-a')).toBeUndefined();
    expect(db.best('user-b')).toBeUndefined();
  });

  it('UUID가 아닌 runId는 DB에 묻지 않고 404', async () => {
    const { db } = setup();
    for (const runId of ['abc', '', "1' or '1'='1", '10000000-0000-4000-8000-00000000000']) {
      const r = await submit(db, bodyFor(runId, 1));
      expect([r.status, r.body], runId).toEqual([404, { ok: false, code: 'not-found' }]);
    }
    expect(db.getRunCalls).toEqual([]);
  });
});

describe('submit-score: 시간', () => {
  it('마지막 t가 서버 경과보다 1ms 크면 400 too-fast(저장 안 함), 같거나 작으면 통과', async () => {
    const { db, lastT } = setup();
    const run = db.runs.get(RUN_A)!;
    run.createdAtMs = db.clock - (lastT - 1);
    const early = await submit(db, bodyFor(RUN_A, 1));
    expect([early.status, early.body]).toEqual([400, { ok: false, code: 'too-fast' }]);
    expect(db.runs.get(RUN_A)?.submissionHash).toBeNull();
    expect(db.commits).toBe(0);
    // 같은 내용이 시간이 흐른 뒤(경과 = lastT) 그대로 통과한다
    run.createdAtMs = db.clock - lastT;
    expect((await submit(db, bodyFor(RUN_A, 1))).status).toBe(200);
  });

  it('경과 = 마지막 t −1 / 같음 / +1', async () => {
    for (const [delta, expected] of [
      [-1, 400],
      [0, 200],
      [1, 200],
    ] as const) {
      const { db, lastT } = setup();
      db.runs.get(RUN_A)!.createdAtMs = db.clock - (lastT + delta);
      expect((await submit(db, bodyFor(RUN_A, 1))).status, String(delta)).toBe(expected);
    }
  });

  it('며칠 뒤 제출해도 만료 없이 통과하고 시작한 주로 기록한다', async () => {
    const { db, g } = setup();
    const run = db.runs.get(RUN_A)!;
    run.weekKey = '2026-W45';
    run.createdAtMs = db.clock - 9 * 24 * 60 * 60 * 1000;
    const r = await submit(db, bodyFor(RUN_A, 1));
    expect(r.body).toEqual({
      ok: true,
      score: g.state.score,
      best: g.state.score,
      weekKey: '2026-W45',
      isNewBest: true,
    });
    expect(db.best('user-a', '2026-W45')?.best).toBe(g.state.score);
    expect(db.best('user-a', '2026-W46')).toBeUndefined();
  });

  it('제출 시각이 발급 시각보다 앞서면 500 server (클라이언트 거부로 소비하지 않는다)', async () => {
    const { db } = setup();
    db.runs.get(RUN_A)!.createdAtMs = db.clock + 1000;
    const r = await submit(db, bodyFor(RUN_A, 1));
    expect([r.status, r.body]).toEqual([500, { code: 'server' }]);
    expect(db.runs.get(RUN_A)?.submissionHash).toBeNull();
    expect(db.errors).toHaveLength(1);
  });

  it('내용이 틀린 로그는 시간과 무관하게 거부된다 (too-fast보다 내용 거부가 먼저 저장)', async () => {
    const { db, g } = setup();
    db.runs.get(RUN_A)!.createdAtMs = db.clock; // 경과 0
    const r = await submit(db, bodyFor(RUN_A, 1, { clientScore: g.state.score + 1 }));
    expect(r.body).toEqual({ ok: false, code: 'score-mismatch' });
  });
});

describe('submit-score: 주간 최고 점수', () => {
  const pair = () => {
    const sorted = [...games()].sort((a, b) => a.state.score - b.state.score);
    const low = sorted.find((g) => g.state.score > 0)!;
    const high = sorted[sorted.length - 1]!;
    expect(high.state.score).toBeGreaterThan(low.state.score);
    return { low, high };
  };
  const addRun = (db: FakeRunsDb, id: string, seed: number) => {
    const lastT = withTimes(game(seed).log).at(-1)!.t;
    db.addRun(id, 'user-a', seed, { createdAtMs: db.clock - lastT - 5000 });
  };

  it('높은 판 → 낮은 판: 낮은 판은 200이지만 best 유지·isNewBest false·기존 run_id', async () => {
    const { low, high } = pair();
    const db = new FakeRunsDb();
    addRun(db, RUN_A, high.seed);
    addRun(db, RUN_B, low.seed);
    await submit(db, bodyFor(RUN_A, high.seed));
    const r = await submit(db, bodyFor(RUN_B, low.seed));
    expect(r.body).toMatchObject({
      ok: true,
      score: low.state.score,
      best: high.state.score,
      isNewBest: false,
    });
    expect(db.best('user-a')).toEqual({ best: high.state.score, runId: RUN_A });
  });

  it('낮은 판 → 높은 판: 갱신 isNewBest true, 1행', async () => {
    const { low, high } = pair();
    const db = new FakeRunsDb();
    addRun(db, RUN_A, low.seed);
    addRun(db, RUN_B, high.seed);
    await submit(db, bodyFor(RUN_A, low.seed));
    const r = await submit(db, bodyFor(RUN_B, high.seed));
    expect(r.body).toMatchObject({ best: high.state.score, isNewBest: true });
    expect(db.weekly.size).toBe(1);
    expect(db.best('user-a')?.runId).toBe(RUN_B);
  });
});

describe('submit-score: 동시 제출', () => {
  it('같은 run·같은 내용 두 요청이 겹쳐도 확정·기록은 한 번이고 응답은 같다', async () => {
    const { db } = setup();
    db.yieldMs = 5; // 둘 다 확정 전의 run을 읽는다
    const [a, b] = await Promise.all([
      submit(db, bodyFor(RUN_A, 1)),
      submit(db, bodyFor(RUN_A, 1)),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body).toEqual(b.body);
    expect(db.commits).toBe(1);
    expect(db.weekly.size).toBe(1);
  });

  it('같은 run·다른 내용 두 요청: 먼저 확정한 하나만 이기고 다른 쪽은 409', async () => {
    const { db, g } = setup();
    db.yieldMs = 5;
    const [a, b] = await Promise.all([
      submit(db, bodyFor(RUN_A, 1)),
      submit(db, bodyFor(RUN_A, 1, { clientScore: g.state.score + 1 })),
    ]);
    expect(db.commits).toBe(1);
    const statuses = [a.status, b.status].sort();
    // 정상 요청이 먼저면 [200, 409], 틀린 요청이 먼저 확정되면 [400, 409]
    expect(statuses[1]).toBe(409);
    expect([200, 400]).toContain(statuses[0]);
    // 최종 DB는 먼저 확정한 쪽과 일치
    const stored = db.runs.get(RUN_A)!.result as { ok: boolean };
    expect(stored.ok ? db.weekly.size : db.weekly.size + 1).toBe(1);
  });
});

describe('submit-score: 인증·CORS·메서드', () => {
  it('토큰이 없거나 무효하면 401 (DB 조회 없음)', async () => {
    const { db } = setup();
    for (const token of [null, 'bad', 'tokenZ']) {
      const r = await submit(db, bodyFor(RUN_A, 1), { token });
      expect([r.status, r.body], String(token)).toEqual([401, { code: 'unauthorized' }]);
    }
    expect(db.getRunCalls).toEqual([]);
  });

  it('인증 서버 장애는 401이 아니라 500 (비밀·메시지 비노출), 오류는 reportError로만', async () => {
    const { db } = setup();
    db.getUserError = new Error('secret-token-abc SQL select * from runs');
    const r = await submit(db, bodyFor(RUN_A, 1));
    expect([r.status, r.body]).toEqual([500, { code: 'server' }]);
    expect(JSON.stringify(r.body)).not.toMatch(/secret|SQL|token/i);
    expect(db.errors).toHaveLength(1);
  });

  it('DB 오류·확정 결과 손상도 500', async () => {
    const a = setup();
    a.db.commitError = new Error('boom');
    expect((await submit(a.db, bodyFor(RUN_A, 1))).status).toBe(500);
    expect(a.db.runs.get(RUN_A)?.submissionHash).toBeNull();
    const b = setup();
    expect((await submit(b.db, bodyFor(RUN_A, 1))).status).toBe(200);
    b.db.runs.get(RUN_A)!.result = { ok: 'maybe' }; // 저장된 결과가 손상됨
    expect((await submit(b.db, bodyFor(RUN_A, 1))).status).toBe(500);
  });

  it('허용 밖 Origin POST는 403, 허용 밖·허용 OPTIONS는 403·204, Origin 없는 POST는 토큰으로 판정', async () => {
    const { db } = setup();
    const bad = await submit(db, bodyFor(RUN_A, 1), { origin: 'https://evil.example' });
    expect([bad.status, bad.body]).toEqual([403, { code: 'origin' }]);
    expect(bad.res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(db.getRunCalls).toEqual([]);

    const optBad = await handleSubmitScore(
      db.deps(),
      new Request(URL_, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }),
    );
    expect(optBad.status).toBe(403);
    expect(optBad.headers.get('Access-Control-Allow-Origin')).toBeNull();

    const optOk = await handleSubmitScore(
      db.deps(),
      new Request(URL_, { method: 'OPTIONS', headers: { Origin: ORIGIN } }),
    );
    expect(optOk.status).toBe(204);
    expect(optOk.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(optOk.headers.get('Access-Control-Allow-Headers')).toBe(HEADERS);
    expect(optOk.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');

    expect((await submit(db, bodyFor(RUN_A, 1), { origin: null })).status).toBe(200);
    expect((await submit(db, bodyFor(RUN_A, 1), { origin: null, token: null })).status).toBe(401);
  });

  it('POST·OPTIONS 외 메서드는 405 (DB 조회 없음)', async () => {
    const { db } = setup();
    for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
      const res = await handleSubmitScore(db.deps(), new Request(URL_, { method }));
      expect([res.status, await res.json()], method).toEqual([405, { code: 'method' }]);
    }
    expect(db.getRunCalls).toEqual([]);
  });
});

describe('submit-score: 본문 크기', () => {
  /** 공백으로 채워 정확히 bytes 바이트인 JSON 본문 */
  const padded = (obj: unknown, bytes: number): string => {
    const text = JSON.stringify(obj);
    const len = new TextEncoder().encode(text).length;
    if (len > bytes) throw new Error('이미 더 큼');
    return text + ' '.repeat(bytes - len);
  };

  it('상한 −1·정확히 상한은 통과하고 +1은 413 (JSON 파싱·DB 전에 끊는다)', async () => {
    const { db } = setup();
    for (const [size, status] of [
      [JUDGE.maxBodyBytes - 1, 200],
      [JUDGE.maxBodyBytes, 200],
    ] as const) {
      const { db: d } = setup();
      const res = await handleSubmitScore(
        d.deps(),
        post(URL_, null, { raw: padded(bodyFor(RUN_A, 1), size) }),
      );
      expect(res.status, String(size)).toBe(status);
    }
    const over = await handleSubmitScore(
      db.deps(),
      post(URL_, null, { raw: padded(bodyFor(RUN_A, 1), JUDGE.maxBodyBytes + 1) }),
    );
    expect([over.status, await over.json()]).toEqual([413, { code: 'too-large' }]);
    expect(db.getRunCalls).toEqual([]);
  });

  it('한글 등 여러 바이트 글자도 바이트로 센다', async () => {
    const { db } = setup();
    const body = { ...bodyFor(RUN_A, 1), memo: '가'.repeat(Math.ceil(JUDGE.maxBodyBytes / 3)) };
    const res = await handleSubmitScore(db.deps(), post(URL_, body));
    expect(res.status).toBe(413);
  });

  it('Content-Length가 없거나 작게 거짓이어도 읽는 바이트로 상한을 넘기면 413', async () => {
    const { db } = setup();
    const chunk = new Uint8Array(100_000).fill(0x20);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > JUDGE.maxBodyBytes + chunk.length) {
          controller.close();
          return;
        }
        sent += chunk.length;
        controller.enqueue(chunk);
      },
    });
    const req = new Request(URL_, {
      method: 'POST',
      headers: { Authorization: 'Bearer tokenA', Origin: ORIGIN, 'Content-Length': '10' },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    const res = await handleSubmitScore(db.deps(), req);
    expect(res.status).toBe(413);
    // 상한을 넘자 읽기를 멈췄다 (끝까지 읽지 않음)
    expect(sent).toBeLessThanOrEqual(JUDGE.maxBodyBytes + 2 * chunk.length);
  });

  it('배치 20,001개는 413 too-large, 20,000개는 크기 때문에 거부되지 않고 규칙 판정으로 간다', async () => {
    const mk = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ trayIndex: 0, row: 0, col: 0, t: i * 200 }));
    const { db } = setup();
    const tooMany = await submit(
      db,
      bodyFor(RUN_A, 1, { placements: mk(JUDGE.maxPlacements + 1) }),
    );
    expect([tooMany.status, tooMany.body]).toEqual([413, { ok: false, code: 'too-large' }]);
    const max = await submit(db, bodyFor(RUN_A, 1, { placements: mk(JUDGE.maxPlacements) }));
    // 같은 칸을 계속 놓는 불법 로그라 규칙 판정에서 거부된다 (크기 때문이 아니다)
    expect(max.status).toBe(400);
    expect(max.body).toMatchObject({ ok: false, code: 'replay-invalid' });
  });
});
