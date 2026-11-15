import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { applyMuted, setMuted, writeMuted } from '../../src/scenes/muteSetting';
import { Sfx } from '../../src/view/Sfx';

/** 사운드 매니저·소리 대역. 소리 하나가 실제로 들리려면 재생 중이고 매니저 mute가 꺼져 있어야 한다. Phaser처럼 stop·destroy·complete 이벤트를 낸다 */
class FakeSound {
  playing = false;
  paused = false;
  destroyed = false;
  playCalls = 0;
  pauseCalls = 0;
  resumeCalls = 0;
  /** play()의 결과: 'ok' | 'false'(잠금·태그 부족 등) | 'throw' */
  playResult: 'ok' | 'false' | 'throw' = 'ok';
  /** true면 pause·resume이 던진다 (파괴된 객체 흉내) */
  broken = false;
  private listeners = new Map<string, (() => void)[]>();
  constructor(readonly key: string) {}
  play(): boolean {
    this.playCalls++;
    if (this.playResult === 'throw') throw new Error('play 실패');
    if (this.playResult === 'false') return false;
    this.playing = true;
    return true;
  }
  pause(): void {
    this.pauseCalls++;
    if (this.broken) throw new Error('pause 실패');
    this.paused = true;
  }
  resume(): void {
    this.resumeCalls++;
    if (this.broken) throw new Error('resume 실패');
    this.paused = false;
  }
  stop(): void {
    if (this.destroyed) throw new Error('이미 파괴됨');
    this.playing = false;
    this.emit('stop');
  }
  destroy(): void {
    if (this.destroyed) return;
    this.stop();
    this.emit('destroy');
    this.destroyed = true;
    this.listeners.clear();
  }
  once(event: string, fn: () => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), fn]);
  }
  private emit(event: string): void {
    const fns = this.listeners.get(event) ?? [];
    this.listeners.delete(event);
    for (const fn of fns) fn();
  }
  /** 자연스럽게 끝남 */
  finish(): void {
    this.playing = false;
    this.emit('complete');
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
    nextPlayResult: 'ok' as 'ok' | 'false' | 'throw',
    add(key: string): FakeSound {
      if (this.throwOnAdd) throw new Error('decode 실패');
      const sound = new FakeSound(key);
      sound.playResult = this.nextPlayResult;
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
    sfx.stopAll();
    expect(sounds[0]!.destroyed).toBe(true);
    expect(sounds[0]!.pauseCalls).toBe(0);
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

describe('Sfx: 소리 하나의 수명 (재생 실패·외부 중단)', () => {
  it('play()가 false면 목록에 안 남고 destroy되며, 이후 pause/resume이 부르지 않는다', () => {
    const { scene, manager, sounds } = setup();
    const sfx = new Sfx(scene);
    manager.nextPlayResult = 'false';
    sfx.play('place');
    expect(sounds[0]!.destroyed).toBe(true);
    sfx.pause();
    sfx.resume();
    expect(sounds[0]!.pauseCalls).toBe(0);
    expect(sounds[0]!.resumeCalls).toBe(0);
  });

  it('play()가 예외를 던져도 같다. Sfx.play는 던지지 않는다', () => {
    const { scene, manager, sounds } = setup();
    const sfx = new Sfx(scene);
    manager.nextPlayResult = 'throw';
    expect(() => sfx.play('place')).not.toThrow();
    expect(sounds[0]!.destroyed).toBe(true);
    sfx.pause();
    expect(sounds[0]!.pauseCalls).toBe(0);
  });

  it('밖에서 stop된 소리는 목록에서 빠져 이후 pause/resume이 부르지 않는다', () => {
    const { scene, sounds } = setup();
    const sfx = new Sfx(scene);
    sfx.play('place');
    sounds[0]!.stop();
    expect(() => {
      sfx.pause();
      sfx.resume();
      sfx.stopAll();
    }).not.toThrow();
    expect(sounds[0]!.pauseCalls).toBe(0);
    expect(sounds[0]!.resumeCalls).toBe(0);
  });

  it('밖에서 destroy된 소리도 같다 (다시 destroy하지 않는다)', () => {
    const { scene, sounds } = setup();
    const sfx = new Sfx(scene);
    sfx.play('place');
    sounds[0]!.destroy();
    expect(() => {
      sfx.pause();
      sfx.resume();
      sfx.stopAll();
    }).not.toThrow();
    expect(sounds[0]!.pauseCalls).toBe(0);
  });

  it('pause·resume 중 한 소리가 던져도 나머지는 처리하고 호출한 쪽으로 던지지 않는다', () => {
    const { scene, sounds, clock } = setup();
    const sfx = new Sfx(scene);
    sfx.play('place');
    clock.now += 500;
    sfx.play('clear');
    clock.now += 500;
    sfx.play('button');
    sounds[0]!.broken = true;
    expect(() => sfx.pause()).not.toThrow();
    expect(sounds.map((s) => s.paused)).toEqual([false, true, true]);
    expect(() => sfx.resume()).not.toThrow();
    expect(sounds.map((s) => s.paused)).toEqual([false, false, false]);
  });

  it('stopAll 뒤 resume은 아무 일도 하지 않는다', () => {
    const { scene, sounds } = setup();
    const sfx = new Sfx(scene);
    sfx.play('clear');
    sfx.stopAll();
    sfx.resume();
    expect(sounds[0]!.resumeCalls).toBe(0);
    expect(sounds[0]!.destroyed).toBe(true);
  });

  it('여러 번 정리해도 안전하다 (complete 뒤 stopAll)', () => {
    const { scene, sounds } = setup();
    const sfx = new Sfx(scene);
    sfx.play('place');
    sounds[0]!.finish();
    expect(() => sfx.stopAll()).not.toThrow();
    expect(sounds[0]!.destroyed).toBe(true);
  });
});
