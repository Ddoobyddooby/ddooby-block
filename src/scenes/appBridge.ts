// Android 앱 연결 (W4-03): 뒤로 가기 버튼과 앱 백그라운드·복귀를 한 Game에 묶는다. Phaser·Capacitor 값은 받아서 쓴다 (시험용).
// Game이 파괴되면 리스너를 모두 지우고, 같은 JS 실행에서 새 Game이 만들어지면 다시 등록할 수 있다.
import { bridgeAppState, listen, type AppLike } from './appLifecycle';
import { backAction } from './backAction';
import { resetNativeVisibility } from './appVisibility';

/** 뒤로 가기에 답하는 씬 (Menu·Ranking·GameOver·Pause·Game이 필요한 것만 가진다) */
export interface BackScene {
  sys: { settings: { key: string } };
  hasOverlay?(): boolean;
  closeOverlay?(): void;
  requestPause?(): void;
  requestResume?(): void;
  requestMenu?(): void;
  /** 메뉴 [종료]: 버튼 누름 잠금이 걸려 있으면 false */
  requestExit?(): boolean;
}

/** Phaser.Game의 필요한 부분 */
export interface GameLike {
  events: {
    emit(event: string): unknown;
    once(event: string, fn: () => void): unknown;
  };
  scene: { getScenes(isActive: boolean): BackScene[] };
}

export interface BridgeDeps {
  app: AppLike & { exitApp(): Promise<void> | void };
  isNative: () => boolean;
  isPreparing: () => boolean;
  isWebHidden: () => boolean;
}

// Phaser.Core.Events의 값 (HIDDEN·VISIBLE·DESTROY). Music도 문자열로 듣는다
const HIDDEN = 'hidden';
const VISIBLE = 'visible';
const DESTROY = 'destroy';

let active: (() => void) | null = null;

/** 웹에서는 아무것도 하지 않는다. 이미 등록돼 있으면 그대로 둔다 (한 번에 한 Game) */
export function registerAppBridge(game: GameLike, deps: BridgeDeps): void {
  if (active !== null || !deps.isNative()) return;

  const offState = bridgeAppState(
    deps.app,
    {
      hidden: () => game.events.emit(HIDDEN),
      visible: () => game.events.emit(VISIBLE),
    },
    deps.isWebHidden,
  );
  const offBack = listen<[]>(
    (l) => deps.app.addListener('backButton', l),
    () => {
      const scenes = game.scene.getScenes(true); // 멈춘 씬(일시정지 중 Game)은 빠진다
      const keys = scenes.map((s) => s.sys.settings.key);
      const find = (key: string) => scenes.find((s) => s.sys.settings.key === key);
      const top = find('GameOver') ?? find('Ranking') ?? find('Menu');
      const action = backAction(keys, {
        overlayOpen: top?.hasOverlay?.() === true,
        preparing: deps.isPreparing(),
      });

      if (action === 'close-overlay') top?.closeOverlay?.();
      else if (action === 'pause') find('Game')?.requestPause?.();
      else if (action === 'resume') find('Pause')?.requestResume?.();
      else if (action === 'menu') (find('GameOver') ?? find('Ranking'))?.requestMenu?.();
      else if (action === 'exit' && find('Menu')?.requestExit?.() === true)
        void Promise.resolve(deps.app.exitApp()).catch(() => undefined);
    },
  );

  const dispose = (): void => {
    if (active !== dispose) return;
    active = null;
    offState();
    offBack();
    resetNativeVisibility();
  };
  active = dispose;
  game.events.once(DESTROY, dispose);
}
