import Phaser from 'phaser';
import { GAME } from './config';
import { BootScene } from './scenes/BootScene';

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
  scene: [BootScene],
});
