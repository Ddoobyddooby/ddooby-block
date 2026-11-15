// 게임 화면. 판정은 core가 하고, 여기서는 입력을 core에 넘기고 돌아온 이벤트를 순서대로 재생한다.

import Phaser from 'phaser';
import { VIEW } from '../config';
import { createGame, place, previewPlacement } from '../core/engine';
import type { GameEvent, GameState, PlaceAction, Pos } from '../core/types';
import { createBlockTextures } from '../view/blockTexture';
import { diffBoard } from '../view/boardCheck';
import { BoardView } from '../view/BoardView';
import { DragController, type PointerLike } from '../view/DragController';
import { Hud } from '../view/Hud';
import { boardLayout, screenLayout, type Layout, type ScreenLayout } from '../view/layout';
import { TrayView } from '../view/TrayView';
import { readBest, recordBest } from './bestScore';
import { canPause } from './pauseRules';
import { parseSeedParam, randomSeed } from './seed';
import { cssColor } from './text';

export class GameScene extends Phaser.Scene {
  private seed = 0;
  private state!: GameState;
  /** 성공한 배치 (DEV 대조가 어긋났을 때 재현용으로 찍는다. 저장은 W2-05) */
  private placements: PlaceAction[] = [];
  /** `place` 이벤트를 재생하는 중 */
  private playing = false;
  private screen!: ScreenLayout;
  private layout!: Layout;
  private boardView!: BoardView;
  private trayView!: TrayView;
  private dragController!: DragController;
  private hud!: Hud;
  /** 일시정지 중 (PauseScene이 떠 있는 동안) */
  private paused = false;
  private gameOverUi: Phaser.GameObjects.GameObject[] = [];
  /** 판 번호. 씬 객체는 다시 쓰이므로, 끝난 판의 재생이 새 판을 건드리지 않게 구분한다 */
  private run = 0;

  constructor() {
    super('Game');
  }

