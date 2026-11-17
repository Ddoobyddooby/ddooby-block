// 메뉴 (PLAN 6.3). [이어하기](저장된 판이 있을 때만) · [새 게임] · [주간 랭킹] (W3-04) · [테마] (W4-05).
// 메뉴가 뜰 때마다 저장소의 최신 상태를 본다. 부팅 읽기가 늦어 메뉴가 먼저 떴다면, 읽기가 끝난 뒤 다시 그린다.

import Phaser from 'phaser';
import { GAME, VIEW } from '../config';
import { createBlockTextures } from '../view/blockTexture';
import { addButton, type PressLock } from '../view/ui/Button';
import { startRun } from '../online';
import { skipsRanking } from './gameStart';
import { menuButtons, menuButtonYs, type MenuButton } from './menuRules';
import { cancelNewGame, isPreparing } from './newRun';
import { handleMenuButton } from './screenActions';
import { getPersistence } from './persistenceRegistry';
import { showPreparing } from './preparingLabel';
import { RANKING_TEXT } from '../view/rankingText';
import { Backdrop } from '../view/theme/backdrop';
import { MenuLogo } from '../view/theme/logo';
import {
  adoptPreferredTheme,
  clearRunTheme,
  hasPendingTheme,
  setTheme,
  themeOf,
} from '../view/theme/themeSetting';
import { lateThemeAction } from './lateTheme';
import { openThemePicker } from '../view/ThemePicker';
import { Music } from '../view/Music';
import { gameTrack, musicFor } from './musicRules';
import type { ThemeId } from '../themeIds';

const THEME_LABEL = '테마';

const LABELS: Record<MenuButton, string> = {
  resume: '이어하기',
  new: '새 게임',
  ranking: RANKING_TEXT.menuButton,
};

