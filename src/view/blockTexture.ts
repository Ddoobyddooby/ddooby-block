// 블록 텍스처를 코드로 그린다 (PLAN 2절 6번: 이미지 파일 없음). 그리는 명령은 theme/blockPaint.ts(순수 함수)가 만들고,
// 여기서는 그 명령을 Phaser Graphics로 옮겨 텍스처 한 장으로 만든다. 테마마다 따로 한 번 만들고 캐시한다 (키에 테마 ID).

import type Phaser from 'phaser';
import { FX, VIEW } from '../config';
import { blockOps, emptyCellOps, ghostOps, type PaintOp } from './theme/blockPaint';
import { mixColor } from './theme/colorMath';
import { getTheme, THEME_IDS, type ThemeId } from './theme/themes';

export { mixColor };

/** 테마와 무관한 텍스처 키 */
export const TEXTURE = {
  /** 흰 칸. 채워질 줄 표시에 쓴다 (tint로 색을 입힌다) */
  lineHighlight: 'cell-line',
  /** 흰 동그라미. 줄 제거 파티클이 칸 색으로 tint해서 쓴다 */
  spark: 'fx-spark',
} as const;

/** 테마별 빈 칸 텍스처 키 */
export function emptyCellKey(theme: ThemeId): string {
  return `cell-empty-${theme}`;
}

/** 색 그룹(0~6)의 블록 텍스처 키 */
export function blockTextureKey(theme: ThemeId, color: number): string {
  return `block-${theme}-${color}`;
}

/** 색 그룹(0~6)의 고스트 텍스처 키 */
export function ghostTextureKey(theme: ThemeId, color: number): string {
  return `ghost-${theme}-${color}`;
}

/** 키에서 (테마, 색 그룹)을 읽는다. 블록 텍스처가 아니면 null (DEV 대조용) */
export function parseBlockKey(key: string): { theme: ThemeId; color: number } | null {
  const m = /^block-([a-z]+)-(\d+)$/.exec(key);
  if (!m) return null;
  const theme = THEME_IDS.find((id) => id === m[1]);
  return theme === undefined ? null : { theme, color: Number(m[2]) };
}

/** 명령 목록을 Graphics로 그린다 */
function paint(g: Phaser.GameObjects.Graphics, ops: readonly PaintOp[]): void {
  for (const op of ops) {
    if (op.kind === 'rect') {
      if (op.fill !== null) {
        g.fillStyle(op.fill, op.alpha);
        g.fillRoundedRect(op.x, op.y, op.w, op.h, op.r);
      }
      if (op.stroke !== null) {
        g.lineStyle(op.stroke.width, op.stroke.color, op.stroke.alpha);
        g.strokeRoundedRect(op.x, op.y, op.w, op.h, op.r);
      }
    } else {
      g.lineStyle(op.width, op.color, op.alpha);
      g.beginPath();
      op.points.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
      g.strokePath();
    }
  }
}

/**
 * 그 테마의 블록 7색·빈 칸·고스트 텍스처와, 테마와 무관한 줄 하이라이트·파티클 텍스처를 만든다.
 * 이미 있으면 건너뛴다 (씬을 다시 시작해도, 테마를 다시 골라도 한 번만).
 */
export function createBlockTextures(scene: Phaser.Scene, themeId: ThemeId): void {
  const theme = getTheme(themeId);
  const { textureSize: size, gap, ghostStroke } = VIEW.block;

  const draw = (
    key: string,
    ops: readonly PaintOp[] | ((g: Phaser.GameObjects.Graphics) => void),
    side: number = size,
  ): void => {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    if (typeof ops === 'function') ops(g);
    else paint(g, ops);
    g.generateTexture(key, side, side);
    g.destroy();
  };

  theme.colors.blocks.forEach((color, group) => {
    draw(blockTextureKey(themeId, group), blockOps(theme.block, color, size, gap));
    draw(
      ghostTextureKey(themeId, group),
      ghostOps(theme.block, theme.ghost, color, size, gap, ghostStroke),
    );
  });
  draw(emptyCellKey(themeId), emptyCellOps(theme.block, theme.colors.empty, size, gap));

  draw(TEXTURE.lineHighlight, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, size, size);
  });
  const spark = FX.particles.texture;
  draw(
    TEXTURE.spark,
    (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(spark / 2, spark / 2, spark / 2);
    },
    spark,
  );
}
