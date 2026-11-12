// 엔진 (PLAN 4.5). (state, action) → { state, events }. 순수 함수이고 입력을 바꾸지 않는다.
// place의 처리 순서가 이벤트 순서이자 리플레이 결과이므로 순서를 바꾸면 RULES_VERSION을 올린다.

import { BOARD } from '../config';
import {
  canPlace,
  canPlaceAnywhere,
  cellsAt,
  clearLines,
  createBoard,
  fillCells,
  fullLines,
} from './board';
import { generateTray } from './generator';
import { getPiece } from './pieces';
import { createRng } from './rng';
import type {
  Board,
  GameEvent,
  GameState,
  PieceDef,
  PieceId,
  PlaceAction,
  PlaceResult,
  Pos,
} from './types';

type Check =
  | { ok: true; piece: PieceDef; cells: Pos[] }
  | { ok: false; reason: 'over' | 'emptySlot' | 'blocked' };

/**
 * 배치 검사. 순서: over → 슬롯 → 위치 (PLAN 4.5의 1단계).
 * 범위 밖·정수가 아닌 trayIndex, 빈 슬롯, 모르는 조각 ID(깨진 저장 데이터)는 모두 `emptySlot`이다.
 * 정수가 아닌 좌표(소수, NaN, 숫자가 아닌 값)는 `blocked`이다.
 */
function check(state: GameState, action: PlaceAction): Check {
  if (state.over) return { ok: false, reason: 'over' };

  const { trayIndex } = action;
  if (!Number.isInteger(trayIndex) || trayIndex < 0 || trayIndex >= state.tray.length) {
    return { ok: false, reason: 'emptySlot' };
  }
  const id = state.tray[trayIndex];
  const piece = id === null || id === undefined ? undefined : getPiece(id);
  if (piece === undefined) return { ok: false, reason: 'emptySlot' };

  // 원값을 먼저 본다. cellsAt이 더한 뒤에는 `null + 0 = 0`, `true + 0 = 1`처럼 정수가 되어
  // canPlace의 정수 검사를 통과한다 (배치 로그는 JSON이라 타입을 어긴 값이 들어올 수 있다)
  if (!Number.isInteger(action.row) || !Number.isInteger(action.col)) {
    return { ok: false, reason: 'blocked' };
  }
  const anchor: Pos = { r: action.row, c: action.col };
  if (!canPlace(state.board, piece, anchor)) return { ok: false, reason: 'blocked' };
  return { ok: true, piece, cells: cellsAt(piece, anchor) };
}

/** 새 판. 첫 트레이도 generateTray로 만든다 (빈 보드라 보정이 일어나지 않는다) */
export function createGame(seed: number): GameState {
  const board = createBoard(BOARD.size);
  const [tray, rngState] = generateTray(board, createRng(seed));
  return { board, tray, rngState, score: 0, combo: 0, missStreak: 0, over: false };
}

/** 남은 조각 중 어떤 것도 놓을 수 없으면 true (SPEC 3.6). 모르는 ID는 놓을 수 없는 조각으로 본다 */
export function isGameOver(board: Board, tray: readonly (PieceId | null)[]): boolean {
  return !tray.some((id) => {
    if (id === null) return false;
    const piece = getPiece(id);
    return piece !== undefined && canPlaceAnywhere(board, piece);
  });
}

/** 조각 하나를 놓는다. 실패하면 상태를 바꾸지 않고 이유만 돌려준다 */
export function place(state: GameState, action: PlaceAction): PlaceResult {
  // 1. 검사
  const checked = check(state, action);
  if (!checked.ok) return checked;
  const { piece, cells } = checked;
  const events: GameEvent[] = [];

  // 2. 칸 채움
  let board = fillCells(state.board, cells, piece.color);
  events.push({
    type: 'place',
    trayIndex: action.trayIndex,
    pieceId: piece.id,
    cells,
    color: piece.color,
  });

  // 3. 줄 제거 (가로·세로 동시, 교차 칸은 한 번)
  const { rows, cols } = fullLines(board);
  const clearedAny = rows.length + cols.length > 0;
  if (clearedAny) {
    const result = clearLines(board, rows, cols);
    board = result.board;
    events.push({ type: 'clear', rows, cols, cells: result.cleared });
  }

  // 4. 콤보 갱신·점수 계산은 W2-01에서 여기에 넣는다 (`score`, `combo` 이벤트도 이 자리).
  //    그때까지 score·combo·missStreak는 받은 값 그대로다 (createGame이 0으로 만든다).
  const { score, combo, missStreak } = state;

  // 5. 줄을 지워서 보드가 전부 비었으면
  if (clearedAny && board.cells.every((cell) => cell === null)) {
    events.push({ type: 'boardClear' });
  }

  // 6. 놓은 슬롯을 비운다. 다 비었을 때만 새 트레이를 뽑는다 (그때만 RNG를 쓴다)
  let tray: (PieceId | null)[] = state.tray.map((id, i) => (i === action.trayIndex ? null : id));
  let rngState = state.rngState;
  if (tray.every((id) => id === null)) {
    const [nextTray, nextRng] = generateTray(board, rngState);
    tray = [...nextTray];
    rngState = nextRng;
    events.push({ type: 'tray', tray: [...nextTray] });
  }

  // 7. 새 트레이를 만든 뒤에 판정한다 (먼저 하면 빈 트레이를 게임 오버로 오판한다, PLAN 9절 5번)
  const over = isGameOver(board, tray);
  if (over) events.push({ type: 'gameOver', score });

  return { ok: true, state: { board, tray, rngState, score, combo, missStreak, over }, events };
}

/** 고스트·줄 하이라이트용 미리보기. 상태를 바꾸지 않는다. `place`가 실패할 조건이면 null */
export function previewPlacement(
  state: GameState,
  action: PlaceAction,
): { cells: Pos[]; rows: number[]; cols: number[] } | null {
  const checked = check(state, action);
  if (!checked.ok) return null;
  const { rows, cols } = fullLines(fillCells(state.board, checked.cells, checked.piece.color));
  return { cells: checked.cells, rows, cols };
}
