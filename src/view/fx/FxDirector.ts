// 연출 감독 (PLAN 6.4): 줄 제거 파티클, 팝업, 화면 흔들림, 전체 비우기 빛, 효과음.
// 판정은 하지 않는다. 문구·흔들림 단계는 순수 함수(popup.ts, shake.ts)가 고르고, 여기서는 그리기·재생만 한다.
// 구조는 ddooby-pang의 FxDirector를 참고했다.
//
// 기다리지 않는 장식(파티클·팝업)은 모두 `live`에 모아 두고, 화면 크기가 바뀌면(`cancelDecor`) 한꺼번에 치운다
// (위치가 어긋난 채 남지 않게). 일시정지 중에는 장식 트윈도 같이 멈췄다가 이어진다 (Game 씬의 트윈 매니저를 쓴다).
// 새 판·씬 종료는 Phaser가 씬을 정리하므로 남지 않는다 (인스턴스는 create마다 새로 만든다).

import Phaser from 'phaser';
import { ANIM, FX, VIEW } from '../../config';
import type { Pos } from '../../core/types';
import { cssColor } from '../../scenes/text';
import { mixColor, TEXTURE } from '../blockTexture';
import { cellCenter, type Layout } from '../layout';
import type { Sfx } from '../Sfx';
import { stopTweensOf, tweenAsync } from '../tween';
import { popupTexts } from './popup';
import { shakeFor, ShakeController } from './shake';

type Decor = Phaser.GameObjects.Image | Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle;

