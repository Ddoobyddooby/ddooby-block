// 지금 쓰는 테마. 화면이 읽는 값은 game.registry에 있고(muteSetting.ts와 같은 방식), 고를 때 persist로 저장소에도 쓴다.
// 값은 셋으로 나뉜다:
//   theme      = 지금 화면에 적용된 테마. 메뉴가 뜰 때(adoptPreferredTheme)와 사용자가 고를 때만 바뀐다.
//   themePref  = 저장소에서 읽은 선호값. 부팅 읽기가 늦게 끝나도 여기에만 쓰고, 안전한 메뉴 진입 때 theme에 반영한다.
//   themeLocked= 이번 실행에서 사용자가 고르거나 DEV `?theme=`로 정했다: 저장 선호값이 덮지 않는다.
//   runTheme   = 진행 중인 한 판(Game·Pause·GameOver)이 시작할 때 고정한 테마. 메뉴가 뜨면 지운다. 있으면 themeOf가 이것을 쓴다.

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

const PREF_KEY = 'themePref';
const LOCK_KEY = 'themeLocked';
const RUN_KEY = 'runTheme';

/** 씬이 지금 그릴 테마. 한 판이 고정한 테마(runTheme)가 있으면 그것, 없으면 적용된 테마다 */
export function themeOf(scene: { registry: ThemeStore }): Theme {
  const run = scene.registry.get(RUN_KEY);
  return getTheme(isThemeId(run) ? run : readThemeId(scene.registry));
}

/** 새 판(Game)이 시작할 때: 지금 테마를 그 판의 테마로 고정하고 돌려준다 */
export function pinRunTheme(store: ThemeStore): Theme {
  const id = readThemeId(store);
  store.set(RUN_KEY, id);
  return getTheme(id);
}

/** 한 판의 고정을 푼다 (메뉴가 뜰 때) */
export function clearRunTheme(store: ThemeStore): void {
  store.set(RUN_KEY, undefined);
}

/** 저장소에서 읽은 선호값을 적어 둔다. 이미 있으면(사용자가 먼저 골랐거나 한 번 읽음) 덮지 않는다. 화면의 테마는 바꾸지 않는다 */
export function writePreferredTheme(store: ThemeStore, id: ThemeId): void {
  if (store.get(PREF_KEY) === undefined) store.set(PREF_KEY, id);
}

/** 메뉴가 선호값을 theme에 반영해야 한다 (사용자·DEV가 정하지 않았고 선호값이 지금 테마와 다르다) */
export function hasPendingTheme(store: ThemeStore): boolean {
  if (store.get(LOCK_KEY) === true) return false;
  const pref = store.get(PREF_KEY);
  return isThemeId(pref) && pref !== readThemeId(store);
}

/** 안전한 메뉴 진입 때: 선호값을 theme에 반영한다. 바뀌었으면 true */
export function adoptPreferredTheme(store: ThemeStore): boolean {
  if (!hasPendingTheme(store)) return false;
  writeTheme(store, store.get(PREF_KEY) as ThemeId);
  return true;
}

/** 사용자(메뉴 카드)나 DEV `?theme=`가 정했다: 이후 저장 선호값이 이 실행의 테마를 바꾸지 않는다 */
export function lockTheme(store: ThemeStore, id: ThemeId): void {
  writeTheme(store, id);
  store.set(PREF_KEY, id);
  store.set(LOCK_KEY, true);
}

/**
 * 테마를 바꾼다: registry 값을 바꾸고, persist가 있으면 영구 저장도 요청한다. 테마 카드는 이것만 부른다.
 * 저장은 실패해도 게임을 막지 않는다 (이 실행의 값은 이미 바뀌었다). persist는 예외를 던지지 않는다.
 */
export function setTheme(store: ThemeStore, id: ThemeId, persist?: (id: ThemeId) => void): void {
  lockTheme(store, id);
  persist?.(id);
}
