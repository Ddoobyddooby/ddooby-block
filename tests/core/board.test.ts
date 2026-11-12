import { describe, expect, it } from 'vitest';
import {
  canPlace,
  canPlaceAnywhere,
  cellsAt,
  clearLines,
  createBoard,
  fillCells,
  fullLines,
} from '../../src/core/board';
import type { Board, PieceDef, Pos } from '../../src/core/types';
import { boardFrom, FILLED } from '../helpers/board';

// pieces.ts는 W1-03 몫이라 조각은 여기서 리터럴로 만든다 (모양은 PLAN 4.2 표와 같다)
const dot: PieceDef = { id: 'dot', cells: [{ r: 0, c: 0 }], color: 0 };
const i3h: PieceDef = {
  id: 'i3h',
  cells: [
    { r: 0, c: 0 },
    { r: 0, c: 1 },
    { r: 0, c: 2 },
  ],
  color: 1,
};
const i5h: PieceDef = {
  id: 'i5h',
  cells: [
    { r: 0, c: 0 },
    { r: 0, c: 1 },
    { r: 0, c: 2 },
    { r: 0, c: 3 },
    { r: 0, c: 4 },
  ],
  color: 1,
};
const o2: PieceDef = {
  id: 'o2',
  cells: [
    { r: 0, c: 0 },
    { r: 0, c: 1 },
    { r: 1, c: 0 },
    { r: 1, c: 1 },
  ],
  color: 2,
};
/** `#./##` */
const l3a: PieceDef = {
  id: 'l3a',
  cells: [
    { r: 0, c: 0 },
    { r: 1, c: 0 },
    { r: 1, c: 1 },
  ],
  color: 3,
};

const EMPTY_8 = boardFrom(`
  ........
  ........
  ........
  ........
  ........
  ........
  ........
  ........
`);

const FULL_8 = boardFrom(`
  ########
  ########
  ########
  ########
  ########
  ########
  ########
  ########
`);

/** 보드와 cells 배열을 얼려서, 구현이 입력을 고치려 하면 TypeError가 나게 한다 */
function frozen(board: Board): Board {
  Object.freeze(board.cells);
  return Object.freeze(board);
}

describe('tests/helpers boardFrom', () => {
  it('# = 채운 칸, . = 빈 칸, index = r * size + c', () => {
    const board = boardFrom('#..\n.#.\n..#');
    expect(board).toEqual({
      size: 3,
      cells: [FILLED, null, null, null, FILLED, null, null, null, FILLED],
    });
  });

  it('가로·세로를 뒤집지 않는다 (r = 줄, c = 줄 안의 위치)', () => {
    const board = boardFrom('.#\n..');
    expect(board.cells).toEqual([null, FILLED, null, null]);
  });

  it('여러 줄 템플릿의 들여쓰기와 앞뒤 빈 줄을 무시한다', () => {
    const board = boardFrom(`
      #.
      .#
    `);
    expect(board).toEqual({ size: 2, cells: [FILLED, null, null, FILLED] });
  });

  it('채운 칸의 색은 0이다 (null과 구분된다)', () => {
    expect(FILLED).toBe(0);
    expect(boardFrom('#').cells).toEqual([0]);
  });

  it('정사각형이 아니면 예외', () => {
    expect(() => boardFrom('##\n#')).toThrow();
    expect(() => boardFrom('###\n###')).toThrow();
  });

  it('모르는 글자나 빈 문자열이면 예외', () => {
    expect(() => boardFrom('#x\n..')).toThrow();
    expect(() => boardFrom('')).toThrow();
    expect(() => boardFrom('  \n  ')).toThrow();
  });
});

describe('core/board createBoard', () => {
  it('8 → 64칸 모두 null', () => {
    const board = createBoard(8);
    expect(board.size).toBe(8);
    expect(board.cells).toHaveLength(64);
    expect(board.cells.every((cell) => cell === null)).toBe(true);
    expect(board).toEqual(EMPTY_8);
  });

  it('크기를 인자로 받는다', () => {
    expect(createBoard(3)).toEqual({
      size: 3,
      cells: [null, null, null, null, null, null, null, null, null],
    });
  });
});

