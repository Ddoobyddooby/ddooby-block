// 메뉴 (PLAN 6.3). [이어하기](저장된 판이 있을 때만) · [새 게임]. 랭킹은 3주차.
// 메뉴가 뜰 때마다 저장소의 최신 상태를 본다. 부팅 읽기가 늦어 메뉴가 먼저 떴다면, 읽기가 끝난 뒤 다시 그린다.

import Phaser from 'phaser';
import { GAME, VIEW } from '../config';
import { addButton, type PressLock } from '../view/ui/Button';
import { startRun } from '../online';
import { skipsRanking, type GameStartData } from './gameStart';
import { menuButtons, type MenuButton } from './menuRules';
import { requestNewGame } from './newRun';
import { getPersistence } from './persistenceRegistry';
import { showPreparing } from './preparingLabel';
import { cssColor } from './text';

const LABELS: Record<MenuButton, string> = {
  resume: '이어하기',
  new: '새 게임',
};

export class MenuScene extends Phaser.Scene {
  private title!: Phaser.GameObjects.Text;
  private buttons: Phaser.GameObjects.Container[] = [];
  /** 씬이 끝남. 늦게 끝난 저장소 읽기가 끝난 메뉴를 건드리지 않게 한다 */
  private closed = false;
  /**
   * 이 메뉴가 떠 있는 동안 전환 요청은 최대 한 번이다. 다시 그려도(resize·늦은 읽기 완료) 같은 잠금을 쓴다.
   * 버려진 버튼의 늦은 누름은 실행되지 않고 잠금이 풀린다 (view/ui/pressLock.ts)
   */
  private lock: PressLock = { pressed: false };

  constructor() {
    super('Menu');
  }

  create(): void {
    const { menu, colors, fontFamily } = VIEW;
    this.cameras.main.setBackgroundColor(colors.background);
    this.closed = false;
    this.lock = { pressed: false };
    this.buttons = [];

    this.title = this.add
      .text(0, 0, 'Ddooby Block', {
        fontFamily,
        fontSize: menu.titleSize,
        fontStyle: 'bold',
        color: cssColor(colors.text),
      })
      .setOrigin(0.5);

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.closed = true;
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });

    // 부팅 읽기가 3초 제한을 넘겨 메뉴가 먼저 떴다면 읽기가 끝나는 때 이어하기 버튼을 보여 준다.
    // load()는 한 번만 실제로 읽고 같은 약속을 돌려주므로 이미 끝났다면 바로 풀린다 (그때는 위에서 이미 반영됨)
    void getPersistence(this.registry)
      ?.load()
      .then(() => {
        if (!this.closed) this.layout();
      });
  }

  /** 제목과 버튼을 화면 크기에 맞춰 가로 가운데에 (다시) 그린다. [새 게임]은 이어하기 유무와 상관없이 같은 자리다 */
  private layout(): void {
    const { menu, colors } = VIEW;
    for (const button of this.buttons) button.destroy();
    this.buttons = [];

    const x = this.scale.width / 2;
    const height = Math.max(this.scale.height, GAME.height);
    this.title.setPosition(x, height * menu.titleY);

    const ids = menuButtons(getPersistence(this.registry)?.resumable() != null);
    ids.forEach((id, i) => {
      const y = height * menu.buttonY - (ids.length - 1 - i) * menu.buttonStep;
      // 주 버튼(파랑): 이어하기가 있으면 이어하기, 없으면 새 게임
      const primary = i === 0;
      this.buttons.push(
        addButton(
          this,
          x,
          y,
          {
            label: LABELS[id],
            width: menu.buttonW,
            height: menu.buttonH,
            radius: menu.buttonRadius,
            fontSize: menu.buttonTextSize,
            fill: primary ? colors.button : colors.uiFill,
            textColor: primary ? colors.buttonText : colors.text,
          },
          () => this.go(id),
          this.lock,
        ),
      );
    });
  }

  private go(button: MenuButton): void {
    if (button === 'new') {
      // 서버에서 새 run을 받는 동안(최대 2.5초) 기다렸다가 시작한다. 실패하면 오프라인 판으로 바로 시작한다 (newRun.ts)
      requestNewGame({
        startRun,
        skipOnline: () => skipsRanking(window.location.search, import.meta.env.DEV),
        isAlive: () => !this.closed,
        showWait: () => showPreparing(this),
        begin: (data) => this.scene.start('Game', data),
      });
      return;
    }
    // 누르는 순간의 저장 상태를 다시 본다. 그 사이 없어졌다면 시작하지 않고 메뉴를 다시 그린다
    const resume = getPersistence(this.registry)?.resumable() ?? null;
    if (resume === null) {
      // 이어하기가 없어졌다: 전환하지 않고 다시 그린다. 다시 누를 수 있게 잠금을 푼다
      this.lock.pressed = false;
      this.layout();
      return;
    }
    const data: GameStartData = { resume };
    this.scene.start('Game', data);
  }
}
