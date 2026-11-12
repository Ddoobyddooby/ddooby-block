import { describe, expect, it } from 'vitest';
import { canPlaceAnywhere, createBoard, fullLines } from '../../src/core/board';
import { createGame, isGameOver, place, previewPlacement } from '../../src/core/engine';
import { generateTray } from '../../src/core/generator';
import { getPiece } from '../../src/core/pieces';
import { createRng } from '../../src/core/rng';
import type { GameEvent, GameState, PieceId, PlaceAction, Pos } from '../../src/core/types';
import { boardFrom } from '../helpers/board';

// 상태는 boardFrom과 손으로 적은 트레이로 직접 만든다. 기대값도 손으로 적는다.
// boardFrom의 `#`은 색 0이고 dot의 색도 0이라, dot을 놓은 뒤의 보드를 boardFrom으로 그대로 적을 수 있다.

const EMPTY_TEXT = new Array<string>(8).fill('........').join('\n');

/**
 * 빈 칸이 두 대각선에만 있다. 가운데 2×2만 붙어 있어서 dot, i2h, i2v, o2, l3*는 놓이고
 * o3, i5h, i5v 같은 큰 조각은 놓이지 않는다. 줄마다 빈 칸이 둘이라 dot 하나로는 줄이 차지 않는다.
 */
const X_TEXT = `
  .######.
  #.####.#
  ##.##.##
  ###..###
  ###..###
  ##.##.##
  #.####.#
  .######.
`;

/**
 * 0번 줄은 (0,0)만 비었고 나머지는 체크무늬다. 가로로 붙은 빈 칸이 없어서 dot만 놓인다.
 * (0,0)에 dot을 놓으면 0번 줄만 차서 지워지고, 그 뒤에는 0번 줄에 가로 조각이 놓인다.
 */
const CHECKER_TEXT = `
  .#######
  #.#.#.#.
  .#.#.#.#
  #.#.#.#.
  .#.#.#.#
  #.#.#.#.
  .#.#.#.#
  #.#.#.#.
`;
const CHECKER_AFTER_TEXT = `
  ........
  #.#.#.#.
  .#.#.#.#
  #.#.#.#.
  .#.#.#.#
  #.#.#.#.
  .#.#.#.#
  #.#.#.#.
`;

/** 3번 가로줄과 4번 세로줄이 (3,4) 한 칸만 남기고 차 있다 */
const CROSS_TEXT = `
  ....#...
  ....#...
  ....#...
  ####.###
  ....#...
  ....#...
  ....#...
  ....#...
`;

function mk(
  boardText: string,
  tray: readonly (PieceId | null)[],
  extra: Partial<GameState> = {},
): GameState {
  return {
    board: boardFrom(boardText),
    tray: [...tray],
    rngState: createRng(777),
    score: 0,
    combo: 0,
    missStreak: 0,
    over: false,
    ...extra,
  };
}

/** 상태를 깊게 얼린다 (보드, cells, 트레이). 입력을 바꾸는 코드는 strict 모드에서 예외가 난다 */
function freeze(state: GameState): GameState {
  Object.freeze(state.board.cells);
  Object.freeze(state.board);
  Object.freeze(state.tray);
  return Object.freeze(state);
}

function types(events: readonly GameEvent[]): string[] {
  return events.map((event) => event.type);
}

function okResult(
  state: GameState,
  action: PlaceAction,
): { state: GameState; events: GameEvent[] } {
  const result = place(state, action);
  if (!result.ok) throw new Error(`배치 실패: ${result.reason}`);
  return result;
}

