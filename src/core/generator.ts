// 조각 생성 + 보정 (PLAN 4.4, SPEC 3.3). 순수 함수: 같은 보드 + 같은 RNG 상태 = 같은 트레이와 같은 다음 상태.
// RNG 호출 순서가 리플레이 결과를 정하므로 추첨 순서를 바꾸면 RULES_VERSION을 올린다.

import { GENERATOR, PIECE_WEIGHTS, TRAY } from '../config';
import { canPlaceAnywhere } from './board';
import { PIECES } from './pieces';
import { nextInt, type RngState } from './rng';
import type { Board, PieceDef, PieceId } from './types';

interface Entry {
  readonly piece: PieceDef;
  readonly weight: number;
}

/**
 * 추첨 표. 순서 = PIECES 순서 (PLAN 4.2 표).
 * PIECES에 있는데 가중치가 없으면 설정 버그이므로 모듈을 읽을 때 바로 던진다 (게임 도중에 터지지 않게).
 */
const ENTRIES: readonly Entry[] = PIECES.map((piece) => {
  const weight: number | undefined = PIECE_WEIGHTS[piece.id];
  if (weight === undefined) {
    throw new Error(`generator: PIECE_WEIGHTS에 '${piece.id}'의 가중치가 없다`);
  }
  return { piece, weight };
});

const ALL_WEIGHTS: readonly number[] = ENTRIES.map((entry) => entry.weight);

/**
 * 가중치 추첨. `nextInt(rng, 합계)`를 정확히 한 번 부르고, 나온 정수가 들어가는 누적합 구간의 index를 돌려준다.
 * 구간은 `[앞 누적합, 누적합)`이라 가중치 0인 항목은 뽑히지 않는다.
 * 계약: 가중치는 0 이상의 정수, 합계는 1 이상. 어기면 호출한 쪽의 버그이므로 던진다.
 */
export function weightedPick(
  weights: readonly number[],
  rng: RngState,
): [index: number, rng: RngState] {
  let total = 0;
  for (const weight of weights) {
    if (!Number.isInteger(weight) || weight < 0) {
      throw new Error(`weightedPick: 가중치는 0 이상의 정수여야 한다 (${weight})`);
    }
    total += weight;
  }
  if (total < 1) throw new Error('weightedPick: 가중치 합계가 1 이상이어야 한다');

  const [roll, nextRng] = nextInt(rng, total);
  let acc = 0;
  for (const [index, weight] of weights.entries()) {
    acc += weight;
    if (roll < acc) return [index, nextRng];
  }
  throw new Error(`weightedPick: 구간을 찾지 못했다 (roll ${roll}, 합계 ${total})`);
}

/** `entries` 안에서 가중치 추첨으로 조각 하나를 뽑는다 */
function pickPiece(entries: readonly Entry[], rng: RngState): [piece: PieceDef, rng: RngState] {
  const [index, nextRng] = weightedPick(
    entries === ENTRIES ? ALL_WEIGHTS : entries.map((entry) => entry.weight),
    rng,
  );
  const entry = entries[index];
  if (entry === undefined) throw new Error(`generator: 추첨 index ${index}가 범위 밖이다`);
  return [entry.piece, nextRng];
}

/**
 * 트레이 조각을 뽑는다 (PLAN 4.4). 최소 1개는 지금 보드에 놓을 수 있다.
 * 한 시도 = 가중치 추첨 `TRAY.size`번(중복 허용). 다 뽑은 뒤에 놓을 수 있는지 본다
 * (놓이는 조각이 먼저 나와도 나머지 추첨을 건너뛰지 않는다 → 시도마다 RNG 호출 수가 같다).
 * `GENERATOR.maxRerolls`번 모두 실패하면 마지막 시도의 슬롯 하나를 놓을 수 있는 조각으로 바꾼다.
 */
export function generateTray(board: Board, rng: RngState): [tray: PieceId[], rng: RngState] {
  let state = rng;
  let tray: PieceId[] = [];

  for (let attempt = 0; attempt < GENERATOR.maxRerolls; attempt++) {
    const drawn: PieceDef[] = [];
    for (let i = 0; i < TRAY.size; i++) {
      const [piece, nextRng] = pickPiece(ENTRIES, state);
      state = nextRng;
      drawn.push(piece);
    }
    tray = drawn.map((piece) => piece.id);
    if (drawn.some((piece) => canPlaceAnywhere(board, piece))) return [tray, state];
  }

  // 보정. RNG 순서: 슬롯 → 조각
  const placeable = ENTRIES.filter((entry) => canPlaceAnywhere(board, entry.piece));
  if (placeable.length === 0) {
    // 줄 제거가 끝난 보드는 꽉 찰 수 없고 dot은 빈 칸 하나면 놓인다. 여기 오면 버그다
    throw new Error('generateTray: 놓을 수 있는 조각이 없다 (보드가 꽉 찼다)');
  }
  const [slot, afterSlot] = nextInt(state, TRAY.size);
  const [piece, afterPiece] = pickPiece(placeable, afterSlot);
  tray[slot] = piece.id;
  return [tray, afterPiece];
}