export class MenuScene extends Phaser.Scene {
  private logo!: MenuLogo;
  private backdrop!: Backdrop;
  /** 테마 카드 창이 떠 있으면 그것을 닫는 함수 */
  private closePicker: (() => void) | null = null;
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
    // 메뉴가 뜨는 때가 테마를 바꿔도 안전한 때다: 한 판의 고정을 풀고, 늦게 읽힌 저장 테마를 반영한다
    clearRunTheme(this.registry);
    adoptPreferredTheme(this.registry);
    const theme = themeOf(this);
    this.cameras.main.setBackgroundColor(theme.colors.background);
    this.closed = false;
    this.lock = { pressed: false };
    this.buttons = [];
    this.closePicker = null;
    createBlockTextures(this, theme.id);
    // 배경 음악: 메뉴 곡 (랭킹에서 와도 같은 곡이 이어진다). 이번 테마의 게임 곡은 메뉴가 뜬 뒤 뒤에서 읽는다 (테마를 고르면 메뉴가 다시 떠서 새 곡을 읽는다)
    const music = Music.of(this.game);
    music.play(musicFor('Menu'));
    music.load(this, [musicFor('Menu'), gameTrack(theme.id)]);
    this.backdrop = new Backdrop(this);
    this.logo = new MenuLogo(this);

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.closed = true;
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
      this.logo.destroy();
      cancelNewGame('Menu');
    });
    if (isPreparing()) showPreparing(this);

    // 부팅 읽기가 3초 제한을 넘겨 메뉴가 먼저 떴다면 읽기가 끝나는 때 이어하기 버튼을 보여 준다.
    // load()는 한 번만 실제로 읽고 같은 약속을 돌려주므로 이미 끝났다면 바로 풀린다 (그때는 위에서 이미 반영됨)
    void getPersistence(this.registry)
      ?.load()
      .then(() => {
        if (this.closed) return;
        // 저장된 테마가 늦게 반영됐다면 (부팅 읽기가 제한 시간을 넘김) 메뉴를 새 테마로 다시 만든다.
        // 새 게임을 준비하는 중이면 다시 만들지 않는다: 다시 만들면 SHUTDOWN이 그 요청을 취소한다 (lateTheme.ts)
        if (lateThemeAction(isPreparing(), hasPendingTheme(this.registry)) === 'restart') {
          this.scene.restart();
        } else {
          this.layout();
        }
      });
  }

  /** 로고와 버튼을 화면 크기에 맞춰 가로 가운데에 (다시) 그린다. 이어하기가 있으면 버튼 묶음 전체가 한 칸 아래에서 시작한다 (menuButtonYs) */
  private layout(): void {
    const { menu } = VIEW;
    for (const button of this.buttons) button.destroy();
    this.buttons = [];

    const x = this.scale.width / 2;
    const height = Math.max(this.scale.height, GAME.height);
    this.backdrop.draw();
    this.logo.draw(x, height * menu.titleY);

    const ids = menuButtons(getPersistence(this.registry)?.resumable() != null);
    // 맨 위 버튼은 menu.buttonY에서 시작하고 한 칸씩 내려간다. 이어하기가 있으면 이어하기가 그 자리를 차지하고 [새 게임]·[주간 랭킹]·[테마]가 한 칸씩 내려간다
    const spec = (label: string, primary: boolean) => ({
      label,
      width: menu.buttonW,
      height: menu.buttonH,
      fontSize: menu.buttonTextSize,
      primary,
    });
    const ys = menuButtonYs(ids.length + 1, height, menu); // 마지막은 [테마]
    ids.forEach((id, i) => {
      // 주 버튼(강조색): 이어하기가 있으면 이어하기, 없으면 새 게임
      this.buttons.push(
        addButton(this, x, ys[i]!, spec(LABELS[id], i === 0), () => this.go(id), this.lock),
      );
    });
    // [테마]는 맨 아래. 화면을 떠나지 않으므로 누른 뒤 잠금을 풀어 둔다
    this.buttons.push(
      addButton(
        this,
        x,
        ys[ids.length]!,
        spec(THEME_LABEL, false),
        () => {
          this.lock.pressed = false;
          this.openPicker();
        },
        this.lock,
      ),
    );
  }

  /** Android 뒤로 가기용: 테마 카드 창이 떠 있다 */
  hasOverlay(): boolean {
    return this.closePicker !== null;
  }

  closeOverlay(): void {
    this.closePicker?.();
  }

  /** Android 뒤로 가기 종료: 버튼 누름 잠금이 걸려 있으면(전환 중) 하지 않는다. 확인 창 없이 바로 끝낸다 */
  requestExit(): boolean {
    if (this.lock.pressed) return false;
    this.lock.pressed = true;
    return true;
  }

  private openPicker(): void {
    if (this.closed || this.closePicker) return;
    this.closePicker = openThemePicker(
      this,
      (id) => this.pickTheme(id),
      () => {
        this.closePicker = null;
      },
    );
  }

  /** 테마를 바꾸고 저장한 뒤 메뉴를 새 테마로 다시 만든다 (테마는 메뉴에서만 바꾼다) */
  private pickTheme(id: ThemeId): void {
    this.closePicker = null;
    setTheme(this.registry, id, (value) => {
      void getPersistence(this.registry)?.setTheme(value);
    });
    this.scene.restart();
  }

  /** 화면 크기가 바뀌면 열려 있는 테마 창은 닫고 다시 그린다 (창 위치가 어긋나지 않게) */
  private onResize(): void {
    this.closePicker?.();
    this.layout();
  }

  private go(button: MenuButton): void {
    handleMenuButton(button, {
      lock: this.lock,
      startRun,
      skipOnline: () => skipsRanking(window.location.search, import.meta.env.DEV),
      showWait: () => showPreparing(this),
      startGame: (data) => this.scene.start('Game', data),
      resumeData: () => {
        const resume = getPersistence(this.registry)?.resumable() ?? null;
        return resume === null ? null : { resume };
      },
      startResume: (data) => this.scene.start('Game', data),
      redraw: () => this.layout(),
      openRanking: () => this.scene.start('Ranking'),
    });
  }
}
