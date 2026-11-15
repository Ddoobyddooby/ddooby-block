// 게임 화면. 판정은 core가 하고, 여기서는 입력을 core에 넘기고 돌아온 이벤트를 순서대로 재생한다.

import Phaser from 'phaser';
import { REPLAY, SAVE, VIEW } from '../config';
import { createGame, previewPlacement } from '../core/engine';
import type { GameEvent, GameState, PlaceAction, Pos } from '../core/types';
import { createBlockTextures } from '../view/blockTexture';
import { diffBoard } from '../view/boardCheck';
import { BoardView } from '../view/BoardView';
import { DragController, type PointerLike } from '../view/DragController';
import { FxDirector } from '../view/fx/FxDirector';
import { unplaceableSlots } from '../view/fx/trayDim';
import { Hud } from '../view/Hud';
import { boardLayout, screenLayout, type Layout, type ScreenLayout } from '../view/layout';
import { Sfx } from '../view/Sfx';
import { TrayView } from '../view/TrayView';
import { readBest, recordBest } from './bestScore';
import { fillState, parseFillParam } from './devFill';
import type { GameStartData } from './gameStart';
import { canPause, RETRY_EVENT } from './pauseRules';
import { getPersistence } from './persistenceRegistry';
import { PlayClock } from './playClock';
import { playEvents } from './playback';
import { RunSession } from './runSession';
import { parseSeedParam, randomSeed } from './seed';
import { cssColor } from './text';

export class GameScene extends Phaser.Scene {
  private seed = 0;
  /** 화면에 보이는 상태. 연출이 끝나야 바뀐다. 저장하는 상태는 `session.state`(배치가 수락된 순간 바뀐다) */
  private state!: GameState;
  /** 배치 로그·저장용 상태·플레이 시계·200ms 간격 판정 (PLAN 6.2) */
  private session!: RunSession;
  private clock!: PlayClock;
  private startData: GameStartData = {};
  /** `place` 이벤트를 재생하는 중 */
  private playing = false;
  private screen!: ScreenLayout;
  private layout!: Layout;
  private boardView!: BoardView;
  private trayView!: TrayView;
  private dragController!: DragController;
  private hud!: Hud;
  private fx!: FxDirector;
  private sfx!: Sfx;
  /**
   * (seed, 배치 로그)만으로 리플레이할 수 있는 판인가. DEV `?fill=`로 시작한 판은 빈 보드에서 시작하지 않아 false다.
   * false인 판은 저장하지 않고(저장된 run을 지우지도 않는다) 최고 점수에도 반영하지 않는다. W3(점수 제출)도 뺀다 (devFill.ts 설명).
   */
  private replayable = true;
  /** 일시정지 중 (PauseScene이 떠 있는 동안) */
  private paused = false;
  /** 씬이 끝남(SHUTDOWN). 일시정지(PAUSED)와 다르다 */
  private ended = false;
  private gameOverUi: Phaser.GameObjects.GameObject[] = [];
  /** 판 번호. 씬 객체는 다시 쓰이므로, 끝난 판의 재생이 새 판을 건드리지 않게 구분한다 */
  private run = 0;

  constructor() {
    super('Game');
  }

  init(data?: GameStartData): void {
    this.startData = data ?? {};
  }

