import type Phaser from 'phaser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SOUND } from '../../src/config';
import { applyLoadedMusic, setMusicOn, type MusicStore } from '../../src/scenes/musicRules';
import { nativeChange, resetNativeVisibility } from '../../src/scenes/appVisibility';
import { Music, musicKey, musicUrls } from '../../src/view/Music';

function fakeStore(): MusicStore {
  const map = new Map<string, unknown>();
  return { get: (k) => map.get(k), set: (k, v) => map.set(k, v) };
}

// W4-01: Music(곡 하나 재생·페이드·멈춤)를 Phaser 없이 대역으로 본다. 실제 소리는 자동 브라우저로 들을 수 없다.

class FakeLoop {
  isPlaying = false;
  isPaused = false;
  volume: number;
  destroyed = false;
  playCalls = 0;
  /** 'false'면 play가 false, 'throw'면 던진다 */
  playResult: 'ok' | 'false' | 'throw' = 'ok';
  private listeners = new Map<string, (() => void)[]>();
  /** 잠금 중이면 동작을 큐에 쌓고 true (HTML5 Audio의 isLocked) */
  queueWhenLocked: (action: 'play' | 'pause' | 'stop') => boolean = () => false;
  constructor(
    readonly key: string,
    readonly config: { loop?: boolean; volume?: number },
  ) {
    this.volume = config.volume ?? 1;
  }
  play(): boolean {
    if (this.queueWhenLocked('play')) return false;
    this.playCalls++;
    if (this.playResult === 'throw') throw new Error('play 실패');
    if (this.playResult === 'false') return false;
    this.isPlaying = true;
    this.isPaused = false;
    return true;
  }
  pause(): boolean {
    if (this.queueWhenLocked('pause')) return false;
    this.isPlaying = false;
    this.isPaused = true;
    return true;
  }
  resume(): boolean {
    this.isPlaying = true;
    this.isPaused = false;
    return true;
  }
  stop(): void {
    if (this.queueWhenLocked('stop')) return;
    this.isPlaying = false;
    this.isPaused = false;
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.isPlaying = false;
    const fns = this.listeners.get('destroy') ?? [];
    this.listeners.clear();
    for (const fn of fns) fn();
  }
  once(event: string, fn: () => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), fn]);
  }
  setVolume(v: number): void {
    this.volume = v;
  }
}

function setup(cached: string[] = ['menu', 'game-soda', 'game-orbit'].map((n) => `music-${n}`)) {
  const handlers = new Map<string, ((...args: number[]) => void)[]>();
  const sounds: FakeLoop[] = [];
  const unlockHandlers: (() => void)[] = [];
  /** HTML5 Audio처럼 잠금 중의 play·pause·stop을 큐에 쌓았다가 풀릴 때 실행하는 대역 (파괴된 소리면 던진다) */
  const queue: { sound: FakeLoop; action: 'play' | 'pause' | 'stop' }[] = [];
  const manager = {
    locked: false,
    nextPlay: 'ok' as 'ok' | 'false' | 'throw',
    unlock(): void {
      this.locked = false;
      while (queue.length > 0) {
        const { sound, action } = queue.shift()!;
        if (sound.destroyed)
          throw new TypeError("Cannot read properties of null (reading 'isLocked')");
        sound[action]();
      }
      for (const fn of unlockHandlers.splice(0)) fn();
    },
  };
  const game = {
    events: {
      on: (name: string, fn: (...args: number[]) => void) => {
        handlers.set(name, [...(handlers.get(name) ?? []), fn]);
      },
    },
    cache: { audio: { exists: (key: string) => cached.includes(key) } },
    sound: {
      get locked() {
        return manager.locked;
      },
      once: (name: string, fn: () => void) => {
        if (name === 'unlocked') unlockHandlers.push(fn);
      },
      add: (key: string, config: { loop?: boolean; volume?: number }) => {
        const s = new FakeLoop(key, config);
        s.queueWhenLocked = (action) => {
          if (!manager.locked) return false;
          queue.push({ sound: s, action });
          return true;
        };
        s.playResult = manager.nextPlay;
        sounds.push(s);
        return s;
      },
    },
  } as unknown as Phaser.Game;
  const emit = (name: string, ...args: number[]): void =>
    (handlers.get(name) ?? []).forEach((fn) => fn(...args));
  const tick = (ms: number): void => emit('step', 0, ms);
  return { music: Music.of(game), game, sounds, emit, tick, cached, manager };
}

