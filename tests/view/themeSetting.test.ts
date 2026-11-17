import { describe, expect, it, vi } from 'vitest';
import {
  hasTheme,
  readThemeId,
  setTheme,
  themeOf,
  writeTheme,
  type ThemeStore,
} from '../../src/view/theme/themeSetting';
import { THEMES } from '../../src/view/theme/themes';

function fakeStore(initial: Record<string, unknown> = {}): ThemeStore {
  const map = new Map<string, unknown>(Object.entries(initial));
  return { get: (k) => map.get(k), set: (k, v) => map.set(k, v) };
}

describe('테마 설정 (registry)', () => {
  it('아직 정하지 않았으면 기본 테마(소다)이고 hasTheme은 false다', () => {
    const store = fakeStore();
    expect(hasTheme(store)).toBe(false);
    expect(readThemeId(store)).toBe('soda');
    expect(themeOf({ registry: store })).toBe(THEMES.soda);
  });

  it('쓴 값을 읽는다. 알 수 없는 값이 들어 있어도 기본 테마다', () => {
    const store = fakeStore();
    writeTheme(store, 'orbit');
    expect(hasTheme(store)).toBe(true);
    expect(readThemeId(store)).toBe('orbit');
    expect(themeOf({ registry: store }).id).toBe('orbit');
    store.set('theme', 'navy');
    expect(readThemeId(store)).toBe('soda');
    store.set('theme', 5);
    expect(themeOf({ registry: store }).id).toBe('soda');
  });

  it('setTheme은 registry를 바꾸고 persist를 한 번 부른다 (persist가 없어도 된다)', () => {
    const store = fakeStore();
    const persist = vi.fn();
    setTheme(store, 'butter', persist);
    expect(readThemeId(store)).toBe('butter');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('butter');
    setTheme(store, 'orbit');
    expect(readThemeId(store)).toBe('orbit');
  });
});
