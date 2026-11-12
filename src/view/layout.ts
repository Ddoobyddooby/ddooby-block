// 보드 좌표(행·열) ↔ 화면 좌표(px) 변환과 화면 구역. Phaser 없는 순수 함수라 테스트할 수 있다.
// createLayout·cellCenter·cellAt은 ddooby-pang에서 복사했다 (PLAN 3.1).

import { BOARD, GAME, VIEW } from '../config';
import type { Pos } from '../core/types';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Layout {
  readonly rows: number;
  readonly cols: number;
  /** 한 칸의 크기 (px) */
  readonly cell: number;
  /** 보드 영역 왼쪽 위 */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 화면 구역 (논리 좌표). 위→아래로 hud → board → tray */
export interface ScreenLayout {
  readonly width: number;
  /** 구역 계산에 쓴 높이 (기준 높이보다 작지 않다) */
  readonly height: number;
  readonly hud: Rect;
  /** 정사각형 */
  readonly board: Rect;
  readonly tray: Rect;
}

/**
 * 화면 높이에 맞춘 구역 배치 (PLAN 6.1). 폭은 GAME.width로 고정이다.
 * 기준 높이(GAME.height)보다 긴 만큼(extra): HUD는 위에 그대로, 보드는 extra × boardShare만큼 내려가고,
 * 트레이는 화면 아래에 붙는다. 기준보다 짧거나 유한한 수가 아니면 기준 높이로 본다.
 */
export function screenLayout(height: number): ScreenLayout {
  const s = VIEW.screen;
  const h = Number.isFinite(height) ? Math.max(height, GAME.height) : GAME.height;
  const extra = h - GAME.height;
  return {
    width: GAME.width,
    height: h,
    hud: { x: 0, y: 0, w: GAME.width, h: s.hudH },
    board: { x: s.boardX, y: s.boardY + extra * s.boardShare, w: s.boardSize, h: s.boardSize },
    tray: { x: 0, y: h - s.trayBottom - s.trayH, w: GAME.width, h: s.trayH },
  };
}

/** 영역 안에 rows x cols 칸을 정사각형으로 가운데 정렬해 배치한다 */
export function createLayout(
  rows: number,
  cols: number,
  area: { x: number; y: number; size: number },
): Layout {
  const cell = Math.floor(area.size / Math.max(rows, cols));
  const width = cell * cols;
  const height = cell * rows;
  return {
    rows,
    cols,
    cell,
    x: area.x + (area.size - width) / 2,
    y: area.y + (area.size - height) / 2,
    width,
    height,
  };
}

/** 화면 구역의 보드 영역에 맞춘 BOARD.size × BOARD.size 칸 배치 */
export function boardLayout(screen: ScreenLayout): Layout {
  const { x, y, w } = screen.board;
  return createLayout(BOARD.size, BOARD.size, { x, y, size: w });
}

/** 칸의 중심 좌표. 보드 밖 칸(음수 등)도 계산한 좌표를 그대로 돌려준다 */
export function cellCenter(layout: Layout, { r, c }: Pos): { x: number; y: number } {
  return { x: layout.x + (c + 0.5) * layout.cell, y: layout.y + (r + 0.5) * layout.cell };
}

/** 화면 좌표가 가리키는 칸. 보드 밖이거나 좌표가 유한한 수가 아니면(NaN, ±Infinity) null */
export function cellAt(layout: Layout, x: number, y: number): Pos | null {
  const c = Math.floor((x - layout.x) / layout.cell);
  const r = Math.floor((y - layout.y) / layout.cell);
  // NaN은 아래 범위 비교가 전부 false라서 따로 걸러야 한다
  if (!Number.isInteger(r) || !Number.isInteger(c)) return null;
  if (r < 0 || r >= layout.rows || c < 0 || c >= layout.cols) return null;
  return { r, c };
}