const live = (sounds: FakeLoop[]): FakeLoop[] => sounds.filter((s) => !s.destroyed);

describe('Music', () => {
  it('곡 이름 → 캐시 키·파일 주소 (ogg 먼저, m4a 다음)', () => {
    expect(musicKey('menu')).toBe('music-menu');
    expect(musicUrls('game-orbit')).toEqual(
      SOUND.formats.map((ext) => `audio/music/game-orbit.${ext}`),
    );
  });

  it('곡을 틀면 반복(loop)으로 0에서 시작해 목표 볼륨까지 올라간다', () => {
    const { music, sounds, tick } = setup();
    music.play('menu');
    expect(sounds).toHaveLength(1);
    expect(sounds[0]!.config).toEqual({ loop: true, volume: 0 });
    expect(sounds[0]!.isPlaying).toBe(true);
    tick(SOUND.music.fadeMs / 2);
    expect(sounds[0]!.volume).toBeCloseTo(SOUND.music.volumes.menu / 2);
    tick(SOUND.music.fadeMs);
    expect(sounds[0]!.volume).toBeCloseTo(SOUND.music.volumes.menu);
    expect(music.state()).toMatchObject({ current: 'menu', desired: 'menu', playing: true });
  });

  it('같은 곡을 다시 부르면 새로 시작하지 않는다 (메뉴 ↔ 랭킹)', () => {
    const { music, sounds, tick } = setup();
    music.play('menu');
    tick(1000);
    music.play('menu');
    music.play('menu');
    tick(1000);
    expect(sounds).toHaveLength(1);
    expect(sounds[0]!.playCalls).toBe(1);
    expect(sounds[0]!.destroyed).toBe(false);
  });

  it('다른 곡이면 나가는 곡은 줄이며 끝내고 들어오는 곡은 올린다 (서로 넘어간다)', () => {
    const { music, sounds, tick } = setup();
    music.play('menu');
    tick(1000);
    music.play('game-soda');
    expect(sounds).toHaveLength(2);
    tick(SOUND.music.fadeMs / 2);
    // 중간: 둘 다 소리가 난다
    expect(sounds[0]!.volume).toBeGreaterThan(0);
    expect(sounds[1]!.volume).toBeGreaterThan(0);
    tick(SOUND.music.fadeMs);
    expect(sounds[0]!.destroyed).toBe(true);
    expect(live(sounds)).toEqual([sounds[1]]);
    expect(music.state().current).toBe('game-soda');
  });

  it('곡이 아직 안 읽혔으면 조용히 기다리고, 읽히면 그때 튼다', () => {
    const { music, sounds, cached } = setup([]);
    music.play('game-orbit');
    expect(sounds).toHaveLength(0);
    expect(music.state()).toMatchObject({ desired: 'game-orbit', current: null });
    cached.push('music-game-orbit');
    music.play('game-orbit'); // 읽기가 끝나면 load()의 완료 콜백이 같은 호출을 한다
    expect(sounds).toHaveLength(1);
  });

  it('일시정지로 멈추고 [계속]에서 이어서 낸다 (처음부터 다시 시작하지 않는다)', () => {
    const { music, sounds, tick } = setup();
    music.play('game-soda');
    tick(1000);
    music.hold('pause', true);
    expect(sounds[0]!.isPaused).toBe(true);
    expect(music.state().held).toEqual(['pause']);
    music.hold('pause', false);
    expect(sounds[0]!.isPlaying).toBe(true);
    expect(sounds[0]!.playCalls).toBe(1);
  });

  it('앱 숨김(hidden)에서 멈추고 돌아오면(visible) 이어서 낸다', () => {
    const { music, sounds, emit, tick } = setup();
    music.play('menu');
    tick(1000);
    emit('hidden');
    expect(sounds[0]!.isPaused).toBe(true);
    emit('visible');
    expect(sounds[0]!.isPlaying).toBe(true);
  });

  it('일시정지와 숨김이 겹치면 둘 다 풀려야 이어진다', () => {
    const { music, sounds, emit, tick } = setup();
    music.play('menu');
    tick(1000);
    music.hold('pause', true);
    emit('hidden');
    emit('visible');
    expect(sounds[0]!.isPaused).toBe(true);
    music.hold('pause', false);
    expect(sounds[0]!.isPlaying).toBe(true);
  });

  it('멈춰 있는 동안에는 올라오던 페이드도 멈춘다', () => {
    const { music, sounds, tick } = setup();
    music.play('menu');
    tick(SOUND.music.fadeMs / 2);
    const before = sounds[0]!.volume;
    music.hold('pause', true);
    tick(1000);
    expect(sounds[0]!.volume).toBe(before);
    music.hold('pause', false);
    tick(SOUND.music.fadeMs);
    expect(sounds[0]!.volume).toBeCloseTo(SOUND.music.volumes.menu);
  });

  it('새 화면이 곡을 정하면 일시정지 멈춤은 풀린다 (메뉴로 나가기·다시 하기)', () => {
    const { music, sounds, tick } = setup();
    music.play('game-soda');
    tick(1000);
    music.hold('pause', true);
    music.play('game-soda'); // 다시 하기: 같은 곡이 이어진다
    expect(sounds[0]!.isPlaying).toBe(true);
    music.hold('pause', true);
    music.play('menu');
    expect(music.state().held).toEqual([]);
    expect(live(sounds).at(-1)!.isPlaying).toBe(true);
  });

  it('끄면 곡을 줄여 끝내고, 다시 켜면 지금 화면의 곡부터 낸다 (음소거와는 상관없다)', () => {
    const { music, sounds, tick } = setup();
    music.play('game-orbit');
    tick(1000);
    music.setEnabled(false);
    tick(SOUND.music.quickFadeMs + 10);
    expect(sounds[0]!.destroyed).toBe(true);
    expect(music.state()).toMatchObject({ enabled: false, current: null, desired: 'game-orbit' });
    music.play('game-orbit'); // 꺼진 채로 화면이 곡을 불러도 소리는 나지 않는다
    expect(sounds).toHaveLength(1);
    music.setEnabled(true, true);
    expect(sounds).toHaveLength(2);
    expect(sounds[1]!.key).toBe('music-game-orbit');
  });

  it('일시정지 화면에서 음악을 켜면 바로 들린다 (일시정지 멈춤이 풀린다)', () => {
    const { music, sounds, tick } = setup();
    music.setEnabled(false);
    music.play('game-soda');
    music.hold('pause', true);
    music.setEnabled(true, true);
    expect(music.state().held).toEqual([]);
    expect(sounds.at(-1)!.isPlaying).toBe(true);
    tick(10);
  });

  it('멈춘 채로 곡이 시작되면 바로 멈춰 둔다', () => {
    const { music, sounds, emit } = setup();
    emit('hidden');
    music.play('menu');
    expect(sounds[0]!.isPaused).toBe(true);
    emit('visible');
    expect(sounds[0]!.isPlaying).toBe(true);
  });

  it('소리 만들기가 던져도 게임은 계속된다', () => {
    const { music, game } = setup();
    (game.sound as unknown as { add: () => never }).add = () => {
      throw new Error('decode 실패');
    };
    expect(() => music.play('menu')).not.toThrow();
    expect(music.state().current).toBeNull();
  });
});

