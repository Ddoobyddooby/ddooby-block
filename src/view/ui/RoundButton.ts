// 동그란 아이콘 버튼: 원 + 테두리 + 아이콘(Graphics). 누르면 말랑하게 눌렸다 돌아온 뒤 onPress.
// 눌리는 중에는 다시 받지 않는다. ddooby-pang의 RoundButton에서 복사해 맞췄다 (소리는 W2-04).

import Phaser from 'phaser';
import { VIEW } from '../../config';

/** 원 안에 아이콘을 그린다 (원점 = 버튼 가운데) */
export type DrawIcon = (g: Phaser.GameObjects.Graphics, color: number) => void;

export function addRoundButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  icon: DrawIcon,
  onPress: () => void,
): Phaser.GameObjects.Container {
  const { colors } = VIEW;
  const g = scene.add
    .graphics()
    .fillStyle(colors.uiFill, 1)
    .fillCircle(0, 0, radius)
    .lineStyle(4, colors.uiEdge, 1)
    .strokeCircle(0, 0, radius);
  icon(g, colors.text);

  const container = scene.add
    .container(x, y, [g])
    .setSize(radius * 2, radius * 2)
    .setInteractive({ useHandCursor: true });
  container.on('pointerup', () => {
    if (scene.tweens.isTweening(container)) return;
    scene.tweens.add({
      targets: container,
      scale: VIEW.button.pressScale,
      duration: VIEW.button.pressMs,
      yoyo: true,
      onComplete: onPress,
    });
  });
  return container;
}

/** ❚❚ 두 막대 */
export const drawPauseIcon: DrawIcon = (g, color) => {
  g.fillStyle(color, 1).fillRoundedRect(-14, -15, 10, 30, 3).fillRoundedRect(4, -15, 10, 30, 3);
};
