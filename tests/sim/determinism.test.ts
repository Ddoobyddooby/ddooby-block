// W4-02 시뮬레이션 결정성 시험. 같은 (봇, seed)면 같은 결과이고, 작은 seed 범위의 요약 값이 고정돼 있다.
// 규칙(core)·가중치·점수·봇이 바뀌면 이 값이 깨진다 → 깨지면 의도한 변경인지 확인하고 값을 갱신한다.
// 1000판 전체는 npm run sim으로 따로 돌린다 (여기에는 짧은 범위만).
import { describe, expect, it } from 'vitest';
import { SAVE } from '../../src/config';
import { createGame } from '../../src/core/engine';
import { replay } from '../../src/core/replay';
import { aggregate } from '../../scripts/sim/aggregate';
import { playGame, type GameRecord } from '../../scripts/sim/play';
import type { BotName } from '../../scripts/sim/bots';

function run(bot: BotName, from: number, to: number, max: number = SAVE.maxRunPlacements) {
  const records: GameRecord[] = [];
  for (let seed = from; seed <= to; seed++) records.push(playGame(seed, bot, max).record);
  return records;
}

const sum = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0);

/** 요약 값을 한눈에 비교할 수 있는 정수들로 */
function fingerprint(records: readonly GameRecord[]) {
  return {
    games: records.length,
    score: sum(records.map((r) => r.score)),
    placements: sum(records.map((r) => r.placements)),
    lines: sum(records.map((r) => r.linesTotal)),
    maxCombo: Math.max(...records.map((r) => r.maxCombo)),
    boardClears: sum(records.map((r) => r.boardClears)),
    trays: sum(records.map((r) => r.trays)),
    rerolls: sum(records.map((r) => r.rerolls)),
    corrected: sum(records.map((r) => r.traysCorrected)),
  };
}

describe('결정성', () => {
  // survivor는 한 수에 빔 탐색을 해서 느리다: 앞 40수까지만 비교한다
  it.each(['greedy', 'random', 'smart', 'survivor'] as const)(
    '%s: 같은 seed는 같은 기록·같은 배치 로그',
    (bot) => {
      const a = playGame(2, bot, 40);
      const b = playGame(2, bot, 40);
      expect(b).toEqual(a);
    },
  );

  it('seed가 다르면 결과가 다르다 (무작위 봇 포함)', () => {
    expect(playGame(1, 'random').record).not.toEqual(playGame(2, 'random').record);
    expect(playGame(1, 'greedy').record.score).not.toBe(playGame(2, 'greedy').record.score);
  });

  it.each(['greedy', 'random', 'smart'] as const)(
    '%s: 기록한 배치 로그를 core로 다시 돌리면 같은 점수의 게임 오버',
    (bot) => {
      for (let seed = 1; seed <= 5; seed++) {
        const { record, log } = playGame(seed, bot);
        const result = replay(seed, log);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state.score).toBe(record.score);
        expect(result.state.over).toBe(true);
        expect(log.length).toBe(record.placements);
      }
    },
  );

  it('기록의 합이 맞는다: 배치 수 = 줄 수별 배치의 합, 트레이 조각 수 = 트레이 수 × 3', () => {
    for (const bot of ['greedy', 'random'] as const) {
      for (const r of run(bot, 1, 10)) {
        expect(r.lines0 + r.lines1 + r.lines2 + r.lines3 + r.lines4).toBe(r.placements);
        // 지운 줄 합계는 줄 수별 배치로 맞춰 본 값 이상이다 (4줄 이상은 4줄로 셈)
        expect(r.linesTotal).toBeGreaterThanOrEqual(
          r.lines1 + 2 * r.lines2 + 3 * r.lines3 + 4 * r.lines4,
        );
        expect(Object.values(r.pieceCounts).reduce((s, v) => s + v, 0)).toBe(r.trays * 3);
        expect(r.comboCounts.reduce((s, v) => s + v, 0)).toBe(r.placements);
        expect(r.finalTray.length).toBeGreaterThan(0);
        expect(r.capped).toBe(false);
      }
    }
  });

  it('배치 수 한도에 닿으면 capped이고 거기서 멈춘다', () => {
    const { record, log } = playGame(1, 'greedy', 5);
    expect(record.capped).toBe(true);
    expect(record.placements).toBe(5);
    expect(log.length).toBe(5);
    // 첫 트레이는 그대로
    expect(createGame(1).tray.length).toBe(3);
  });
});

describe('요약 값 고정 (seed 1~20)', () => {
  it('greedy', () => {
    expect(fingerprint(run('greedy', 1, 20))).toEqual(GREEDY_1_20);
  });
  it('random', () => {
    expect(fingerprint(run('random', 1, 20))).toEqual(RANDOM_1_20);
  });
  it('smart (seed 1~10)', () => {
    expect(fingerprint(run('smart', 1, 10))).toEqual(SMART_1_10);
  });
  it('survivor (seed 1~3, 앞 60수까지)', () => {
    expect(fingerprint(run('survivor', 1, 3, 60))).toEqual(SURVIVOR_1_3_60);
  });
  it('aggregate는 같은 기록에서 같은 요약', () => {
    const records = run('greedy', 1, 20);
    expect(aggregate('greedy', records)).toEqual(aggregate('greedy', [...records]));
    expect(aggregate('greedy', records).score.mean).toBe(GREEDY_1_20.score / 20);
  });
});

const GREEDY_1_20 = {
  games: 20,
  score: 140161,
  placements: 1245,
  lines: 470,
  maxCombo: 23,
  boardClears: 0,
  trays: 423,
  rerolls: 3,
  corrected: 0,
};
const RANDOM_1_20 = {
  games: 20,
  score: 6438,
  placements: 309,
  lines: 41,
  maxCombo: 3,
  boardClears: 0,
  trays: 112,
  rerolls: 1,
  corrected: 0,
};
const SMART_1_10 = {
  games: 10,
  score: 186413,
  placements: 1264,
  lines: 530,
  maxCombo: 35,
  boardClears: 0,
  trays: 425,
  rerolls: 1,
  corrected: 0,
};
const SURVIVOR_1_3_60 = {
  games: 3,
  score: 20969,
  placements: 180,
  lines: 76,
  maxCombo: 12,
  boardClears: 0,
  trays: 63,
  rerolls: 0,
  corrected: 0,
};
