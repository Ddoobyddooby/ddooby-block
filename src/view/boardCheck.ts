// DEV 대조: 화면에 그려진 보드와 core 보드가 같은지 본다. Phaser 없는 순수 함수.

import type { Board, Pos } from '../core/types';

export interface CellMismatch extends Pos {
  /** 화면에 그려진 색 그룹 (null = 빈 칸, undefined = 화면 쪽에 그 칸이 없음) */
  readonly view: number | null | undefined;
  /** core 보드의 값 (undefined = core 쪽에 그 칸이 없음) */
  readonly core: number | null | undefined;
}

/**
 * 화면의 칸(1차원, index = r × size + c)과 core 보드를 칸마다 비교해 다른 칸을 돌려준다. 같으면 빈 배열.
 * 길이가 다르면 넘치는 칸도 다른 칸으로 센다.
 */
export function diffBoard(view: readonly (number | null)[], board: Board): CellMismatch[] {
  const { size, cells } = board;
  const out: CellMismatch[] = [];
  const length = Math.max(view.length, cells.length);
  for (let i = 0; i < length; i++) {
    if (view[i] !== cells[i]) {
      out.push({ r: Math.floor(i / size), c: i % size, view: view[i], core: cells[i] });
    }
  }
  return out;
}