describe('Music: 곡별 소리 크기', () => {
  it('곡마다 정한 크기까지 올라간다', () => {
    for (const name of ['menu', 'game-soda', 'game-butter', 'game-orbit'] as const) {
      const { music, sounds, tick } = setup([`music-${name}`]);
      music.play(name);
      tick(SOUND.music.fadeMs * 2);
      expect(sounds[0]!.volume).toBeCloseTo(SOUND.music.volumes[name]);
    }
  });
});

/** 지금 소리가 나는 객체(파괴되지 않고 재생 중이고 멈춰 있지 않은 것) */
const audible = (sounds: FakeLoop[]): FakeLoop[] =>
  sounds.filter((s) => !s.destroyed && s.isPlaying && !s.isPaused);

describe('Music: 교차 페이드 중 멈춤 (리뷰 지적 1)', () => {
  it('전환 중 일시정지하면 나가는 곡도 멈추고, 풀리면 둘 다 이어서 낸다', () => {
    const { music, sounds, tick } = setup();
    music.play('menu');
    tick(1000);
    music.play('game-soda');
    tick(100);
    music.hold('pause', true);
    expect(audible(sounds)).toEqual([]);
    tick(5000); // 멈춘 동안 페이드는 진행하지 않는다
    expect(sounds[0]!.destroyed).toBe(false);
    music.hold('pause', false);
    expect(audible(sounds)).toHaveLength(2);
    tick(SOUND.music.fadeMs * 2);
    expect(live(sounds)).toEqual([sounds[1]]);
    expect(audible(sounds)).toEqual([sounds[1]]);
  });

  it('전환 → 숨김 → (visible) 아직 일시정지 → 계속: 살아 있는 모든 소리가 멈춰 있다가 마지막에 이어진다', () => {
    const { music, sounds, emit, tick } = setup();
    music.play('menu');
    tick(1000);
    music.play('game-soda');
    tick(100);
    music.hold('pause', true);
    emit('hidden');
    expect(audible(sounds)).toEqual([]);
    emit('visible');
    expect(audible(sounds)).toEqual([]); // 일시정지가 아직 남아 있다
    music.hold('pause', false);
    expect(audible(sounds)).toHaveLength(2);
  });

  it('전환 중 숨김만 걸려도 나가는 곡이 멈춘다', () => {
    const { music, sounds, emit, tick } = setup();
    music.play('menu');
    tick(1000);
    music.play('game-soda');
    tick(100);
    emit('hidden');
    expect(audible(sounds)).toEqual([]);
    emit('visible');
    expect(audible(sounds)).toHaveLength(2);
  });
});

