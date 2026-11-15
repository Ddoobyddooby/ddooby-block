// 게임 오버 화면 (PLAN 6.3). 끝난 GameScene 위에 띄운다(launch). 보드가 뒤에 보인다.
// 점수·최고 점수·최고 기록 갱신 여부는 GameScene이 계산해 넘긴다 (gameOverRules.ts). 저장은 이미 끝났다 (게임 오버 때 RunSession이 한다).

import Phaser from 'phaser';
import { VIEW } from '../config';
import { addButton, type PressLock } from '../view/ui/Button';
import { drawPanel } from '../view/ui/Panel';
import {
  gameOverButtons,
  gameOverTexts,
  type GameOverButton,
  type GameOverData,
} from './gameOverRules';
import { newGameData } from './gameStart';
import { cssColor } from './text';

const LABELS: Record<GameOverButton, string> = {
  retry: '다시 하기',
  menu: '메뉴',
};

/** 화면 크기가 바뀌어 다시 그릴 때는 입력 지연을 또 주지 않는다 */
type SceneData = GameOverData & { relayout?: boolean };

export class GameOverScene extends Phaser.Scene {
  private data0: GameOverData = { score: 0, best: 0, newBest: false };
  private relayout = false;

  constructor() {
    super('GameOver');
  }

  init(data?: SceneData): void {
    if (data !== undefined) {
      this.data0 = { score: data.score, best: data.best, newBest: data.newBest };
      this.relayout = data.relayout === true;
    }
  }

  create(): void {
    const { colors, fontFamily, gameOver: g } = VIEW;
    const { width, height } = this.scale;
    const cx = width / 2;
    const texts = gameOverTexts(this.data0);
    const buttons = gameOverButtons();

    // 화면 전체 덮개: 눌러도 아무 일 없고, 아래 게임으로 입력이 가지 않는다
    this.add
      .rectangle(0, 0, width, height, colors.overlay, g.dimAlpha)
      .setOrigin(0)
      .setInteractive();

    // 위에서 아래로 쌓는다. 높이는 글자 크기를 기준으로 하고, 최고 기록 문구는 있을 때만 자리를 쓴다
    const textRows: { text: string; size: number; color: number; bold: boolean; gap: number }[] = [
      { text: texts.title, size: g.titleSize, color: colors.text, bold: true, gap: g.titleGap },
      {
        text: texts.scoreLabel,
        size: g.scoreLabelSize,
        color: colors.textDim,
        bold: false,
        gap: 0,
      },
      { text: texts.score, size: g.scoreSize, color: colors.text, bold: true, gap: g.scoreGap },
      { text: texts.best, size: g.bestSize, color: colors.textDim, bold: false, gap: g.textGap },
    ];
    if (texts.newBest !== null) {
      textRows.push({
        text: texts.newBest,
        size: g.newBestSize,
        color: colors.combo,
        bold: true,
        gap: g.textGap,
      });
    }
    const textsH = textRows.reduce((sum, row) => sum + row.size + row.gap, 0);
    const buttonsH = (buttons.length - 1) * g.buttonStep + g.buttonH;
    const contentH = textsH + g.buttonsGap + buttonsH;
    const top = height / 2 - contentH / 2 - g.panelPad;
    drawPanel(this, cx, top, top + contentH + g.panelPad * 2, {
      width: g.panelW,
      radius: g.panelRadius,
    });

    let y = top + g.panelPad;
    for (const row of textRows) {
      this.add
        .text(cx, y + row.size / 2, row.text, {
          fontFamily,
          fontSize: row.size,
          fontStyle: row.bold ? 'bold' : 'normal',
          color: cssColor(row.color),
        })
        .setOrigin(0.5);
      y += row.size + row.gap;
    }

    const firstY = y + g.buttonsGap + g.buttonH / 2;
    // 처음 뜰 때는 잠시 눌리지 않는다 (PressLock이 눌린 상태로 시작했다가 풀린다)
    const lock: PressLock = { pressed: !this.relayout };
    if (!this.relayout) {
      this.time.delayedCall(g.inputDelayMs, () => {
        lock.pressed = false;
      });
    }
    buttons.forEach((id, i) => {
      const primary = id === 'retry';
      addButton(
        this,
        cx,
        firstY + i * g.buttonStep,
        {
          label: LABELS[id],
          width: g.buttonW,
          height: g.buttonH,
          radius: g.buttonRadius,
          fontSize: g.buttonTextSize,
          fill: primary ? colors.button : colors.uiFill,
          textColor: primary ? colors.buttonText : colors.text,
        },
        () => this.go(id),
        lock,
      );
    });

    // 화면 크기가 바뀌면 처음부터 다시 그린다 (PauseScene과 같다)
    this.scale.on(Phaser.Scale.Events.RESIZE, this.redraw, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.redraw, this);
    });
  }

  private redraw(): void {
    this.scene.restart({ ...this.data0, relayout: true });
  }

  private go(button: GameOverButton): void {
    // 끝난 Game 씬을 끝낸다 (run은 게임 오버 때 이미 지워졌다). DEV `?over`에서는 Game 씬이 없어도 상관없다
    this.scene.stop('Game');
    if (button === 'retry') this.scene.start('Game', newGameData());
    else this.scene.start('Menu');
  }
}
