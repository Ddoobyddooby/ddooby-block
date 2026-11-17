// 원격 weekly_ranking 시험 (W3-04). `npm run supabase:check -- --ranking`
// block 전용 프로젝트에 승인된 마이그레이션(w3_04)이 적용된 뒤에만 실행한다. **이 태스크에서는 실행하지 않았다**
// (로컬 리허설 tests/supabase/rankingRehearsal.test.ts와 PGlite 확인까지). 실행은 claude-main이 승인받아 한다.
// publishable key와 익명 로그인 토큰만 쓴다. 판정은 rankingJudge.ts.
//
// 계정 4개: R(이름 있음)·N(처음엔 이름 없음)·Z(기록 없음)·비로그인 anon. R·N은 서버 발급 seed로 봇 판을 만들고(마지막 t만큼 실제로 기다린다)
// submit-score로 올린다. 시험이 원격에 남기는 것: 익명 계정 3개, run 2개, weekly_scores 2행, profiles 이름 2개 (공개 랭킹에 보인다 → 시험 뒤 정리).
//
// 기대 status: 공개 조회 200, 위조 토큰 401, set-nickname 200(R·N)·409 already-set(R 재시도), 쓰기 차단 42501(anon 401·로그인 403),
// commit_submission 호출 42501.
import type { SupabaseClient } from '@supabase/supabase-js';
import { RULES_VERSION } from '../../supabase/functions/_shared/replay.js';
import { weekKey } from '../../src/replay/weekKey.ts';
import { judgeCode, judgeSet, type FnRes } from './nicknameJudge.ts';
import { denied, failed, type Outcome, type Res, type Row } from './report.ts';
import {
  judgeAnon,
  judgeBadBearer,
  judgeNamed,
  judgeNoRecord,
  judgeUnnamed,
  type Expected,
  type WeekWindow,
} from './rankingJudge.ts';
import { ALLOWED_ORIGIN, playBot, type CallInit, type FnName } from './scores.ts';
import { judgeStarted, judgeSubmitOk } from './scoresJudge.ts';

export interface RankingIo {
  call(fn: FnName | 'set-nickname', init: CallInit): Promise<FnRes>;
  /** weekly_ranking RPC. token이 null이면 anon */
  rpc(token: string | null): Promise<FnRes>;
  sleep(ms: number): Promise<void>;
  /** 단조 증가 시계(ms) */
  now(): number;
  /** 지금 시각 (ms, Unix). 주 판정용 */
  clock(): number;
}

export interface RankingClients {
  anon: SupabaseClient;
  r: SupabaseClient;
  idR: string;
  idN: string;
  idZ: string;
  tokenR: string;
  tokenN: string;
  tokenZ: string;
}

const WAIT_MARGIN_MS = 500;
// JWT처럼 보이지만 서명이 틀린 값. 키 검사(separation)에 걸리지 않게 조각으로 만든다
const FORGED_TOKEN = ['eyJ' + 'hbGciOiJIUzI1NiJ9', 'eyJ' + 'zdWIiOiJub3BlIn0', 'invalid'].join('.');

