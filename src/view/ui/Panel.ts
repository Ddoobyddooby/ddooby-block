// 반투명이 아닌 둥근 판 + 테두리 + 아래 그림자. 일시정지·게임 오버 창이 쓴다. 위쪽 장식은 테마가 정한다 (시안 gameover).
// ddooby-pang의 Panel에서 복사해 맞췄다.

import type Phaser from 'phaser';
import { sparklePoints } from '../theme/backdrop';
import { themeOf } from '../theme/themeSetting';

/** 가운데 cx, 위·아래 끝은 내용에 맞춘다 */
export function drawPanel(
  scene: Phaser.Scene,
  cx: number,
  top: number,
  bottom: number,
  { width: w, radius }: { width: number; radius: number },
): Phaser.GameObjects.Graphics {
  const theme = themeOf(scene);
  const { colors } = theme;
  const left = cx - w / 2;
  const g = scene.add.graphics();
  g.fillStyle(colors.shadow, 0.35).fillRoundedRect(left, top + 18, w, bottom - top, radius);
  g.fillStyle(colors.panel, 1).fillRoundedRect(left, top, w, bottom - top, radius);
  g.lineStyle(3.5, colors.edge, 1).strokeRoundedRect(left, top, w, bottom - top, radius);
  if (theme.panelDeco === 'sparkles') {
    g.fillStyle(0xe7bf3d, 1).fillPoints(sparklePoints(left + 82, top + 54, 13), true);
    g.fillStyle(colors.accent, 1).fillPoints(sparklePoints(left + w - 84, top + 86, 9), true);
  } else if (theme.panelDeco === 'lines') {
    g.lineStyle(3.5, colors.blocks[5], 1);
    g.beginPath()
      .moveTo(left + 56, top)
      .lineTo(left + 220, top)
      .strokePath();
    g.beginPath()
      .moveTo(left + w - 220, top)
      .lineTo(left + w - 56, top)
      .strokePath();
  } else {
    g.fillStyle(colors.blocks[0], 1).fillCircle(cx, top, 17);
  }
  return g;
}
