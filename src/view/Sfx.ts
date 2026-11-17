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

/** Phaser 소리 객체에서 쓰는 부분 */
interface LiveSound {
  play(): unknown;
  pause(): unknown;
  resume(): unknown;
  stop(): unknown;
  destroy(): void;
  once(event: string, fn: () => void): unknown;
}

/**
 * 소리를 낸 쪽(씬)이 자기 소리만 멈추고 이어가고 정리할 수 있게, 낸 소리를 기억한다.
 * 그래서 게임 씬의 Sfx를 `pause`/`resume`/`stopAll`해도 다른 Sfx(버튼 소리)는 건드리지 않는다.
 * 음소거: `play`의 registry 검사가 새 소리를 아예 만들지 않게 하고, `resume`이 멈춰 있던 소리를 버린다. 사운드 매니저의 mute는 쓰지 않는다 (배경 음악까지 꺼지므로).
 *
 * 소리 하나의 수명: 우리가 끝내는 경우(자연 종료 complete, 재생 실패, stopAll, pause/resume 중 던진 소리)는 `release`로
 * 목록에서 먼저 빼고 stop·destroy한다. 여러 번 불려도 안전하다. 밖에서 멈추거나 파괴한 경우(stop·destroy 이벤트)는
 * 목록에서 빼기만 하고 그 객체는 건드리지 않는다 (그쪽이 책임진다).
 * complete는 Phaser가 `sound.update`(매니저의 forEach) 안에서 내며, 그 뒤 이 소리를 더 쓰지 않고 destroy는 pendingRemove만 세워
 * 배열을 바꾸지 않으므로(다음 update에서 정리) 그 자리에서 destroy해도 안전하다 (BaseSoundManager.js 665-690, WebAudioSound.js 612-636).
 * 정책: play가 false면(HTML5 Audio 잠김·태그 부족, 소리 없음 환경) 그 소리는 포기한다 — 나중에 뒤늦게 나지 않게.
 * 버튼용 Sfx는 씬 종료에 묶지 않는다: 확인음은 짧아서 끝나면(complete) 스스로 정리되고, 종료 때 끊으면 방금 누른 소리가 잘린다.
 * pause/resume/stopAll은 소리 하나가 실패해도 나머지를 처리하고 던지지 않는다 (RESUME 리스너 안에서 불리므로).
 */
export class Sfx {
  /** 이름별 마지막 재생 시각 (minGapMs 안의 중복을 건너뛴다) */
  private readonly lastAt = new Map<SfxName, number>();
  /** 아직 끝나지 않은 소리 */
  private readonly live = new Set<LiveSound>();

  constructor(private readonly scene: Phaser.Scene) {}

  play(name: SfxName, opts: { level?: number } = {}): void {
    let instance: LiveSound | null = null;
    try {
      const { sound, cache, time, registry } = this.scene;
      if (readMuted(registry)) return;
      const key = sfxKey(name);
      if (!cache.audio.exists(key)) return;
      const now = time.now;
      if (now - (this.lastAt.get(name) ?? -Infinity) < SOUND.minGapMs) return;
      this.lastAt.set(name, now);

      const rate = name === 'clear' ? sfxRate(opts.level ?? 1) : 1;
      const created: LiveSound = sound.add(key, { volume: SOUND.effects[name].volume, rate });
      instance = created;
      this.live.add(created);
      // 이벤트로 알게 된 종료: stop·destroy는 밖에서 한 일이므로 목록에서 빼기만 한다. 여기서 다시 destroy하면
      // Phaser의 destroy가 pendingRemove 전에 이 이벤트를 내고 그 뒤 노드를 해제하므로 TypeError가 난다.
      // complete(자연스럽게 끝남)만 우리가 destroy해 매니저에 남지 않게 한다
      created.once('stop', () => this.live.delete(created));
      created.once('destroy', () => this.live.delete(created));
      created.once('complete', () => this.release(created));
      if (created.play() === false) {
        this.release(created);
        return;
      }
      if (import.meta.env.DEV) console.debug(`[sfx] ${name} rate=${rate}`);
    } catch (error) {
      // 소리가 안 나도 게임은 계속된다
      if (instance !== null) this.release(instance);
      if (import.meta.env.DEV) console.warn('[sfx] 재생 실패', name, error);
    }
  }

  /** 일시정지: 이 Sfx가 낸 소리만 멈춘다 */
  pause(): void {
    for (const sound of [...this.live]) this.guard(sound, () => sound.pause());
  }

  /** [계속]: 멈춘 소리를 이어서 낸다. 그 사이 음소거를 켰다면 이어 내지 않고 버린다 (음소거는 매니저 출력이 아니라 여기서 지킨다) */
  resume(): void {
    if (readMuted(this.scene.registry)) {
      this.stopAll();
      return;
    }
    for (const sound of [...this.live]) this.guard(sound, () => sound.resume());
  }

  /** 씬이 끝날 때: 이 Sfx가 낸 소리를 멈추고 없앤다 (이전 판의 소리가 뒤늦게 나지 않게) */
  stopAll(): void {
    for (const sound of [...this.live]) this.release(sound);
  }

  /** 소리 하나를 목록에서 빼고 멈춘 뒤 없앤다. 이미 끝났거나 파괴됐으면 아무 일도 안 한다 */
  private release(sound: LiveSound): void {
    if (!this.live.delete(sound)) return;
    try {
      sound.stop();
    } catch {
      // 이미 파괴된 소리
    }
    try {
      sound.destroy();
    } catch {
      // 이미 파괴된 소리
    }
  }

  /** 소리 하나가 던져도 나머지를 계속 처리한다. 던진 소리는 죽은 것으로 보고 정리한다 */
  private guard(sound: LiveSound, action: () => void): void {
    try {
      action();
    } catch {
      this.release(sound);
    }
  }
}