describe('core/board cellsAt', () => {
  it('조각 칸을 기준점만큼 옮긴다', () => {
    expect(cellsAt(l3a, { r: 2, c: 5 })).toEqual([
      { r: 2, c: 5 },
      { r: 3, c: 5 },
      { r: 3, c: 6 },
    ]);
  });

  it('기준점 (0,0)이면 조각 칸 그대로', () => {
    expect(cellsAt(o2, { r: 0, c: 0 })).toEqual([
      { r: 0, c: 0 },
      { r: 0, c: 1 },
      { r: 1, c: 0 },
      { r: 1, c: 1 },
    ]);
  });

  it('조각 정의를 바꾸지 않는다', () => {
    const piece: PieceDef = {
      id: 'i2h',
      cells: Object.freeze([Object.freeze({ r: 0, c: 0 }), Object.freeze({ r: 0, c: 1 })]),
      color: 1,
    };
    expect(cellsAt(piece, { r: 4, c: 4 })).toEqual([
      { r: 4, c: 4 },
      { r: 4, c: 5 },
    ]);
    expect(piece.cells).toEqual([
      { r: 0, c: 0 },
      { r: 0, c: 1 },
    ]);
  });
});

describe('core/board canPlace', () => {
  it('빈 보드 안쪽 → true', () => {
    expect(canPlace(EMPTY_8, o2, { r: 0, c: 0 })).toBe(true);
    expect(canPlace(EMPTY_8, o2, { r: 3, c: 4 })).toBe(true);
  });

  it('보드 밖 (음수) → false', () => {
    expect(canPlace(EMPTY_8, dot, { r: -1, c: 0 })).toBe(false);
    expect(canPlace(EMPTY_8, dot, { r: 0, c: -1 })).toBe(false);
    expect(canPlace(EMPTY_8, o2, { r: -1, c: -1 })).toBe(false);
  });

  it('보드 밖 (8 이상) → false', () => {
    expect(canPlace(EMPTY_8, dot, { r: 8, c: 0 })).toBe(false);
    expect(canPlace(EMPTY_8, dot, { r: 0, c: 8 })).toBe(false);
    // 기준점은 안쪽이지만 조각 일부가 밖으로 나간다
    expect(canPlace(EMPTY_8, o2, { r: 7, c: 0 })).toBe(false);
    expect(canPlace(EMPTY_8, o2, { r: 0, c: 7 })).toBe(false);
  });

  it('오른쪽으로 넘친 칸이 다음 줄의 빈 칸으로 계산되지 않는다', () => {
    // (0,6) (0,7) (0,8): 1차원 index로는 8 = (1,0)이라 잘못 구현하면 true가 된다
    expect(canPlace(EMPTY_8, i3h, { r: 0, c: 6 })).toBe(false);
  });

  it('채워진 칸과 겹침 → false', () => {
    const board = boardFrom(`
      ........
      ........
      ........
      ....#...
      ........
      ........
      ........
      ........
    `);
    expect(canPlace(board, dot, { r: 3, c: 4 })).toBe(false);
    expect(canPlace(board, o2, { r: 2, c: 3 })).toBe(false); // 조각의 (1,1) 칸이 겹친다
    expect(canPlace(board, o2, { r: 3, c: 4 })).toBe(false); // 조각의 (0,0) 칸이 겹친다
    expect(canPlace(board, o2, { r: 4, c: 4 })).toBe(true); // 바로 아래는 비어 있다
  });

  it('오른쪽 아래 끝에 딱 맞음 → true', () => {
    expect(canPlace(EMPTY_8, o2, { r: 6, c: 6 })).toBe(true);
    expect(canPlace(EMPTY_8, dot, { r: 7, c: 7 })).toBe(true);
    expect(canPlace(EMPTY_8, i3h, { r: 7, c: 5 })).toBe(true);
  });

  it('조각의 빈 모서리는 채워진 칸과 겹쳐도 된다', () => {
    // l3a = #./## 이라 (0,1)은 조각 칸이 아니다
    const board = boardFrom(`
      .#......
      ........
      ........
      ........
      ........
      ........
      ........
      ........
    `);
    expect(canPlace(board, l3a, { r: 0, c: 0 })).toBe(true);
  });
});

