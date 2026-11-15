// 카메라 흔들림 고르기 (PLAN 6.4). Phaser 없는 순수 함수. pickShake는 ddooby-pang의 shake.ts에서 복사했다.
// Phaser는 이미 흔들리는 중이면 새 요청을 무시한다. 그래서 약한 흔들림이 먼저 오면 센 흔들림이 묻힌다.
// 지금 흔들림이 끝났거나 새 것이 더 세면 새 것을 force로 시작하고, 아니면 무시한다.

import { FX } from '../../config';

export interface ShakeRequest {
  duration: number;
  intensity: number;
}

/** 지금 흔들리고 있는 것 (endAt = 끝나는 시각, scene.time.now 기준 ms) */
export interface ShakeState {
  intensity: number;
  endAt: number;
}

/** 새 흔들림을 시작해야 하면 그 상태를, 무시하면 null을 돌려준다 */
export function pickShake(
  current: ShakeState | null,
  next: ShakeRequest,
  now: number,
): ShakeState | null {
  const running = current !== null && now < current.endAt;
  if (running && next.intensity <= current.intensity) return null;
  return { intensity: next.intensity, endAt: now + next.duration };
}

/**
 * 줄 제거의 흔들림. 단계 = (줄 수 - 1) + (콤보 - 1)이고 `FX.shake.levels`에서 고른다.
 * 단계가 0(한 줄, 콤보 1)이거나 줄이 없으면 null, 표보다 크면 마지막 값이다.
 */
export function shakeFor(lines: number, combo: number): ShakeRequest | null {
  if (!Number.isFinite(lines) || lines < 1) return null;
  const comboExtra = Number.isFinite(combo) ? Math.max(0, Math.floor(combo) - 1) : 0;
  const level = Math.floor(lines) - 1 + comboExtra;
  if (level < 1) return null;
  const levels = FX.shake.levels;
  return levels[Math.min(level, levels.length) - 1] ?? null;
}
