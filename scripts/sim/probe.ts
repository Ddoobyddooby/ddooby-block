// 생성기 관찰 (W4-02). generateTray는 "몇 번 다시 뽑았는지·보정이 일어났는지"를 내보내지 않는다.
// core를 바꾸지 않으려고 같은 RNG 상태에서 같은 추첨을 한 번 더 따라 해서 센다.
// 따라 한 결과가 실제 트레이와 다르면(생성기가 바뀌었는데 이 파일이 안 따라간 경우) 던진다.
// 그래서 이 파일은 측정 도구이면서 generateTray의 추첨 순서 대조이기도 하다.

import { GENERATOR, PIECE_WEIGHTS, TRAY } from '../../src/config';
import { canPlaceAnywhere } from '../../src/core/board';
import { weightedPick } from '../../src/core/generator';
import { PIECES } from '../../src/core/pieces';
import { nextInt, type RngState } from '../../src/core/rng';
import type { Board, PieceDef, PieceId } from '../../src/core/types';

const WEIGHTS: readonly number[] = PIECES.map((p) => PIECE_WEIGHTS[p.id] ?? 0);

export interface TrayProbe {
  /** 추첨 시도 횟수 (1 = 다시 뽑지 않음, maxRerolls = 전부 실패해 보정) */
  attempts: number;
  /** maxRerolls번 모두 놓을 곳이 없어 슬롯 하나를 바꿨는가 */
  corrected: boolean;
}

const pieceOf = (index: number): PieceDef => {
  const piece = PIECES[index];
  if (piece === undefined) throw new Error(`probe: 조각 index ${index} 없음`);
  return piece;
};

/**
 * `board`·`rng`로 `generateTray`가 `actual`(과 `rngAfter`)을 냈다고 할 때의 시도 횟수와 보정 여부.
 * generateTray와 같은 순서로 끝까지 따라 계산해 트레이 전체를 비교한다:
 * 시도마다 가중치 추첨 3번 → 놓을 수 있는 조각이 있으면 끝, maxRerolls번 모두 실패하면
 * 슬롯 추첨(nextInt) → 놓을 수 있는 조각들 중 가중치 추첨 → 그 슬롯을 바꾼다.
 * `rngAfter`를 주면 다음 RNG 상태도 대조한다 (RNG 소비 순서 확인). 다르면 던진다.
 */
export function probeTray(
  board: Board,
  rng: RngState,
  actual: readonly PieceId[],
  rngAfter?: RngState,
): TrayProbe {
  let state = rng;
  let drawn: PieceDef[] = [];
  let result: { tray: PieceId[]; probe: TrayProbe } | null = null;
  for (let attempt = 1; attempt <= GENERATOR.maxRerolls && result === null; attempt++) {
    drawn = [];
    for (let i = 0; i < TRAY.size; i++) {
      const [index, nextRng] = weightedPick(WEIGHTS, state);
      state = nextRng;
      drawn.push(pieceOf(index));
    }
    if (drawn.some((piece) => canPlaceAnywhere(board, piece))) {
      result = { tray: drawn.map((p) => p.id), probe: { attempts: attempt, corrected: false } };
    }
  }
  if (result === null) {
    const placeable = PIECES.filter((piece) => canPlaceAnywhere(board, piece));
    if (placeable.length === 0) throw new Error('probe: 놓을 수 있는 조각이 없는 보드');
    const [slot, afterSlot] = nextInt(state, TRAY.size);
    const [index, afterPiece] = weightedPick(
      placeable.map((p) => PIECE_WEIGHTS[p.id] ?? 0),
      afterSlot,
    );
    state = afterPiece;
    const tray = drawn.map((p) => p.id);
    const replacement = placeable[index];
    if (replacement === undefined) throw new Error(`probe: 보정 조각 index ${index} 없음`);
    tray[slot] = replacement.id;
    result = { tray, probe: { attempts: GENERATOR.maxRerolls, corrected: true } };
  }
  if (result.tray.join() !== actual.join()) {
    throw new Error(`probe: 따라 한 트레이 ${result.tray.join()}이 실제 ${actual.join()}과 다르다`);
  }
  if (rngAfter !== undefined && state !== rngAfter) {
    throw new Error(`probe: 따라 한 다음 RNG 상태 ${state}가 실제 ${rngAfter}와 다르다`);
  }
  return result.probe;
}
