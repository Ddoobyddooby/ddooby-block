// 블록 텍스처를 코드로 그린다 (PLAN 2절 6번: 단색 + 하이라이트, 이미지 파일 없음).
// 모양: 모서리가 둥근 단색 칸에 위쪽 밝은 띠와 아래쪽 어두운 띠.

import type Phaser from 'phaser';
import { FX, VIEW } from '../config';

/** 텍스처 키 */
export const TEXTURE = {
  emptyCell: 'cell-empty',
  /** 흰색 테두리 + 옅은 속. 조각 색으로 tint해서 쓴다 */
  ghost: 'cell-ghost',
  /** 흰색 칸. 채워질 줄 표시에 쓴다 */
  lineHighlight: 'cell-line',
  /** 흰 동그라미. 줄 제거 파티클이 칸 색으로 tint해서 쓴다 */
  spark: 'fx-spark',
} as const;

/** 색 그룹(0~6)의 블록 텍스처 키 */
export function blockTextureKey(color: number): string {
  return `block-${color}`;
}

/**
 * 색(0xRRGGBB)에 다른 색을 amount(0~1)만큼 섞는다. 채널마다 반올림한다.
 * amount는 0~1로 자른다.
 */
export function mixColor(color: number, target: number, amount: number): number {
  const t = Math.min(Math.max(amount, 0), 1);
  const channel = (shift: number): number => {
    const from = (color >> shift) & 0xff;
    const to = (target >> shift) & 0xff;
    return Math.round(from + (to - from) * t);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** 블록·빈 칸·고스트·줄 하이라이트·파티클 텍스처를 만든다. 이미 있으면 건너뛴다 (씬을 다시 시작해도 한 번만) */
export function createBlockTextures(scene: Phaser.Scene): void {
  const { textureSize: size, gap, radius, band, light, dark, ghostStroke } = VIEW.block;
  const inset = size * gap;
  const side = size - inset * 2;
  const r = size * radius;
  const bandH = size * band;

  const draw = (
    key: string,
    paint: (g: Phaser.GameObjects.Graphics) => void,
    side: number = size,
  ): void => {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    paint(g);
    g.generateTexture(key, side, side);
    g.destroy();
  };

  VIEW.colors.blocks.forEach((color, group) => {
    draw(blockTextureKey(group), (g) => {
      // 어두운 바탕 → 본색을 띠 높이만큼 위로 → 밝은 띠를 맨 위에. 겹쳐 그려서 둥근 모서리가 유지된다
      g.fillStyle(mixColor(color, 0x000000, dark), 1);
      g.fillRoundedRect(inset, inset, side, side, r);
      g.fillStyle(mixColor(color, 0xffffff, light), 1);
      g.fillRoundedRect(inset, inset, side, side - bandH, r);
      g.fillStyle(color, 1);
      g.fillRoundedRect(inset, inset + bandH, side, side - bandH * 2, r);
    });
  });

  draw(TEXTURE.emptyCell, (g) => {
    g.fillStyle(VIEW.colors.emptyCell, 1);
    g.fillRoundedRect(inset, inset, side, side, r);
  });

  draw(TEXTURE.ghost, (g) => {
    const stroke = size * ghostStroke;
    g.fillStyle(0xffffff, VIEW.ghostFillAlpha);
    g.fillRoundedRect(inset, inset, side, side, r);
    g.lineStyle(stroke, 0xffffff, 1);
    g.strokeRoundedRect(
      inset + stroke / 2,
      inset + stroke / 2,
      side - stroke,
      side - stroke,
      Math.max(r - stroke / 2, 0),
    );
  });

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