describe('Music: 저장값 반영과 사용자의 켜기 구분 (리뷰 지적 2)', () => {
  it('저장값 true를 늦게 반영해도 일시정지·숨김 멈춤은 그대로다', () => {
    const { music, sounds, emit, tick } = setup();
    music.play('game-soda');
    tick(1000);
    music.hold('pause', true);
    emit('hidden');
    applyLoadedMusic(fakeStore(), music, true);
    expect(music.state().held).toEqual(['pause', 'hidden']);
    expect(audible(sounds)).toEqual([]);
  });

  it('저장값 false를 늦게 반영하면 곡을 끝낸다', () => {
    const { music, sounds, tick } = setup();
    music.play('game-soda');
    tick(1000);
    applyLoadedMusic(fakeStore(), music, false);
    tick(SOUND.music.quickFadeMs + 10);
    expect(live(sounds)).toEqual([]);
  });

  it('사용자가 먼저 바꿨다면 늦은 저장값이 덮지 않고 멈춤도 건드리지 않는다', () => {
    const { music, sounds, tick } = setup();
    const store = fakeStore();
    music.play('game-soda');
    tick(1000);
    music.hold('pause', true);
    setMusicOn(store, music, true); // 일시정지 창의 켜기: 일시정지 멈춤을 푼다
    expect(music.state().held).toEqual([]);
    music.hold('pause', true);
    applyLoadedMusic(store, music, false);
    expect(music.state().enabled).toBe(true);
    expect(audible(sounds)).toEqual([]);
  });

  it('사용자의 켜기는 숨김 멈춤은 풀지 않는다', () => {
    const { music, sounds, emit } = setup();
    music.setEnabled(false);
    music.play('game-soda');
    emit('hidden');
    music.hold('pause', true);
    setMusicOn(fakeStore(), music, true);
    expect(music.state().held).toEqual(['hidden']);
    expect(audible(sounds)).toEqual([]);
    emit('visible');
    expect(audible(sounds)).toHaveLength(1);
  });
});