describe('createGame', () => {
  it('빈 8×8 보드, 유효한 조각 3개, 점수·콤보·missStreak 0, over false', () => {
    const state = createGame(1);
    expect(state.board.size).toBe(8);
    expect(state.board.cells).toHaveLength(64);
    expect(state.board.cells.every((cell) => cell === null)).toBe(true);
    expect(state.tray).toHaveLength(3);
    for (const id of state.tray) {
      expect(id).not.toBeNull();
      expect(getPiece(id ?? '')).toBeDefined();
    }
    expect(state.score).toBe(0);
    expect(state.combo).toBe(0);
    expect(state.missStreak).toBe(0);
    expect(state.over).toBe(false);
  });

  it('트레이와 rngState는 generateTray(빈 보드, createRng(seed))와 같다', () => {
    for (const seed of [0, 1, 2, 42, 12345, -9]) {
      const [tray, rngState] = generateTray(createBoard(8), createRng(seed));
      const state = createGame(seed);
      expect(state.tray, `seed ${seed}`).toEqual(tray);
      expect(state.rngState, `seed ${seed}`).toBe(rngState);
    }
  });

  it('같은 seed → 같은 상태, seed가 다르면 다른 트레이가 나온다', () => {
    expect(createGame(5)).toEqual(createGame(5));
    const trays = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => createGame(seed).tray.join(',')));
    expect(trays.size).toBeGreaterThan(1);
  });
});

describe('place: 실패', () => {
  // (0,0)~(1,1)이 차 있다. 슬롯 0 = o2, 슬롯 1 = 빈 슬롯, 슬롯 2 = 모르는 ID
  const BOARD_TEXT = `
    ##......
    ##......
    ........
    ........
    ........
    ........
    ........
    ........
  `;
  const TRAY = ['o2', null, 'nope'] as const;

  function expectFail(
    state: GameState,
    action: PlaceAction,
    reason: 'over' | 'emptySlot' | 'blocked',
  ): void {
    const snapshot = structuredClone(state);
    const frozen = freeze(state);
    const result = place(frozen, action);
    const label = JSON.stringify(action);
    // state·events 키가 없어야 한다
    expect(result, label).toStrictEqual({ ok: false, reason });
    expect(frozen, label).toEqual(snapshot);
  }

  it('over 상태면 슬롯·좌표가 잘못돼도 over (가장 먼저 본다)', () => {
    const actions: PlaceAction[] = [
      { trayIndex: 0, row: 4, col: 4 }, // 다른 것은 멀쩡
      { trayIndex: 1, row: 4, col: 4 }, // 빈 슬롯
      { trayIndex: 9, row: 4, col: 4 }, // 범위 밖
      { trayIndex: 2, row: 4, col: 4 }, // 모르는 ID
      { trayIndex: 0, row: 0, col: 0 }, // 겹침
      { trayIndex: 0, row: -1, col: Number.NaN },
    ];
    for (const action of actions) expectFail(mk(BOARD_TEXT, TRAY, { over: true }), action, 'over');
  });

  it('빈 슬롯, 범위 밖·정수가 아닌 trayIndex, 모르는 ID → emptySlot (좌표가 잘못돼도)', () => {
    const indexes = [1, -1, 3, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2];
    for (const trayIndex of indexes) {
      expectFail(mk(BOARD_TEXT, TRAY), { trayIndex, row: 4, col: 4 }, 'emptySlot');
      expectFail(mk(BOARD_TEXT, TRAY), { trayIndex, row: 0, col: 0 }, 'emptySlot');
      expectFail(mk(BOARD_TEXT, TRAY), { trayIndex, row: -1, col: 99 }, 'emptySlot');
    }
  });

  it('겹침, 보드 밖, 정수가 아닌 좌표 → blocked (SPEC 11절 1번의 core 쪽)', () => {
    const positions: readonly (readonly [row: number, col: number])[] = [
      [0, 0], // 전부 겹침
      [1, 1], // 한 칸 겹침
      [-1, 4],
      [4, -1],
      [8, 4],
      [4, 8],
      [7, 4], // o2의 아랫줄이 보드 밖
      [4, 7], // o2의 오른쪽 줄이 보드 밖
      [0.125, 4],
      [4, 0.5],
      [Number.NaN, 4],
      [4, Number.NaN],
      [Number.POSITIVE_INFINITY, 4],
    ];
    for (const [row, col] of positions) {
      expectFail(mk(BOARD_TEXT, TRAY), { trayIndex: 0, row, col }, 'blocked');
    }
  });
});