export async function runRanking(
  c: RankingClients,
  io: RankingIo,
  rows: Row[],
  nameBase: string,
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
  /** RPC를 부르고 그 전후의 KST 주를 함께 돌려준다 */
  const rpcWithWeeks = async (token: string | null): Promise<{ res: FnRes; weeks: WeekWindow }> => {
    const before = weekKey(io.clock());
    const res = await io.rpc(token);
    return { res, weeks: { before, after: weekKey(io.clock()) } };
  };

  /** run을 발급받아 종료된 판을 만들고 실제 경과를 기다린 뒤 제출한다. 점수는 서버가 확인한 값 */
  const publish = async (token: string): Promise<number> => {
    const started = await io.call('start-run', {
      method: 'POST',
      origin: ALLOWED_ORIGIN,
      token,
      body: { version: RULES_VERSION },
    });
    const judged = judgeStarted(started, RULES_VERSION);
    if (!judged.started) throw new Error(`start-run 실패: ${judged.detail}`);
    const at = io.now();
    const bot = playBot(judged.started.seed);
    const need = bot.lastT + WAIT_MARGIN_MS - (io.now() - at);
    if (need > 0) await io.sleep(need);
    const res = await io.call('submit-score', {
      method: 'POST',
      origin: ALLOWED_ORIGIN,
      token,
      body: {
        runId: judged.started.runId,
        seed: judged.started.seed,
        version: RULES_VERSION,
        clientScore: bot.score,
        placements: bot.placements,
      },
    });
    const ok = judgeSubmitOk(res, { score: bot.score, weekKey: judged.started.weekKey });
    if (!ok.pass) throw new Error(`submit-score 실패: ${ok.detail}`);
    return typeof ok.best === 'number' ? ok.best : bot.score;
  };

  // 준비: R·N 판을 올린다. 실패하면 이 항목이 FAIL로 남고, 뒤 항목은 기대 사용자가 없어 PASS하지 못한다
  let scoreR = -1;
  let scoreN = -1;
  await check(
    '①',
    'R 판 제출(양성 대조)',
    'start-run 200 → submit-score 200, 점수 일치',
    async () => {
      scoreR = await publish(c.tokenR);
      return { pass: true, detail: `점수 ${scoreR}` };
    },
  );
  await check('①', 'N 판 제출', 'start-run 200 → submit-score 200, 점수 일치', async () => {
    scoreN = await publish(c.tokenN);
    return { pass: true, detail: `점수 ${scoreN}` };
  });

  // R 이름 정하기 (200). N은 아직 정하지 않는다
  const nameR = `${nameBase}R`;
  let tagR = -1;
  await check('②', 'R set-nickname', '200, 이름·태그(0~9999)', async () => {
    const res = await io.call('set-nickname', {
      method: 'POST',
      origin: ALLOWED_ORIGIN,
      token: c.tokenR,
      body: { nickname: nameR },
    });
    const out = judgeSet(res, nameR);
    if (out.tag !== undefined) tagR = out.tag;
    return out;
  });
  const expectR = (): Expected => ({ nickname: nameR, tag: tagR, score: scoreR });

  await check(
    '③',
    '비로그인 anon 조회',
    '200, week 1행·top에 R·is_me 모두 false·me/around 없음·개인정보 열 없음',
    async () => {
      const { res, weeks } = await rpcWithWeeks(null);
      return scoreR < 0 || tagR < 0
        ? { pass: false, detail: '앞 단계(R 판·이름)가 실패해 기대 사용자가 없음' }
        : judgeAnon(res, weeks, expectR());
    },
  );
  await check(
    '③',
    'R(이름 있음) 조회',
    '200, me 1행(rank·seq·점수 일치)·around·내 줄',
    async () => {
      const { res, weeks } = await rpcWithWeeks(c.tokenR);
      return scoreR < 0 || tagR < 0
        ? { pass: false, detail: '앞 단계가 실패해 기대 값이 없음' }
        : judgeNamed(res, weeks, expectR());
    },
  );
  await check(
    '③',
    'N(이름 없음) 조회',
    '200, me 1행 rank·seq null·점수 일치·목록에 없음',
    async () => {
      const { res, weeks } = await rpcWithWeeks(c.tokenN);
      return scoreN < 0
        ? { pass: false, detail: '앞 단계(N 판)가 실패해 기대 값이 없음' }
        : judgeUnnamed(res, weeks, scoreN);
    },
  );
  await check('③', 'Z(기록 없음) 조회', '200, me·around 없음', async () => {
    const { res, weeks } = await rpcWithWeeks(c.tokenZ);
    return judgeNoRecord(res, weeks);
  });

  // N이 이름을 정한 뒤: 같은 점수가 목록에 나타나고 me.rank가 생긴다. R의 재설정은 409
  const nameN = `${nameBase}N`;
  let tagN = -1;
  await check('④', 'N set-nickname', '200, 이름·태그(0~9999)', async () => {
    const res = await io.call('set-nickname', {
      method: 'POST',
      origin: ALLOWED_ORIGIN,
      token: c.tokenN,
      body: { nickname: nameN },
    });
    const out = judgeSet(res, nameN);
    if (out.tag !== undefined) tagN = out.tag;
    return out;
  });
  await check('④', 'N 이름 정한 뒤 조회', '200, me.rank 생김·같은 점수가 목록에', async () => {
    const { res, weeks } = await rpcWithWeeks(c.tokenN);
    return scoreN < 0 || tagN < 0
      ? { pass: false, detail: '앞 단계가 실패해 기대 값이 없음' }
      : judgeNamed(res, weeks, { nickname: nameN, tag: tagN, score: scoreN });
  });
  await check('④', 'R set-nickname 다시', '409 already-set', async () =>
    judgeCode(
      await io.call('set-nickname', {
        method: 'POST',
        origin: ALLOWED_ORIGIN,
        token: c.tokenR,
        body: { nickname: `${nameBase}X` },
      }),
      409,
      'already-set',
    ),
  );

  // 위조 토큰
  await check('⑤', '위조 Bearer 조회', '401 (anon으로 낮아지면 FAIL)', async () =>
    judgeBadBearer(await io.rpc(FORGED_TOKEN)),
  );

  // 쓰기 차단 회귀: 시험 소유 행에만 요청한다. 잘못 열려 있으면 실제로 바뀔 수 있다 (supabase/README.md)
  const tables = ['weekly_scores', 'profiles', 'runs'] as const;
  for (const [who, client, idCol] of [
    ['anon', c.anon, c.idR],
    ['R', c.r, c.idR],
  ] as const) {
    for (const t of tables) {
      const col = t === 'profiles' ? 'id' : 'user_id';
      await check(
        '⑥',
        `${who} ${t} UPDATE`,
        who === 'anon' ? '401 + 42501' : '403 + 42501',
        async () =>
          denied(
            (await client
              .from(t)
              .update(
                t === 'weekly_scores'
                  ? { best_score: 2147483647 }
                  : t === 'profiles'
                    ? { tag: 1 }
                    : { seed: 2 },
              )
              .eq(col, idCol)
              .select()) as unknown as Res,
          ),
      );
    }
  }
  // 서버 전용 함수: 클라이언트 역할은 호출하지 못한다 (함수 없음 404·스키마 캐시 오류는 차단 성공이 아니다)
  const commitArgs = {
    p_run: '00000000-0000-4000-8000-000000000000',
    p_user: c.idR,
    p_hash: 'x',
    p_result: { ok: true, score: 1 },
    p_submitted_at: new Date(io.clock()).toISOString(),
  };
  await check('⑥', 'anon commit_submission', '401 + 42501', async () =>
    denied((await c.anon.rpc('commit_submission', commitArgs)) as unknown as Res),
  );
  await check('⑥', 'R commit_submission', '403 + 42501', async () =>
    denied((await c.r.rpc('commit_submission', commitArgs)) as unknown as Res),
  );
}
