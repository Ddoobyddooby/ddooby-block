// 동그란 아이콘 버튼: 원 + 테두리 + 아이콘(Graphics). 누르면 말랑하게 눌렸다 돌아온 뒤 onPress.
// 눌리는 중에는 다시 받지 않는다. ddooby-pang의 RoundButton에서 복사해 맞췄다 (누를 때 버튼 소리가 난다).

import Phaser from 'phaser';
import { VIEW } from '../../config';
import { Sfx } from '../Sfx';

/** 원 안에 아이콘을 그린다 (원점 = 버튼 가운데) */
export type DrawIcon = (g: Phaser.GameObjects.Graphics, color: number) => void;

export interface RoundButton {
  readonly container: Phaser.GameObjects.Container;
  /** 아이콘만 다시 그린다 (음소거 켬/끔 표시 등) */
  redraw(icon: DrawIcon): void;
}

export function addRoundButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  icon: DrawIcon,
  onPress: () => void,
  /** true면 누를 때 버튼 소리를 내지 않는다 (음소거 버튼은 누른 결과에 따라 직접 낸다) */
  silent = false,
): RoundButton {
  const { colors } = VIEW;
  const g = scene.add.graphics();
  const draw = (drawIcon: DrawIcon): void => {
    g.clear()
      .fillStyle(colors.uiFill, 1)
      .fillCircle(0, 0, radius)
      .lineStyle(4, colors.uiEdge, 1)
      .strokeCircle(0, 0, radius);
    drawIcon(g, colors.text);
  };
  draw(icon);
  const container = scene.add
    .container(x, y, [g])
    .setSize(radius * 2, radius * 2)
    .setInteractive({ useHandCursor: true });
  const sfx = new Sfx(scene);
  container.on('pointerup', () => {
    if (scene.tweens.isTweening(container)) return;
    if (!silent) sfx.play('button');
    scene.tweens.add({
      targets: container,
      scale: VIEW.button.pressScale,
      duration: VIEW.button.pressMs,
      yoyo: true,
      onComplete: onPress,
    });
  });
  return { container, redraw: draw };
}

/** ❚❚ 두 막대 */
export const drawPauseIcon: DrawIcon = (g, color) => {
  g.fillStyle(color, 1).fillRoundedRect(-14, -15, 10, 30, 3).fillRoundedRect(4, -15, 10, 30, 3);
};
