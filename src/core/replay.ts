// 리플레이 (PLAN 4.8). 이어하기 복원(6.2)과 서버 검증(7절)이 이 함수 하나를 쓴다.
// 판정은 전부 엔진(createGame, place)에 맡기고 여기서 다시 계산하지 않는다.

import { createGame, place } from './engine';
import type { GameState, PlaceAction, Placement } from './types';

export type ReplayResult =
  | { ok: true; state: GameState }
  | { ok: false; index: number; reason: 'over' | 'emptySlot' | 'blocked' };

/**
 * `createGame(seed)`에서 시작해 배치를 차례로 적용한다.
 * 실패하면 그 배치의 index(0부터)와 `place`가 준 이유를 돌려주고 멈춘다.
 * `Placement`의 `t`는 보지 않는다 (간격 검사는 `checkIntervals`).
 */
export function replay(seed: number, placements: readonly PlaceAction[]): ReplayResult {
  let state = createGame(seed);
  for (const [index, action] of placements.entries()) {
    const result = place(state, action);
    if (!result.ok) return { ok: false, index, reason: result.reason };
    state = result.state;
  }
  return { ok: true, state };
}

/**
 * `t`가 늘어나고(같으면 안 됨) 이웃한 배치의 간격이 `minMs` 이상이면 true.
 * 배치 로그는 JSON이라 타입을 어긴 값이 들어올 수 있으므로 `t`가 유한한 수가 아니거나 음수면 false.
 * 첫 배치의 `t`에는 하한을 두지 않는다. 0개·1개는 간격이 없어 true (1개일 때도 `t` 값은 검사한다).
 */
export function checkIntervals(placements: readonly Placement[], minMs: number): boolean {
  let prev: number | null = null;
  for (const { t } of placements) {
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) return false;
    if (prev !== null && !(t > prev && t - prev >= minMs)) return false;
    prev = t;
  }
  return true;
}
