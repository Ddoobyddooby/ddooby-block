// 게임 오버 화면 (PLAN 6.3). 끝난 GameScene 위에 띄운다(launch). 보드가 뒤에 보인다.
// 점수·최고 점수·최고 기록 갱신 여부는 GameScene이 계산해 넘긴다 (gameOverRules.ts). 저장은 이미 끝났다 (게임 오버 때 RunSession이 한다).

import Phaser from 'phaser';
import { VIEW } from '../config';
import { addButton, type PressLock } from '../view/ui/Button';
import { drawPanel } from '../view/ui/Panel';
import {
  gameOverButtons,
  gameOverTexts,
  inputDelayLeft,
  type GameOverButton,
  type GameOverData,
} from './gameOverRules';
import { startRun } from '../online';
import { skipsRanking } from './gameStart';
import { NicknameFlow } from './nicknameFlow';
import { fakeSubmit } from './nicknameDev';
import { parseFakeRanking } from './nicknameGate';
import { requestNewGame } from './newRun';
import { showPreparing } from './preparingLabel';
import { currentWeek, rankingLine, type RankingTracker } from './rankingResult';
import { cssColor } from './text';

const LABELS: Record<GameOverButton, string> = {
  retry: '다시 하기',
  menu: '메뉴',
};

/**
 * 화면 크기가 바뀌어 다시 그릴 때는 입력 지연을 또 주지 않는다 (unlockAt).
 * ranking: 이 판의 점수 제출 진행 (W3-03). 랭킹 대상이 아닌 판(run 없음, `?fill=`, `?over` 미리보기)에는 없다: 결과 줄도, 닉네임 창도 없다
 */
type SceneData = GameOverData & { unlockAt?: number; ranking?: RankingTracker | null };

export class GameOverScene extends Phaser.Scene {
  private data0: GameOverData = { score: 0, best: 0, newBest: false };
  /** 버튼 입력이 풀리는 시각 (performance.now 기준). 처음 뜰 때 정하고 resize로 다시 그려도 그대로 쓴다 */
  private unlockAt = 0;
  private ranking: RankingTracker | null = null;
  /** 이 게임 오버가 새로 떴다 (resize로 다시 그린 것이 아니다) */
  private fresh = true;
  /** resize로 다시 그리는 중: 닉네임 창을 지우지 않고 넘긴다 (키보드가 올라오며 resize가 나도 입력 중인 창이 사라지지 않게) */
  private redrawing = false;
  /** 점수 제출이 성공한 뒤 닉네임을 묻는 진행 (W3-03). 화면을 떠날 때 끝낸다 */
  private nickname: NicknameFlow | null = null;
  /** 제출 결과를 기다리는 닉네임 묻기의 구독. resize로 다시 그려도 이어지고, 화면을 떠날 때 끊는다 */
  private nicknameUnsub: (() => void) | null = null;

  constructor() {
    super('GameOver');
  }

  init(data?: SceneData): void {
    if (data !== undefined) {
      this.data0 = { score: data.score, best: data.best, newBest: data.newBest };
      this.fresh = data.unlockAt === undefined;
      this.unlockAt = data.unlockAt ?? performance.now() + VIEW.gameOver.inputDelayMs;
      this.ranking = data.ranking ?? null;
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
    const textRows: {
      text: string;
      size: number;
      color: number;
      bold: boolean;
      gap: number;
      ranking?: true;
    }[] = [
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
    if (this.ranking !== null) {
      textRows.push({
        text: rankingLine(this.ranking.state, currentWeek(Date.now())),
        size: g.rankingSize,
        color: colors.textDim,
        bold: false,
        gap: g.textGap,
        ranking: true,
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
    let rankingText: Phaser.GameObjects.Text | null = null;
    for (const row of textRows) {
      const text = this.add
        .text(cx, y + row.size / 2, row.text, {
          fontFamily,
          fontSize: row.size,
          fontStyle: row.bold ? 'bold' : 'normal',
          color: cssColor(row.color),
        })
        .setOrigin(0.5);
      if (row.ranking) rankingText = text;
      y += row.size + row.gap;
    }
    // 제출 결과가 오면 결과 줄을 바꾼다. 화면(이 create)이 끝나면 구독을 끊는다 (늦은 응답이 지워진 글자를 건드리지 않게)
    const unsubscribeLine = this.ranking?.subscribe((state) => {
      rankingText?.setText(rankingLine(state, currentWeek(Date.now())));
    });

    const firstY = y + g.buttonsGap + g.buttonH / 2;
    // 처음 뜬 뒤 잠시는 눌리지 않는다 (PressLock이 눌린 상태로 시작했다가 남은 시간이 지나면 풀린다). resize 뒤에도 남은 시간만 적용
    const left = inputDelayLeft(this.unlockAt, performance.now());
    const lock: PressLock = { pressed: left > 0 };
    if (left > 0) {
      this.time.delayedCall(left, () => {
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
      unsubscribeLine?.();
      rankingText = null;
      if (!this.redrawing) this.endNickname();
    });

    // 닉네임 묻기 (W3-03): 점수 제출이 성공한 뒤에만, 새로 뜬 화면에서 한 번 (resize로 다시 그려도 이어진다).
    // DEV `?ranking=fake`는 온라인 없이 가짜 제출로 창만 띄운다 (프로덕션 빌드에서는 그 분기가 지워진다)
    if (this.fresh && !this.redrawing) {
      this.endNickname();
      if (import.meta.env.DEV && parseFakeRanking(window.location.search, true)) {
        this.nickname = new NicknameFlow(this.game.canvas);
        this.nickname.beginFake(fakeSubmit);
      } else if (this.ranking !== null) {
        const flow = new NicknameFlow(this.game.canvas);
        this.nickname = flow;
        const state = this.ranking.state;
        if (state.phase === 'done') flow.afterSubmit(state.outcome);
        else {
          this.nicknameUnsub = this.ranking.subscribe((next) => {
            if (next.phase === 'done') flow.afterSubmit(next.outcome);
          });
        }
      }
    }
    this.redrawing = false;
    this.fresh = false;
  }

  private redraw(): void {
    this.redrawing = true;
    this.scene.restart({
      ...this.data0,
      unlockAt: this.unlockAt,
      ranking: this.ranking,
    });
  }

  private endNickname(): void {
    this.nicknameUnsub?.();
    this.nicknameUnsub = null;
    this.nickname?.end();
    this.nickname = null;
  }

  private go(button: GameOverButton): void {
    if (button === 'retry') {
      // [다시 하기]: 서버에서 새 run을 받는 동안(최대 2.5초) 기다렸다가 시작한다. 실패하면 오프라인 판으로 바로 시작한다 (newRun.ts)
      requestNewGame({
        startRun,
        skipOnline: () => skipsRanking(window.location.search, import.meta.env.DEV),
        isAlive: () => this.scene.isActive(),
        showWait: () => showPreparing(this),
        begin: (data) => {
          // 끝난 Game 씬을 끝낸다 (run은 게임 오버 때 이미 지워졌다). DEV `?over`에서는 Game 씬이 없어도 상관없다
          this.scene.stop('Game');
          this.scene.start('Game', data);
        },
      });
      return;
    }
    this.scene.stop('Game');
    this.scene.start('Menu');
  }
}
