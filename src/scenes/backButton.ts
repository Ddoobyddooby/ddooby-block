// Android 앱 연결 (W4-03): 뒤로 가기 버튼과 앱 백그라운드·복귀. BootScene이 앱에서 한 번만 등록한다. 웹에서는 아무것도 안 한다.
// 무엇을 할지는 backAction(순수)이 정하고, 여기서는 지금 씬에 그대로 시킨다.

import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import Phaser from 'phaser';
import { bridgeAppState } from './appLifecycle';
import { backAction } from './backAction';
import { isPreparing } from './newRun';

/** 뒤로 가기에 답하는 씬 (Menu·Ranking·GameOver·Pause·Game이 필요한 것만 가진다) */
interface BackScene extends Phaser.Scene {
  hasOverlay?(): boolean;
  closeOverlay?(): void;
  requestPause?(): void;
  requestResume?(): void;
  requestMenu?(): void;
}

let registered = false;

export function registerAppBridge(game: Phaser.Game): void {
  if (registered || !Capacitor.isNativePlatform()) return;
  registered = true;

  // 앱이 백그라운드로 가면 웹에서 탭이 숨겨진 것과 같게 (시계 멈춤·저장·음악 멈춤). 돌아오면 이어서
  bridgeAppState(App, {
    hidden: () => game.events.emit(Phaser.Core.Events.HIDDEN),
    visible: () => game.events.emit(Phaser.Core.Events.VISIBLE),
  });

  void App.addListener('backButton', () => {
    const scenes = game.scene.getScenes(true) as BackScene[]; // 멈춘 씬(일시정지 중 Game)은 빠진다
    const keys = scenes.map((s) => s.sys.settings.key);
    const find = (key: string) => scenes.find((s) => s.sys.settings.key === key);
    const top = find('GameOver') ?? find('Ranking') ?? find('Menu');
    const action = backAction(keys, {
      overlayOpen: top?.hasOverlay?.() === true,
      preparing: isPreparing(),
    });

    if (action === 'close-overlay') top?.closeOverlay?.();
    else if (action === 'pause') find('Game')?.requestPause?.();
    else if (action === 'resume') find('Pause')?.requestResume?.();
    else if (action === 'menu') (find('GameOver') ?? find('Ranking'))?.requestMenu?.();
    else if (action === 'exit') void App.exitApp();
  });
}
