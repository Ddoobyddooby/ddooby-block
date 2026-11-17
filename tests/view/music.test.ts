import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { SOUND } from '../../src/config';
import { Music, musicKey, musicUrls } from '../../src/view/Music';

// W4-01: Music(곡 하나 재생·페이드·멈춤)를 Phaser 없이 대역으로 본다. 실제 소리는 자동 브라우저로 들을 수 없다.

class FakeLoop {
  isPlaying = false;
  isPaused = false;
  volume: number;
  destroyed = false;
  playCalls = 0;
  constructor(
    readonly key: string,
    readonly config: { loop?: boolean; volume?: number },
  ) {
    this.volume = config.volume ?? 1;
  }
  play(): boolean {
    this.playCalls++;
    this.isPlaying = true;
    this.isPaused = false;
    return true;
  }
  pause(): boolean {
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
    this.isPlaying = false;
    this.isPaused = false;
  }
  destroy(): void {
    this.destroyed = true;
  }
  setVolume(v: number): void {
    this.volume = v;
  }
}

function setup(cached: string[] = ['menu', 'game-soda', 'game-orbit'].map((n) => `music-${n}`)) {
  const handlers = new Map<string, ((...args: number[]) => void)[]>();
  const sounds: FakeLoop[] = [];
  const game = {
    events: {
      on: (name: string, fn: (...args: number[]) => void) => {
        handlers.set(name, [...(handlers.get(name) ?? []), fn]);
      },
    },
    cache: { audio: { exists: (key: string) => cached.includes(key) } },
    sound: {
      add: (key: string, config: { loop?: boolean; volume?: number }) => {
        const s = new FakeLoop(key, config);
        sounds.push(s);
        return s;
      },
    },
  } as unknown as Phaser.Game;
  const emit = (name: string, ...args: number[]): void =>
    (handlers.get(name) ?? []).forEach((fn) => fn(...args));
  const tick = (ms: number): void => emit('step', 0, ms);
  return { music: Music.of(game), game, sounds, emit, tick, cached };
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
    expect(sounds[0]!.volume).toBeCloseTo(SOUND.music.volume / 2);
    tick(SOUND.music.fadeMs);
    expect(sounds[0]!.volume).toBeCloseTo(SOUND.music.volume);
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
    expect(sounds[0]!.volume).toBeCloseTo(SOUND.music.volume);
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
    music.setEnabled(true);
    expect(sounds).toHaveLength(2);
    expect(sounds[1]!.key).toBe('music-game-orbit');
  });

  it('일시정지 화면에서 음악을 켜면 바로 들린다 (일시정지 멈춤이 풀린다)', () => {
    const { music, sounds, tick } = setup();
    music.setEnabled(false);
    music.play('game-soda');
    music.hold('pause', true);
    music.setEnabled(true);
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
