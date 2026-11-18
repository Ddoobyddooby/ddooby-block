// 원격 start-run·submit-score 시험 (W3-03). `npm run supabase:check -- --scores [--parity[=N]]`
// block 전용 프로젝트에 승인된 마이그레이션·두 함수가 배포된 뒤에만 실행한다 (이 저장소에서는 로컬 리허설 tests/supabase/scoresRehearsal.test.ts까지만 돌렸다).
// publishable key와 익명 로그인 토큰만 쓴다 (service_role 키를 요구하지 않는다). 판정은 scoresJudge.ts (정확한 status·code·본문·DB 상태).
//
// 서버 발급 seed로 봇이 종료된 판 로그를 만들고(서버가 쓰는 생성 번들의 같은 엔진), 마지막 t만큼 실제로 기다린 뒤 제출한다
// (예전 pang의 약 60초 대기는 block 규칙이 아니다). 시간 거부 시험만 첫 t를 미래로 밀어 일부러 이르게 낸다.
// 시험이 원격에 남기는 것: 익명 계정 2개(A·B), A의 runs·weekly_scores 행들 (run 수는 아래 표 + parity 수). 운영 랭킹 공개 전에 정리한다.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  canPlace,
  createGame,
  createRng,
  getPiece,
  nextInt,
  parseSubmission,
  place,
  replay,
  submissionHash,
  RULES_VERSION,
} from '../../supabase/functions/_shared/replay.js';
import {
  judgeCode,
  judgePreflightAllowed,
  judgePreflightDenied,
  judgeUnauthorized,
  type FnRes,
} from './nicknameJudge.ts';
import { denied, failed, type Outcome, type Res, type Row } from './report.ts';
import {
  judgeConflictRace,
  judgeRaceRun,
  judgeOtherRun,
  judgeOwnRun,
  judgeReject,
  judgeSame,
  judgeStarted,
  judgeSubmitOk,
  judgeWeekly,
  type Started,
} from './scoresJudge.ts';

export type FnName = 'start-run' | 'submit-score';

export interface CallInit {
  method: string;
  origin: string | null;
  token: string | null;
  body?: unknown;
  /** 직접 만든 본문 문자열 (본문 크기 시험) */
  rawBody?: string;
}

/** 바깥 세계: 함수 호출·시계. 시험(리허설)이 가짜로 바꿔 끼운다 */
export interface ScoresIo {
  call(fn: FnName, init: CallInit): Promise<FnRes>;
  sleep(ms: number): Promise<void>;
  /** 단조 증가 시계(ms). 시각 판정은 이 시계의 경과로만 한다 */
  now(): number;
}

export interface ScoresClients {
  anon: SupabaseClient;
  a: SupabaseClient;
  b: SupabaseClient;
  idA: string;
  idB: string;
  tokenA: string;
  tokenB: string;
}

export const ALLOWED_ORIGIN = 'http://localhost:5181';
export const OTHER_ALLOWED_ORIGIN = 'https://ddoobyddooby.github.io';
export const DENIED_ORIGIN = 'https://evil.example';
const NIL_UUID = '00000000-0000-4000-8000-000000000000';
const STEP_MS = 250;
const START_T = 300;
/** 마지막 t 뒤에 더 기다리는 여유 (서버 경과는 응답을 받은 시점부터 잰 경과보다 항상 크다. 이 여유는 시계 해상도용) */
const WAIT_MARGIN_MS = 500;
/** 시간 거부 시험: 첫 t를 이만큼 미래로 민다 */
const FUTURE_OFFSET_MS = 15_000;
const MAX_PLACEMENTS = 20_000;
const MAX_BODY_BYTES = 1_500_000;

interface Bot {
  placements: { trayIndex: number; row: number; col: number; t: number }[];
  score: number;
  lastT: number;
}

