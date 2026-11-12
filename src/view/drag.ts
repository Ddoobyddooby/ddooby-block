// 드래그·트레이 좌표 계산 (PLAN 6.1). Phaser 없는 순수 함수이고 입력을 바꾸지 않는다.
// 그리기(dragTopLeft)와 기준점(dragAnchor)이 같은 계산을 써서 화면에 보인 위치와 놓이는 위치가 어긋나지 않는다.

import { TRAY, VIEW } from '../config';
import type { PieceDef, Pos } from '../core/types';
import { boardLayout, type Layout, type Rect, type ScreenLayout } from './layout';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** 조각 bounding box의 크기 (칸 수). 모양은 (0,0)에서 시작한다 (core/pieces.ts) */
export function pieceSize(piece: PieceDef): { rows: number; cols: number } {
  let rows = 0;
  let cols = 0;
  for (const { r, c } of piece.cells) {
    rows = Math.max(rows, r + 1);
    cols = Math.max(cols, c + 1);
  }
  return { rows, cols };
}

/**
 * 드래그 중 실제 칸 크기로 그리는 조각의 bounding box 왼쪽 위 (px).
 * 상자 중심 = (pointer.x, pointer.y − liftCells × cell). 채운 칸의 평균이 아니라 상자의 중심이다.
 */
export function dragTopLeft(
  layout: Layout,
  piece: PieceDef,
  pointer: Point,
  liftCells: number = VIEW.dragLiftCells,
): Point {
  const { rows, cols } = pieceSize(piece);
  const { cell } = layout;
  return {
    x: pointer.x - (cols * cell) / 2,
    y: pointer.y - liftCells * cell - (rows * cell) / 2,
  };
}

/**
 * 드래그 중인 조각을 놓을 기준 칸 (조각의 (0,0)이 놓일 칸). dragTopLeft를 칸 단위로 반올림한다.
 * 보드 밖 값도 자르지 않고 그대로 돌려준다. 놓을 수 있는지는 core(previewPlacement·place)가 정한다.
 */
export function dragAnchor(
  layout: Layout,
  piece: PieceDef,
  pointer: Point,
  liftCells: number = VIEW.dragLiftCells,
): Pos {
  const { x, y } = dragTopLeft(layout, piece, pointer, liftCells);
  // Math.round(-0.4)는 -0이라서 + 0으로 0으로 만든다
  return {
    r: Math.round((y - layout.y) / layout.cell) + 0,
    c: Math.round((x - layout.x) / layout.cell) + 0,
  };
}

/** 트레이 슬롯 영역 (누르기 판정·복귀 위치). 트레이를 TRAY.size개로 균등 분할한다 */
export function traySlotRect(screen: ScreenLayout, index: number): Rect {
  if (!Number.isInteger(index) || index < 0 || index >= TRAY.size) {
    throw new RangeError(`traySlotRect: index ${index} (0~${TRAY.size - 1}의 정수여야 한다)`);
  }
  const { tray } = screen;
  const w = tray.w / TRAY.size;
  return { x: tray.x + index * w, y: tray.y, w, h: tray.h };
}

/** 슬롯 가운데에 VIEW.trayScale 크기로 그릴 때 조각 bounding box (칸 크기 = 보드 칸 × trayScale) */
export function trayPieceRect(screen: ScreenLayout, index: number, piece: PieceDef): Rect {
  const slot = traySlotRect(screen, index);
  const cell = boardLayout(screen).cell * VIEW.trayScale;
  const { rows, cols } = pieceSize(piece);
  const w = cols * cell;
  const h = rows * cell;
  return { x: slot.x + (slot.w - w) / 2, y: slot.y + (slot.h - h) / 2, w, h };
}
