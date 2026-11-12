// 보드 연산 (PLAN 4.3). 보드는 불변이다: 입력을 바꾸지 않고 항상 새 객체를 돌려준다.

import type { Board, PieceDef, Pos } from './types';

function inBounds(board: Board, pos: Pos): boolean {
  return pos.r >= 0 && pos.r < board.size && pos.c >= 0 && pos.c < board.size;
}

/** 빈 보드 */
export function createBoard(size: number): Board {
  return { size, cells: new Array<number | null>(size * size).fill(null) };
}

/** 조각 칸을 기준점만큼 옮긴 좌표 */
export function cellsAt(piece: PieceDef, anchor: Pos): Pos[] {
  return piece.cells.map((cell) => ({ r: anchor.r + cell.r, c: anchor.c + cell.c }));
}

/** 모든 칸이 보드 안이고 빈 칸이면 true */
export function canPlace(board: Board, piece: PieceDef, anchor: Pos): boolean {
  return cellsAt(piece, anchor).every(
    (pos) => inBounds(board, pos) && board.cells[pos.r * board.size + pos.c] === null,
  );
}

/** 모든 기준점 전수 검사 (SPEC 9.1). 보드가 작아서 최적화하지 않는다 */
export function canPlaceAnywhere(board: Board, piece: PieceDef): boolean {
  for (let r = 0; r < board.size; r++) {
    for (let c = 0; c < board.size; c++) {
      if (canPlace(board, piece, { r, c })) return true;
    }
  }
  return false;
}

/** 지정한 칸에 색을 넣은 새 보드. 보드 밖 좌표는 무시한다 (cells 길이를 지킨다) */
export function fillCells(board: Board, cells: readonly Pos[], color: number): Board {
  const next = board.cells.slice();
  for (const pos of cells) {
    if (inBounds(board, pos)) next[pos.r * board.size + pos.c] = color;
  }
  return { size: board.size, cells: next };
}

/** 꽉 찬 가로·세로 줄 번호 (오름차순) */
export function fullLines(board: Board): { rows: number[]; cols: number[] } {
  const { size, cells } = board;
  const rows: number[] = [];
  const cols: number[] = [];
  for (let i = 0; i < size; i++) {
    let rowFull = true;
    let colFull = true;
    for (let j = 0; j < size; j++) {
      if (cells[i * size + j] === null) rowFull = false;
      if (cells[j * size + i] === null) colFull = false;
    }
    if (rowFull) rows.push(i);
    if (colFull) cols.push(i);
  }
  return { rows, cols };
}

/**
 * 줄을 지운 새 보드와 지운 칸 목록. 교차 칸은 한 번만 들어간다.
 * `cleared` 순서 = 가로 줄 먼저(위→아래, 왼→오), 그다음 세로 줄에서 아직 안 나온 칸(왼→오, 위→아래).
 * `rows`, `cols`는 `fullLines`의 결과(오름차순)를 그대로 넘긴다.
 */
export function clearLines(
  board: Board,
  rows: readonly number[],
  cols: readonly number[],
): { board: Board; cleared: Pos[] } {
  const { size } = board;
  const next = board.cells.slice();
  const seen = new Set<number>();
  const cleared: Pos[] = [];

  const clearCell = (r: number, c: number): void => {
    const index = r * size + c;
    if (seen.has(index)) return;
    seen.add(index);
    next[index] = null;
    cleared.push({ r, c });
  };

  for (const r of rows) {
    for (let c = 0; c < size; c++) clearCell(r, c);
  }
  for (const c of cols) {
    for (let r = 0; r < size; r++) clearCell(r, c);
  }
  return { board: { size, cells: next }, cleared };
}