  create(): void {
    this.seed = parseSeedParam(window.location.search) ?? randomSeed();
    this.state = createGame(this.seed);
    this.placements = [];
    this.playing = false;
    this.paused = false;
    this.gameOverUi = [];
    this.run += 1;

    this.cameras.main.setBackgroundColor(VIEW.colors.background);
    createBlockTextures(this);
    this.screen = screenLayout(this.scale.height, this.scale.width);
    this.layout = boardLayout(this.screen);
    this.hud = new Hud(this, this.screen, () => this.pause(), {
      score: this.state.score,
      best: readBest(this.game.registry),
      combo: this.state.combo,
    });
    this.boardView = new BoardView(this, this.layout);
    this.boardView.render(this.state.board);
    this.trayView = new TrayView(this, this.screen);
    this.trayView.render(this.state.tray);

    const { boardView, trayView } = this;
    this.dragController = new DragController({
      lock: () => ({ playing: this.playing, paused: this.paused, over: this.state.over }),
      screen: () => this.screen,
      layout: () => this.layout,
      pieceAt: (index) => trayView.pieceAt(index),
      lift: (index, topLeft) => trayView.lift(index, topLeft),
      returnHome: (index) => trayView.returnHome(index),
      preview: (trayIndex, anchor) => previewPlacement(this.state, toAction(trayIndex, anchor)),
      showPreview: (preview, color) => boardView.showPreview(preview, color),
      hidePreview: () => boardView.hidePreview(),
      drop: (trayIndex, anchor) => this.drop(toAction(trayIndex, anchor)),
    });

    const drag = this.dragController;
    const cancel = (): void => drag.cancel();
    this.input.on('pointerdown', (pointer: PointerLike) => drag.onDown(pointer));
    this.input.on('pointermove', (pointer: PointerLike) => drag.onMove(pointer));
    // 캔버스 안에서 떼면 놓기를 시도한다 (touchcancel이면 취소)
    this.input.on('pointerup', (pointer: PointerLike) => drag.onUp(pointer));
    // 캔버스를 벗어나면 드래그를 취소한다. 화면 밖에서 뗀 것은 놓기로 치지 않는다 (보이지 않는 곳에서 놓이면 안 된다).
    // 보통 gameout이 먼저 와서 취소되고, pointerupoutside는 gameout이 오지 않았을 때의 안전장치다 (이때도 놓지 않는다).
    // 창이 가려져도 취소한다 (조각이 손가락에 붙은 채 남지 않게)
    this.input.on('pointerupoutside', (pointer: PointerLike) => drag.onUpOutside(pointer));
    this.input.on('gameout', cancel);
    this.game.events.on(Phaser.Core.Events.BLUR, cancel);
    this.game.events.on(Phaser.Core.Events.HIDDEN, cancel);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    // [계속]으로 돌아오면 입력 잠금을 푼다
    const onResume = (): void => {
      this.paused = false;
    };
    this.events.on(Phaser.Scenes.Events.RESUME, onResume);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.RESUME, onResume);
      this.game.events.off(Phaser.Core.Events.BLUR, cancel);
      this.game.events.off(Phaser.Core.Events.HIDDEN, cancel);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    });

    if (import.meta.env.DEV) console.info('seed', this.seed);
  }

  override update(): void {
    this.dragController.update();
  }

  /** 화면 크기가 바뀌면 구역을 다시 계산해 그림을 옮긴다. 하던 드래그는 취소한다 */
  private onResize(): void {
    this.dragController.cancel();
    this.screen = screenLayout(this.scale.height, this.scale.width);
    this.layout = boardLayout(this.screen);
    this.boardView.setLayout(this.layout);
    this.trayView.setLayout(this.screen);
    this.hud.setLayout(this.screen);
    if (this.gameOverUi.length > 0) this.showGameOver();
  }

  /**
   * 일시정지 버튼. 하던 드래그는 취소해 조각을 트레이로 돌려보내고, PauseScene을 띄운 뒤 이 씬을 멈춘다.
   * 이벤트 재생 중에도 멈출 수 있다: 씬이 멈추면 트윈도 같이 멈췄다가 [계속] 뒤에 이어서 끝까지 재생된다.
   */
  private pause(): void {
    if (!canPause({ over: this.state.over || this.gameOverUi.length > 0, paused: this.paused })) {
      return;
    }
    this.paused = true;
    this.dragController.cancel();
    this.scene.launch('Pause');
    this.scene.pause();
  }

  /** core `place`를 부르고, 성공하면 이벤트 재생을 시작한다 */
  private drop(action: PlaceAction): boolean {
    const result = place(this.state, action);
    if (!result.ok) return false;
    this.placements.push(action);
    void this.play(result.events, result.state, action);
    return true;
  }

  /** 이벤트를 순서대로 재생한다. 재생 중에는 조각을 집을 수 없고(`playing`), 끝나면 상태를 바꾼다 */
  private async play(events: GameEvent[], next: GameState, action: PlaceAction): Promise<void> {
    const { run } = this;
    this.playing = true;
    for (const event of events) {
      switch (event.type) {
        case 'place':
          this.trayView.remove(event.trayIndex);
          await this.boardView.playPlace(event);
          break;
        case 'clear':
          await this.boardView.playClear(event);
          break;
        case 'tray':
          await this.trayView.playTrayIn(event.tray);
          break;
        case 'gameOver':
          this.showGameOver();
          break;
        case 'score':
          this.hud.setScore(this.hud.shownScore + event.delta);
          this.hud.setBest(recordBest(this.game.registry, this.hud.shownScore));
          break;
        case 'combo':
          this.hud.setCombo(event.combo);
          break;
        default:
          // boardClear 연출은 W2-04
          break;
      }
      // 재생 도중에 씬이 끝났거나 새 판이 시작됐으면 그만둔다
      if (run !== this.run || !this.sys.isActive()) return;
    }
    this.state = next;
    this.playing = false;

    if (import.meta.env.DEV) {
      if (this.hud.shownScore !== next.score || this.hud.comboVisible !== next.combo >= 1) {
        console.error('HUD ≠ state', {
          seed: this.seed,
          hudScore: this.hud.shownScore,
          score: next.score,
          hudCombo: this.hud.comboVisible,
          combo: next.combo,
        });
      }
      const diff = diffBoard(this.boardView.filledCells(), next.board);
      if (diff.length > 0) {
        console.error('view ≠ board', {
          seed: this.seed,
          placement: action,
          placementCount: this.placements.length,
          placements: this.placements,
          diff,
        });
      }
    }
  }

  /** "게임 오버" 글자(임시, 화면은 W2-06). 그 뒤 화면을 누르면 메뉴로 돌아간다 */
  private showGameOver(): void {
    const first = this.gameOverUi.length === 0;
    for (const object of this.gameOverUi) object.destroy();
    const { width, height } = this.scale;
    const { gameOver, colors, fontFamily, depth } = VIEW;
    const overlay = this.add
      .rectangle(0, 0, width, height, colors.overlay, gameOver.overlayAlpha)
      .setOrigin(0)
      .setDepth(depth.overlay);
    const title = this.add
      .text(width / 2, height / 2, '게임 오버', {
        fontFamily,
        fontSize: gameOver.titleSize,
        fontStyle: 'bold',
        color: cssColor(colors.text),
      })
      .setOrigin(0.5)
      .setDepth(depth.overlay);
    const hint = this.add
      .text(width / 2, height / 2 + gameOver.hintGap, '화면을 누르면 메뉴로', {
        fontFamily,
        fontSize: gameOver.hintSize,
        color: cssColor(colors.textDim),
      })
      .setOrigin(0.5)
      .setDepth(depth.overlay);
    this.gameOverUi = [overlay, title, hint];
    if (first) this.input.once('pointerdown', () => this.scene.start('Menu'));
  }
}

function toAction(trayIndex: number, anchor: Pos): PlaceAction {
  return { trayIndex, row: anchor.r, col: anchor.c };
}
