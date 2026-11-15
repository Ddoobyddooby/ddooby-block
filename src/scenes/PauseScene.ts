// 일시정지 창 (PLAN 6.1). GameScene 위에 띄우고(launch) GameScene은 멈춘다(pause).
// 반투명 덮개가 아래 입력을 삼킨다. 나가기·다시 하기는 결과가 아니므로 저장하지 않는다.
// ddooby-pang의 PauseScene에서 복사해 맞췄다.

import Phaser from 'phaser';
import { VIEW } from '../config';
import { addButton, type PressLock } from '../view/ui/Button';
import { addMuteButton } from '../view/ui/MuteButton';
import { drawPanel } from '../view/ui/Panel';
import { readMuted, writeMuted } from './muteSetting';
import { pauseButtons, type PauseButton } from './pauseRules';
import { cssColor } from './text';

const LABELS: Record<PauseButton, string> = {
  resume: '계속',
  retry: '다시 하기',
  menu: '메뉴',
};

export class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  create(): void {
    const { colors, fontFamily, pause } = VIEW;
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    // 화면 전체 덮개: 눌러도 아무 일 없고, 아래 게임으로 입력이 가지 않는다
    this.add
      .rectangle(0, 0, width, height, colors.overlay, pause.dimAlpha)
      .setOrigin(0)
      .setInteractive();

    const buttons = pauseButtons();
    const buttonsH = (buttons.length - 1) * pause.buttonStep + pause.buttonH;
    const contentH = pause.titleSize + pause.titleGap + buttonsH;
    const top = cy - contentH / 2 - pause.panelPad;
    drawPanel(this, cx, top, top + contentH + pause.panelPad * 2, {
      width: pause.panelW,
      radius: pause.panelRadius,
    });
    const titleY = top + pause.panelPad + pause.titleSize / 2;
    this.add
      .text(cx, titleY, '일시정지', {
        fontFamily,
        fontSize: pause.titleSize,
        fontStyle: 'bold',
        color: cssColor(colors.text),
      })
      .setOrigin(0.5);

    // 음소거 버튼: 판 오른쪽 위. 설정은 앱이 켜져 있는 동안만 기억한다 (muteSetting.ts)
    addMuteButton(
      this,
      cx + pause.panelW / 2 - pause.muteInset,
      titleY,
      pause.muteRadius,
      readMuted(this.registry),
      (muted) => writeMuted(this.registry, muted),
    );

    const firstY = top + pause.panelPad + pause.titleSize + pause.titleGap + pause.buttonH / 2;
    const lock: PressLock = { pressed: false };
    buttons.forEach((id, i) => {
      const primary = id === 'resume';
      addButton(
        this,
        cx,
        firstY + i * pause.buttonStep,
        {
          label: LABELS[id],
          width: pause.buttonW,
          height: pause.buttonH,
          radius: pause.buttonRadius,
          fontSize: pause.buttonTextSize,
          fill: primary ? colors.button : colors.uiFill,
          textColor: primary ? colors.buttonText : colors.text,
        },
        () => this.go(id),
        lock,
      );
    });

    // 화면 크기가 바뀌면 처음부터 다시 그린다
    this.scale.on(Phaser.Scale.Events.RESIZE, this.relayout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.relayout, this);
    });
  }

  private relayout(): void {
    this.scene.restart();
  }

  private go(button: PauseButton): void {
    switch (button) {
      case 'resume':
        this.scene.resume('Game');
        this.scene.stop();
        break;
      case 'retry':
        // 멈춘 Game을 끝내고 처음부터 다시. seed는 GameScene이 정한다 (?seed=N이면 같은 seed, 아니면 새로)
        this.scene.stop('Game');
        this.scene.start('Game');
        break;
      case 'menu':
        this.scene.stop('Game');
        this.scene.start('Menu');
        break;
    }
  }
}
