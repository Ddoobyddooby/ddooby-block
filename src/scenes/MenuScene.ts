// 메뉴. 지금은 게임 이름과 "새 게임" 버튼만 있다 (이어하기·랭킹은 뒤 태스크, PLAN 6.3).

import Phaser from 'phaser';
import { GAME, VIEW } from '../config';
import { cssColor } from './text';

export class MenuScene extends Phaser.Scene {
  private title!: Phaser.GameObjects.Text;
  private buttonShape!: Phaser.GameObjects.Graphics;
  private buttonLabel!: Phaser.GameObjects.Text;
  private buttonZone!: Phaser.GameObjects.Zone;

  constructor() {
    super('Menu');
  }

  create(): void {
    const { menu, colors, fontFamily } = VIEW;
    this.cameras.main.setBackgroundColor(colors.background);

    this.title = this.add
      .text(0, 0, 'Ddooby Block', {
        fontFamily,
        fontSize: menu.titleSize,
        fontStyle: 'bold',
        color: cssColor(colors.text),
      })
      .setOrigin(0.5);

    this.buttonShape = this.add.graphics();
    this.buttonShape.fillStyle(colors.button, 1);
    this.buttonShape.fillRoundedRect(
      -menu.buttonW / 2,
      -menu.buttonH / 2,
      menu.buttonW,
      menu.buttonH,
      menu.buttonRadius,
    );
    this.buttonLabel = this.add
      .text(0, 0, '새 게임', {
        fontFamily,
        fontSize: menu.buttonTextSize,
        fontStyle: 'bold',
        color: cssColor(colors.buttonText),
      })
      .setOrigin(0.5);
    this.buttonZone = this.add
      .zone(0, 0, menu.buttonW, menu.buttonH)
      .setInteractive({ useHandCursor: true });
    this.buttonZone.on('pointerdown', () => this.buttonShape.setAlpha(menu.buttonDownAlpha));
    this.buttonZone.on('pointerout', () => this.buttonShape.setAlpha(1));
    // 누른 채 버튼 밖으로 나가서 떼면 시작하지 않는다
    this.buttonZone.on('pointerup', () => this.scene.start('Game'));

    this.place();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.place, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.place, this);
    });
  }

  /** 화면 크기에 맞춰 가로 가운데에 둔다 */
  private place(): void {
    const { menu } = VIEW;
    const x = this.scale.width / 2;
    const height = Math.max(this.scale.height, GAME.height);
    this.title.setPosition(x, height * menu.titleY);
    const y = height * menu.buttonY;
    this.buttonShape.setPosition(x, y);
    this.buttonLabel.setPosition(x, y);
    this.buttonZone.setPosition(x, y);
  }
}
