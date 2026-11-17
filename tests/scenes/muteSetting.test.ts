import { describe, expect, it } from 'vitest';
import { readMuted, setMuted, writeMuted, type MuteStore } from '../../src/scenes/muteSetting';

function fakeStore(initial?: unknown): MuteStore {
  const map = new Map<string, unknown>();
  if (initial !== undefined) map.set('muted', initial);
  return { get: (k) => map.get(k), set: (k, v) => map.set(k, v) };
}

describe('readMuted / writeMuted', () => {
  it('기록이 없으면 소리를 켜 둔 것(false)', () => {
    expect(readMuted(fakeStore())).toBe(false);
  });

  it('쓴 값을 읽는다', () => {
    const store = fakeStore();
    writeMuted(store, true);
    expect(readMuted(store)).toBe(true);
    writeMuted(store, false);
    expect(readMuted(store)).toBe(false);
  });

  it('불리언이 아닌 값은 소리를 켜 둔 것으로 본다', () => {
    expect(readMuted(fakeStore('true'))).toBe(false);
    expect(readMuted(fakeStore(1))).toBe(false);
    expect(readMuted(fakeStore(null))).toBe(false);
  });

  it('같은 저장소를 쓰는 곳끼리 값이 이어진다 (새 판에서도 유지)', () => {
    const store = fakeStore();
    writeMuted(store, true);
    // 새 판이 시작돼도 같은 game.registry를 읽는다
    expect(readMuted(store)).toBe(true);
  });
});

describe('setMuted (효과음만 끈다)', () => {
  it('setMuted: registry 값이 바뀐다', () => {
    const store = fakeStore();
    setMuted(store, true);
    expect(readMuted(store)).toBe(true);
    setMuted(store, false);
    expect(readMuted(store)).toBe(false);
  });

  it('setMuted: persist가 있으면 바뀐 값으로 한 번씩 부른다 (영구 저장 요청)', () => {
    const store = fakeStore();
    const saved: boolean[] = [];
    setMuted(store, true, (muted) => saved.push(muted));
    setMuted(store, false, (muted) => saved.push(muted));
    expect(saved).toEqual([true, false]);
    // persist 없이도 그대로 동작한다
    setMuted(store, true);
    expect(readMuted(store)).toBe(true);
  });
});
