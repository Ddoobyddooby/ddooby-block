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
  it('seed 범위 경계: 0과 uint32 최댓값은 허용, 그 밖과 안전하지 않은 정수는 거부', () => {
    expect(parseArgs(['--seeds', '0-4294967295'])).toMatchObject({
      seedFrom: 0,
      seedTo: 4294967295,
    });
    expect(() => parseArgs(['--seeds', '4294967296'])).toThrow(/범위/);
    expect(() => parseArgs(['--seeds', '1-4294967296'])).toThrow(/범위/);
    // 2^53은 seed++가 제자리라 끝나지 않는다
    expect(() => parseArgs(['--seeds', '9007199254740992'])).toThrow(/범위/);
    expect(() => parseArgs(['--seeds', '1-9007199254740993'])).toThrow(/범위/);
    // 아주 긴 숫자는 Number()가 Infinity로 바꾼다
    expect(() => parseArgs(['--seeds', '9'.repeat(400)])).toThrow(/범위/);
    expect(() => parseArgs(['--seeds', `1-${'9'.repeat(400)}`])).toThrow(/범위/);
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
  /** (0,0) 한 칸만 비어 dot만 놓을 수 있는 보드 */
  const oneHole = (): Board => {
    const cells = new Array<number | null>(64).fill(1);
    cells[0] = null;
    return { size: 8, cells };
  };
  /** generateTray가 낸 값 */
  const real = (board: Board, seed: number) => {
    const rng = createRng(seed);
    const [tray, after] = generateTray(board, rng);
    return { rng, tray, after };
  };

  it('첫 트레이는 시도 1번, 보정 없음 (다음 RNG 상태까지 일치)', () => {
    const state = createGame(7);
    expect(probeTray(createBoard(8), createRng(7), state.tray as string[], state.rngState)).toEqual(
      {
        attempts: 1,
        corrected: false,
      },
    );
  });

  it('실제 트레이와 다르면 던진다', () => {
    expect(() => probeTray(createBoard(8), createRng(7), ['dot', 'dot', 'dot'])).toThrow(/probe/);
  });

  it('정상 보정(seed 8, 리뷰 재현): 실제 [dot, i4v, l3a]를 통과', () => {
    const { rng, tray, after } = real(oneHole(), 8);
    // 독립 기대값: 리뷰가 계산한 실제 생성기 출력
    expect(tray).toEqual(['dot', 'i4v', 'l3a']);
    expect(probeTray(oneHole(), rng, tray, after)).toEqual({
      attempts: GENERATOR.maxRerolls,
      corrected: true,
    });
  });

  it('보정을 건너뛴 트레이(마지막 실패 추첨 그대로)는 거부', () => {
    const { rng } = real(oneHole(), 8);
    expect(() => probeTray(oneHole(), rng, ['l3a', 'i4v', 'l3a'])).toThrow(/probe/);
  });

  it('잘못된 슬롯에 보정한 트레이와 다른 교체 조각은 거부', () => {
    const { rng, tray, after } = real(oneHole(), 8);
    const slot = tray.indexOf('dot');
    const failed = ['l3a', 'i4v', 'l3a'];
    // 다른 슬롯에 dot
    const wrongSlot = [...failed];
    wrongSlot[(slot + 1) % 3] = 'dot';
    expect(() => probeTray(oneHole(), rng, wrongSlot, after)).toThrow(/probe/);
    // 같은 슬롯에 놓을 수 없는 다른 조각
    const wrongPiece = [...failed];
    wrongPiece[slot] = 'i2h';
    expect(() => probeTray(oneHole(), rng, wrongPiece, after)).toThrow(/probe/);
  });

  it('다음 RNG 상태가 다르면 거부', () => {
    const { rng, tray, after } = real(oneHole(), 8);
    expect(() => probeTray(oneHole(), rng, tray, after + 1)).toThrow(/RNG/);
  });

  it('여러 seed에서 generateTray와 항상 일치 (보정이 섞인 보드 포함)', () => {
    let corrected = 0;
    for (let seed = 1; seed <= 200; seed++) {
      for (const board of [createBoard(8), oneHole()]) {
        const { rng, tray, after } = real(board, seed);
        if (probeTray(board, rng, tray, after).corrected) corrected++;
      }
    }
    expect(corrected).toBeGreaterThan(0);
  });
});
