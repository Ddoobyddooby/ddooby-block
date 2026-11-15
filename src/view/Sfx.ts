// 효과음 재생 (PLAN 6.4). 씬·버튼은 이름만 부른다: sfx.play('clear', { level: combo }).
// ddooby-pang의 Sfx.ts에서 복사해 맞췄다. 바뀐 점: 음소거를 모듈 변수가 아니라 scenes/muteSetting의 game.registry에서 읽는다
// (저장소가 한 군데이고 W2-05에서 저장소로 바꿔 끼운다), 칭찬 목소리는 없다.
// 기다리게 하지 않는다. 파일이 없거나 로드에 실패했거나 브라우저가 아직 소리를 막고 있어도 조용히 넘어간다.

import type Phaser from 'phaser';
import { SOUND } from '../config';
import { readMuted } from '../scenes/muteSetting';

export type SfxName = keyof typeof SOUND.effects;

/** 캐시 키 (BootScene이 이 키로 미리 읽는다) */
export const sfxKey = (name: SfxName): string => `sfx-${name}`;

/** 줄 제거 소리의 콤보(1부터) → 재생 속도. 콤보가 오를수록 음이 높아지고 상한에서 멈춘다 */
export function sfxRate(combo: number): number {
  const rates = SOUND.clearRateByCombo;
  const level = Number.isFinite(combo) ? Math.round(combo) : 1;
  const i = Math.min(Math.max(1, level), rates.length) - 1;
  return rates[i] ?? 1;
}

export class Sfx {
  /** 이름별 마지막 재생 시각 (minGapMs 안의 중복을 건너뛴다) */
  private readonly lastAt = new Map<SfxName, number>();

  constructor(private readonly scene: Phaser.Scene) {}

  play(name: SfxName, opts: { level?: number } = {}): void {
    try {
      const { sound, cache, time, registry } = this.scene;
      if (readMuted(registry)) return;
      const key = sfxKey(name);
      if (!cache.audio.exists(key)) return;
      const now = time.now;
      if (now - (this.lastAt.get(name) ?? -Infinity) < SOUND.minGapMs) return;
      this.lastAt.set(name, now);

      const rate = name === 'clear' ? sfxRate(opts.level ?? 1) : 1;
      sound.play(key, { volume: SOUND.effects[name].volume, rate });
      if (import.meta.env.DEV) console.debug(`[sfx] ${name} rate=${rate}`);
    } catch (error) {
      // 소리가 안 나도 게임은 계속된다
      if (import.meta.env.DEV) console.warn('[sfx] 재생 실패', name, error);
    }
  }
}