describe('place: 성공', () => {
  it('칸과 색을 채우고 놓은 슬롯만 null. place 이벤트 하나, RNG·점수 그대로', () => {
    const start = freeze(mk(EMPTY_TEXT, ['dot', 'o2', 'i3h']));
    const snapshot = structuredClone(start);
    const { state, events } = okResult(start, { trayIndex: 1, row: 2, col: 3 });

    const cells: Pos[] = [
      { r: 2, c: 3 },
      { r: 2, c: 4 },
      { r: 3, c: 3 },
      { r: 3, c: 4 },
    ];
    // o2의 색 그룹은 2. index = r * 8 + c
    const expectedCells = new Array<number | null>(64).fill(null);
    for (const index of [19, 20, 27, 28]) expectedCells[index] = 2;
    expect(state.board).toEqual({ size: 8, cells: expectedCells });
    expect(state.tray).toEqual(['dot', null, 'i3h']);
    expect(events).toEqual([{ type: 'place', trayIndex: 1, pieceId: 'o2', cells, color: 2 }]);

    expect(state.rngState).toBe(start.rngState);
    expect(state.score).toBe(0);
    expect(state.combo).toBe(0);
    expect(state.missStreak).toBe(0);
    expect(state.over).toBe(false);

    // 입력은 그대로이고 결과와 배열을 공유하지 않는다
    expect(start).toEqual(snapshot);
    expect(state.tray).not.toBe(start.tray);
    expect(state.board.cells).not.toBe(start.board.cells);
  });

  it('두 번째 조각까지는 트레이를 새로 뽑지 않는다', () => {
    const start = mk(EMPTY_TEXT, ['dot', null, 'i3h']);
    const { state, events } = okResult(start, { trayIndex: 2, row: 7, col: 5 });
    expect(state.tray).toEqual(['dot', null, null]);
    expect(types(events)).toEqual(['place']);
    expect(state.rngState).toBe(start.rngState);
    expect(state.over).toBe(false);
  });

  it('가로·세로가 동시에 차면 clear 이벤트 하나, 교차 칸은 한 번 (SPEC 11절 2번)', () => {
    // CROSS에 (0,0) 한 칸을 더 채워서 보드가 다 비지는 않게 한다
    const start = mk(CROSS_TEXT.replace('....#...', '#...#...'), ['i2h', 'dot', 'i2v']);
    const { state, events } = okResult(start, { trayIndex: 1, row: 3, col: 4 });

    const cleared: Pos[] = [
      // 가로 3번 줄 (왼→오)
      { r: 3, c: 0 },
      { r: 3, c: 1 },
      { r: 3, c: 2 },
      { r: 3, c: 3 },
      { r: 3, c: 4 },
      { r: 3, c: 5 },
      { r: 3, c: 6 },
      { r: 3, c: 7 },
      // 세로 4번 줄에서 아직 안 나온 칸 (위→아래)
      { r: 0, c: 4 },
      { r: 1, c: 4 },
      { r: 2, c: 4 },
      { r: 4, c: 4 },
      { r: 5, c: 4 },
      { r: 6, c: 4 },
      { r: 7, c: 4 },
    ];
    expect(events).toEqual([
      { type: 'place', trayIndex: 1, pieceId: 'dot', cells: [{ r: 3, c: 4 }], color: 0 },
      { type: 'clear', rows: [3], cols: [4], cells: cleared },
    ]);
    expect(state.board).toEqual(boardFrom(EMPTY_TEXT.replace('........', '#.......')));
    expect(state.tray).toEqual(['i2h', null, 'i2v']);
    expect(state.score).toBe(0);
    expect(state.over).toBe(false);
  });

  it('줄을 지워 보드가 전부 비면 place → clear → boardClear', () => {
    const start = mk(CROSS_TEXT, ['i2h', 'dot', 'i2v']);
    const { state, events } = okResult(start, { trayIndex: 1, row: 3, col: 4 });
    expect(types(events)).toEqual(['place', 'clear', 'boardClear']);
    expect(state.board).toEqual(createBoard(8));
    expect(state.over).toBe(false);
  });
});

