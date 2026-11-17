// W4-02 시뮬레이션 도구(옵션 해석·통계·생성기 관찰) 시험
import { describe, expect, it } from 'vitest';
import { GENERATOR } from '../../src/config';
import { createBoard } from '../../src/core/board';
import { createGame } from '../../src/core/engine';
import { generateTray } from '../../src/core/generator';
import { createRng } from '../../src/core/rng';
import type { Board } from '../../src/core/types';
import { parseArgs } from '../../scripts/sim/args';
import { probeTray } from '../../scripts/sim/probe';
import { histogram, percentile, summarize, table } from '../../scripts/sim/stats';

describe('parseArgs', () => {
  it('기본값: seed 1~1000, greedy·random', () => {
    expect(parseArgs([])).toEqual({
      seedFrom: 1,
      seedTo: 1000,
      bots: ['greedy', 'random'],
      json: null,
      logs: null,
      maxPlacements: null,
    });
  });
  it('옵션', () => {
    const o = parseArgs([
      '--seeds',
      '5-9',
      '--bot',
      'smart,greedy',
      '--json',
      'a.json',
      '--max-placements',
      '50',
    ]);
    expect([o.seedFrom, o.seedTo, o.bots, o.json, o.maxPlacements]).toEqual([
      5,
      9,
      ['smart', 'greedy'],
      'a.json',
      50,
    ]);
    expect(parseArgs(['--seeds', '7']).seedTo).toBe(7);
    expect(parseArgs(['--bot', 'all']).bots).toHaveLength(4);
  });
  it('잘못된 옵션은 던진다', () => {
    for (const bad of [
      ['--seeds', 'x'],
      ['--seeds', '9-1'],
      ['--bot', 'nope'],
      ['--zzz'],
      ['--json'],
      ['--max-placements', '0'],
    ]) {
      expect(() => parseArgs(bad)).toThrow();
    }
  });
});

describe('stats', () => {
  it('percentile은 선형 보간', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([10], 0.9)).toBe(10);
    expect(percentile([], 0.5)).toBeNaN();
  });
  it('summarize', () => {
    const s = summarize([2, 4, 4, 4, 5, 5, 7, 9]);
    expect([s.n, s.mean, s.median, s.stddev, s.min, s.max]).toEqual([8, 5, 4.5, 2, 2, 9]);
    expect(summarize([]).n).toBe(0);
  });
  it('histogram은 모든 값을 센다 (최댓값은 마지막 구간)', () => {
    const h = histogram([0, 1, 2, 3, 10], 5);
    expect(h.reduce((s, b) => s + b.count, 0)).toBe(5);
    expect(h.at(-1)?.count).toBe(1);
  });
  it('table은 열을 맞춘다 (한글은 2칸)', () => {
    const lines = table(['항목', '값'], [['점수', '1,000']]).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('----  -----');
  });
});

describe('probeTray (생성기 추첨 따라 하기)', () => {
  it('첫 트레이는 시도 1번, 보정 없음', () => {
    const state = createGame(7);
    expect(probeTray(createBoard(8), createRng(7), state.tray as string[])).toEqual({
      attempts: 1,
      corrected: false,
    });
  });
  it('실제 트레이와 다르면 던진다', () => {
    expect(() => probeTray(createBoard(8), createRng(7), ['dot', 'dot', 'dot'])).toThrow(/probe/);
  });
  it('보정 횟수는 maxRerolls와 같다', () => {
    // 한 칸만 비고 나머지가 찬 보드: dot만 놓인다. 가중치 추첨에 dot이 한 번도 없으면 보정 (seed를 찾아 확인)
    const cells = new Array<number | null>(64).fill(1);
    cells[0] = null;
    const board = { size: 8, cells };
    let corrected = 0;
    for (let seed = 1; seed <= 300 && corrected === 0; seed++) {
      // 보정 여부는 generateTray 결과와 probe가 서로 맞는지로 확인된다 (맞지 않으면 probe가 던진다)
      const result = probeTrayFor(board, seed);
      if (result.corrected) {
        corrected++;
        expect(result.attempts).toBe(GENERATOR.maxRerolls);
      }
    }
    expect(corrected).toBe(1);
  });
});

function probeTrayFor(board: Board, seed: number) {
  const rng = createRng(seed);
  const [tray] = generateTray(board, rng);
  return probeTray(board, rng, tray);
}
