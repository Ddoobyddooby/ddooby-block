// Boot가 저장소에서 읽은 값을 화면·소리가 읽는 곳(game.registry, 사운드 출력)에 반영한다. Phaser 없이 테스트할 수 있다.
import type { LoadResult } from '../storage/persistence';
import { writeBest, type BestStore } from './bestScore';
import {
  hasTheme,
  writePreferredTheme,
  writeTheme,
  type ThemeStore,
} from '../view/theme/themeSetting';
import { applyMuted, writeMuted, type MuteStore, type SoundOutput } from './muteSetting';

/**
 * 최고 점수는 이미 더 큰 값이 있으면 그대로 둔다. 음소거는 아직 아무도 정하지 않았을 때만 저장된 값으로 채운다

 * (저장소 읽기가 늦어 사용자가 먼저 바꾼 값을 덮지 않는다). 테마는 선호값으로만 적는다 (위). 마지막에 사운드 출력을 registry 값에 맞춘다.
 */
export function applyLoaded(
  store: BestStore & MuteStore & ThemeStore,
  output: SoundOutput,
  result: Pick<LoadResult, 'bestScore' | 'settings'>,
): void {
  writeBest(store, result.bestScore);
  if (store.get('muted') === undefined) writeMuted(store, result.settings.muted);
  // 저장 테마는 선호값으로만 적어 둔다. 화면에 이미 적용된 테마(첫 화면이 떴거나 사용자·DEV가 정함)는 바꾸지 않는다:
  // 진행 중인 게임의 테마가 도중에 바뀌지 않게 하고, 메뉴가 뜰 때 반영한다 (adoptPreferredTheme).
  // 첫 화면 전(아직 적용된 테마가 없음)이면 바로 적용한다
  writePreferredTheme(store, result.settings.theme);
  if (!hasTheme(store)) writeTheme(store, result.settings.theme);
  applyMuted(store, output);
}