describe('core/board canPlaceAnywhere', () => {
  it('빈 보드 → true', () => {
    expect(canPlaceAnywhere(EMPTY_8, o2)).toBe(true);
    expect(canPlaceAnywhere(EMPTY_8, i5h)).toBe(true);
  });

  it('꽉 찬 보드 → false', () => {
    expect(canPlaceAnywhere(FULL_8, dot)).toBe(false);
    expect(canPlaceAnywhere(FULL_8, o2)).toBe(false);
  });

  it('딱 한 자리만 맞는 보드 → true (마지막 기준점까지 검사한다)', () => {
    // 빈 칸은 (6,6) (7,6) (7,7) = l3a 모양 하나뿐
    const board = boardFrom(`
      ########
      ########
      ########
      ########
      ########
      ########
      ######.#
      ######..
    `);
    expect(canPlaceAnywhere(board, l3a)).toBe(true);
    expect(canPlaceAnywhere(board, dot)).toBe(true);
    expect(canPlaceAnywhere(board, i3h)).toBe(false);
    expect(canPlaceAnywhere(board, o2)).toBe(false);
  });

  it('빈 칸이 (0,0) 하나뿐 → dot만 true', () => {
    const board = boardFrom(`
      .#######
      ########
      ########
      ########
      ########
      ########
      ########
      ########
    `);
    expect(canPlaceAnywhere(board, dot)).toBe(true);
    expect(canPlaceAnywhere(board, l3a)).toBe(false);
  });

  it('크기는 board.size를 따른다 (8을 가정하지 않는다)', () => {
    const empty4 = boardFrom(`
      ....
      ....
      ....
      ....
    `);
    expect(canPlaceAnywhere(empty4, i3h)).toBe(true);
    expect(canPlaceAnywhere(empty4, i5h)).toBe(false);

    // 10×10에서 빈 자리가 8번 줄·열 밖(9번 줄)에만 있다
    const big = boardFrom(`
      ##########
      ##########
      ##########
      ##########
      ##########
      ##########
      ##########
      ##########
      ##########
      #######...
    `);
    expect(canPlaceAnywhere(big, i3h)).toBe(true);
  });
});

describe('core/board fillCells', () => {
  it('지정한 칸만 색이 들어가고 나머지는 그대로', () => {
    const board = boardFrom(`
      #...
      ....
      ....
      ...#
    `);
    const cells: Pos[] = [
      { r: 1, c: 1 },
      { r: 1, c: 2 },
      { r: 2, c: 1 },
    ];
    const result = fillCells(board, cells, 5);
    // prettier-ignore
    expect(result).toEqual({
      size: 4,
      cells: [
        FILLED, null, null, null,
        null,   5,    5,    null,
        null,   5,    null, null,
        null,   null, null, FILLED,
      ],
    });
  });

  it('색 0도 채운 칸이다', () => {
    const result = fillCells(createBoard(2), [{ r: 0, c: 1 }], 0);
    expect(result.cells).toEqual([null, 0, null, null]);
    expect(canPlace(result, dot, { r: 0, c: 1 })).toBe(false);
  });

  it('원래 Board와 cells 배열을 바꾸지 않는다', () => {
    const board = frozen(boardFrom('#.\n..'));
    const cells: readonly Pos[] = Object.freeze([Object.freeze({ r: 1, c: 1 })]);

    const result = fillCells(board, cells, 3);

    expect(result).not.toBe(board);
    expect(result.cells).not.toBe(board.cells);
    expect(board).toEqual({ size: 2, cells: [FILLED, null, null, null] });
    expect(cells).toEqual([{ r: 1, c: 1 }]);
    expect(result.cells).toEqual([FILLED, null, null, 3]);
  });

  it('보드 밖 좌표는 무시한다 (cells 길이가 늘지 않는다)', () => {
    const result = fillCells(
      createBoard(2),
      [
        { r: 0, c: 2 },
        { r: 2, c: 0 },
        { r: -1, c: 0 },
        { r: 0, c: -1 },
        { r: 1, c: 0 },
      ],
      4,
    );
    expect(result).toEqual({ size: 2, cells: [null, null, 4, null] });
  });
});

describe('core/board fullLines', () => {
  it('꽉 찬 줄 없음', () => {
    expect(fullLines(EMPTY_8)).toEqual({ rows: [], cols: [] });
    const almost = boardFrom(`
      #######.
      #.......
      #.......
      #.......
      #.......
      #.......
      #.......
      ........
    `);
    expect(fullLines(almost)).toEqual({ rows: [], cols: [] });
  });

  it('가로 1줄', () => {
    const board = boardFrom(`
      ........
      ........
      ########
      ...#....
      ........
      ........
      ........
      ........
    `);
    expect(fullLines(board)).toEqual({ rows: [2], cols: [] });
  });

  it('세로 1줄', () => {
    const board = boardFrom(`
      ......#.
      ......#.
      ......#.
      ..#...#.
      ......#.
      ......#.
      ......#.
      ......#.
    `);
    expect(fullLines(board)).toEqual({ rows: [], cols: [6] });
  });

  it('가로 2 + 세로 1 동시 (오름차순)', () => {
    const board = boardFrom(`
      ...#....
      ########
      ...#....
      ...#....
      ...#....
      ...#....
      ########
      ...#....
    `);
    expect(fullLines(board)).toEqual({ rows: [1, 6], cols: [3] });
  });

  it('꽉 찬 보드 → 모든 줄', () => {
    expect(fullLines(FULL_8)).toEqual({
      rows: [0, 1, 2, 3, 4, 5, 6, 7],
      cols: [0, 1, 2, 3, 4, 5, 6, 7],
    });
  });

  it('크기는 board.size를 따른다', () => {
    const board = boardFrom(`
      #.#
      ###
      ..#
    `);
    expect(fullLines(board)).toEqual({ rows: [1], cols: [2] });
  });
});