describe('Music: 소리 객체 정리 (리뷰 지적 4)', () => {
  it('add 뒤 play가 던져도 만든 객체를 정리하고, 반복해도 남지 않는다', () => {
    const { music, sounds, manager } = setup();
    manager.nextPlay = 'throw';
    for (let i = 0; i < 3; i++) {
      music.play('menu');
      music.play(null);
      music.play('menu');
    }
    expect(sounds.length).toBeGreaterThan(0);
    expect(live(sounds)).toEqual([]);
    expect(music.state().current).toBeNull();
  });

  it('play=false는 실패로 보고 정리한다 (HTML5 태그 부족 등)', () => {
    const { music, sounds, manager } = setup();
    manager.nextPlay = 'false';
    music.play('menu');
    expect(live(sounds)).toEqual([]);
    expect(music.state().current).toBeNull();
  });

  it('멈춘 채 만든 소리의 pause가 던져도 정리한다', () => {
    const { music, sounds, emit, game } = setup();
    emit('hidden');
    const add = game.sound.add.bind(game.sound);
    (game.sound as unknown as { add: typeof add }).add = (k, c) => {
      const s = add(k, c) as unknown as FakeLoop;
      s.pause = () => {
        throw new Error('pause 실패');
      };
      return s as never;
    };
    music.play('menu');
    expect(live(sounds)).toEqual([]);
  });

  it('밖에서 파괴된 소리는 목록에서만 빼고 다시 destroy하지 않는다', () => {
    const { music, sounds, tick } = setup();
    music.play('menu');
    tick(1000);
    sounds[0]!.destroy();
    expect(music.state().current).toBeNull();
    music.play('menu'); // 새로 만든다
    expect(sounds).toHaveLength(2);
  });
});

describe('Music: 꺼진 곡 재개 방지 (재리뷰 지적 1)', () => {
  it('일시정지 → 끄기 → 대기 → 계속: 살아 있는 소리가 없다', () => {
    const { music, sounds, tick } = setup();
    music.play('game-soda');
    tick(1000);
    music.hold('pause', true);
    setMusicOn(fakeStore(), music, false);
    tick(5000);
    music.hold('pause', false);
    expect(audible(sounds)).toEqual([]); // 풀린 바로 그 순간에도 소리가 나지 않는다
    tick(5000);
    expect(live(sounds)).toEqual([]);
    expect(audible(sounds)).toEqual([]);
  });

  it('일시정지 + 숨김 → 끄기 → visible → 계속: 끝까지 조용하다', () => {
    const { music, sounds, emit, tick } = setup();
    music.play('game-soda');
    tick(1000);
    music.hold('pause', true);
    emit('hidden');
    setMusicOn(fakeStore(), music, false);
    emit('visible');
    expect(audible(sounds)).toEqual([]);
    tick(500);
    music.hold('pause', false);
    expect(audible(sounds)).toEqual([]);
    tick(5000);
    expect(live(sounds)).toEqual([]);
  });

  it('교차 페이드 중 일시정지 → 끄기 → 계속: 나가던 곡도 다시 나지 않는다', () => {
    const { music, sounds, tick } = setup();
    music.play('menu');
    tick(1000);
    music.play('game-soda');
    tick(100);
    music.hold('pause', true);
    setMusicOn(fakeStore(), music, false);
    music.hold('pause', false);
    expect(audible(sounds)).toEqual([]); // 풀린 바로 그 순간에도 소리가 나지 않는다
    tick(5000);
    expect(live(sounds)).toEqual([]);
  });

  it('늦은 저장값 false를 일시정지 중 반영해도 계속 뒤에 조용하다', () => {
    const { music, sounds, tick } = setup();
    music.play('game-soda');
    tick(1000);
    music.hold('pause', true);
    applyLoadedMusic(fakeStore(), music, false);
    music.hold('pause', false);
    expect(audible(sounds)).toEqual([]); // 풀린 바로 그 순간에도 소리가 나지 않는다
    tick(5000);
    expect(live(sounds)).toEqual([]);
  });

  it('일반 재생 중 끄기는 짧은 페이드 뒤에 끝난다 (여전히 소리가 줄어든다)', () => {
    const { music, sounds, tick } = setup();
    music.play('game-soda');
    tick(1000);
    music.setEnabled(false);
    tick(SOUND.music.quickFadeMs / 2);
    expect(audible(sounds)).toHaveLength(1);
    tick(SOUND.music.quickFadeMs);
    expect(live(sounds)).toEqual([]);
  });
});

