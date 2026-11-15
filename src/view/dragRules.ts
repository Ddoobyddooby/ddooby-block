// 입력 잠금 규칙 (PLAN 6.1, 9절 4번). Phaser 없는 순수 함수라 테스트할 수 있다.

export interface PickUpState {
  /** `place` 이벤트를 재생하는 중 (놓기 → 줄 제거 → 새 트레이) */
  readonly playing: boolean;
  readonly paused: boolean;
  /** 게임 오버 */
  readonly over: boolean;
  /** 마지막 배치 뒤 최소 간격(`REPLAY.minIntervalMs`)이 아직 안 지났다 (플레이 시계 기준) */
  readonly cooling: boolean;
}

/**
 * 트레이 조각을 집을 수 있는가. 이벤트 재생 중·일시정지·게임 오버·배치 직후 간격 동안에는 집을 수 없다.
 * 드래그 중에 false가 되면 그 드래그도 취소한다 (DragController).
 */
export function canPickUp(state: PickUpState): boolean {
  return !state.playing && !state.paused && !state.over && !state.cooling;
}