describe('place: 세 번째 조각', () => {
  it('tray 이벤트와 새 트레이 3개. generateTray(놓은 뒤 보드, 이전 rngState)와 같다', () => {
    for (const seed of [1, 2, 3, 99]) {
      const start = mk(EMPTY_TEXT, [null, 'dot', null], { rngState: createRng(seed) });
      const { state, events } = okResult(start, { trayIndex: 1, row: 0, col: 0 });

      const after = boardFrom(EMPTY_TEXT.replace('........', '#.......'));
      const [tray, rngState] = generateTray(after, createRng(seed));
      expect(state.board).toEqual(after);
      expect(state.tray).toEqual(tray);
      expect(state.tray).toHaveLength(3);
      expect(state.tray.every((id) => id !== null)).toBe(true);
      expect(state.rngState).toBe(rngState);
      expect(state.rngState).not.toBe(start.rngState);

      // gameOver가 없다 = 빈 트레이로 판정하지 않았다
      expect(types(events)).toEqual(['place', 'tray']);
      expect(events[1]).toEqual({ type: 'tray', tray });
      expect(state.over).toBe(false);

      // 이벤트의 배열은 상태의 트레이와 다른 배열이다
      const trayEvent = events[1];
      if (trayEvent?.type !== 'tray') throw new Error('tray 이벤트가 아니다');
      expect(trayEvent.tray).not.toBe(state.tray);
    }
  });

  it('줄 제거와 겹치면 place → clear → tray, 새 트레이는 줄을 지운 뒤 보드로 뽑는다', () => {
    // 0번 줄이 (0,0)만 비었고 (5,5)가 차 있다
    const text = EMPTY_TEXT.replace('........', '.#######').replace(/\n\.{8}$/, '\n.....#..');
    const afterText = EMPTY_TEXT.replace(/\n\.{8}$/, '\n.....#..');
    const start = mk(text, [null, null, 'dot'], { rngState: createRng(31) });
    const { state, events } = okResult(start, { trayIndex: 2, row: 0, col: 0 });

    const after = boardFrom(afterText);
    const [tray, rngState] = generateTray(after, createRng(31));
    expect(types(events)).toEqual(['place', 'clear', 'tray']);
    expect(state.board).toEqual(after);
    expect(state.tray).toEqual(tray);
    expect(state.rngState).toBe(rngState);
    expect(state.over).toBe(false);
  });
});

describe('place: 남은 조각으로 게임 오버 (SPEC 11절 4번)', () => {
  it('남은 2개가 모두 놓을 수 없으면 그 배치에서 over, 마지막 이벤트가 gameOver', () => {
    const start = mk(X_TEXT, ['dot', 'o3', 'i5h']);
    const { state, events } = okResult(start, { trayIndex: 0, row: 0, col: 0 });
    expect(types(events)).toEqual(['place', 'gameOver']);
    expect(events[1]).toEqual({ type: 'gameOver', score: 0 });
    expect(state.over).toBe(true);
    expect(state.tray).toEqual([null, 'o3', 'i5h']);
    expect(state.rngState).toBe(start.rngState);

    // 게임 오버 뒤에는 놓을 수 없다
    expect(place(state, { trayIndex: 1, row: 3, col: 3 })).toStrictEqual({
      ok: false,
      reason: 'over',
    });
  });

  it('남은 조각 중 하나라도 놓이면 게임 오버가 아니다', () => {
    // o2는 가운데 2×2에 놓인다
    const start = mk(X_TEXT, ['dot', 'o3', 'o2']);
    const { state, events } = okResult(start, { trayIndex: 0, row: 0, col: 0 });
    expect(types(events)).toEqual(['place']);
    expect(state.over).toBe(false);
  });

  it('줄을 지워서 자리가 생기면 게임 오버가 아니다 (지운 뒤 보드로 판정)', () => {
    const start = mk(CHECKER_TEXT, ['dot', 'i5h', null]);
    // 전제: 지금 보드에는 i5h를 놓을 곳이 없다
    expect(isGameOver(start.board, ['i5h'])).toBe(true);

    const { state, events } = okResult(start, { trayIndex: 0, row: 0, col: 0 });
    expect(types(events)).toEqual(['place', 'clear']);
    expect(state.board).toEqual(boardFrom(CHECKER_AFTER_TEXT));
    expect(state.over).toBe(false);
  });
});