describe('Music: 잠금 해제 뒤에 곡 만들기 (재리뷰 지적 2)', () => {
  it('잠겨 있는 동안에는 소리 객체를 만들지 않고, 풀리면 원하는 곡을 튼다', () => {
    const { music, sounds, manager } = setup();
    manager.locked = true;
    music.play('menu');
    expect(sounds).toHaveLength(0);
    expect(music.state()).toMatchObject({ desired: 'menu', current: null });
    manager.unlock();
    expect(live(sounds)).toHaveLength(1);
    expect(sounds[0]!.isPlaying).toBe(true);
    expect(music.state().current).toBe('menu');
  });

  it('대기 중 끄면 풀려도 아무것도 만들지 않고 예외도 없다', () => {
    const { music, sounds, manager } = setup();
    manager.locked = true;
    music.play('menu');
    music.setEnabled(false);
    expect(() => manager.unlock()).not.toThrow();
    expect(sounds).toHaveLength(0);
  });

  it('대기 중 일시정지·숨김이면 풀려도 멈춘 채다', () => {
    const { music, sounds, manager, emit } = setup();
    manager.locked = true;
    music.play('menu');
    music.hold('pause', true);
    emit('hidden');
    manager.unlock();
    expect(audible(sounds)).toEqual([]);
    emit('visible');
    expect(audible(sounds)).toEqual([]);
    music.hold('pause', false);
    expect(audible(sounds)).toHaveLength(1);
  });

  it('대기 중 곡이 바뀌면 의도한 곡만 튼다', () => {
    const { music, sounds, manager } = setup();
    manager.locked = true;
    music.play('menu');
    music.play('game-soda');
    music.play('game-orbit');
    manager.unlock();
    expect(live(sounds).map((s) => s.key)).toEqual(['music-game-orbit']);
    expect(music.state().current).toBe('game-orbit');
  });

  it('대기를 여러 번 걸어도 잠금 해제 때 한 번만 평가한다', () => {
    const { music, sounds, manager } = setup();
    manager.locked = true;
    for (let i = 0; i < 5; i++) music.play('menu');
    manager.unlock();
    expect(sounds).toHaveLength(1);
  });

  it('대기 중 외부 destroy할 소리가 없으므로, 풀린 뒤 외부 destroy는 목록에서만 빠진다', () => {
    const { music, sounds, manager, tick } = setup();
    manager.locked = true;
    music.play('menu');
    manager.unlock();
    tick(1000);
    sounds[0]!.destroy();
    expect(music.state().current).toBeNull();
  });
});

describe('Music 시작 시 숨김 (W4-03 재리뷰)', () => {
  afterEach(() => {
    resetNativeVisibility();
    vi.unstubAllGlobals();
  });

  it('native 비활성 상태에서 만들면 멈춘 채 시작한다', () => {
    nativeChange(false, false);
    const { music } = setup();
    expect(music.state().held).toEqual(['hidden']);
  });

  it('한쪽만 복귀하면 멈춘 채, 양쪽 복귀하면 이어진다 (웹 hidden + native 비활성으로 시작)', () => {
    vi.stubGlobal('document', { hidden: true });
    nativeChange(false, true);
    const { music, emit } = setup();
    expect(music.state().held).toEqual(['hidden']);
    emit('visible'); // 웹만 복귀: native가 아직 비활성
    expect(music.state().held).toEqual(['hidden']);
    expect(nativeChange(true, false)).toBe('visible'); // native 복귀 → bridge가 visible을 알린다
    emit('visible');
    expect(music.state().held).toEqual([]);
  });

  it('document.hidden만 true로 시작하는 기존 경로', () => {
    vi.stubGlobal('document', { hidden: true });
    const { music, emit } = setup();
    expect(music.state().held).toEqual(['hidden']);
    emit('visible');
    expect(music.state().held).toEqual([]);
  });

  it('둘 다 활성이면 멈추지 않고 시작한다', () => {
    const { music } = setup();
    expect(music.state().held).toEqual([]);
  });
});
