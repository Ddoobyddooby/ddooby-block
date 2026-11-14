// 포인터 → 드래그·고스트·놓기 (PLAN 6.1). 포인터 하나만 추적한다.
// 판정은 하지 않는다: 놓을 수 있는지는 host의 preview(core previewPlacement)와 drop(core place)이 정한다.
// Phaser에 직접 기대지 않고 필요한 것만 host로 받아서 테스트할 수 있다 (tests/view/DragController.test.ts).

import { TRAY } from '../config';
import type { PieceDef, Pos } from '../core/types';
import type { Preview } from './BoardView';
import { dragAnchor, dragTopLeft, traySlotRect, type Point } from './drag';
import { canPickUp, type PickUpState } from './dragRules';
import type { Layout, ScreenLayout } from './layout';

/** Phaser.Input.Pointer에서 쓰는 부분 */
export interface PointerLike {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** touchcancel로 끝났으면 true */
  readonly wasCanceled?: boolean;
}

export interface DragHost {
  lock(): PickUpState;
  screen(): ScreenLayout;
  layout(): Layout;
  /** 그 슬롯에 있는 조각. 없으면 null */
  pieceAt(trayIndex: number): PieceDef | null;
  /** 조각을 실제 칸 크기로 키워 bounding box 왼쪽 위를 topLeft에 그린다 */
  lift(trayIndex: number, topLeft: Point): void;
  /** 조각을 슬롯으로 되돌린다 */
  returnHome(trayIndex: number): void;
  /** core `previewPlacement`. 놓을 수 없으면 null */
  preview(trayIndex: number, anchor: Pos): Preview | null;
  showPreview(preview: Preview, color: number): void;
  hidePreview(): void;
  /** core `place`를 부른다. 놓였으면 true (그 뒤 조각 그림은 host가 치운다) */
  drop(trayIndex: number, anchor: Pos): boolean;
}

interface Drag {
  readonly pointerId: number;
  readonly trayIndex: number;
  readonly piece: PieceDef;
  /** 마지막으로 계산한 기준 칸. 놓을 때 이 값을 쓴다 (PLAN 9절 1번) */
  anchor: Pos;
}

export class DragController {
  private drag: Drag | null = null;

  constructor(private readonly host: DragHost) {}

  get dragging(): boolean {
    return this.drag !== null;
  }

  /** 누르기: 트레이 슬롯 안이고 조각이 있고 잠겨 있지 않으면 집는다. 드래그 중에는 다른 포인터를 무시한다 */
  onDown(pointer: PointerLike): void {
    if (this.drag !== null) return;
    if (!canPickUp(this.host.lock())) return;
    const trayIndex = this.slotAt(pointer);
    if (trayIndex === null) return;
    const piece = this.host.pieceAt(trayIndex);
    if (piece === null) return;
    this.drag = { pointerId: pointer.id, trayIndex, piece, anchor: { r: -1, c: -1 } };
    this.follow(this.drag, pointer);
  }

  onMove(pointer: PointerLike): void {
    const { drag } = this;
    if (drag === null || pointer.id !== drag.pointerId) return;
    this.follow(drag, pointer);
  }

  /**
   * 캔버스 안에서 떼기: 마지막으로 계산한 anchor로 놓는다. up 이벤트의 좌표로 다시 계산하지 않는다
   * (고스트가 보인 칸과 놓이는 칸이 달라질 수 있다). 실패하면 슬롯으로 되돌린다.
   * touchcancel로 끝났으면 놓지 않고 취소한다. 캔버스 밖에서 뗀 것은 `onUpOutside`가 받는다.
   */
  onUp(pointer: PointerLike): void {
    const { drag } = this;
    if (drag === null || pointer.id !== drag.pointerId) return;
    if (pointer.wasCanceled === true) {
      this.cancel();
      return;
    }
    this.drag = null;
    this.host.hidePreview();
    if (!this.host.drop(drag.trayIndex, drag.anchor)) this.host.returnHome(drag.trayIndex);
  }

  /**
   * 캔버스 밖에서 떼기: 놓지 않고 취소한다 (보이지 않는 곳에서 놓이면 안 된다).
   * 추적 중인 포인터일 때만이다. 다른 손가락이 밖에서 떼어져도 하던 드래그는 그대로다.
   */
  onUpOutside(pointer: PointerLike): void {
    if (this.drag === null || pointer.id !== this.drag.pointerId) return;
    this.cancel();
  }

  /**
   * 드래그를 취소하고 조각을 슬롯으로 되돌린다. 어느 포인터인지 가리지 않는다
   * (잠김, 포인터가 캔버스를 벗어남, 창이 가려짐, 화면 크기 변경).
   */
  cancel(): void {
    const { drag } = this;
    if (drag === null) return;
    this.drag = null;
    this.host.hidePreview();
    this.host.returnHome(drag.trayIndex);
  }

  /** 매 프레임: 드래그 중에 잠기면 취소한다 */
  update(): void {
    if (this.drag !== null && !canPickUp(this.host.lock())) this.cancel();
  }

  private follow(drag: Drag, pointer: PointerLike): void {
    const layout = this.host.layout();
    this.host.lift(drag.trayIndex, dragTopLeft(layout, drag.piece, pointer));
    drag.anchor = dragAnchor(layout, drag.piece, pointer);
    const preview = this.host.preview(drag.trayIndex, drag.anchor);
    if (preview === null) this.host.hidePreview();
    else this.host.showPreview(preview, drag.piece.color);
  }

  private slotAt(point: Point): number | null {
    const screen = this.host.screen();
    for (let index = 0; index < TRAY.size; index++) {
      const { x, y, w, h } = traySlotRect(screen, index);
      // 왼쪽·위 경계는 포함, 오른쪽·아래 끝은 제외 (슬롯 경계는 다음 슬롯)
      if (point.x >= x && point.x < x + w && point.y >= y && point.y < y + h) return index;
    }
    return null;
  }
}
