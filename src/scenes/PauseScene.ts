// 일시정지 창 (PLAN 6.1). GameScene 위에 띄우고(launch) GameScene은 멈춘다(pause).
// 반투명 덮개가 아래 입력을 삼킨다. 나가기·다시 하기는 결과가 아니므로 저장하지 않는다.
// ddooby-pang의 PauseScene에서 복사해 맞췄다.

import Phaser from 'phaser';
import { VIEW } from '../config';
import { addButton, type PressLock } from '../view/ui/Button';
import { addMuteButton } from '../view/ui/MuteButton';
import { drawPanel } from '../view/ui/Panel';
import { Sfx } from '../view/Sfx';
import { readMuted, setMuted } from './muteSetting';
import { getPersistence } from './persistenceRegistry';
import { startRun } from '../online';
import { skipsRanking } from './gameStart';
import { cancelNewGame, isPreparing } from './newRun';
import { RestartGate } from './restartGate';
import { handlePauseButton } from './screenActions';
import { showPreparing } from './preparingLabel';
import { pauseButtons, RETRY_EVENT, type PauseButton } from './pauseRules';
import { cssColor } from './text';

const LABELS: Record<PauseButton, string> = {
  resume: '계속',
  retry: '다시 하기',
  menu: '메뉴',
};

export class PauseScene extends Phaser.Scene {
  /** resize로 다시 그리는 중: 화면을 떠난 것이 아니므로 진행 중인 새 판 준비를 취소하지 않는다 (예약은 합친다, restartGate.ts) */
  private readonly gate = new RestartGate();
  private lock: PressLock = { pressed: false };

  constructor() {
    super('Pause');
  }

  create(): void {
    this.gate.started();
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

    const sfx = new Sfx(this);
    // 음소거 버튼: 판 오른쪽 위. 설정은 저장소에도 쓴다 (muteSetting.ts)
    addMuteButton(
      this,
      cx + pause.panelW / 2 - pause.muteInset,
      titleY,
      pause.muteRadius,
      readMuted(this.registry),
      (muted) => {
        // 저장값과 실제 출력(사운드 매니저)을 같이 바꾼다. 음소거를 켤 때는 소리가 없고, 끌 때만 확인음이 난다
        setMuted(this.registry, this.sound, muted, (value) => {
          void getPersistence(this.registry)?.setMuted(value);
        });
        if (!muted) sfx.play('button');
      },
    );

    const firstY = top + pause.panelPad + pause.titleSize + pause.titleGap + pause.buttonH / 2;
    const lock: PressLock = { pressed: false };
    this.lock = lock;
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
      // 다시 그리기가 아니라 화면을 떠나는 것이면 준비 중이던 요청은 무효 (늦은 응답이 새 판을 시작하지 않는다)
      if (!this.gate.restarting) cancelNewGame('Pause');
    });
    // 다시 그려도 준비 중이면 "준비 중…"을 계속 보인다 (준비가 끝나면 화면이 새 판으로 넘어간다)
    if (isPreparing()) showPreparing(this);
  }

  private relayout(): void {
    this.gate.request(() => this.scene.restart());
  }

  private go(button: PauseButton): void {
    handlePauseButton(button, {
      lock: this.lock,
      startRun,
      skipOnline: () => skipsRanking(window.location.search, import.meta.env.DEV),
      showWait: () => showPreparing(this),
      startGame: (data) => this.scene.start('Game', data),
      resumeGame: () => {
        this.scene.resume('Game');
        this.scene.stop();
      },
      abandonGame: () => this.scene.get('Game').events.emit(RETRY_EVENT),
      stopGame: () => this.scene.stop('Game'),
      goMenu: () => this.scene.start('Menu'),
    });
  }
}
