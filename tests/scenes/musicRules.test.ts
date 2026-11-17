import { describe, expect, it } from 'vitest';
import { SOUND } from '../../src/config';
import { THEME_IDS } from '../../src/themeIds';
import {
  applyLoadedMusic,
  gameTrack,
  isHeld,
  musicFor,
  musicTransition,
  readMusic,
  setMusicOn,
  startFade,
  stepFade,
  withHold,
  type MusicHolds,
  type MusicStore,
} from '../../src/scenes/musicRules';

function fakeStore(initial?: unknown): MusicStore {
  const map = new Map<string, unknown>();
  if (initial !== undefined) map.set('music', initial);
  return { get: (k) => map.get(k), set: (k, v) => map.set(k, v) };
}

describe('곡 고르기', () => {
  it('메뉴·랭킹은 테마와 상관없이 menu', () => {
    for (const theme of THEME_IDS) {
      expect(musicFor('Menu', theme)).toBe('menu');
      expect(musicFor('Ranking', theme)).toBe('menu');
    }
    expect(musicFor('Menu')).toBe('menu');
  });

  it('게임은 테마마다 다른 곡', () => {
    expect(musicFor('Game', 'soda')).toBe('game-soda');
    expect(musicFor('Game', 'butter')).toBe('game-butter');
    expect(musicFor('Game', 'orbit')).toBe('game-orbit');
    expect(new Set(THEME_IDS.map((t) => gameTrack(t))).size).toBe(THEME_IDS.length);
  });

  it('모르는·없는 테마 값은 기본 테마(soda)의 곡', () => {
    expect(gameTrack('nope')).toBe('game-soda');
    expect(gameTrack(undefined)).toBe('game-soda');
    expect(musicFor('Game')).toBe('game-soda');
  });

  it('SOUND.music: 모든 곡이 tracks에 있고, 테마마다 곡이 있다', () => {
    const { tracks, menuTrack, gameTracks } = SOUND.music;
    expect(tracks).toContain(menuTrack);
    for (const theme of THEME_IDS) expect(tracks).toContain(gameTracks[theme]);
    expect(new Set(tracks).size).toBe(tracks.length);
    // 곡마다 소리 크기가 있고 0 초과 1 이하
    expect(Object.keys(SOUND.music.volumes).sort()).toEqual([...tracks].sort());
    for (const volume of Object.values(SOUND.music.volumes)) {
      expect(volume).toBeGreaterThan(0);
      expect(volume).toBeLessThanOrEqual(1);
    }
  });
});

describe('곡 전환', () => {
  it('같은 곡이면 이어서 (메뉴 ↔ 랭킹, 다시 하기)', () => {
    expect(musicTransition('menu', 'menu')).toBe('keep');
    expect(musicTransition('game-soda', 'game-soda')).toBe('keep');
  });

  it('다른 곡이면 바꾼다, 곡이 없어지면 끝낸다, 둘 다 없으면 아무것도 안 한다', () => {
    expect(musicTransition('menu', 'game-soda')).toBe('switch');
    expect(musicTransition(null, 'menu')).toBe('switch');
    expect(musicTransition('menu', null)).toBe('stop');
    expect(musicTransition(null, null)).toBe('none');
  });

  it('화면 순서를 따라가면 곡이 바뀌는 때는 메뉴 → 게임, 게임 → 메뉴뿐', () => {
    const screens = [
      musicFor('Menu'),
      musicFor('Ranking'),
      musicFor('Menu'),
      musicFor('Game', 'orbit'),
      musicFor('Game', 'orbit'),
      musicFor('Menu'),
    ];
    const changes = screens.slice(1).map((next, i) => musicTransition(screens[i]!, next));
    expect(changes).toEqual(['keep', 'keep', 'switch', 'keep', 'switch']);
  });
});