/** W2-02의 무작위 봇(게임 seed와 다른 seed `1_000_000 + seed`로 후보를 고른다)으로 종료된 판 로그를 만든다 */
export function playBot(seed: number, startT = START_T): Bot {
  let state = createGame(seed);
  let rng = createRng(1_000_000 + seed);
  const log: { trayIndex: number; row: number; col: number }[] = [];
  while (!state.over) {
    if (log.length >= 3000) throw new Error(`봇이 3000배치 안에 끝나지 않음 (seed ${seed})`);
    const cands: { trayIndex: number; row: number; col: number }[] = [];
    state.tray.forEach((id, trayIndex) => {
      const piece = id === null ? undefined : getPiece(id);
      if (piece === undefined) return;
      for (let row = 0; row < state.board.size; row++) {
        for (let col = 0; col < state.board.size; col++) {
          if (canPlace(state.board, piece, { r: row, c: col })) cands.push({ trayIndex, row, col });
        }
      }
    });
    if (cands.length === 0) throw new Error(`놓을 곳이 없는데 끝나지 않음 (seed ${seed})`);
    const [i, next] = nextInt(rng, cands.length);
    rng = next;
    const action = cands[i];
    if (!action) throw new Error('후보 선택 오류');
    const res = place(state, action);
    if (!res.ok) throw new Error(`봇의 수가 거부됨 (seed ${seed})`);
    log.push(action);
    state = res.state;
  }
  const placements = log.map((a, i) => ({ ...a, t: startT + i * STEP_MS }));
  const check = replay(seed, placements);
  if (!check.ok || !check.state.over)
    throw new Error(`봇 로그가 번들 리플레이를 통과하지 못함 (seed ${seed})`);
  return { placements, score: check.state.score, lastT: placements[placements.length - 1]?.t ?? 0 };
}

interface Prepared extends Started {
  /** 응답을 받은 시각 (io.now) */
  at: number;
  bot: Bot;
  token: string;
}

