// Boot가 저장소에서 읽은 값을 화면·소리가 읽는 곳(game.registry, 사운드 출력)에 반영한다. Phaser 없이 테스트할 수 있다.
import type { LoadResult } from '../storage/persistence';
import { writeBest, type BestStore } from './bestScore';
import { hasTheme, writeTheme, type ThemeStore } from '../view/theme/themeSetting';
import { applyMuted, writeMuted, type MuteStore, type SoundOutput } from './muteSetting';

/**
 * 최고 점수는 이미 더 큰 값이 있으면 그대로 둔다. 음소거는 아직 아무도 정하지 않았을 때만 저장된 값으로 채운다

 * (저장소 읽기가 늦어 사용자가 먼저 바꾼 값을 덮지 않는다). 테마도 같다: 이미 정해졌으면(DEV `?theme=`, 메뉴에서 먼저 고름) 덮지 않는다. 마지막에 사운드 출력을 registry 값에 맞춘다.
 */
export function applyLoaded(
  store: BestStore & MuteStore & ThemeStore,
  output: SoundOutput,
  result: Pick<LoadResult, 'bestScore' | 'settings'>,
): void {
  writeBest(store, result.bestScore);
  if (store.get('muted') === undefined) writeMuted(store, result.settings.muted);
  if (!hasTheme(store)) writeTheme(store, result.settings.theme);
  applyMuted(store, output);
}
