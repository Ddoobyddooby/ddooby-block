// 생성기 관찰 (W4-02). generateTray는 "몇 번 다시 뽑았는지·보정이 일어났는지"를 내보내지 않는다.
// core를 바꾸지 않으려고 같은 RNG 상태에서 같은 추첨을 한 번 더 따라 해서 센다.
// 따라 한 결과가 실제 트레이와 다르면(생성기가 바뀌었는데 이 파일이 안 따라간 경우) 던진다.
// 그래서 이 파일은 측정 도구이면서 generateTray의 추첨 순서 대조이기도 하다.

import { GENERATOR, PIECE_WEIGHTS, TRAY } from '../../src/config';
import { canPlaceAnywhere } from '../../src/core/board';
import { weightedPick } from '../../src/core/generator';
import { PIECES } from '../../src/core/pieces';
import type { RngState } from '../../src/core/rng';
import type { Board, PieceId } from '../../src/core/types';

const WEIGHTS: readonly number[] = PIECES.map((p) => PIECE_WEIGHTS[p.id] ?? 0);

export interface TrayProbe {
  /** 추첨 시도 횟수 (1 = 다시 뽑지 않음, maxRerolls = 전부 실패해 보정) */
  attempts: number;
  /** maxRerolls번 모두 놓을 곳이 없어 슬롯 하나를 바꿨는가 */
  corrected: boolean;
}

/**
 * `board`·`rng`로 `generateTray`가 `actual`을 냈다고 할 때의 시도 횟수와 보정 여부.
 * 보정이 아니면 마지막 시도의 추첨과 `actual`이 같아야 하고, 보정이면 슬롯 하나만 달라도 된다.
 */
export function probeTray(board: Board, rng: RngState, actual: readonly PieceId[]): TrayProbe {
  let state = rng;
  let drawn: PieceId[] = [];
  for (let attempt = 1; attempt <= GENERATOR.maxRerolls; attempt++) {
    drawn = [];
    for (let i = 0; i < TRAY.size; i++) {
      const [index, nextRng] = weightedPick(WEIGHTS, state);
      state = nextRng;
      const piece = PIECES[index];
      if (piece === undefined) throw new Error(`probe: 조각 index ${index} 없음`);
      drawn.push(piece.id);
    }
    const placeable = drawn.some((id) => {
      const piece = PIECES.find((p) => p.id === id);
      return piece !== undefined && canPlaceAnywhere(board, piece);
    });
    if (placeable) {
      if (drawn.join() !== actual.join()) {
        throw new Error(
          `probe: ${attempt}번째 시도 추첨 ${drawn.join()}이 실제 ${actual.join()}과 다르다`,
        );
      }
      return { attempts: attempt, corrected: false };
    }
  }
  const diff = drawn.filter((id, i) => id !== actual[i]).length;
  if (actual.length !== drawn.length || diff > 1) {
    throw new Error(
      `probe: 보정 뒤 트레이 ${actual.join()}이 마지막 추첨 ${drawn.join()}과 슬롯 하나 넘게 다르다`,
    );
  }
  return { attempts: GENERATOR.maxRerolls, corrected: true };
}