describe('isGameOver', () => {
  const board = boardFrom(X_TEXT);

  it('놓을 수 있는 조각이 마지막 슬롯에만 있어도 false', () => {
    expect(isGameOver(board, ['o3', 'i5h', 'dot'])).toBe(false);
    expect(isGameOver(board, [null, null, 'o2'])).toBe(false);
  });

  it('남은 조각이 모두 놓을 수 없으면 true', () => {
    expect(isGameOver(board, ['o3', 'i5h', 'i5v'])).toBe(true);
    expect(isGameOver(board, [null, 'o3', null])).toBe(true);
  });

  it('null과 모르는 ID는 놓을 수 없는 것으로 본다 (예외 없음)', () => {
    expect(isGameOver(board, ['nope', null, 'dot'])).toBe(false);
    expect(isGameOver(board, ['nope', null, null])).toBe(true);
    expect(isGameOver(board, ['nope', 'o3', 'zzz'])).toBe(true);
    expect(isGameOver(createBoard(8), ['nope', '', 'constructor'])).toBe(true);
  });

  it('남은 조각이 하나도 없으면 true (정의상)', () => {
    expect(isGameOver(board, [null, null, null])).toBe(true);
    expect(isGameOver(createBoard(8), [])).toBe(true);
  });

  it('입력을 바꾸지 않는다', () => {
    const frozen = freeze(mk(X_TEXT, ['o3', null, 'dot']));
    const snapshot = structuredClone(frozen);
    expect(isGameOver(frozen.board, frozen.tray)).toBe(false);
    expect(frozen).toEqual(snapshot);
  });
});

describe('previewPlacement', () => {
  it('단순 배치: 채워질 칸, 차는 줄 없음', () => {
    const state = mk(EMPTY_TEXT, ['dot', 'o2', 'i3h']);
    expect(previewPlacement(state, { trayIndex: 2, row: 6, col: 1 })).toEqual({
      cells: [
        { r: 6, c: 1 },
        { r: 6, c: 2 },
        { r: 6, c: 3 },
      ],
      rows: [],
      cols: [],
    });
  });

  it('가로·세로가 동시에 차는 배치: rows, cols', () => {
    const state = mk(CROSS_TEXT, ['i2h', 'dot', 'i2v']);
    expect(previewPlacement(state, { trayIndex: 1, row: 3, col: 4 })).toEqual({
      cells: [{ r: 3, c: 4 }],
      rows: [3],
      cols: [4],
    });
    // 한 줄만 차는 위치는 없다: 다른 곳에 놓으면 줄이 안 찬다
    expect(previewPlacement(state, { trayIndex: 1, row: 0, col: 0 })).toEqual({
      cells: [{ r: 0, c: 0 }],
      rows: [],
      cols: [],
    });
  });

  it('놓을 수 없으면 null: over, 빈 슬롯, 범위 밖, 모르는 ID, blocked', () => {
    const tray = ['o2', null, 'nope'] as const;
    expect(
      previewPlacement(mk(EMPTY_TEXT, tray, { over: true }), { trayIndex: 0, row: 0, col: 0 }),
    ).toBeNull();
    const state = mk(CROSS_TEXT, tray);
    expect(previewPlacement(state, { trayIndex: 1, row: 0, col: 0 })).toBeNull();
    expect(previewPlacement(state, { trayIndex: 3, row: 0, col: 0 })).toBeNull();
    expect(previewPlacement(state, { trayIndex: 0.5, row: 0, col: 0 })).toBeNull();
    expect(previewPlacement(state, { trayIndex: 2, row: 0, col: 0 })).toBeNull();
    expect(previewPlacement(state, { trayIndex: 0, row: 0, col: 3 })).toBeNull(); // 겹침
    expect(previewPlacement(state, { trayIndex: 0, row: 7, col: 0 })).toBeNull(); // 보드 밖
    expect(previewPlacement(state, { trayIndex: 0, row: 0.5, col: 0 })).toBeNull();
  });

  it('상태를 바꾸지 않고, 같은 입력의 place 결과와 칸·줄이 맞는다', () => {
    const cases: readonly (readonly [GameState, PlaceAction])[] = [
      [mk(EMPTY_TEXT, ['dot', 'o2', 'i3h']), { trayIndex: 1, row: 2, col: 3 }],
      [mk(CROSS_TEXT, ['i2h', 'dot', 'i2v']), { trayIndex: 1, row: 3, col: 4 }],
      [mk(CHECKER_TEXT, ['dot', 'i5h', null]), { trayIndex: 0, row: 0, col: 0 }],
      [mk(X_TEXT, ['dot', 'o3', 'i5h']), { trayIndex: 0, row: 7, col: 7 }],
    ];
    for (const [state, action] of cases) {
      const snapshot = structuredClone(state);
      const frozen = freeze(state);
      const preview = previewPlacement(frozen, action);
      expect(frozen).toEqual(snapshot);
      if (preview === null) throw new Error('미리보기가 null이다');

      const { events } = okResult(frozen, action);
      const placed = events.find((event) => event.type === 'place');
      const clear = events.find((event) => event.type === 'clear');
      expect(placed?.cells).toEqual(preview.cells);
      expect(clear?.rows ?? []).toEqual(preview.rows);
      expect(clear?.cols ?? []).toEqual(preview.cols);
    }
  });
});

