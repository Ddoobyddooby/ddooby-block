// 놓을 수 없는 트레이 조각 (PLAN 6.4). 판정은 core `canPlaceAnywhere`가 하고 여기서는 슬롯별로 모아 주기만 한다.

import { canPlaceAnywhere } from '../../core/board';
import { getPiece } from '../../core/pieces';
import type { Board, PieceId } from '../../core/types';

/**
 * 슬롯마다 "조각이 있는데 보드 어디에도 놓을 수 없으면" true. 빈 슬롯은 false.
 * 모르는 조각 ID(깨진 저장 데이터)는 `isGameOver`처럼 놓을 수 없는 것으로 본다.
 */
export function unplaceableSlots(board: Board, tray: readonly (PieceId | null)[]): boolean[] {
  return tray.map((id) => {
    if (id === null) return false;
    const piece = getPiece(id);
    return piece === undefined || !canPlaceAnywhere(board, piece);
  });
}
