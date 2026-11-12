import { describe, expect, it } from 'vitest';
import {
  canPlaceAnywhere,
  clearLines,
  createBoard,
  fillCells,
  fullLines,
} from '../../src/core/board';
import { generateTray, weightedPick } from '../../src/core/generator';
import { getPiece } from '../../src/core/pieces';
import { createRng, next, nextInt, type RngState } from '../../src/core/rng';
import type { Board, Pos } from '../../src/core/types';
import { boardFrom, FILLED } from '../helpers/board';

// ---------------------------------------------------------------------------
// 독립 기준 구현. RNG는 mock하지 않는다 (core는 순수 함수라 주입 지점이 없다).
// rng.ts의 next/nextInt로 seed의 정수 수열을 직접 뽑고, 아래 손으로 적은 표로 기대값을 계산한다.
// pieces.ts·config.ts의 표와 generator.ts의 추첨 코드를 쓰지 않는다.
// ---------------------------------------------------------------------------

/** PLAN 4.2 표를 보고 손으로 적었다. 순서 = 표 순서 */
const TABLE: readonly (readonly [id: string, weight: number])[] = [
  ['dot', 4],
  ['i2h', 6],
  ['i2v', 6],
  ['i3h', 6],
  ['i3v', 6],
  ['i4h', 4],
  ['i4v', 4],
  ['i5h', 2],
  ['i5v', 2],
  ['o2', 6],
  ['r2x3', 3],
  ['r3x2', 3],
  ['o3', 1],
  ['l3a', 5],
  ['l3b', 5],
  ['l3c', 5],
  ['l3d', 5],
  ['l5a', 2],
  ['l5b', 2],
  ['l5c', 2],
  ['l5d', 2],
  ['tu', 4],
  ['td', 4],
  ['tl', 4],
  ['tr', 4],
  ['sh', 3],
  ['sv', 3],
  ['zh', 3],
  ['zv', 3],
];
const IDS: readonly string[] = TABLE.map(([id]) => id);

const REF_TRAY_SIZE = 3;
const REF_MAX_ATTEMPTS = 10;
const REF_TOTAL_WEIGHT = 109;

/**
 * 추첨 정수 → ID 표. ID를 가중치만큼 늘어놓는다 (`[dot, dot, dot, dot, i2h, …]`).
 * 누적합 비교를 쓰지 않으므로 generator.ts의 구간 계산과 같은 실수를 하지 않는다.
 */
function expand(ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const [id, weight] of TABLE) {
    if (!ids.includes(id)) continue;
    for (let i = 0; i < weight; i++) out.push(id);
  }
  return out;
}
const ALL_LOOKUP: readonly string[] = expand(IDS);

function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined)
    throw new Error(`테스트 버그: index ${index}가 범위 밖 (${list.length})`);
  return value;
}

/** next를 n번 적용한 상태 = RNG를 n번 쓴 뒤의 상태 */
function advance(state: RngState, n: number): RngState {
  let s = state;
  for (let i = 0; i < n; i++) s = next(s)[1];
  return s;
}

interface RefResult {
  tray: string[];
  state: RngState;
  /** 성공한 시도 번호(1~10). 보정이면 10 */
  attempts: number;
  corrected: boolean;
  /** 보정 전 마지막 시도 트레이 (보정일 때만) */
  before?: string[];
  slot?: number;
  /** 보정 조각 추첨에서 나온 정수 (보정일 때만) */
  roll?: number;
}

/**
 * PLAN 4.4 기준 구현. `canPlaceAnywhere` 대신 그 보드에서 놓을 수 있는 ID를 손으로 넘긴다
 * (`placeable`, 표 순서 무관 — 여기서 표 순서로 다시 늘어놓는다).
 */