describe('결정성: 같은 seed + 같은 배치 순서 = 같은 상태와 이벤트', () => {
  const MAX_PLACEMENTS = 300;

  /**
   * 단순한 규칙 봇: 줄이 차는 첫 배치(슬롯 → 위→아래 → 왼→오 순서), 없으면 놓을 수 있는 첫 배치.
   * 첫 배치만 고르면 줄을 한 번도 못 지우고 끝나는 seed가 있어서 줄이 차는 배치를 먼저 본다.
   */
  function botAction(state: GameState): PlaceAction | null {
    let first: PlaceAction | null = null;
    for (let trayIndex = 0; trayIndex < state.tray.length; trayIndex++) {
      for (let row = 0; row < state.board.size; row++) {
        for (let col = 0; col < state.board.size; col++) {
          const action = { trayIndex, row, col };
          const preview = previewPlacement(state, action);
          if (preview === null) continue;
          if (preview.rows.length + preview.cols.length > 0) return action;
          first ??= action;
        }
      }
    }
    return first;
  }

  function checkInvariants(state: GameState, label: string): void {
    expect(state.tray, label).toHaveLength(3);
    expect(state.score, label).toBe(0);
    expect(state.combo, label).toBe(0);
    expect(state.missStreak, label).toBe(0);
    expect(fullLines(state.board), label).toEqual({ rows: [], cols: [] });
    // isGameOver를 쓰지 않고 직접 본다
    const anyPlaceable = state.tray.some((id) => {
      const piece = id === null ? undefined : getPiece(id);
      return piece !== undefined && canPlaceAnywhere(state.board, piece);
    });
    expect(anyPlaceable, label).toBe(!state.over);
  }

  it('seed 1~20: 단계마다 두 판의 상태·이벤트가 같고 불변식이 지켜진다', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let a = createGame(seed);
      let b = createGame(seed);
      let placements = 0;
      let trayEvents = 0;
      let clearEvents = 0;

      while (!a.over && placements < MAX_PLACEMENTS) {
        const label = `seed ${seed}, 배치 ${placements}`;
        checkInvariants(a, label);
        const action = botAction(a);
        if (action === null) throw new Error(`${label}: over가 아닌데 놓을 곳이 없다`);

        const ra = place(freeze(a), action);
        const rb = place(b, action);
        expect(rb, label).toEqual(ra);
        if (!ra.ok || !rb.ok) throw new Error(`${label}: 배치 실패`);

        const last = ra.events[ra.events.length - 1];
        expect(last?.type === 'gameOver', label).toBe(ra.state.over);
        trayEvents += ra.events.filter((event) => event.type === 'tray').length;
        clearEvents += ra.events.filter((event) => event.type === 'clear').length;
        a = ra.state;
        b = rb.state;
        placements += 1;
      }
      checkInvariants(a, `seed ${seed}, 끝`);
      expect(a).toEqual(b);
      // 이 판에서 트레이 재생성과 줄 제거가 실제로 일어났다
      expect(trayEvents, `seed ${seed}: tray`).toBeGreaterThanOrEqual(1);
      expect(clearEvents, `seed ${seed}: clear`).toBeGreaterThanOrEqual(1);
    }
  });
});
