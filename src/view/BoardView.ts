// 보드 그리기와 이벤트 재생. 판정은 하지 않는다: core가 준 상태·이벤트·미리보기를 그리기만 한다.

import type Phaser from 'phaser';
import { ANIM, VIEW } from '../config';
import type { Board, GameEvent, Pos } from '../core/types';
import {
  blockTextureKey,
  emptyCellKey,
  ghostTextureKey,
  parseBlockKey,
  TEXTURE,
} from './blockTexture';
import { themeOf } from './theme/themeSetting';
import type { Theme } from './theme/themes';
import { cellCenter, type Layout } from './layout';
import { stopTweensOf, tweenAsync } from './tween';

type PlaceEvent = Extract<GameEvent, { type: 'place' }>;
type ClearEvent = Extract<GameEvent, { type: 'clear' }>;

/** core `previewPlacement`의 결과 */
export interface Preview {
  readonly cells: readonly Pos[];
  readonly rows: readonly number[];
  readonly cols: readonly number[];
}

interface Block {
  readonly image: Phaser.GameObjects.Image;
  readonly color: number;
  readonly pos: Pos;
}

export class BoardView {
  private readonly panel: Phaser.GameObjects.Graphics;
  /** 빈 칸 그림. index = r × cols + c */
  private readonly emptyCells: Phaser.GameObjects.Image[] = [];
  /** 채워질 줄 표시. 칸마다 하나씩 두고 보였다 숨겼다 한다 */
  private readonly lineCells: Phaser.GameObjects.Image[] = [];
  private readonly ghosts: Phaser.GameObjects.Image[] = [];
  /** 채워진 칸. index = r × cols + c, 빈 칸은 null */
  private blocks: (Block | null)[];
  /** 이 보드가 그리는 테마 (씬이 시작할 때 정해진다. 테마는 메뉴에서만 바뀐다) */
  private readonly theme: Theme;
  /** 지우는 연출이 끝나지 않은 그림 (보드에서는 이미 빠졌다) */
  private readonly fading = new Set<Block>();

  constructor(
    private readonly scene: Phaser.Scene,
    private layout: Layout,
  ) {
    const { rows, cols } = layout;
    this.theme = themeOf(scene);
    this.blocks = new Array<Block | null>(rows * cols).fill(null);
    this.panel = scene.add.graphics().setDepth(VIEW.depth.panel);
    for (let i = 0; i < rows * cols; i++) {
      this.emptyCells.push(
        scene.add.image(0, 0, emptyCellKey(this.theme.id)).setDepth(VIEW.depth.cell),
      );
      this.lineCells.push(
        scene.add
          .image(0, 0, TEXTURE.lineHighlight)
          .setDepth(VIEW.depth.lineHighlight)
          .setTint(this.theme.colors.line)
          .setAlpha(this.theme.colors.lineAlpha)
          .setVisible(false),
      );
    }
    this.setLayout(layout);
  }

  /** 화면 크기가 바뀌었을 때: 있는 그림을 새 위치로 옮긴다 (재생 중인 연출은 크기·투명도만 바꾸므로 그대로 이어진다) */
  setLayout(layout: Layout): void {
    this.layout = layout;
    const pad = VIEW.boardPad;
    this.panel.clear();
    const { colors } = this.theme;
    const box = [
      layout.x - pad,
      layout.y - pad,
      layout.width + pad * 2,
      layout.height + pad * 2,
    ] as const;
    // 아래 그림자 → 받침 → 테두리 (시안 board)
    this.panel.fillStyle(colors.shadow, 0.24);
    this.panel.fillRoundedRect(box[0], box[1] + 8, box[2], box[3], VIEW.boardRadius);
    this.panel.fillStyle(colors.board, 1);
    this.panel.fillRoundedRect(...box, VIEW.boardRadius);
    this.panel.lineStyle(2.5, colors.boardEdge, 1);
    this.panel.strokeRoundedRect(...box, VIEW.boardRadius);
    for (let i = 0; i < this.emptyCells.length; i++) {
      const pos = this.posOf(i);
      this.moveTo(this.emptyCells[i], pos);
      this.moveTo(this.lineCells[i], pos);
    }
    for (const block of this.blocks) {
      if (block) this.moveTo(block.image, block.pos, false);
    }
    for (const block of this.fading) this.moveTo(block.image, block.pos, false);
    // 고스트는 다음 드래그 이동 때 새 위치로 다시 그린다
    this.hidePreview();
  }

  /** 상태로 전체를 다시 그린다 (연출 없음) */
  render(board: Board): void {
    this.clearBlocks();
    board.cells.forEach((color, i) => {
      if (color !== null) this.addBlock(this.posOf(i), color);
    });
  }

  /** `place` 이벤트: 놓인 칸이 나타난다 */
  async playPlace(event: PlaceEvent): Promise<void> {
    const images = event.cells.map((pos) => this.addBlock(pos, event.color).image);
    const scale = this.cellScale();
    for (const image of images) image.setScale(scale * VIEW.placeFromScale);
    await tweenAsync(this.scene, {
      targets: images,
      scale,
      duration: ANIM.place,
      ease: 'Back.easeOut',
    });
  }