function refGenerate(seed: number, placeable: readonly string[]): RefResult {
  let state = createRng(seed);
  let tray: string[] = [];
  for (let attempt = 1; attempt <= REF_MAX_ATTEMPTS; attempt++) {
    tray = [];
    for (let i = 0; i < REF_TRAY_SIZE; i++) {
      const [roll, s] = nextInt(state, REF_TOTAL_WEIGHT);
      state = s;
      tray.push(at(ALL_LOOKUP, roll));
    }
    if (tray.some((id) => placeable.includes(id))) {
      return { tray, state, attempts: attempt, corrected: false };
    }
  }
  const before = [...tray];
  const lookup = expand(placeable);
  const [slot, s1] = nextInt(state, REF_TRAY_SIZE);
  const [roll, s2] = nextInt(s1, lookup.length);
  tray[slot] = at(lookup, roll);
  return { tray, state: s2, attempts: REF_MAX_ATTEMPTS, corrected: true, before, slot, roll };
}

/** 조건에 맞는 seed를 `from`부터 `count`개 찾는다. 못 찾으면 테스트 버그 */
function findSeeds(pred: (seed: number) => boolean, count: number, from = 1): number[] {
  const found: number[] = [];
  for (let seed = from; seed < from + 200_000 && found.length < count; seed++) {
    if (pred(seed)) found.push(seed);
  }
  if (found.length < count) throw new Error(`테스트 버그: seed를 ${count}개 찾지 못했다`);
  return found;
}

function findSeed(pred: (seed: number) => boolean, from = 1): number {
  return at(findSeeds(pred, 1, from), 0);
}

// ---------------------------------------------------------------------------
// 보드. 놓을 수 있는 조각을 손으로 알 수 있는 보드만 쓴다
// ---------------------------------------------------------------------------

const FULL_ROWS = (n: number): string => new Array<string>(n).fill('########').join('\n');

const EMPTY = createBoard(8);
/** 빈 칸이 (0,0) 하나뿐 → dot만 놓인다 */
const ONE_HOLE = boardFrom(`.#######\n${FULL_ROWS(7)}`);
/** 가로로 붙은 빈 칸 (0,0)·(0,1) → dot, i2h */
const TWO_H = boardFrom(`..######\n${FULL_ROWS(7)}`);
/** 세로로 붙은 빈 칸 (0,0)·(1,0) → dot, i2v */
const TWO_V = boardFrom(`.#######\n.#######\n${FULL_ROWS(6)}`);
const FULL = boardFrom(FULL_ROWS(8));

const CASES: readonly { name: string; board: Board; placeable: readonly string[] }[] = [
  { name: '빈 보드', board: EMPTY, placeable: IDS },
  { name: '빈 칸 (0,0) 하나', board: ONE_HOLE, placeable: ['dot'] },
  { name: '가로 빈 칸 둘', board: TWO_H, placeable: ['dot', 'i2h'] },
  { name: '세로 빈 칸 둘', board: TWO_V, placeable: ['dot', 'i2v'] },
];

function placeableIds(board: Board): string[] {
  return IDS.filter((id) => {
    const piece = getPiece(id);
    return piece !== undefined && canPlaceAnywhere(board, piece);
  });
}

describe('기준 구현의 전제', () => {
  it('손으로 적은 표: 29종, 가중치 합 109', () => {
    expect(TABLE).toHaveLength(29);
    expect(ALL_LOOKUP).toHaveLength(REF_TOTAL_WEIGHT);
    expect(new Set(IDS).size).toBe(29);
  });

  it('보드마다 손으로 적은 "놓을 수 있는 조각"이 실제 canPlaceAnywhere와 같다', () => {
    for (const { name, board, placeable } of CASES) {
      expect(placeableIds(board), name).toEqual(placeable);
    }
    expect(placeableIds(FULL)).toEqual([]);
  });
});

