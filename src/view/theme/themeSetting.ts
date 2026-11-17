// 지금 쓰는 테마. 화면이 읽는 값은 game.registry에 있고(muteSetting.ts와 같은 방식), 고를 때 persist로 저장소에도 쓴다.
// Boot가 저장소에서 읽은 값(또는 DEV `?theme=`)을 `writeTheme`로 채운다. 테마는 메뉴에서만 바꾼다.

import { DEFAULT_THEME, isThemeId, type ThemeId } from '../../themeIds';
import { getTheme, type Theme } from './themes';

const KEY = 'theme';

/** Phaser.Data.DataManager에서 쓰는 부분 (muteSetting.ts의 MuteStore와 같다) */
export interface ThemeStore {
  get(key: string): unknown;
  set(key: string, value: unknown): unknown;
}

/** 아직 아무도 정하지 않았다 (Boot의 저장값 반영이 이 값으로 먼저 채우지 않았는지 볼 때 쓴다) */
export function hasTheme(store: ThemeStore): boolean {
  return store.get(KEY) !== undefined;
}

/** 기록이 없거나 모르는 값이면 기본 테마 */
export function readThemeId(store: ThemeStore): ThemeId {
  const value = store.get(KEY);
  return isThemeId(value) ? value : DEFAULT_THEME;
}

export function writeTheme(store: ThemeStore, id: ThemeId): void {
  store.set(KEY, id);
}

/** 씬이 지금 그릴 테마. 씬은 `registry`를 가지고 있어 어느 화면에서나 부를 수 있다 */
export function themeOf(scene: { registry: ThemeStore }): Theme {
  return getTheme(readThemeId(scene.registry));
}

/**
 * 테마를 바꾼다: registry 값을 바꾸고, persist가 있으면 영구 저장도 요청한다. 테마 카드는 이것만 부른다.
 * 저장은 실패해도 게임을 막지 않는다 (이 실행의 값은 이미 바뀌었다). persist는 예외를 던지지 않는다.
 */
export function setTheme(store: ThemeStore, id: ThemeId, persist?: (id: ThemeId) => void): void {
  writeTheme(store, id);
  persist?.(id);
}