  create(): void {
    // 이어하기: 저장된 판의 seed·상태·로그·시계로 시작한다. 이어하는 판에는 ?fill=을 쓰지 않는다
    const resume = this.startData.resume ?? null;
    const fill =
      resume === null ? parseFillParam(window.location.search, import.meta.env.DEV) : null;
    this.seed = resume?.saved.seed ?? parseSeedParam(window.location.search) ?? randomSeed();
    this.state =
      resume !== null
        ? resume.state
        : fill === null
          ? createGame(this.seed)
          : fillState(fill, this.seed);
    this.replayable = fill === null;
    // 시계는 이어한 판이면 저장된 elapsedMs에서 시작한다. 화면이 숨겨진 채 시작하면 멈춰 둔다
    this.clock = new PlayClock(() => performance.now(), resume?.saved.elapsedMs ?? 0);
    if (document.hidden) this.clock.block('hidden');
    this.session = new RunSession({
      seed: this.seed,
      state: this.state,
      placements: resume?.saved.placements,
      runId: resume?.saved.runId ?? null,
      clock: this.clock,
      store: getPersistence(this.registry),
      replayable: this.replayable,
      minIntervalMs: REPLAY.minIntervalMs,
      maxPlacements: SAVE.maxRunPlacements,
    });
    this.playing = false;
    this.paused = false;
    this.ended = false;
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
    this.sfx = new Sfx(this);
    this.fx = new FxDirector(this, this.sfx, this.layout);
    this.refreshTrayDim();

    const { boardView, trayView } = this;
    this.dragController = new DragController({
      lock: () => ({
        playing: this.playing,
        paused: this.paused,
        over: this.state.over,
        cooling: this.session.cooling(),
      }),
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
    // 화면이 숨겨지면 시계를 멈추고 지금까지의 플레이 시간을 저장한다. 숨겨진 동안에는 배치를 받지 않는다
    const onHidden = (): void => {
      cancel();
      this.clock.block('hidden');
      this.session.checkpoint();
    };
    const onVisible = (): void => this.clock.unblock('hidden');
    this.game.events.on(Phaser.Core.Events.HIDDEN, onHidden);
    this.game.events.on(Phaser.Core.Events.VISIBLE, onVisible);
    // [다시 하기]: 저장된 run을 지운다
    const onRetry = (): void => this.session.abandon();
    this.events.on(RETRY_EVENT, onRetry);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    // [계속]으로 돌아오면 입력 잠금을 풀고 멈췄던 소리를 이어서 낸다
    const onResume = (): void => {
      this.paused = false;
      this.clock.unblock('paused');
      // 음소거를 켰다면 사운드 매니저의 mute가 출력을 막고 있어 들리지 않는다
      this.sfx.resume();
    };
    this.events.on(Phaser.Scenes.Events.RESUME, onResume);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ended = true;
      // 정책: 씬이 끝나면(다시 하기·메뉴) 게임이 낸 소리는 이어 내지 않고 멈춰 정리한다 (이전 판의 소리가 뒤늦게 나지 않게).
      // 방금 누른 버튼 소리는 다른 Sfx가 냈으므로 끊기지 않는다. 카메라 흔들림도 같이 치운다
      this.sfx.stopAll();
      this.fx.shutdown();
      this.events.off(Phaser.Scenes.Events.RESUME, onResume);
      this.game.events.off(Phaser.Core.Events.BLUR, cancel);
      this.game.events.off(Phaser.Core.Events.HIDDEN, onHidden);
      this.game.events.off(Phaser.Core.Events.VISIBLE, onVisible);
      this.events.off(RETRY_EVENT, onRetry);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    });

    if (import.meta.env.DEV) {
      console.info('seed', this.seed);
      if (fill !== null) console.info('fill', fill, '(이 판은 리플레이 불가)');
    }
  }

  /** `?fill=`이 아닌 판만 true. 저장·제출 쪽(W2-05·W3)이 읽는다 */
  get isReplayable(): boolean {
    return this.replayable;
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
    this.fx.setLayout(this.layout);
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
    // 일시정지 동안은 플레이 시간이 흐르지 않는다. 지금까지의 시간을 저장한다
    this.clock.block('paused');
    this.session.checkpoint();
    this.dragController.cancel();
    // 게임이 낸 연출 소리도 같이 멈춘다 ([계속]에서 이어진다). 일시정지 중에는 새 소리가 시작되지 않는다 (재생 루프가 멈춘다).
    // 일시정지 버튼을 누른 소리 같은 다른 소리는 건드리지 않는다
    this.sfx.pause();
    this.scene.launch('Pause');
    this.scene.pause();
  }

