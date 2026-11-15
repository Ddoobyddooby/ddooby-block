// HUD: 점수·최고 점수·콤보·일시정지 버튼 (PLAN 6.1). 화면 구역의 hud 영역 안에 그린다.
// 숫자만 보여 준다. 큰 연출(팝업·파티클)은 view/fx/FxDirector가 한다.

import Phaser from 'phaser';
import { VIEW } from '../config';
import { cssColor } from '../scenes/text';
import { comboLabel, formatScore } from './hudText';
import type { ScreenLayout } from './layout';
import { addRoundButton, drawPauseIcon } from './ui/RoundButton';

export class Hud {
  private readonly label: Phaser.GameObjects.Text;
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly bestText: Phaser.GameObjects.Text;
  private readonly comboText: Phaser.GameObjects.Text;
  private readonly pauseButton: Phaser.GameObjects.Container;
  private score = 0;
  private screen: ScreenLayout;

  constructor(
    scene: Phaser.Scene,
    screen: ScreenLayout,
    onPause: () => void,
    initial: { score: number; best: number; combo: number },
  ) {
    const { fontFamily, colors, hud } = VIEW;
    const text = (size: number, color: number, bold: boolean) =>
      scene.add.text(0, 0, '', {
        fontFamily,
        fontSize: size,
        fontStyle: bold ? 'bold' : 'normal',
        color: cssColor(color),
      });
    this.screen = screen;
    this.label = text(hud.labelSize, colors.textDim, false).setText('점수');
    this.scoreText = text(hud.scoreSize, colors.text, true);
    this.bestText = text(hud.bestSize, colors.textDim, false);
    this.comboText = text(hud.comboSize, colors.combo, true);
    this.pauseButton = addRoundButton(
      scene,
      0,
      0,
      hud.buttonRadius,
      drawPauseIcon,
      onPause,
    ).container;
    this.setScore(initial.score);
    this.setBest(initial.best);
    this.setCombo(initial.combo);
    this.place();
  }

  /** 지금 표시하는 점수 */
  get shownScore(): number {
    return this.score;
  }

  setScore(score: number): void {
    this.score = score;
    this.scoreText.setText(formatScore(score));
  }

  setBest(best: number): void {
    this.bestText.setText(`최고 ${formatScore(best)}`);
  }

  /** 콤보가 1 이상이면 보이고 0이면 감춘다 */
  setCombo(combo: number): void {
    const label = comboLabel(combo);
    this.comboText.setVisible(label !== null);
    if (label !== null) this.comboText.setText(label);
  }

  get comboVisible(): boolean {
    return this.comboText.visible;
  }

  setLayout(screen: ScreenLayout): void {
    this.screen = screen;
    this.place();
  }

  private place(): void {
    const { hud: area } = this.screen;
    const { hud } = VIEW;
    const left = area.x + hud.padX;
    const right = area.x + area.w - hud.padX;
    this.label.setOrigin(0, 0.5).setPosition(left, area.y + hud.labelY);
    this.scoreText.setOrigin(0, 0.5).setPosition(left, area.y + hud.scoreY);
    this.comboText.setOrigin(0, 0.5).setPosition(left, area.y + hud.comboY);
    this.bestText.setOrigin(1, 0.5).setPosition(right, area.y + hud.bestY);
    this.pauseButton.setPosition(right - hud.buttonRadius, area.y + hud.buttonY);
  }
}