describe('core/board clearLines', () => {
  const CROSS = `
    #....#..
    .....#..
    .....#..
    ########
    .....#..
    .....#.#
    .....#..
    ..#..#.#
  `;

  it('가로 3번 + 세로 5번 → cleared 15칸, 교차 칸 (3,5)는 한 번만, 순서는 PLAN 4.3', () => {
    const { cleared } = clearLines(boardFrom(CROSS), [3], [5]);

    expect(cleared).toHaveLength(15);
    expect(cleared.filter((p) => p.r === 3 && p.c === 5)).toHaveLength(1);
    // 가로 줄 먼저(왼→오), 그다음 세로 줄에서 아직 안 나온 칸(위→아래)
    expect(cleared).toEqual([
      { r: 3, c: 0 },
      { r: 3, c: 1 },
      { r: 3, c: 2 },
      { r: 3, c: 3 },
      { r: 3, c: 4 },
      { r: 3, c: 5 },
      { r: 3, c: 6 },
      { r: 3, c: 7 },
      { r: 0, c: 5 },
      { r: 1, c: 5 },
      { r: 2, c: 5 },
      { r: 4, c: 5 },
      { r: 5, c: 5 },
      { r: 6, c: 5 },
      { r: 7, c: 5 },
    ]);
  });

  it('지운 줄은 비고 다른 칸은 그대로', () => {
    const { board } = clearLines(boardFrom(CROSS), [3], [5]);
    expect(board).toEqual(
      boardFrom(`
        #.......
        ........
        ........
        ........
        ........
        .......#
        ........
        ..#....#
      `),
    );
  });

  it('원래 Board와 rows·cols 배열을 바꾸지 않는다', () => {
    const original = frozen(boardFrom(CROSS));
    const rows: readonly number[] = Object.freeze([3]);
    const cols: readonly number[] = Object.freeze([5]);

    const result = clearLines(original, rows, cols);

    expect(result.board).not.toBe(original);
    expect(result.board.cells).not.toBe(original.cells);
    expect(original).toEqual(boardFrom(CROSS));
    expect(rows).toEqual([3]);
    expect(cols).toEqual([5]);
  });

  it('가로 2 + 세로 2: 가로는 위→아래, 세로는 왼→오 순서, 교차 4칸은 한 번씩', () => {
    const board = boardFrom(`
      #..#
      ####
      #..#
      ####
    `);
    const result = clearLines(board, [1, 3], [0, 3]);
    expect(result.cleared).toEqual([
      { r: 1, c: 0 },
      { r: 1, c: 1 },
      { r: 1, c: 2 },
      { r: 1, c: 3 },
      { r: 3, c: 0 },
      { r: 3, c: 1 },
      { r: 3, c: 2 },
      { r: 3, c: 3 },
      { r: 0, c: 0 },
      { r: 2, c: 0 },
      { r: 0, c: 3 },
      { r: 2, c: 3 },
    ]);
    expect(result.board).toEqual(createBoard(4));
  });

  it('가로만 / 세로만', () => {
    const board = boardFrom(`
      ##.
      ###
      .#.
    `);
    const rowOnly = clearLines(board, [1], []);
    expect(rowOnly.cleared).toEqual([
      { r: 1, c: 0 },
      { r: 1, c: 1 },
      { r: 1, c: 2 },
    ]);
    expect(rowOnly.board).toEqual(boardFrom('##.\n...\n.#.'));

    const colOnly = clearLines(board, [], [1]);
    expect(colOnly.cleared).toEqual([
      { r: 0, c: 1 },
      { r: 1, c: 1 },
      { r: 2, c: 1 },
    ]);
    expect(colOnly.board).toEqual(boardFrom('#..\n#.#\n...'));
  });

  it('지울 줄이 없으면 cleared는 비고 보드 내용은 같다', () => {
    const board = boardFrom(CROSS);
    const result = clearLines(board, [], []);
    expect(result.cleared).toEqual([]);
    expect(result.board).toEqual(boardFrom(CROSS));
  });

  it('fullLines 결과를 그대로 넘기면 꽉 찬 줄이 남지 않는다', () => {
    const board = boardFrom(CROSS);
    const lines = fullLines(board);
    expect(lines).toEqual({ rows: [3], cols: [5] });
    const result = clearLines(board, lines.rows, lines.cols);
    expect(fullLines(result.board)).toEqual({ rows: [], cols: [] });
  });
});
