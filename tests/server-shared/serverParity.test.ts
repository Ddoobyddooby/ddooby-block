import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGame, place } from '../../src/core/engine';
import { next, createRng } from '../../src/core/rng';
import type { Board } from '../../src/core/types';
import * as src from '../../src/replay/server';
import * as bundle from '../../supabase/functions/_shared/replay.js';
import { boardFrom } from '../helpers/board';
import { games, withTimes } from '../helpers/randomBot';
import { FIXTURES } from '../helpers/replayFixtures';
import { compute, type ParityApi, type ParityInput } from './parityCompute';

// 같은 입력(봇 로그 200개 + 고정 fixture + 깨뜨린 로그 + 생성 보정 보드 + 주 경계 시각)을 네 곳에서 돌려 결과를 대조한다:
//   (1) src  (2) 생성 번들(Node 같은 프로세스)  (3) 생성 번들(Node, 시간대 다른 별도 프로세스 둘)  (4) 생성 번들(Deno)
// 입력은 여기서 한 번만 만든다. 번들이 src와 다르면(낡은 번들) 대조가 어긋나고, 둘이 함께 틀린 경우는 아래 리터럴 fixture가 잡는다.
// 한계: src와 번들이 같이 틀리고 RULES_VERSION도 안 올렸다면 이 대조만으로는 못 잡는다 → tests/server-shared/rulesFingerprint.test.ts

const ROOT = resolve(import.meta.dirname, '../..');
const RUNNER = join(ROOT, 'tests/server-shared/runners/parityRunner.ts');
const TIMES = [
  Date.parse('2026-11-15T14:59:59.999Z'),
  Date.parse('2026-11-15T15:00:00.000Z'),
  Date.parse('2020-12-31T15:00:00.000Z'),
  Date.parse('2021-01-03T15:00:00.000Z'),
  Date.parse('2018-12-30T15:00:00.000Z'),
];

const FULL_ROWS = (n: number): string => new Array<string>(n).fill('########').join('\n');
const BOARDS: { name: string; board: Board }[] = [
  { name: '빈 칸 하나', board: boardFrom(`.#######\n${FULL_ROWS(7)}`) },
  { name: '가로 둘', board: boardFrom(`..######\n${FULL_ROWS(7)}`) },
  { name: '세로 둘', board: boardFrom(`.#######\n.#######\n${FULL_ROWS(6)}`) },
];
const GEN_SEEDS = Array.from({ length: 400 }, (_, i) => i + 1);

function buildInput(): ParityInput {
  const all = games();
  const fixtureGames = FIXTURES.map((fx) => ({
    seed: fx.seed,
    clientScore: fx.final.score,
    placements: withTimes(fx.log.map(([trayIndex, row, col]) => ({ trayIndex, row, col }))),
  }));
  const g1 = all[0]!;
  const timed = withTimes(g1.log);
  const variants: ParityInput['variants'] = [
    { name: '정상', seed: g1.seed, placements: timed },
    { name: '게임오버뒤', seed: g1.seed, placements: withTimes([...g1.log, g1.log[0]!]) },
    {
      name: '범위밖',
      seed: g1.seed,
      placements: timed.map((p, i) => (i === 2 ? { ...p, row: 99 } : p)),
    },
    { name: 'null항목', seed: g1.seed, placements: [timed[0], null, timed[1]] },
    {
      name: '간격199',
      seed: g1.seed,
      placements: timed.map((p, i) => (i === 1 ? { ...p, t: timed[0]!.t + 199 } : p)),
    },
    {
      name: '빈슬롯',
      seed: g1.seed,
      placements: [timed[0], { ...timed[1]!, trayIndex: timed[0]!.trayIndex }],
    },
    { name: '순서뒤집기', seed: g1.seed, placements: [...timed].reverse() },
    { name: '소수t', seed: g1.seed, placements: [{ ...timed[0]!, t: 0.5 }, timed[1]] },
  ];
  return {
    games: [
      ...all.map((g) => ({
        seed: g.seed,
        clientScore: g.state.score,
        placements: withTimes(g.log),
      })),
      ...fixtureGames,
    ],
    variants,
    boards: BOARDS.map((b) => ({
      name: b.name,
      size: b.board.size,
      cells: [...b.board.cells],
      seeds: GEN_SEEDS,
    })),
    times: TIMES,
  };
}

