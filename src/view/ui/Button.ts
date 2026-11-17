// 공통 버튼: 둥근 사각형 + 글자. 누르면 말랑하게 눌렸다가 돌아온 뒤 onPress.
// 같은 화면의 버튼끼리 PressLock을 나눠 쓰면 하나만 눌린다. 모양(모서리·그림자·테두리·색)은 테마가 정한다 (시안 build_mockups.py의 button).
// ddooby-pang의 Button에서 복사해 맞췄다 (누를 때 버튼 소리가 난다).

import Phaser from 'phaser';
import { VIEW } from '../../config';
import { mixColor } from '../theme/colorMath';
import { textStyle } from '../theme/textStyle';
import { themeOf } from '../theme/themeSetting';
import { Sfx } from '../Sfx';
import { beginPress, finishPress, type PressLock } from './pressLock';

export type { PressLock };

export interface ButtonSpec {
  label: string;
  width: number;
  height: number;
  fontSize: number;
  /** 주 버튼(강조색)이면 true, 보조 버튼(패널색 + 테두리)이면 false */
  primary: boolean;
}

/** 버튼 아래 그림자가 내려오는 거리 (시안 5px × 720/390) */
const SHADOW_DY = 9;

export function addButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  spec: ButtonSpec,
  onPress: () => void,
  lock: PressLock = { pressed: false },
): Phaser.GameObjects.Container {
  const theme = themeOf(scene);
  const { colors } = theme;
  const { width: w, height: h } = spec;
  const radius = theme.buttonRadius === 'pill' ? h / 2 : theme.buttonRadius;
  const fill = spec.primary ? colors.accent : colors.panel;
  const bg = scene.add.graphics();
  bg.fillStyle(colors.shadow, 0.5).fillRoundedRect(-w / 2, -h / 2 + SHADOW_DY, w, h, radius);
  bg.fillStyle(fill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, radius);
  // 보조 버튼은 테두리, 주 버튼은 테두리 없음 (시안)
  if (!spec.primary) {
    bg.lineStyle(2.5, colors.edge, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
  }
  // 오비트: 위쪽 밝은 선. 버터 주 버튼: 왼쪽의 작은 노란 점
  if (theme.deco.kind === 'orbit') {
    bg.lineStyle(2, mixColor(fill, 0xffffff, 0.35), 1);
    bg.beginPath()
      .moveTo(-w / 2 + 30, -h / 2 + 13)
      .lineTo(w / 2 - 30, -h / 2 + 13)
      .strokePath();
  } else if (theme.deco.kind === 'butter' && spec.primary) {
    bg.fillStyle(colors.blocks[0], 1).fillCircle(-w / 2 + 44, 0, 5.5);
  }
  const label = scene.add
    .text(
      0,
      0,
      spec.label,
      textStyle(theme, 'heading', spec.fontSize, spec.primary ? colors.accentText : colors.ink),
    )
    .setOrigin(0.5);
  const button = scene.add
    .container(x, y, [bg, label])
    .setSize(w, h)
    .setInteractive({ useHandCursor: true });

  const sfx = new Sfx(scene);
  button.on('pointerup', () => {
    if (!beginPress(lock)) return;
    sfx.play('button');
    scene.tweens.add({
      targets: button,
      scale: VIEW.button.pressScale,
      duration: VIEW.button.pressMs,
      yoyo: true,
      ease: 'Quad.easeOut',
      // 눌리는 동안 화면이 다시 그려져 버튼이 버려졌으면 실행하지 않는다 (destroy해도 트윈의 onComplete는 실행된다)
      onComplete: () => finishPress(lock, button.active, onPress),
    });
  });
  return button;
}
