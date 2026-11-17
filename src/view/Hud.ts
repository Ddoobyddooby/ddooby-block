// HUD: 점수·최고 점수·콤보·일시정지 버튼 (PLAN 6.1). 화면 구역의 hud 영역 안에 그린다.
// 숫자만 보여 준다. 큰 연출(팝업·파티클)은 view/fx/FxDirector가 한다.

import Phaser from 'phaser';
import { VIEW } from '../config';
import { textStyle } from './theme/textStyle';
import { themeOf } from './theme/themeSetting';
import { comboLabel, formatScore } from './hudText';
import type { ScreenLayout } from './layout';
import { addRoundButton, drawPauseIcon } from './ui/RoundButton';
import type { TextRole } from './theme/textStyle';

export class Hud {
  private readonly label: Phaser.GameObjects.Text;
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly bestText: Phaser.GameObjects.Text;
  private readonly comboText: Phaser.GameObjects.Text;
  private readonly comboPill: Phaser.GameObjects.Graphics;
  private readonly panelColors: { fill: number; edge: number };
  private readonly pauseButton: Phaser.GameObjects.Container;
  private score = 0;
  private screen: ScreenLayout;

  constructor(
    scene: Phaser.Scene,
    screen: ScreenLayout,
    onPause: () => void,
    initial: { score: number; best: number; combo: number },
  ) {
    const theme = themeOf(scene);
    const { colors } = theme;
    const { hud } = VIEW;
    const text = (role: TextRole, size: number, color: number) =>
      scene.add.text(0, 0, '', textStyle(theme, role, size, color));
    this.screen = screen;
    this.label = text('body', hud.labelSize, colors.muted).setText('점수');
    this.scoreText = text('number', hud.scoreSize, colors.ink);
    this.bestText = text('body', hud.bestSize, colors.muted);
    this.comboText = text('heading', hud.comboSize, colors.combo);
    // 콤보 글자 뒤의 알약 (시안: 패널색 + 테두리). 글자 크기에 맞춰 setCombo에서 다시 그린다
    this.comboPill = scene.add.graphics();
    this.comboText.setDepth(1);
    this.panelColors = { fill: colors.panel, edge: colors.edge };
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
    this.comboPill.setVisible(label !== null);
    if (label !== null) this.comboText.setText(label);
    this.drawPill();
  }

  /** 콤보 글자를 감싸는 알약 */
  private drawPill(): void {
    const t = this.comboText;
    const padX = 22;
    const padY = 6;
    const w = t.width + padX * 2;
    const h = t.height + padY * 2;
    this.comboPill
      .clear()
      .fillStyle(this.panelColors.fill, 1)
      .fillRoundedRect(t.x - padX, t.y - h / 2, w, h, h / 2)
      .lineStyle(2.5, this.panelColors.edge, 1)
      .strokeRoundedRect(t.x - padX, t.y - h / 2, w, h, h / 2);
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
    // 콤보 알약이 왼쪽 여백을 넘지 않게 글자를 알약 안쪽 여백만큼 오른쪽에 둔다
    this.comboText.setOrigin(0, 0.5).setPosition(left + 22, area.y + hud.comboY);
    this.bestText.setOrigin(1, 0.5).setPosition(right, area.y + hud.bestY);
    this.pauseButton.setPosition(right - hud.buttonRadius, area.y + hud.buttonY);
    this.drawPill();
  }
}
