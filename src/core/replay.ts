// 리플레이 (PLAN 4.8). 이어하기 복원(6.2)과 서버 검증(7절)이 이 함수 하나를 쓴다.
// 판정은 전부 엔진(createGame, place)에 맡기고 여기서 다시 계산하지 않는다.
// 배치 로그는 JSON으로 저장·전송되므로 손상된 데이터가 들어올 수 있다. 예외를 던지지 않고 실패로 돌려준다.
// seed와 로그 길이는 검증하지 않는다. 호출하는 쪽이 검증한다 (서버는 발급한 seed를 쓰고, 길이 한도는 저장 파서·서버가 정한다).

import { createGame, place } from './engine';
import type { GameState, PlaceAction, Placement } from './types';

/** `invalid`는 리플레이 전용이다 (엔진의 PlaceResult에는 없다). 로그나 항목이 객체·배열 모양이 아닐 때 */
export type ReplayResult =
  | { ok: true; state: GameState }
  | { ok: false; index: number; reason: 'over' | 'emptySlot' | 'blocked' | 'invalid' };

/** 배열이 아닌 객체 (null, 숫자, 문자열, 배열, 배열의 빈 구멍 undefined는 아니다) */
function isPlainObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * `createGame(seed)`에서 시작해 배치를 차례로 적용한다.
 * 실패하면 그 배치의 index(0부터)와 이유를 돌려주고 멈춘다. `placements`가 배열이 아니면 index 0 `invalid`.
 * 항목이 객체가 아니면(`null`, 숫자, 문자열, 배열, 빈 구멍) 엔진을 부르기 전에 그 index에서 `invalid`.
 * 객체이지만 필드가 잘못된 항목(`row: null` 등)은 엔진이 `emptySlot`·`blocked`로 판정한다.
 * `Placement`의 `t`는 보지 않는다 (간격 검사는 `checkIntervals`).
 */
export function replay(seed: number, placements: readonly PlaceAction[]): ReplayResult {
  if (!Array.isArray(placements)) return { ok: false, index: 0, reason: 'invalid' };
  let state = createGame(seed);
  for (const [index, action] of placements.entries()) {
    if (!isPlainObject(action)) return { ok: false, index, reason: 'invalid' };
    const result = place(state, action);
    if (!result.ok) return { ok: false, index, reason: result.reason };
    state = result.state;
  }
  return { ok: true, state };
}

/**
 * `t`가 늘어나고(같으면 안 됨) 이웃한 배치의 간격이 `minMs` 이상이면 true.
 * 깨진 입력은 예외 대신 false: `placements`가 배열이 아님, 항목이 객체가 아님,
 * `t`가 유한한 수가 아니거나 음수, `minMs`가 유한한 수가 아니거나 음수 (0개·1개 로그여도).
 * 첫 배치의 `t`에는 하한을 두지 않는다. 0개·1개는 간격이 없어 true (1개일 때도 `t` 값은 검사한다).
 */
export function checkIntervals(placements: readonly Placement[], minMs: number): boolean {
  if (!Array.isArray(placements)) return false;
  if (typeof minMs !== 'number' || !Number.isFinite(minMs) || minMs < 0) return false;
  let prev: number | null = null;
  for (const item of placements) {
    if (!isPlainObject(item)) return false;
    const { t } = item;
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) return false;
    if (prev !== null && !(t > prev && t - prev >= minMs)) return false;
    prev = t;
  }
  return true;
}
