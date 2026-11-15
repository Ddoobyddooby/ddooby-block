// 트레이: 슬롯 3개의 조각을 그린다. 조각 하나는 Container이고 안에 칸 그림이 실제 칸 크기로 들어 있다.
// 트레이에서는 Container를 VIEW.trayScale로 줄이고, 드래그 중에는 1로 키운다.

import type Phaser from 'phaser';
import { ANIM, FX, VIEW } from '../config';
import { getPiece } from '../core/pieces';
import type { PieceDef, PieceId } from '../core/types';
import { blockTextureKey } from './blockTexture';
import { trayPieceRect, type Point } from './drag';
import { boardLayout, type ScreenLayout } from './layout';
import { stopTweensOf, tweenAsync } from './tween';

interface Slot {
  readonly piece: PieceDef;
  readonly container: Phaser.GameObjects.Container;
  /** 보드 어디에도 놓을 수 없어 흐리게 그리는 중. 집을 수는 있다 */
  dimmed: boolean;
}

export class TrayView {
  private slots: (Slot | null)[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private screen: ScreenLayout,
  ) {}

  /** 화면 크기가 바뀌었을 때: 조각을 새 슬롯 위치에 바로 둔다 (되돌아가는 중이던 조각도) */
  setLayout(screen: ScreenLayout): void {
    this.screen = screen;
    this.slots.forEach((slot, index) => {
      if (slot) this.placeHome(index, slot);
    });
  }

  /** 상태로 전체를 다시 그린다 (연출 없음). 모르는 조각 ID는 빈 슬롯으로 그린다 */
  render(tray: readonly (PieceId | null)[]): void {
    this.clear();
    this.slots = tray.map((id, index) => this.createSlot(index, id));
  }

  /** `tray` 이벤트: 새 조각 3개가 나타난다 */
  async playTrayIn(tray: readonly PieceId[]): Promise<void> {
    this.render(tray);
    const containers = this.slots.flatMap((slot) => (slot ? [slot.container] : []));
    for (const container of containers) {
      container.setScale(VIEW.trayScale * VIEW.trayInFromScale).setAlpha(0);
    }
    await tweenAsync(this.scene, {
      targets: containers,
      scale: VIEW.trayScale,
      alpha: 1,
      duration: ANIM.trayIn,
      ease: 'Back.easeOut',
    });
  }

  /**
   * 놓을 수 없는 조각을 흐리게 한다 (슬롯마다 true = 흐림, `ANIM.trayDim`). 판정은 호출한 쪽이 한다 (view/fx/trayDim.ts).
   * 기다리지 않는다. 흐림 상태는 슬롯에 남아서 화면 크기가 바뀌어도 유지된다.
   */
  setDimmed(flags: readonly boolean[]): void {
    this.slots.forEach((slot, index) => {
      if (!slot) return;
      const dimmed = flags[index] === true;
      slot.dimmed = dimmed;
      void tweenAsync(this.scene, {
        targets: slot.container,
        alpha: dimmed ? FX.dimAlpha : 1,
        duration: ANIM.trayDim,
      });
    });
  }

  /** 그 슬롯에 그려진 조각. 없으면 null */
  pieceAt(index: number): PieceDef | null {
    return this.slots[index]?.piece ?? null;
  }

  /** 드래그: 조각을 실제 칸 크기로 키워 bounding box 왼쪽 위를 topLeft에 둔다 */
  lift(index: number, topLeft: Point): void {
    const slot = this.slots[index];
    if (!slot) return;
    this.halt(slot);
    slot.container.setDepth(VIEW.depth.drag).setScale(1).setPosition(topLeft.x, topLeft.y);
  }

  /** 조각을 슬롯으로 되돌린다 (`ANIM.returnToTray`) */
  returnHome(index: number): void {
    const slot = this.slots[index];
    if (!slot) return;
    const { container, piece } = slot;
    const home = trayPieceRect(this.screen, index, piece);
    this.halt(slot);
    void tweenAsync(this.scene, {
      targets: container,
      x: home.x,
      y: home.y,
      scale: VIEW.trayScale,
      duration: ANIM.returnToTray,
      ease: 'Quad.easeOut',
    }).then(() => {
      // 도중에 놓였거나(remove) 다시 집혔으면 건드리지 않는다
      if (this.slots[index] === slot && container.scale === VIEW.trayScale) {
        container.setDepth(VIEW.depth.tray);
      }
    });
  }

  /** 놓은 슬롯을 비운다 */
  remove(index: number): void {
    const slot = this.slots[index];
    if (!slot) return;
    stopTweensOf(this.scene, slot.container);
    slot.container.destroy();
    this.slots[index] = null;
  }

  private createSlot(index: number, id: PieceId | null): Slot | null {
    const piece = id === null ? undefined : getPiece(id);
    if (!piece) return null;
    const cell = boardLayout(this.screen).cell;
    const scale = cell / VIEW.block.textureSize;
    const images = piece.cells.map(({ r, c }) =>
      this.scene.make
        .image(
          { x: (c + 0.5) * cell, y: (r + 0.5) * cell, key: blockTextureKey(piece.color) },
          false,
        )
        .setScale(scale),
    );
    const slot: Slot = { piece, container: this.scene.add.container(0, 0, images), dimmed: false };
    this.placeHome(index, slot);
    return slot;
  }

  /** 슬롯의 트윈을 멈춘다. 흐림 전환이 도중에 끊겨도 투명도는 목표 값으로 맞춘다 */
  private halt(slot: Slot): void {
    stopTweensOf(this.scene, slot.container);
    slot.container.setAlpha(slot.dimmed ? FX.dimAlpha : 1);
  }

  private placeHome(index: number, slot: Slot): void {
    const home = trayPieceRect(this.screen, index, slot.piece);
    stopTweensOf(this.scene, slot.container);
    slot.container
      .setDepth(VIEW.depth.tray)
      .setScale(VIEW.trayScale)
      .setAlpha(slot.dimmed ? FX.dimAlpha : 1)
      .setPosition(home.x, home.y);
  }

  private clear(): void {
    for (const slot of this.slots) {
      if (!slot) continue;
      stopTweensOf(this.scene, slot.container);
      slot.container.destroy();
    }
    this.slots = [];
  }
}
