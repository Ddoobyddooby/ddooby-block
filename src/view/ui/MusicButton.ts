// 동그란 ♫ 버튼: 배경 음악 켜고 끄기. 공통 동그란 버튼(RoundButton)에 음표 아이콘을 그린다.
// ddooby-pang의 MusicButton에서 복사해 맞췄다. 저장은 모른다: 누르면 onToggle(새 값)을 부른다.

import type Phaser from 'phaser';
import { addRoundButton, type DrawIcon } from './RoundButton';

export function addMusicButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  on: boolean,
  onToggle: (on: boolean) => void,
): Phaser.GameObjects.Container {
  let current = on;
  // 버튼 소리는 호출한 쪽이 정한다 (켜질 때만 낸다)
  const button = addRoundButton(
    scene,
    x,
    y,
    radius,
    note(current),
    () => {
      current = !current;
      button.redraw(note(current));
      onToggle(current);
    },
    true,
  );
  return button.container;
}

/** 8분음표 둘을 이은 ♫. 꺼지면 X */
const note =
  (on: boolean): DrawIcon =>
  (g, color) => {
    g.fillStyle(color, 1)
      .fillEllipse(-9, 10, 13, 10)
      .fillEllipse(11, 6, 13, 10)
      .fillRect(-4, -14, 4, 24)
      .fillRect(16, -18, 4, 24)
      .fillTriangle(-4, -14, 20, -18, 20, -10)
      .fillTriangle(-4, -14, 20, -10, -4, -6);
    if (!on) {
      g.lineStyle(7, 0xffffff, 1).lineBetween(-20, -20, 20, 20);
      g.lineStyle(4, color, 1).lineBetween(-20, -20, 20, 20);
    }
  };