  /**
   * 배치를 시도한다 (RunSession: 시계·간격 판정 → core `place` → 로그·저장). 수락되면 이벤트 재생을 시작한다.
   * 저장은 수락된 순간 끝난 판단이고 연출을 기다리지 않는다. 거부되면 조각은 트레이로 돌아간다
   */
  private drop(action: PlaceAction): boolean {
    const outcome = this.session.tryPlace(action);
    if (!outcome.ok) {
      this.sfx.play('return');
      return false;
    }
    void this.play(outcome.result.events, outcome.result.state, action);
    return true;
  }

  /** 이벤트를 순서대로 재생한다. 재생 중에는 조각을 집을 수 없고(`playing`), 끝나면 상태를 바꾼다 */
  private async play(events: GameEvent[], next: GameState, action: PlaceAction): Promise<void> {
    const { run } = this;
    this.playing = true;
    // 줄 제거 연출은 이 배치의 콤보를 알아야 한다 (clear 이벤트에는 없고 score 이벤트에 있다)
    const scored = events.find((event) => event.type === 'score');
    const combo = scored?.type === 'score' ? scored.combo : 0;
    const completed = await playEvents(events, (event) => this.playEvent(event, combo), {
      // 판이 바뀌었거나 씬이 끝났으면 버린다. 일시정지는 버리지 않고 [계속]까지 기다린다
      isCurrent: () => run === this.run && !this.ended,
      isPaused: () => this.paused,
      waitResume: () => this.waitResume(),
    });
    if (!completed) return;
    this.state = next;
    this.refreshTrayDim();
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
          placementCount: this.session.placements.length,
          placements: this.session.placements,
          diff,
        });
      }
    }
  }

  /** 이벤트 하나의 연출. 연출이 끝나면 풀린다 */
  private async playEvent(event: GameEvent, combo: number): Promise<void> {
    switch (event.type) {
      case 'place':
        this.sfx.play('place');
        this.trayView.remove(event.trayIndex);
        await this.boardView.playPlace(event);
        break;
      case 'clear':
        // 팝업·흔들림·소리는 기다리지 않고 시작하고, 칸이 터지는 연출만 기다린다
        this.fx.clearStart({ lines: event.rows.length + event.cols.length, combo });
        await this.boardView.playClear(event, ({ pos, color, order }) =>
          this.fx.burstCell(pos, color, order),
        );
        break;
      case 'tray':
        await this.trayView.playTrayIn(event.tray);
        break;
      case 'gameOver':
        this.sfx.play('gameOver');
        this.showGameOver();
        break;
      case 'score':
        this.hud.setScore(this.hud.shownScore + event.delta);
        // ?fill= 판은 최고 점수에 반영하지 않는다 (화면 표시값 포함)
        if (this.replayable) this.hud.setBest(recordBest(this.game.registry, this.hud.shownScore));
        break;
      case 'combo':
        this.hud.setCombo(event.combo);
        break;
      case 'boardClear':
        await this.fx.playBoardClear();
        break;
    }
  }

  /** 놓을 수 없는 트레이 조각을 흐리게 한다. 판정은 core `canPlaceAnywhere` (view/fx/trayDim.ts) */
  private refreshTrayDim(): void {
    this.trayView.setDimmed(unplaceableSlots(this.state.board, this.state.tray));
  }

  /** [계속](RESUME)이나 씬 종료(SHUTDOWN) 중 먼저 오는 쪽에서 풀린다. 둘 다 리스너를 남기지 않는다 */
  private waitResume(): Promise<void> {
    return new Promise((resolve) => {
      const done = (): void => {
        this.events.off(Phaser.Scenes.Events.RESUME, done);
        this.events.off(Phaser.Scenes.Events.SHUTDOWN, done);
        resolve();
      };
      this.events.once(Phaser.Scenes.Events.RESUME, done);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, done);
    });
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