describe('weightedPick', () => {
  it('구간 경계: [2, 0, 3]에서 정수 0·1 → index 0, 2·3·4 → index 2', () => {
    const expected = [0, 0, 2, 2, 2];
    for (let roll = 0; roll < 5; roll++) {
      // 첫 추첨 정수가 roll인 seed를 찾는다
      const seeds = findSeeds((seed) => nextInt(createRng(seed), 5)[0] === roll, 3);
      for (const seed of seeds) {
        expect(nextInt(createRng(seed), 5)[0]).toBe(roll);
        const [index] = weightedPick([2, 0, 3], createRng(seed));
        expect(index, `roll ${roll}, seed ${seed}`).toBe(expected[roll]);
      }
    }
  });

  it('가중치 0인 항목은 뽑히지 않는다: [2, 0, 3]의 index 1, [0, 1, 0]은 항상 1', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      expect(weightedPick([2, 0, 3], createRng(seed))[0]).not.toBe(1);
      expect(weightedPick([0, 1, 0], createRng(seed))[0]).toBe(1);
    }
  });

  it('RNG를 정확히 한 번 쓴다 (결과가 정해져 있는 [0, 1, 0]도)', () => {
    for (const weights of [[2, 0, 3], [0, 1, 0], [1], [1, 2, 3]]) {
      for (const seed of [0, 1, 2, 42, 12345, -7]) {
        const start = createRng(seed);
        const [, after] = weightedPick(weights, start);
        expect(after).toBe(next(start)[1]);
      }
    }
  });

  it('seed 1~10000으로 [1, 2, 3]을 뽑은 빈도가 가중치 비율 ±2%p', () => {
    const counts = [0, 0, 0];
    const total = 10000;
    for (let seed = 1; seed <= total; seed++) {
      const [index] = weightedPick([1, 2, 3], createRng(seed));
      counts[index] = at(counts, index) + 1;
    }
    expect(at(counts, 0) + at(counts, 1) + at(counts, 2)).toBe(total);
    expect(Math.abs(at(counts, 0) / total - 1 / 6)).toBeLessThan(0.02);
    expect(Math.abs(at(counts, 1) / total - 2 / 6)).toBeLessThan(0.02);
    expect(Math.abs(at(counts, 2) / total - 3 / 6)).toBeLessThan(0.02);
  });

  it('계약 위반은 throw: 빈 배열, 합계 0, 음수, 소수, NaN', () => {
    const rng = createRng(1);
    expect(() => weightedPick([], rng)).toThrow();
    expect(() => weightedPick([0, 0, 0], rng)).toThrow();
    expect(() => weightedPick([3, -1, 2], rng)).toThrow();
    expect(() => weightedPick([1, 1.5], rng)).toThrow();
    expect(() => weightedPick([1, Number.NaN], rng)).toThrow();
    expect(() => weightedPick([1, Number.POSITIVE_INFINITY], rng)).toThrow();
  });

  it('합계 상한 2^32: 넘으면 throw, 딱 상한이면 뽑는다 (RNG가 32비트 값을 낸다)', () => {
    const rng = createRng(1);
    // 낱개는 정수 검사를 통과하지만 합계가 Infinity
    expect(() => weightedPick([1e308, 1e308], rng)).toThrow(/2\^32/);
    expect(() => weightedPick([2 ** 32, 1], rng)).toThrow(/2\^32/);
    expect(() => weightedPick([2 ** 31, 2 ** 31, 1], rng)).toThrow(/2\^32/);

    for (const seed of [0, 1, 2, 42, -7]) {
      const start = createRng(seed);
      expect(weightedPick([2 ** 32], start)).toEqual([0, next(start)[1]]);
      expect(weightedPick([0, 2 ** 31, 2 ** 31], start)[0]).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('generateTray', () => {
  it('같은 seed → 같은 트레이와 같은 다음 RNG 상태, 기준 구현과도 같다', () => {
    const seeds = [0, 1, 2, 3, 7, 42, 999, 12345, 2026_11_11, -5];
    const seen = new Set<string>();
    for (const { name, board, placeable } of CASES) {
      for (const seed of seeds) {
        const first = generateTray(board, createRng(seed));
        const second = generateTray(board, createRng(seed));
        expect(second, `${name}, seed ${seed}`).toEqual(first);

        const ref = refGenerate(seed, placeable);
        expect(first[0], `${name}, seed ${seed}`).toEqual(ref.tray);
        expect(first[1], `${name}, seed ${seed}`).toBe(ref.state);
        seen.add(first[0].join(','));
      }
    }
    // 기대값이 한두 가지로 몰려 있지 않다 (항상 같은 트레이를 돌려주는 구현을 잡는다)
    expect(seen.size).toBeGreaterThan(10);
  });

  it('빈 보드: 첫 시도에서 끝난다. RNG 3번, 트레이는 첫 추첨 3개, 보정 없음', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const start = createRng(seed);
      const [tray, state] = generateTray(EMPTY, start);

      // 기준: seed의 첫 정수 3개를 표에서 찾는다
      const expected: string[] = [];
      let s = start;
      for (let i = 0; i < 3; i++) {
        const [roll, nextState] = nextInt(s, 109);
        s = nextState;
        expected.push(at(ALL_LOOKUP, roll));
      }
      expect(tray, `seed ${seed}`).toEqual(expected);
      expect(state, `seed ${seed}`).toBe(advance(start, 3));
    }
  });

  it('재추첨: 2번째 시도에서 성공하면 RNG 6번', () => {
    const seeds = findSeeds((seed) => {
      const ref = refGenerate(seed, ['dot']);
      return !ref.corrected && ref.attempts === 2;
    }, 3);
    for (const seed of seeds) {
      const ref = refGenerate(seed, ['dot']);
      expect(ref.attempts).toBe(2);
      expect(ref.tray).toContain('dot');

      const [tray, state] = generateTray(ONE_HOLE, createRng(seed));
      expect(tray, `seed ${seed}`).toEqual(ref.tray);
      expect(state, `seed ${seed}`).toBe(ref.state);
      expect(state, `seed ${seed}`).toBe(advance(createRng(seed), 6));
    }
  });

  it('재추첨: 10번째 시도에서 성공하면 RNG 30번 (보정용 RNG는 쓰지 않는다)', () => {
    const seeds = findSeeds((seed) => {
      const ref = refGenerate(seed, ['dot']);
      return !ref.corrected && ref.attempts === 10;
    }, 3);
    for (const seed of seeds) {
      const ref = refGenerate(seed, ['dot']);
      expect(ref.corrected).toBe(false);
      expect(ref.attempts).toBe(10);
      expect(ref.tray).toContain('dot');

      const [tray, state] = generateTray(ONE_HOLE, createRng(seed));
      expect(tray, `seed ${seed}`).toEqual(ref.tray);
      expect(state, `seed ${seed}`).toBe(ref.state);
      expect(state, `seed ${seed}`).toBe(advance(createRng(seed), 30));
    }
  });

  it('보정: 빈 칸이 (0,0) 하나뿐이고 30번 모두 dot이 아니면 슬롯 하나만 dot으로 바뀐다 (슬롯 0·1·2)', () => {
    for (const slot of [0, 1, 2]) {
      const seeds = findSeeds((seed) => {
        const ref = refGenerate(seed, ['dot']);
        return ref.corrected && ref.slot === slot;
      }, 4);
      for (const seed of seeds) {
        const ref = refGenerate(seed, ['dot']);
        const before = ref.before ?? [];
        // 찾은 seed가 정말 그 상황인지: 30번 모두 dot이 아니다
        expect(ref.corrected).toBe(true);
        expect(before).toHaveLength(3);
        expect(before).not.toContain('dot');
        let s = createRng(seed);
        for (let i = 0; i < 30; i++) {
          const [roll, nextState] = nextInt(s, 109);
          s = nextState;
          expect(at(ALL_LOOKUP, roll)).not.toBe('dot');
        }

        const [tray, state] = generateTray(ONE_HOLE, createRng(seed));
        const msg = `seed ${seed}, slot ${slot}`;
        expect(tray, msg).toHaveLength(3);
        for (let i = 0; i < 3; i++) {
          expect(tray[i], msg).toBe(i === slot ? 'dot' : before[i]);
        }
        expect(tray, msg).toEqual(ref.tray);
        expect(state, msg).toBe(ref.state);
        expect(state, msg).toBe(advance(createRng(seed), 32));
      }
    }
  });

  it('보정 후보는 표 순서 + PIECE_WEIGHTS: 가로 빈 칸 둘 → 정수 0~3은 dot, 4~9는 i2h', () => {
    const seeds = findSeeds((seed) => refGenerate(seed, ['dot', 'i2h']).corrected, 60);
    const rolls = new Set<number>();
    const slots = new Set<number>();
    for (const seed of seeds) {
      const ref = refGenerate(seed, ['dot', 'i2h']);
      const roll = ref.roll ?? -1;
      const slot = ref.slot ?? -1;
      rolls.add(roll);
      slots.add(slot);
      expect(roll).toBeGreaterThanOrEqual(0);
      expect(roll).toBeLessThan(10);
      const expectedId = roll <= 3 ? 'dot' : 'i2h';
      expect(ref.tray[slot]).toBe(expectedId);

      const [tray, state] = generateTray(TWO_H, createRng(seed));
      const msg = `seed ${seed}, slot ${slot}, roll ${roll}`;
      expect(tray[slot], msg).toBe(expectedId);
      expect(tray, msg).toEqual(ref.tray);
      expect(state, msg).toBe(ref.state);
      expect(state, msg).toBe(advance(createRng(seed), 32));
    }
    // 정수 0~9와 슬롯 0~2가 모두 나왔다
    expect([...rolls].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect([...slots].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it('보정 후보: 세로 빈 칸 둘 → 정수 0~3은 dot, 4~9는 i2v', () => {
    const seeds = findSeeds((seed) => refGenerate(seed, ['dot', 'i2v']).corrected, 30);
    const picked = new Set<string>();
    for (const seed of seeds) {
      const ref = refGenerate(seed, ['dot', 'i2v']);
      const roll = ref.roll ?? -1;
      const slot = ref.slot ?? -1;
      const expectedId = roll <= 3 ? 'dot' : 'i2v';
      picked.add(expectedId);

      const [tray, state] = generateTray(TWO_V, createRng(seed));
      const msg = `seed ${seed}, slot ${slot}, roll ${roll}`;
      expect(tray[slot], msg).toBe(expectedId);
      expect(tray, msg).toEqual(ref.tray);
      expect(state, msg).toBe(ref.state);
    }
    expect([...picked].sort()).toEqual(['dot', 'i2v']);
  });

  it('놓을 수 있는 조각이 하나도 없으면(꽉 찬 보드) throw', () => {
    for (const seed of [1, 2, 3, 42]) {
      expect(() => generateTray(FULL, createRng(seed))).toThrow();
    }
  });

  it('입력 보드를 바꾸지 않는다 (얼린 보드에서도 예외 없음)', () => {
    for (const { name, board } of CASES) {
      const frozen: Board = Object.freeze({
        size: board.size,
        cells: Object.freeze([...board.cells]),
      });
      const copy = [...board.cells];
      for (const seed of [1, 2, 3, 42]) {
        expect(() => generateTray(frozen, createRng(seed)), name).not.toThrow();
      }
      expect(frozen.size, name).toBe(8);
      expect(frozen.cells, name).toEqual(copy);
    }
    // 보정이 일어나는 경로에서도
    const seed = findSeed((s) => refGenerate(s, ['dot']).corrected);
    const frozen: Board = Object.freeze({
      size: ONE_HOLE.size,
      cells: Object.freeze([...ONE_HOLE.cells]),
    });
    expect(() => generateTray(frozen, createRng(seed))).not.toThrow();
    expect(frozen.cells).toEqual(ONE_HOLE.cells);
  });

  it('중복 허용: 같은 조각이 트레이에 두 번 나오는 seed가 있다', () => {
    const seed = findSeed((s) => new Set(refGenerate(s, IDS).tray).size < 3);
    const [tray] = generateTray(EMPTY, createRng(seed));
    expect(tray).toEqual(refGenerate(seed, IDS).tray);
    expect(new Set(tray).size).toBeLessThan(3);
  });
});

describe('수용 검증 (SPEC 11절): seed 1~1000', () => {
  /**
   * seed에서 따로 만든 RNG로 40~60칸을 서로 다른 위치에 채우고 꽉 찬 줄을 지운 보드.
   * 생성기에 넘기는 RNG(`createRng(seed)`)와 수열이 겹치지 않게 seed를 옮긴다.
   */
  function randomBoard(seed: number): { board: Board; filled: number; filledCells: number } {
    let state = createRng(seed + 1_000_000);
    const [extra, s0] = nextInt(state, 21);
    state = s0;
    const filled = 40 + extra;

    // 앞쪽 filled개만 섞는 Fisher–Yates → 서로 다른 위치
    const order = Array.from({ length: 64 }, (_, i) => i);
    for (let i = 0; i < filled; i++) {
      const [offset, s] = nextInt(state, 64 - i);
      state = s;
      const j = i + offset;
      const tmp = at(order, i);
      order[i] = at(order, j);
      order[j] = tmp;
    }
    const cells: Pos[] = order.slice(0, filled).map((index) => ({
      r: Math.floor(index / 8),
      c: index % 8,
    }));
    const before = fillCells(createBoard(8), cells, FILLED);
    const filledCells = before.cells.filter((cell) => cell !== null).length;
    const { rows, cols } = fullLines(before);
    return { board: clearLines(before, rows, cols).board, filled, filledCells };
  }

  function check(board: Board, seed: number, label: string, failures: string[]): void {
    const [tray] = generateTray(board, createRng(seed));
    if (tray.length !== 3) failures.push(`${label} seed ${seed}: 길이 ${tray.length}`);
    const pieces = tray.map((id) => getPiece(id));
    if (pieces.some((piece) => piece === undefined) || tray.some((id) => !IDS.includes(id))) {
      failures.push(`${label} seed ${seed}: 모르는 ID ${tray.join(',')}`);
    }
    if (!pieces.some((piece) => piece !== undefined && canPlaceAnywhere(board, piece))) {
      failures.push(`${label} seed ${seed}: 놓을 수 있는 조각 없음 ${tray.join(',')}`);
    }
  }

  it('빈 보드 → 길이 3, 모두 PIECES의 ID, 최소 1개는 놓을 수 있다', () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 1000; seed++) check(EMPTY, seed, '빈 보드', failures);
    expect(failures).toEqual([]);
  });

  it('40~60칸을 채우고 꽉 찬 줄을 지운 보드 → 최소 1개는 놓을 수 있다', () => {
    const failures: string[] = [];
    const counts = new Set<number>();
    for (let seed = 1; seed <= 1000; seed++) {
      const { board, filled, filledCells } = randomBoard(seed);
      // 보드가 의도대로 만들어졌는지 먼저 본다
      if (filled < 40 || filled > 60) failures.push(`seed ${seed}: 채운 칸 ${filled}`);
      if (filledCells !== filled)
        failures.push(`seed ${seed}: 겹친 위치 (${filledCells}/${filled})`);
      const left = fullLines(board);
      if (left.rows.length > 0 || left.cols.length > 0) {
        failures.push(`seed ${seed}: 꽉 찬 줄이 남았다`);
      }
      counts.add(filled);
      check(board, seed, '채운 보드', failures);
    }
    expect(failures).toEqual([]);
    // 40과 60 양 끝이 모두 나온다
    expect(Math.min(...counts)).toBe(40);
    expect(Math.max(...counts)).toBe(60);
  });
});
