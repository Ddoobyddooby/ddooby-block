// 공통 버튼: 둥근 사각형 + 글자. 누르면 말랑하게 눌렸다가 돌아온 뒤 onPress.
// 같은 화면의 버튼끼리 PressLock을 나눠 쓰면 하나만 눌린다. ddooby-pang의 Button에서 복사해 맞췄다 (누를 때 버튼 소리가 난다).

import Phaser from 'phaser';
import { VIEW } from '../../config';
import { cssColor } from '../../scenes/text';
import { Sfx } from '../Sfx';

export interface ButtonSpec {
  label: string;
  width: number;
  height: number;
  radius: number;
  fontSize: number;
  fill: number;
  textColor: number;
}

/** 한 화면에서 버튼이 한 번만 눌리게 한다 (화면을 떠나는 중에 다른 버튼이 또 눌리지 않게) */
export interface PressLock {
  pressed: boolean;
}

export function addButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  spec: ButtonSpec,
  onPress: () => void,
  lock: PressLock = { pressed: false },
): Phaser.GameObjects.Container {
  const { width: w, height: h } = spec;
  const bg = scene.add
    .graphics()
    .fillStyle(spec.fill, 1)
    .fillRoundedRect(-w / 2, -h / 2, w, h, spec.radius);
  const label = scene.add
    .text(0, 0, spec.label, {
      fontFamily: VIEW.fontFamily,
      fontSize: spec.fontSize,
      fontStyle: 'bold',
      color: cssColor(spec.textColor),
    })
    .setOrigin(0.5);
  const button = scene.add
    .container(x, y, [bg, label])
    .setSize(w, h)
    .setInteractive({ useHandCursor: true });

  const sfx = new Sfx(scene);
  button.on('pointerup', () => {
    if (lock.pressed) return;
    lock.pressed = true;
    sfx.play('button');
    scene.tweens.add({
      targets: button,
      scale: VIEW.button.pressScale,
      duration: VIEW.button.pressMs,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: onPress,
    });
  });
  return button;
}