  /**
   * `clear` 이벤트: `cells` 순서대로 `ANIM.clearPerCell` 간격으로 지운다.
   * onCell은 칸마다 한 번, 지우기 시작 전에 불린다 (파티클용. order번째 칸은 order × clearPerCell 뒤에 사라진다)
   */
  async playClear(
    event: ClearEvent,
    onCell?: (cell: { pos: Pos; color: number; order: number }) => void,
  ): Promise<void> {
    const scale = this.cellScale() * VIEW.clearToScale;
    const jobs = event.cells.map((pos, order) => {
      const index = this.indexOf(pos);
      const block = this.blocks[index];
      if (!block) return Promise.resolve();
      onCell?.({ pos, color: block.color, order });
      // 보드에서는 바로 뺀다. 그림만 순서대로 사라진다
      this.blocks[index] = null;
      this.fading.add(block);
      return tweenAsync(this.scene, {
        targets: block.image,
        scale,
        alpha: 0,
        delay: order * ANIM.clearPerCell,
        duration: ANIM.clearFade,
        ease: 'Quad.easeIn',
      }).then(() => {
        this.fading.delete(block);
        block.image.destroy();
      });
    });
    await Promise.all(jobs);
  }

  /** 고스트(놓일 칸)와 채워질 줄 표시 */
  showPreview(preview: Preview, color: number): void {
    const key = ghostTextureKey(this.theme.id, color);
    preview.cells.forEach((pos, i) => {
      let ghost = this.ghosts[i];
      if (!ghost) {
        ghost = this.scene.add.image(0, 0, key).setDepth(VIEW.depth.ghost);
        this.ghosts.push(ghost);
      }
      this.moveTo(ghost, pos);
      // 고스트 텍스처는 색 그룹마다 따로 있다 (같은 칸 그림을 색만 입히면 밝은 보드에서 묻힌다)
      ghost.setTexture(key).setAlpha(this.theme.ghost.alpha).setVisible(true);
    });
    for (let i = preview.cells.length; i < this.ghosts.length; i++) {
      this.ghosts[i]?.setVisible(false);
    }
    for (let i = 0; i < this.lineCells.length; i++) {
      const { r, c } = this.posOf(i);
      this.lineCells[i]?.setVisible(preview.rows.includes(r) || preview.cols.includes(c));
    }
  }

  hidePreview(): void {
    for (const ghost of this.ghosts) ghost.setVisible(false);
    for (const cell of this.lineCells) cell.setVisible(false);
  }

  /**
   * 지금 화면에 채워져 있는 칸 (DEV 대조용). index = r × cols + c, 값은 색 그룹, 빈 칸은 null.
   * 따로 적어 둔 값이 아니라 실제 그림(보이는지, 어떤 텍스처인지, 어느 칸 위치인지)에서 읽는다.
   */
  filledCells(): (number | null)[] {
    const out = new Array<number | null>(this.blocks.length).fill(null);
    const { layout } = this;
    for (const child of this.scene.children.list) {
      const image = child as Phaser.GameObjects.Image;
      if (image.type !== 'Image' || !image.visible || image.alpha <= 0) continue;
      const parsed = parseBlockKey(image.texture.key);
      if (parsed === null || parsed.theme !== this.theme.id) continue;
      const color = parsed.color;
      const c = Math.floor((image.x - layout.x) / layout.cell);
      const r = Math.floor((image.y - layout.y) / layout.cell);
      if (r < 0 || r >= layout.rows || c < 0 || c >= layout.cols) continue;
      out[r * layout.cols + c] = color;
    }
    return out;
  }

  /** 보이는 고스트 칸 (화면 확인용). 그림 위치에서 읽는다 */
  ghostCells(): Pos[] {
    const { layout } = this;
    return this.ghosts
      .filter((ghost) => ghost.visible)
      .map((ghost) => ({
        r: Math.floor((ghost.y - layout.y) / layout.cell),
        c: Math.floor((ghost.x - layout.x) / layout.cell),
      }));
  }

  private addBlock(pos: Pos, color: number): Block {
    const index = this.indexOf(pos);
    this.blocks[index]?.image.destroy();
    const image = this.scene.add
      .image(0, 0, blockTextureKey(this.theme.id, color))
      .setDepth(VIEW.depth.block);
    this.moveTo(image, pos);
    const block: Block = { image, color, pos };
    this.blocks[index] = block;
    return block;
  }

  private clearBlocks(): void {
    for (const block of this.blocks) {
      if (!block) continue;
      stopTweensOf(this.scene, block.image);
      block.image.destroy();
    }
    for (const block of this.fading) {
      stopTweensOf(this.scene, block.image);
      block.image.destroy();
    }
    this.fading.clear();
    this.blocks = new Array<Block | null>(this.blocks.length).fill(null);
  }

  private cellScale(): number {
    return this.layout.cell / VIEW.block.textureSize;
  }

  /** 그림을 칸 중심으로 옮긴다. resize가 false면 크기는 건드리지 않는다 (연출 중일 수 있다) */
  private moveTo(image: Phaser.GameObjects.Image | undefined, pos: Pos, resize = true): void {
    if (!image) return;
    const { x, y } = cellCenter(this.layout, pos);
    image.setPosition(x, y);
    if (resize) image.setScale(this.cellScale());
  }

  private indexOf(pos: Pos): number {
    return pos.r * this.layout.cols + pos.c;
  }

  private posOf(index: number): Pos {
    return { r: Math.floor(index / this.layout.cols), c: index % this.layout.cols };
  }
}
