// 반투명이 아닌 둥근 판 + 테두리. 일시정지 창이 쓴다 (ddooby-pang의 Panel에서 복사해 맞췄다).

import type Phaser from 'phaser';
import { VIEW } from '../../config';

/** 가운데 cx, 위·아래 끝은 내용에 맞춘다 */
export function drawPanel(
  scene: Phaser.Scene,
  cx: number,
  top: number,
  bottom: number,
  { width: w, radius }: { width: number; radius: number },
): Phaser.GameObjects.Graphics {
  const { colors } = VIEW;
  return scene.add
    .graphics()
    .fillStyle(colors.panel, 1)
    .fillRoundedRect(cx - w / 2, top, w, bottom - top, radius)
    .lineStyle(4, colors.uiEdge, 1)
    .strokeRoundedRect(cx - w / 2, top, w, bottom - top, radius);
}
