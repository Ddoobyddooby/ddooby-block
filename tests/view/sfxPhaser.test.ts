// 설치된 Phaser의 실제 WebAudioSound(destroy·stop)와 BaseSound.destroy 순서로 Sfx의 정리를 검증한다.
// 오디오 노드·AudioContext만 최소 대역이다. (Phaser의 destroy는 stop·destroy 이벤트를 pendingRemove 전에 내고,
// 그 뒤 노드를 disconnect한다 — 이벤트 안에서 다시 destroy하면 노드가 null이라 TypeError가 난다)
import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import EventEmitter from 'eventemitter3';
// @ts-expect-error Phaser 소스는 타입 선언이 없다
import WebAudioSound from 'phaser/src/sound/webaudio/WebAudioSound.js';
import { Sfx } from '../../src/view/Sfx';

interface RealSound {
  pendingRemove: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  destroyCalls: number;
  pauseCalls: number;
  destroy(): void;
  emit(event: string, ...args: unknown[]): void;
}

/** 실제 WebAudioSound.prototype의 stop·destroy를 쓰는 소리. play/pause/resume만 대역 */
function realSound(): RealSound {
  const sound = Object.create(WebAudioSound.prototype) as RealSound & Record<string, unknown>;
  (EventEmitter as { call(self: unknown): void }).call(sound);
  const node = { disconnect: () => {} };
  Object.assign(sound, {
    pendingRemove: false,
    isPlaying: false,
    isPaused: false,
    rateUpdates: [],
    muteNode: { ...node },
    volumeNode: { ...node },
    pannerNode: null,
    spatialNode: null,
    audioBuffer: {},
    source: null,
    loopSource: null,
    manager: {},
    config: {},
    currentConfig: {},
    markers: {},
    currentMarker: null,
    destroyCalls: 0,
    pauseCalls: 0,
    resetConfig() {},
    stopAndRemoveBufferSource() {},
    play() {
      this.isPlaying = true;
      return true;
    },
    pause() {
      this.pauseCalls++;
      return true;
    },
    resume() {
      return true;
    },
  });
  const realDestroy = WebAudioSound.prototype.destroy as () => void;
  sound.destroy = function (this: RealSound) {
    this.destroyCalls++;
    realDestroy.call(this);
  };
  return sound;
}

function setup() {
  const sounds: RealSound[] = [];
  const scene = {
    sound: {
      add: () => {
        const sound = realSound();
        sounds.push(sound);
        return sound;
      },
    },
    cache: { audio: { exists: () => true } },
    time: { now: 1000 },
    registry: { get: () => undefined, set: () => {} },
  } as unknown as Phaser.Scene;
  return { sfx: new Sfx(scene), sounds };
}

describe('Sfx + 실제 Phaser WebAudioSound: 밖에서 정리해도 다시 파괴하지 않는다', () => {
  it('재생 중인 소리를 밖에서 destroy해도 던지지 않고 목록에서 빠진다', () => {
    const { sfx, sounds } = setup();
    sfx.play('place');
    expect(sounds[0]!.isPlaying).toBe(true);
    expect(() => sounds[0]!.destroy()).not.toThrow();
    expect(sounds[0]!.destroyCalls).toBe(1);
    expect(sounds[0]!.pendingRemove).toBe(true);
    sfx.pause();
    expect(sounds[0]!.pauseCalls).toBe(0);
  });

  it('재생이 멈춘 소리를 밖에서 destroy해도 같다', () => {
    const { sfx, sounds } = setup();
    sfx.play('place');
    sounds[0]!.isPlaying = false;
    expect(() => sounds[0]!.destroy()).not.toThrow();
    expect(sounds[0]!.destroyCalls).toBe(1);
  });

  it('매니저가 모든 소리를 destroy해도(removeAll) 던지지 않고 stopAll도 안전하다', () => {
    const { sfx, sounds } = setup();
    sfx.play('place');
    expect(() => {
      for (const sound of sounds) sound.destroy();
    }).not.toThrow();
    expect(() => sfx.stopAll()).not.toThrow();
    expect(sounds[0]!.destroyCalls).toBe(1);
  });

  it('자연스럽게 끝나면(complete) 매니저에 남지 않게 destroy한다', () => {
    const { sfx, sounds } = setup();
    sfx.play('place');
    sounds[0]!.isPlaying = false;
    expect(() => sounds[0]!.emit('complete', sounds[0])).not.toThrow();
    expect(sounds[0]!.pendingRemove).toBe(true);
    expect(sounds[0]!.destroyCalls).toBe(1);
  });

  it('stopAll은 우리가 파괴하므로 한 번만 destroy한다', () => {
    const { sfx, sounds } = setup();
    sfx.play('place');
    expect(() => sfx.stopAll()).not.toThrow();
    expect(sounds[0]!.destroyCalls).toBe(1);
    expect(sounds[0]!.pendingRemove).toBe(true);
  });
});
