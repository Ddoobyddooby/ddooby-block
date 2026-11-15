import { describe, expect, it } from 'vitest';
import {
  applyMuted,
  readMuted,
  setMuted,
  writeMuted,
  type MuteStore,
} from '../../src/scenes/muteSetting';

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

describe('applyMuted / setMuted (사운드 매니저 mute와 동기화)', () => {
  it('applyMuted: 저장된 값을 매니저 mute에 맞춘다', () => {
    const store = fakeStore(true);
    const output = { mute: false };
    applyMuted(store, output);
    expect(output.mute).toBe(true);
  });

  it('applyMuted: 기록이 없으면 소리를 켠다 (mute false)', () => {
    const output = { mute: true };
    applyMuted(fakeStore(), output);
    expect(output.mute).toBe(false);
  });

  it('setMuted: 저장값과 매니저 mute가 같이 바뀐다', () => {
    const store = fakeStore();
    const output = { mute: false };
    setMuted(store, output, true);
    expect(readMuted(store)).toBe(true);
    expect(output.mute).toBe(true);
    setMuted(store, output, false);
    expect(readMuted(store)).toBe(false);
    expect(output.mute).toBe(false);
  });
});
