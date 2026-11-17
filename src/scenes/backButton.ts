// Android 앱 연결의 실제 값 (W4-03). BootScene이 호출한다. 동작은 appBridge.ts (시험은 tests/scenes/appBridge.test.ts).
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type Phaser from 'phaser';
import { registerAppBridge as register, type GameLike } from './appBridge';
import { isPreparing } from './newRun';

export function registerAppBridge(game: Phaser.Game): void {
  register(game as unknown as GameLike, {
    app: App,
    isNative: () => Capacitor.isNativePlatform(),
    isPreparing,
    isWebHidden: () => document.hidden,
  });
}