const input = buildInput();
const inputDir = mkdtempSync(join(tmpdir(), 'ddooby-parity-'));
const inputPath = join(inputDir, 'input.json');
writeFileSync(inputPath, JSON.stringify(input));

function run(cmd: string, args: string[], env: Record<string, string> = {}): string {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env },
  });
  if (r.error) throw new Error(`${cmd} 실행 실패: ${r.error.message} (Deno가 설치돼 있어야 한다)`);
  if (r.status !== 0) throw new Error(`${cmd} 종료 코드 ${r.status}\n${r.stderr}`);
  return r.stdout;
}
const node = (mode: 'core' | 'handler', tz: string): string =>
  run(process.execPath, ['--disable-warning=ExperimentalWarning', RUNNER, mode, inputPath], {
    TZ: tz,
  });
const deno = (mode: 'core' | 'handler'): string =>
  run('deno', ['run', '--no-lock', `--allow-read=${inputDir}`, RUNNER, mode, inputPath]);

const asApi = (m: unknown): ParityApi => m as ParityApi;

interface CoreOut {
  rulesVersion: number;
  games: {
    seed: number;
    replay: { ok: boolean; state?: Record<string, unknown> };
    verdict: { ok: boolean; score?: number; code?: string };
    hash: string;
  }[];
  variants: { name: string; replay: unknown; intervals: boolean }[];
  boards: { name: string; results: { seed: number; tray: string[]; rng: number }[] }[];
  weeks: { t: number; week: string }[];
}

const jsonOf = (v: unknown): string => JSON.stringify(v);
const ref = (await compute(asApi(src), input)) as CoreOut;

describe('서버 번들 대조: 입력', () => {
  it('봇 200판 + 고정 fixture 2개가 모두 들어 있고 seed 집합이 1~200이다 (분모 고정)', () => {
    expect(input.games).toHaveLength(202);
    const botSeeds = ref.games.slice(0, 200).map((g) => g.seed);
    expect(botSeeds).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
  });

  it('src 결과: 봇 200판은 모두 통과하고 점수는 봇 상태와 같다', () => {
    const all = games();
    ref.games.slice(0, 200).forEach((g, i) => {
      expect(g.verdict, `seed ${g.seed}`).toEqual({ ok: true, score: all[i]!.state.score });
      expect(g.replay.ok).toBe(true);
    });
  });

  it('생성 보정 경로에 닿는 입력이 실제로 있다 (RNG 32번 소비 = 보정)', () => {
    let corrected = 0;
    for (const b of ref.boards) {
      for (const r of b.results) {
        let s = createRng(r.seed);
        let calls = 0;
        while (s !== r.rng && calls < 100) {
          s = next(s)[1];
          calls += 1;
        }
        if (calls === 32) corrected += 1;
      }
    }
    expect(corrected).toBeGreaterThan(0);
  });
});