export class FxDirector {
  private readonly live = new Set<Decor>();
  private readonly shaker: ShakeController;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sfx: Sfx,
    private layout: Layout,
  ) {
    // 카메라는 씬이 다시 시작해도 같은 것을 쓰므로 부를 때마다 읽는다
    this.shaker = new ShakeController(
      {
        shake: (d, i, force) => this.scene.cameras.main.shake(d, i, force),
        resetFX: () => this.scene.cameras.main.resetFX(),
      },
      () => this.scene.time.now,
    );
  }

  /** 화면 크기가 바뀌면 장식과 카메라 흔들림을 모두 치운다 (위치가 어긋난 채 남지 않게) */
  setLayout(layout: Layout): void {
    this.layout = layout;
    this.cancelDecor();
    this.shaker.reset();
  }

  /** 남은 파티클·팝업·빛을 바로 치운다 (걸린 트윈도 멈춘다) */
  cancelDecor(): void {
    for (const object of [...this.live]) this.dispose(object);
  }

  /**
   * 씬이 끝날 때: 카메라 흔들림을 치운다. 장식 그림과 트윈은 Phaser가 씬과 함께 정리하므로
   * (이미 정리됐을 수 있어) 여기서 건드리지 않고 목록만 비운다.
   */
  shutdown(): void {
    this.live.clear();
    this.shaker.reset();
  }

  /**
   * `clear` 이벤트가 시작될 때: 팝업·흔들림·효과음. 기다리지 않는다.
   * lines = 지운 줄 수, combo = 이 배치로 갱신된 콤보 (같은 배치의 `score` 이벤트의 값)
   */
  clearStart({ lines, combo }: { lines: number; combo: number }): void {
    this.sfx.play('clear', { level: combo });
    this.shake(shakeFor(lines, combo));
    popupTexts({ lines, combo }).forEach((popup, i, all) => {
      const { popup: cfg } = FX;
      const size = popup.kind === 'line' ? cfg.lineSize : cfg.comboSize;
      const color = popup.kind === 'line' ? cfg.lineColor : VIEW.colors.combo;
      const y =
        this.layout.y + this.layout.height * cfg.lineY + (i - (all.length - 1) / 2) * cfg.stackGap;
      this.popup(popup.text, size, color, y, i * cfg.stagger);
    });
  }

  /** 지워지는 칸 하나의 파티클. order번째 칸이 사라지기 시작할 때 터지도록 지연한다 */
  burstCell(pos: Pos, color: number, order: number): void {
    const { particles: cfg } = FX;
    const { x, y } = cellCenter(this.layout, pos);
    const base = VIEW.colors.blocks[color] ?? VIEW.colors.lineHighlight;
    const tint = mixColor(base, 0xffffff, cfg.whiteMix);
    for (let i = 0; i < cfg.perCell; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Phaser.Math.FloatBetween(cfg.distMin, cfg.distMax);
      const scale = Phaser.Math.FloatBetween(cfg.scaleMin, cfg.scaleMax);
      const spark = this.scene.add
        .image(x, y, TEXTURE.spark)
        .setDepth(FX.depth.particle)
        .setTint(tint)
        .setScale(scale)
        .setAlpha(0);
      this.live.add(spark);
      this.scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist + cfg.gravity,
        scale: 0,
        alpha: { from: 1, to: 0 },
        delay: order * ANIM.clearPerCell,
        duration: Phaser.Math.Between(cfg.lifeMin, cfg.lifeMax),
        ease: 'Quad.easeOut',
        onComplete: () => this.dispose(spark),
      });
    }
  }

  /** `boardClear` 이벤트: 보드 전체 빛 + 큰 팝업 + 센 흔들림 + 효과음. 빛이 꺼질 때까지 기다린다 */
  async playBoardClear(): Promise<void> {
    const { layout } = this;
    const { popup: cfg, boardClear } = FX;
    this.sfx.play('boardClear');
    this.shake(FX.shake.boardClear);
    this.popup(
      '전체 비우기!',
      cfg.boardClearSize,
      cfg.boardClearColor,
      layout.y + layout.height * cfg.boardClearY,
      0,
    );
    const pad = VIEW.boardPad;
    const glow = this.scene.add
      .rectangle(
        layout.x - pad,
        layout.y - pad,
        layout.width + pad * 2,
        layout.height + pad * 2,
        boardClear.glowColor,
      )
      .setOrigin(0)
      .setDepth(FX.depth.glow)
      .setAlpha(0);
    this.live.add(glow);
    await tweenAsync(this.scene, {
      targets: glow,
      alpha: boardClear.glowAlpha,
      duration: ANIM.boardClearGlow / 2,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
    this.dispose(glow);
  }

  /** 글자가 커지며 나타나 잠깐 머물다가 위로 올라가며 사라진다 */
  private popup(text: string, size: number, color: number, y: number, delay: number): void {
    const { popup: cfg } = FX;
    const x = this.layout.x + this.layout.width / 2;
    const label = this.scene.add
      .text(x, y, text, {
        fontFamily: VIEW.fontFamily,
        fontSize: size,
        fontStyle: 'bold',
        color: cssColor(color),
        stroke: cssColor(cfg.strokeColor),
        strokeThickness: cfg.strokeWidth,
      })
      .setOrigin(0.5)
      .setDepth(FX.depth.popup)
      .setScale(cfg.fromScale)
      .setAlpha(0);
    this.live.add(label);
    // 세 단계를 차례로 잇는다. 도중에 dispose로 멈추면(stop) onComplete가 불리지 않아 뒤 단계는 시작하지 않는다
    const { tweens } = this.scene;
    tweens.add({
      targets: label,
      scale: 1,
      alpha: 1,
      delay,
      duration: cfg.popInMs,
      ease: 'Back.easeOut',
      onComplete: () =>
        tweens.add({
          targets: label,
          alpha: 1,
          duration: cfg.holdMs,
          onComplete: () =>
            tweens.add({
              targets: label,
              y: y - cfg.riseY,
              alpha: 0,
              duration: cfg.fadeMs,
              ease: 'Quad.easeIn',
              onComplete: () => this.dispose(label),
            }),
        }),
    });
  }

  private shake(request: { duration: number; intensity: number } | null): void {
    if (request !== null) this.shaker.request(request);
  }

  private dispose(object: Decor): void {
    if (!this.live.delete(object)) return;
    stopTweensOf(this.scene, object);
    object.destroy();
  }
}
