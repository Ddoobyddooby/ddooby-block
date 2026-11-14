import Phaser from 'phaser';
import { GAME, VIEW } from './config';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME.width,
  height: GAME.height,
  scale: {
    // 폭 720 기준으로 화면 비율에 맞춰 높이를 늘린다 (PLAN 1절)
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // 터치 포인터 수 (마우스 제외). 두 번째 손가락도 이벤트로 받아서 DragController가 직접 무시한다
  input: { activePointers: VIEW.touchPointers },
  scene: [BootScene, MenuScene, GameScene],
});
