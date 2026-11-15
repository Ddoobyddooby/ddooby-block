import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { applyMuted, setMuted, writeMuted } from '../../src/scenes/muteSetting';
import { Sfx } from '../../src/view/Sfx';

/** 사운드 매니저·소리 대역. 소리 하나가 실제로 들리려면 재생 중이고 매니저 mute가 꺼져 있어야 한다 */
class FakeSound {
  playing = false;
  paused = false;
  destroyed = false;
  private onComplete: (() => void) | null = null;
  constructor(readonly key: string) {}
  play(): void {
    this.playing = true;
  }
  pause(): void {
    this.paused = true;
  }
  resume(): void {
    this.paused = false;
  }
  stop(): void {
    this.playing = false;
  }
  destroy(): void {
    this.destroyed = true;
  }
  once(event: string, fn: () => void): void {
    if (event === 'complete') this.onComplete = fn;
  }
  finish(): void {
    this.playing = false;
    this.onComplete?.();
  }
}

function setup() {
  const store = new Map<string, unknown>();
  const registry = {
    get: (k: string) => store.get(k),
    set: (k: string, v: unknown) => store.set(k, v),
  };
  const sounds: FakeSound[] = [];
  const manager = {
    mute: false,
    throwOnAdd: false,
    add(key: string): FakeSound {
      if (this.throwOnAdd) throw new Error('decode 실패');
      const sound = new FakeSound(key);
      sounds.push(sound);
      return sound;
    },
  };
  const clock = { now: 1000 };
  const scene = {
    sound: manager,
    cache: { audio: { exists: (key: string) => key !== 'sfx-gameOver' } },
    time: clock,
    registry,
  } as unknown as Phaser.Scene;
  const audible = (s: FakeSound): boolean => s.playing && !s.paused && !manager.mute;
  return { scene, registry, manager, sounds, clock, audible };
}

describe('Sfx: 일시정지로 멈춘 소리와 음소거', () => {
  it('멈춘 소리가 있는 상태에서 음소거를 켜고 재개해도 들리지 않는다', () => {
    const { scene, registry, manager, sounds, audible } = setup();
    const sfx = new Sfx(scene);
    sfx.play('clear');
    sfx.pause();
    setMuted(registry, manager, true);
    sfx.resume();
    expect(sounds).toHaveLength(1);
    expect(sounds[0]!.playing).toBe(true);
    expect(audible(sounds[0]!)).toBe(false);
  });

  it('음소거를 끄면 그 뒤 새 소리는 들린다', () => {
    const { scene, registry, manager, sounds, clock, audible } = setup();
    const sfx = new Sfx(scene);
    setMuted(registry, manager, true);
    sfx.play('place');
    expect(sounds).toHaveLength(0);
    setMuted(registry, manager, false);
    clock.now += 500;
    sfx.play('place');
    expect(sounds).toHaveLength(1);
    expect(audible(sounds[0]!)).toBe(true);
  });

  it('게임 시작 때 저장값이 매니저에 반영된다 (applyMuted)', () => {
    const { registry, manager } = setup();
    writeMuted(registry, true);
    applyMuted(registry, manager);
    expect(manager.mute).toBe(true);
  });
});

describe('Sfx: 종료 때 정리', () => {
  it('stopAll은 이 Sfx가 낸 소리만 멈추고 없앤다. 재개해도 다시 나지 않는다', () => {
    const { scene, sounds } = setup();
    const game = new Sfx(scene);
    const button = new Sfx(scene);
    game.play('clear');
    button.play('button');
    game.pause();
    game.stopAll();
    game.resume();
    const [clear, click] = sounds;
    expect(clear!.playing).toBe(false);
    expect(clear!.destroyed).toBe(true);
    expect(click!.playing).toBe(true);
    expect(click!.destroyed).toBe(false);
  });

  it('끝난 소리는 정리 목록에서 빠져 stopAll이 다시 건드리지 않는다', () => {
    const { scene, sounds } = setup();
    const sfx = new Sfx(scene);
    sfx.play('place');
    sounds[0]!.finish();
    expect(sounds[0]!.destroyed).toBe(true);
    sounds[0]!.destroyed = false;
    sfx.stopAll();
    expect(sounds[0]!.destroyed).toBe(false);
  });
});

describe('Sfx.play: 중복 제한과 예외', () => {
  it('같은 이름은 minGapMs 안에 다시 부르면 건너뛴다 (60ms 미만 건너뜀, 이상 재생)', () => {
    const { scene, sounds, clock } = setup();
    const sfx = new Sfx(scene);
    sfx.play('clear');
    clock.now += 59;
    sfx.play('clear');
    expect(sounds).toHaveLength(1);
    clock.now += 1;
    sfx.play('clear');
    expect(sounds).toHaveLength(2);
  });

  it('다른 이름은 막지 않는다', () => {
    const { scene, sounds } = setup();
    const sfx = new Sfx(scene);
    sfx.play('place');
    sfx.play('clear');
    expect(sounds.map((s) => s.key)).toEqual(['sfx-place', 'sfx-clear']);
  });

  it('소리 파일을 못 읽었으면(캐시에 없음) 조용히 넘어간다', () => {
    const { scene, sounds } = setup();
    expect(() => new Sfx(scene).play('gameOver')).not.toThrow();
    expect(sounds).toHaveLength(0);
  });

  it('재생 중 예외가 나도 던지지 않고, 정리 목록에 남지 않는다', () => {
    const { scene, manager, sounds } = setup();
    const sfx = new Sfx(scene);
    manager.throwOnAdd = true;
    expect(() => sfx.play('place')).not.toThrow();
    manager.throwOnAdd = false;
    expect(() => sfx.stopAll()).not.toThrow();
    expect(sounds).toHaveLength(0);
  });
});