describe('서버 번들 대조: 같은 프로세스', () => {
  it('생성 번들의 결과가 src와 완전히 같다 (전체 상태·판정·해시·생성기·주 키)', async () => {
    const out = await compute(asApi(bundle), input);
    expect(jsonOf(out)).toBe(jsonOf(ref));
  });

  it('번들을 두 번 돌리고 순서를 뒤집어도 같다 (숨은 모듈 상태 없음)', async () => {
    const a = await compute(asApi(bundle), input);
    const reversed: ParityInput = { ...input, games: [...input.games].reverse() };
    const b = (await compute(asApi(bundle), reversed)) as CoreOut;
    expect(jsonOf(a)).toBe(jsonOf(await compute(asApi(bundle), input)));
    expect(jsonOf([...b.games].reverse())).toBe(jsonOf((a as CoreOut).games));
  });

  it('고정 fixture의 리터럴 기대값이 src와 번들 양쪽에 그대로 적용된다 (seed 67: 8배치·280점·게임 오버, seed 68: 3281점·게임 안 끝남)', async () => {
    const out = (await compute(asApi(bundle), input)) as CoreOut;
    for (const fx of FIXTURES) {
      for (const result of [ref, out]) {
        const g = result.games.find(
          (x) => x.seed === fx.seed && x.replay.state?.score === fx.final.score,
        );
        expect(g, `seed ${fx.seed}`).toBeDefined();
        const s = g!.replay.state as Record<string, unknown>;
        expect({
          score: s.score,
          combo: s.combo,
          missStreak: s.missStreak,
          over: s.over,
          rngState: s.rngState,
          tray: s.tray,
        }).toEqual({
          score: fx.final.score,
          combo: fx.final.combo,
          missStreak: fx.final.missStreak,
          over: fx.final.over,
          rngState: fx.final.rngState,
          tray: fx.final.tray,
        });
        // 서버 판정: 게임 오버 판만 통과
        expect(g!.verdict.ok).toBe(fx.final.over);
      }
    }
  });

  it('주 경계 시각의 weekKey가 독립 계산값과 같다', async () => {
    const out = (await compute(asApi(bundle), input)) as CoreOut;
    expect(out.weeks.map((w) => w.week)).toEqual([
      '2026-W46',
      '2026-W47',
      '2020-W53',
      '2021-W01',
      '2019-W01',
    ]);
  });

  it('src 엔진으로 처음부터 다시 돌려도 번들 상태와 같다 (번들이 src 엔진을 그대로 묶었다)', () => {
    const g = input.games[0]!;
    let state = createGame(g.seed);
    for (const p of g.placements as { trayIndex: number; row: number; col: number }[]) {
      const r = place(state, p);
      if (!r.ok) throw new Error('재생 실패');
      state = r.state;
    }
    const b = bundle.replay(g.seed, g.placements as never);
    expect(b.ok && jsonOf(b.state)).toBe(jsonOf(state));
  });
});

describe('서버 번들 대조: 다른 프로세스·시간대·런타임', () => {
  const expected = jsonOf(ref);

  it('Node 별도 프로세스 TZ=Asia/Seoul·America/Los_Angeles·UTC 모두 같다', () => {
    for (const tz of ['Asia/Seoul', 'America/Los_Angeles', 'UTC']) {
      expect(node('core', tz), tz).toBe(expected);
    }
  });

  it('Deno에서 실제로 실행한 결과도 같다 (deno check가 아니라 deno run)', () => {
    expect(deno('core')).toBe(expected);
  });
});

describe('실제 submit-score handler + 번들 (가짜 DB·고정 시각)', () => {
  it('봇 200판 + fixture에서 Node와 Deno의 응답이 같고 점수가 맞다 (정상 200, 재제출 같음, 다른 내용 409, 틀린 점수 400)', () => {
    const nodeOut = JSON.parse(node('handler', 'Asia/Seoul')) as {
      seed: number;
      ok: { status: number; body: { score?: number; best?: number; isNewBest?: boolean } };
      again: { status: number; body: unknown };
      conflict: { status: number; body: unknown };
      wrong: { status: number; body: unknown };
    }[];
    const denoOut = JSON.parse(deno('handler')) as unknown;
    expect(jsonOf(denoOut)).toBe(jsonOf(nodeOut));

    expect(nodeOut).toHaveLength(202);
    const all = games();
    nodeOut.forEach((r, i) => {
      const gameOver = i < 200 || i === 201; // 마지막에서 두 번째(fixture 68)는 끝나지 않은 판
      if (!gameOver) {
        expect(r.ok, `fixture 68`).toEqual({ status: 400, body: { ok: false, code: 'not-over' } });
        return;
      }
      const score = i < 200 ? all[i]!.state.score : 280;
      expect(r.ok.status, `seed ${r.seed}`).toBe(200);
      expect(r.ok.body).toEqual({
        ok: true,
        score,
        best: score,
        weekKey: '2026-W46',
        isNewBest: true,
      });
      expect(r.again).toEqual(r.ok);
      expect(r.conflict).toEqual({ status: 409, body: { ok: false, code: 'resubmit-conflict' } });
      expect(r.wrong).toEqual({ status: 400, body: { ok: false, code: 'score-mismatch' } });
    });
  });
});