describe('페이드', () => {
  it('시간에 따라 선형으로 가고, 끝나면 목표 값이다', () => {
    let fade = startFade(0, 0.3, 600);
    const a = stepFade(fade, 300);
    expect(a.volume).toBeCloseTo(0.15);
    expect(a.done).toBe(false);
    fade = a.fade;
    const b = stepFade(fade, 300);
    expect(b.volume).toBeCloseTo(0.3);
    expect(b.done).toBe(true);
  });

  it('시간을 넘겨도 목표를 넘지 않고, 줄어드는 페이드도 된다', () => {
    expect(stepFade(startFade(0, 0.3, 100), 10_000).volume).toBe(0.3);
    expect(stepFade(startFade(0.3, 0, 100), 50).volume).toBeCloseTo(0.15);
    expect(stepFade(startFade(0.3, 0, 100), 100).done).toBe(true);
  });

  it('ms가 0이어도 나눗셈이 깨지지 않고, 음수 delta는 무시한다', () => {
    expect(stepFade(startFade(0, 1, 0), 1).done).toBe(true);
    expect(stepFade(startFade(0, 1, 100), -50).volume).toBe(0);
  });

  it('입력을 바꾸지 않는다', () => {
    const fade = startFade(0, 1, 100);
    stepFade(fade, 50);
    expect(fade.elapsed).toBe(0);
  });
});

describe('멈춤 이유', () => {
  it('하나라도 있으면 멈춰 있고 모두 사라져야 이어진다', () => {
    let holds: MusicHolds = new Set();
    expect(isHeld(holds)).toBe(false);
    holds = withHold(holds, 'pause', true);
    holds = withHold(holds, 'hidden', true);
    expect(isHeld(holds)).toBe(true);
    holds = withHold(holds, 'pause', false);
    expect(isHeld(holds)).toBe(true);
    holds = withHold(holds, 'hidden', false);
    expect(isHeld(holds)).toBe(false);
  });

  it('이미 그 상태면 같은 객체를 돌려준다 (바뀐 게 없음)', () => {
    const empty: MusicHolds = new Set();
    expect(withHold(empty, 'pause', false)).toBe(empty);
    const held = withHold(empty, 'pause', true);
    expect(withHold(held, 'pause', true)).toBe(held);
    expect(empty.size).toBe(0);
  });
});

describe('음악 설정', () => {
  it('기록이 없거나 불리언이 아니면 켬', () => {
    expect(readMusic(fakeStore())).toBe(true);
    expect(readMusic(fakeStore('false'))).toBe(true);
    expect(readMusic(fakeStore(0))).toBe(true);
    expect(readMusic(fakeStore(false))).toBe(false);
  });

  it('setMusicOn: registry·재생 출력·저장 요청을 같이 바꾼다. 음소거(muted)는 건드리지 않는다', () => {
    const store = fakeStore();
    store.set('muted', true);
    const enabled: boolean[] = [];
    const saved: boolean[] = [];
    setMusicOn(store, { setEnabled: (on) => enabled.push(on) }, false, (v) => saved.push(v));
    setMusicOn(store, { setEnabled: (on) => enabled.push(on) }, true, (v) => saved.push(v));
    expect(enabled).toEqual([false, true]);
    expect(saved).toEqual([false, true]);
    expect(readMusic(store)).toBe(true);
    expect(store.get('muted')).toBe(true);
  });

  it('applyLoadedMusic: 아직 정하지 않았으면 저장값, 사용자가 먼저 바꿨으면 그 값을 덮지 않는다', () => {
    const a: boolean[] = [];
    applyLoadedMusic(fakeStore(), { setEnabled: (on) => a.push(on) }, false);
    expect(a).toEqual([false]);
    const store = fakeStore(true);
    const b: boolean[] = [];
    applyLoadedMusic(store, { setEnabled: (on) => b.push(on) }, false);
    expect(b).toEqual([true]);
    expect(readMusic(store)).toBe(true);
  });
});