export async function runScores(
  c: ScoresClients,
  io: ScoresIo,
  rows: Row[],
  options: { parity?: number } = {},
): Promise<void> {
  const check = async (id: string, label: string, expect: string, run: () => Promise<Outcome>) => {
    let outcome: Outcome;
    try {
      outcome = await run();
    } catch (e) {
      outcome = failed(e);
    }
    rows.push({ id, label, expect, outcome });
  };
  const start = (token: string | null, body: unknown, origin: string | null = ALLOWED_ORIGIN) =>
    io.call('start-run', { method: 'POST', origin, token, body });
  const submit = (token: string | null, body: unknown, origin: string | null = ALLOWED_ORIGIN) =>
    io.call('submit-score', { method: 'POST', origin, token, body });
  const submitBody = (p: Prepared, over: Record<string, unknown> = {}) => ({
    runId: p.runId,
    seed: p.seed,
    version: RULES_VERSION,
    clientScore: p.bot.score,
    placements: p.bot.placements,
    ...over,
  });
  /** 마지막 t까지 실제로 기다린다 (응답을 받은 뒤의 경과 ≥ 마지막 t + 여유 → 서버 경과도 그 이상이다) */
  const waitReady = async (p: Prepared, extraT = 0) => {
    const need = p.bot.lastT + extraT + WAIT_MARGIN_MS - (io.now() - p.at);
    if (need > 0) await io.sleep(need);
  };

  /** run을 새로 발급받아 판 로그를 만든다. 실패하면 그 사유를 던진다 (뒤 항목은 "시험 불가"로 남는다) */
  const prepare = async (user: 'a' | 'b' = 'a'): Promise<Prepared> => {
    const token = user === 'a' ? c.tokenA : c.tokenB;
    const res = await start(token, { version: RULES_VERSION });
    const judged = judgeStarted(res, RULES_VERSION);
    if (!judged.started) throw new Error(`start-run 실패: ${judged.detail}`);
    return { ...judged.started, at: io.now(), bot: playBot(judged.started.seed), token };
  };

  const accepted: { runId: string; score: number }[] = [];
  let week = '';
  const record = (p: Prepared, ok: boolean) => {
    if (ok) accepted.push({ runId: p.runId, score: p.bot.score });
  };
  const own = (id: string, userClient: SupabaseClient = c.a) =>
    userClient
      .from('runs')
      .select(
        'id, user_id, seed, rules_version, week_key, created_at, submitted_at, submission_hash, result',
      )
      .eq('id', id) as unknown as PromiseLike<Res>;

  // ① start-run
  let p0: Prepared | undefined;
  await check(
    '①',
    'A start-run (양성 대조)',
    '200, UUID runId, uint32 seed, 서버 버전·주',
    async () => {
      const res = await start(c.tokenA, { version: RULES_VERSION });
      const out = judgeStarted(res, RULES_VERSION);
      if (out.started) {
        p0 = { ...out.started, at: io.now(), bot: playBot(out.started.seed), token: c.tokenA };
        week = out.started.weekKey;
      }
      return out;
    },
  );
  await check('①', 'A가 자기 run 읽기', '정확히 1행, 값 일치, 미제출', async () => {
    if (!p0) return { pass: false, detail: '앞 단계(start-run)가 실패해 비교할 수 없음' };
    return judgeOwnRun(await own(p0.runId), {
      userId: c.idA,
      seed: p0.seed,
      rulesVersion: RULES_VERSION,
      weekKey: p0.weekKey,
      submitted: false,
    });
  });
  await check('①', 'B가 A의 run 읽기', '오류 없음, 0행', async () => {
    if (!p0) return { pass: false, detail: '앞 단계(start-run)가 실패해 비교할 수 없음' };
    return judgeOtherRun(await own(p0.runId, c.b));
  });
  await check('①', 'anon runs SELECT', '실패 (42501)', async () =>
    denied((await c.anon.from('runs').select('*').limit(5)) as unknown as Res),
  );
  await check('①', 'version 999999', '409 version-mismatch (run 미발급)', async () =>
    judgeCode(await start(c.tokenA, { version: 999999 }), 409, 'version-mismatch'),
  );
  for (const [label, version] of [
    ['문자열 "1"', '1'],
    ['소수 1.5', 1.5],
    ['null', null],
  ] as const) {
    await check('①', `start-run version ${label}`, '400 version-invalid', async () =>
      judgeCode(await start(c.tokenA, { version }), 400, 'version-invalid'),
    );
  }

  // ② 정상 제출·같은 내용 재제출(멱등)·다른 내용 충돌
  let firstOk: FnRes | undefined;
  if (p0) {
    await waitReady(p0);
    await check('②', 'A 정상 제출', '200, 검증 점수·best·weekKey·isNewBest true', async () => {
      firstOk = await submit(c.tokenA, submitBody(p0 as Prepared));
      const out = judgeSubmitOk(firstOk, {
        score: (p0 as Prepared).bot.score,
        weekKey: (p0 as Prepared).weekKey,
        isNewBest: true,
      });
      record(p0 as Prepared, out.pass);
      return out;
    });
    await check('②', '제출 뒤 A의 run', '정확히 1행, 제출 확정', async () =>
      judgeOwnRun(await own((p0 as Prepared).runId), {
        userId: c.idA,
        seed: (p0 as Prepared).seed,
        rulesVersion: RULES_VERSION,
        weekKey: (p0 as Prepared).weekKey,
        submitted: true,
      }),
    );
    await check('②', '같은 내용 재제출', '최초 응답과 같은 200 본문', async () => {
      if (!firstOk) return { pass: false, detail: '앞 단계(정상 제출)가 실패해 비교할 수 없음' };
      return judgeSame(firstOk, await submit(c.tokenA, submitBody(p0 as Prepared)));
    });
    await check('②', '다른 내용으로 같은 run 재사용', '409 resubmit-conflict', async () =>
      judgeCode(
        await submit(
          c.tokenA,
          submitBody(p0 as Prepared, { clientScore: (p0 as Prepared).bot.score + 1 }),
        ),
        409,
        'resubmit-conflict',
      ),
    );
  }

  // ③ 조작 (새 run마다 한 조건만 바꾼다. 시간은 충분히 흐르게 해 다른 거부로 가려지지 않는다)
  const tamper: {
    label: string;
    make(p: Prepared): Record<string, unknown>;
    status: number;
    code: string;
    extra?(p: Prepared): { index: number; reason: string };
  }[] = [
    {
      label: 'clientScore +1',
      make: (p) => ({ clientScore: p.bot.score + 1 }),
      status: 400,
      code: 'score-mismatch',
    },
    {
      label: 'clientScore −1',
      make: (p) => ({ clientScore: p.bot.score - 1 }),
      status: 400,
      code: 'score-mismatch',
    },
    {
      label: 'seed 다름',
      make: (p) => ({ seed: (p.seed + 1) % 4294967296 }),
      status: 400,
      code: 'seed-mismatch',
    },
    {
      label: '간격 199ms',
      make: (p) => ({
        placements: p.bot.placements.map((q, i) =>
          i === 0 ? q : { ...q, t: p.bot.placements[0]!.t + 199 + (i - 1) * STEP_MS },
        ),
      }),
      status: 400,
      code: 'gap-too-short',
    },
    {
      label: '게임 오버 뒤 배치',
      make: (p) => ({
        placements: [...p.bot.placements, { ...p.bot.placements[0]!, t: p.bot.lastT + STEP_MS }],
      }),
      status: 400,
      code: 'replay-invalid',
      extra: (p) => ({ index: p.bot.placements.length, reason: 'over' }),
    },
    {
      label: '빈 로그',
      make: () => ({ placements: [], clientScore: 0 }),
      status: 400,
      code: 'not-over',
    },
    {
      label: `version ${RULES_VERSION + 1} (서버와 다름)`,
      make: () => ({ version: RULES_VERSION + 1 }),
      status: 409,
      code: 'version-mismatch',
    },
    {
      label: 'seed가 문자열(형식)',
      make: (p) => ({ seed: String(p.seed) }),
      status: 400,
      code: 'payload-invalid',
    },
    {
      label: 'clientScore 음수(형식)',
      make: () => ({ clientScore: -1 }),
      status: 400,
      code: 'client-score-invalid',
    },
    {
      label: 'placements가 null(형식)',
      make: () => ({ placements: null }),
      status: 400,
      code: 'placements-invalid',
    },
    {
      label: 't가 소수(형식)',
      make: (p) => ({
        placements: p.bot.placements.map((q, i) => (i === 0 ? { ...q, t: 1.5 } : q)),
      }),
      status: 400,
      code: 't-invalid',
    },
  ];
  const tampered: Prepared[] = [];
  for (const t of tamper) {
    await check('③', `조작: ${t.label}`, `${t.status} ${t.code}`, async () => {
      const p = await prepare();
      tampered.push(p);
      await waitReady(p);
      const res = await submit(c.tokenA, submitBody(p, t.make(p)));
      return judgeReject(res, t.status, t.code, t.extra?.(p));
    });
  }
  // version-mismatch는 run을 소비하지 않는다: 맞는 버전으로 같은 run을 다시 내면 통과한다
  await check('③', 'version-mismatch 뒤 같은 run 정상 제출', '200 (run 미소비)', async () => {
    const idx = tamper.findIndex((t) => t.code === 'version-mismatch');
    const p = tampered[idx];
    if (!p) return { pass: false, detail: '앞 단계가 실패해 비교할 수 없음' };
    const res = await submit(c.tokenA, submitBody(p));
    const out = judgeSubmitOk(res, { score: p.bot.score, weekKey: p.weekKey });
    record(p, out.pass);
    return out;
  });

  // ④ 시간: 너무 이른 제출은 저장하지 않고, 같은 내용이 시간이 흐른 뒤 통과한다
  await check('④', '이른 제출(첫 t를 미래로)', '400 too-fast, run 미확정', async () => {
    const p = await prepare();
    const shifted = p.bot.placements.map((q) => ({ ...q, t: q.t + FUTURE_OFFSET_MS }));
    const body = submitBody(p, { placements: shifted });
    const res = await submit(c.tokenA, body);
    const verdict = judgeReject(res, 400, 'too-fast');
    if (!verdict.pass) return verdict;
    const row = judgeOwnRun(await own(p.runId), {
      userId: c.idA,
      seed: p.seed,
      rulesVersion: RULES_VERSION,
      weekKey: p.weekKey,
      submitted: false,
    });
    if (!row.pass) return { pass: false, detail: `too-fast 뒤 run 상태: ${row.detail}` };
    // 같은 내용을 마지막 t가 지날 때까지 기다린 뒤 다시 낸다
    await waitReady(p, FUTURE_OFFSET_MS);
    const again = judgeSubmitOk(await submit(c.tokenA, body), {
      score: p.bot.score,
      weekKey: p.weekKey,
    });
    record(p, again.pass);
    return again.pass
      ? { pass: true, detail: 'too-fast 뒤 run 미확정 → 같은 내용 재시도 200' }
      : { pass: false, detail: `재시도 실패: ${again.detail}` };
  });

  // ⑤ 소유자
  await check('⑤', 'B가 A의 run 제출', '404 not-found, A의 run 그대로', async () => {
    const p = await prepare();
    await waitReady(p);
    const res = await submit(c.tokenB, submitBody(p));
    const verdict = judgeReject(res, 404, 'not-found');
    if (!verdict.pass) return verdict;
    const after = judgeOwnRun(await own(p.runId), {
      userId: c.idA,
      seed: p.seed,
      rulesVersion: RULES_VERSION,
      weekKey: p.weekKey,
      submitted: false,
    });
    if (!after.pass) return { pass: false, detail: `A의 run이 바뀜: ${after.detail}` };
    const mine = judgeSubmitOk(await submit(c.tokenA, submitBody(p)), {
      score: p.bot.score,
      weekKey: p.weekKey,
    });
    record(p, mine.pass);
    return mine.pass ? verdict : { pass: false, detail: `A의 정상 제출 실패: ${mine.detail}` };
  });
  await check('⑤', '없는 UUID run 제출', '404 not-found', async () =>
    judgeReject(
      await submit(c.tokenA, {
        runId: NIL_UUID,
        seed: 1,
        version: RULES_VERSION,
        clientScore: 0,
        placements: [],
      }),
      404,
      'not-found',
    ),
  );
  await check('⑤', 'UUID가 아닌 runId', '404 not-found (500 아님)', async () =>
    judgeReject(
      await submit(c.tokenA, {
        runId: 'not-a-uuid',
        seed: 1,
        version: RULES_VERSION,
        clientScore: 0,
        placements: [],
      }),
      404,
      'not-found',
    ),
  );

  // ⑥ 높은 점수 → 낮은 점수 (서버 seed로 만든 종료 로그들을 먼저 만들어 점수 순서를 단언한다. 빈 로그로 낮은 점수를 만들지 않는다)
  await check(
    '⑥',
    '높은 판 → 낮은 판',
    '낮은 판은 200이지만 best 유지·isNewBest false',
    async () => {
      const pool: Prepared[] = [];
      for (let i = 0; i < 3; i++) pool.push(await prepare());
      pool.sort((x, y) => y.bot.score - x.bot.score);
      const hi = pool[0] as Prepared;
      const lo = pool[pool.length - 1] as Prepared;
      if (hi.bot.score <= lo.bot.score)
        return { pass: false, detail: '시험 불가: 점수가 모두 같아 순서를 단언할 수 없음' };
      for (const p of pool) await waitReady(p);
      const rest = pool.slice(1, -1);
      const hiRes = judgeSubmitOk(await submit(c.tokenA, submitBody(hi)), {
        score: hi.bot.score,
        weekKey: hi.weekKey,
      });
      record(hi, hiRes.pass);
      if (!hiRes.pass) return hiRes;
      const best = Math.max(hi.bot.score, ...accepted.map((a) => a.score));
      const loRes = judgeSubmitOk(await submit(c.tokenA, submitBody(lo)), {
        score: lo.bot.score,
        weekKey: lo.weekKey,
        best,
        isNewBest: false,
      });
      record(lo, loRes.pass);
      for (const p of rest) {
        const r = judgeSubmitOk(await submit(c.tokenA, submitBody(p)), {
          score: p.bot.score,
          weekKey: p.weekKey,
        });
        record(p, r.pass);
      }
      return loRes;
    },
  );

  // ⑦ 경쟁 (실제 병렬 요청)
  await check('⑦', '같은 run·같은 내용 동시 두 요청', '둘 다 같은 200', async () => {
    const p = await prepare();
    await waitReady(p);
    const [r1, r2] = await Promise.all([
      submit(c.tokenA, submitBody(p)),
      submit(c.tokenA, submitBody(p)),
    ]);
    const ok1 = judgeSubmitOk(r1, { score: p.bot.score, weekKey: p.weekKey });
    record(p, ok1.pass);
    return ok1.pass ? judgeSame(r1, r2) : ok1;
  });
  await check(
    '⑦',
    '같은 run·다른 내용 동시 두 요청',
    '정상 200+조작 409, 또는 정상 409+조작 400 score-mismatch',
    async () => {
      const p = await prepare();
      await waitReady(p);
      const goodBody = submitBody(p);
      const badBody = submitBody(p, { clientScore: p.bot.score + 1 });
      const [r1, r2] = await Promise.all([submit(c.tokenA, goodBody), submit(c.tokenA, badBody)]);
      const verdict = judgeConflictRace(r1, r2, { score: p.bot.score, weekKey: p.weekKey });
      if (!verdict.pass || verdict.winner === undefined) return verdict;
      // 정상이 이겼다면 주간 점수에 반영됐다
      record(p, verdict.winner === 'good');
      // 최종 run의 해시·결과가 승자와 같다 (확정 필드가 채워졌다는 것만으로는 부족하다)
      const winnerBody = verdict.winner === 'good' ? goodBody : badBody;
      const parsed = parseSubmission(winnerBody);
      if (!parsed.ok) return { pass: false, detail: `승자 본문 형식 오류: ${parsed.code}` };
      const after = judgeRaceRun((await own(p.runId)) as Res, {
        winner: verdict.winner,
        score: p.bot.score,
        hash: await submissionHash(parsed.submission),
      });
      return after.pass ? verdict : { pass: false, detail: `경쟁 뒤 run: ${after.detail}` };
    },
  );

  // ⑧ 인증·CORS·메서드·한도
  for (const fn of ['start-run', 'submit-score'] as const) {
    const body =
      fn === 'start-run'
        ? { version: RULES_VERSION }
        : submitBody(
            p0 ??
              ({
                runId: NIL_UUID,
                seed: 1,
                bot: { score: 0, placements: [] },
              } as unknown as Prepared),
          );
    await check('⑧', `${fn} 토큰 없음`, '401', async () =>
      judgeUnauthorized(
        await io.call(fn, { method: 'POST', origin: ALLOWED_ORIGIN, token: null, body }),
      ),
    );
    await check('⑧', `${fn} 위조 토큰`, '401', async () =>
      judgeUnauthorized(
        await io.call(fn, {
          method: 'POST',
          origin: ALLOWED_ORIGIN,
          token: 'forged.token.value',
          body,
        }),
      ),
    );
    for (const origin of [ALLOWED_ORIGIN, OTHER_ALLOWED_ORIGIN]) {
      await check('⑧', `${fn} 허용 출처 OPTIONS (${origin})`, '204 + 허용 헤더', async () =>
        judgePreflightAllowed(
          await io.call(fn, { method: 'OPTIONS', origin, token: null }),
          origin,
        ),
      );
    }
    await check('⑧', `${fn} 허용 밖 출처 OPTIONS`, '403, 허용 헤더 없음', async () =>
      judgePreflightDenied(
        await io.call(fn, { method: 'OPTIONS', origin: DENIED_ORIGIN, token: null }),
      ),
    );
    await check(
      '⑧',
      `${fn} 허용 밖 출처 POST (유효 토큰)`,
      '403 origin, 허용 헤더 없음',
      async () => {
        const res = await io.call(fn, {
          method: 'POST',
          origin: DENIED_ORIGIN,
          token: c.tokenA,
          body,
        });
        const verdict = judgeCode(res, 403, 'origin');
        return verdict.pass && res.header('access-control-allow-origin') !== null
          ? { pass: false, detail: '403이지만 Allow-Origin이 붙음' }
          : verdict;
      },
    );
    await check('⑧', `${fn} GET`, '405 method', async () =>
      judgeCode(
        await io.call(fn, { method: 'GET', origin: ALLOWED_ORIGIN, token: c.tokenA }),
        405,
        'method',
      ),
    );
  }
  if (firstOk) {
    const ok = firstOk;
    await check('⑧', '성공 응답의 Allow-Origin', '요청 출처와 같음', async () =>
      ok.header('access-control-allow-origin') === ALLOWED_ORIGIN
        ? { pass: true, detail: 'status 200, Allow-Origin 일치' }
        : { pass: false, detail: 'Allow-Origin이 요청 출처와 다름' },
    );
  }

  // ⑨ 한도 (상한을 넘는 bounded 요청 하나씩. 무한 payload는 보내지 않는다)
  await check('⑨', `배치 ${MAX_PLACEMENTS + 1}개`, '413 too-large', async () => {
    const placements = Array.from({ length: MAX_PLACEMENTS + 1 }, (_, i) => ({
      trayIndex: 0,
      row: 0,
      col: 0,
      t: i * STEP_MS,
    }));
    return judgeReject(
      await submit(c.tokenA, {
        runId: NIL_UUID,
        seed: 1,
        version: RULES_VERSION,
        clientScore: 0,
        placements,
      }),
      413,
      'too-large',
    );
  });
  await check('⑨', `본문 ${MAX_BODY_BYTES + 1}바이트`, '413 too-large', async () => {
    const head = JSON.stringify({
      runId: NIL_UUID,
      seed: 1,
      version: RULES_VERSION,
      clientScore: 0,
      placements: [],
    });
    const rawBody = head + ' '.repeat(MAX_BODY_BYTES + 1 - new TextEncoder().encode(head).length);
    return judgeCode(
      await io.call('submit-score', {
        method: 'POST',
        origin: ALLOWED_ORIGIN,
        token: c.tokenA,
        rawBody,
      }),
      413,
      'too-large',
    );
  });

  // ⑩ 직접 쓰기·DB 함수는 클라이언트에게 막혀 있다 (권한 거부 42501만 PASS: 네트워크·500·함수 없음은 차단 증명이 아니다)
  const nilRun = { user_id: c.idA, seed: 1, rules_version: 1, week_key: week || '2099-W01' };
  const nilWeekly = {
    user_id: c.idA,
    week_key: week || '2099-W01',
    best_score: 1,
    run_id: NIL_UUID,
  };
  const writes: [string, SupabaseClient, () => PromiseLike<unknown>][] = [];
  for (const [who, client] of [
    ['A', c.a],
    ['anon', c.anon],
  ] as const) {
    writes.push(
      [`${who} runs INSERT`, client, () => client.from('runs').insert(nilRun).select()],
      [
        `${who} runs UPDATE`,
        client,
        () => client.from('runs').update({ seed: 2 }).eq('user_id', c.idA).select(),
      ],
      [
        `${who} runs DELETE`,
        client,
        () => client.from('runs').delete().eq('user_id', c.idA).select(),
      ],
      [
        `${who} weekly_scores INSERT`,
        client,
        () => client.from('weekly_scores').insert(nilWeekly).select(),
      ],
      [
        `${who} weekly_scores UPDATE`,
        client,
        () =>
          client.from('weekly_scores').update({ best_score: 999999 }).eq('user_id', c.idA).select(),
      ],
      [
        `${who} weekly_scores DELETE`,
        client,
        () => client.from('weekly_scores').delete().eq('user_id', c.idA).select(),
      ],
      [
        `${who} rpc commit_submission`,
        client,
        () =>
          client.rpc('commit_submission', {
            p_run: NIL_UUID,
            p_user: c.idA,
            p_hash: 'x',
            p_result: { ok: true, score: 999999 },
            p_submitted_at: new Date().toISOString(),
          }),
      ],
    );
  }
  for (const [label, , run] of writes) {
    await check('⑩', label, '실패 (42501)', async () => denied((await run()) as Res));
  }

  // ⑪ 최종 주간 점수: 통과한 제출 중 최고 점수 하나, run_id는 그 점수를 낸 run
  await check('⑪', 'A weekly_scores', '1행, best_score = 통과한 제출의 최댓값', async () => {
    if (accepted.length === 0) return { pass: false, detail: '통과한 제출이 없어 비교할 수 없음' };
    const best = Math.max(...accepted.map((a) => a.score));
    const res = (await c.a
      .from('weekly_scores')
      .select('best_score, run_id')
      .eq('user_id', c.idA)
      .eq('week_key', week)) as unknown as Res;
    return judgeWeekly(
      res,
      best,
      accepted.filter((a) => a.score === best).map((a) => a.runId),
    );
  });

  // 확장 parity: 서버가 발급한 seed N개로 봇 로그를 만들어 모두 정상 제출되고 점수가 로컬 리플레이와 같다
  if (options.parity !== undefined && options.parity > 0) {
    const n = options.parity;
    await check(
      '⑫',
      `서버 발급 seed ${n}판 parity`,
      `${n}/${n} 200, 점수 일치, weekly = 최댓값`,
      async () => {
        const runs: Prepared[] = [];
        for (let i = 0; i < n; i += 1) runs.push(await prepare());
        const maxLast = Math.max(...runs.map((r) => r.bot.lastT));
        const lastIssued = runs[runs.length - 1] as Prepared;
        const need = maxLast + WAIT_MARGIN_MS - (io.now() - lastIssued.at);
        if (need > 0) await io.sleep(need);
        let okCount = 0;
        const bad: string[] = [];
        const queue = [...runs];
        const worker = async () => {
          for (let p = queue.shift(); p; p = queue.shift()) {
            const res = await submit(c.tokenA, submitBody(p));
            const out = judgeSubmitOk(res, { score: p.bot.score, weekKey: p.weekKey });
            record(p, out.pass);
            if (out.pass) okCount += 1;
            else bad.push(`seed ${p.seed}: ${out.detail}`);
          }
        };
        await Promise.all(Array.from({ length: 8 }, worker));
        const best = Math.max(...accepted.map((a) => a.score));
        const weekly = judgeWeekly(
          (await c.a
            .from('weekly_scores')
            .select('best_score, run_id')
            .eq('user_id', c.idA)
            .eq('week_key', week)) as unknown as Res,
          best,
          accepted.filter((a) => a.score === best).map((a) => a.runId),
        );
        if (okCount !== n)
          return {
            pass: false,
            detail: `${okCount}/${n} 통과. 실패: ${bad.slice(0, 3).join(' · ')}`,
          };
        return weekly.pass
          ? { pass: true, detail: `${okCount}/${n} 통과, ${weekly.detail}` }
          : weekly;
      },
    );
  }
}
