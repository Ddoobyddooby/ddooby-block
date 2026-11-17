import { describe, expect, it } from 'vitest';
import { PIECES } from '../../src/core/pieces';
import {
  blockTextureKey,
  ghostTextureKey,
  mixColor,
  parseBlockKey,
} from '../../src/view/blockTexture';
import { THEME_LIST } from '../../src/view/theme/themes';

describe('mixColor', () => {
  it('0이면 원래 색, 1이면 섞는 색', () => {
    expect(mixColor(0x336699, 0xffffff, 0)).toBe(0x336699);
    expect(mixColor(0x336699, 0xffffff, 1)).toBe(0xffffff);
    expect(mixColor(0x336699, 0x000000, 1)).toBe(0x000000);
  });

  it('채널마다 섞고 반올림한다', () => {
    // 0x40 = 64 → 흰색 50%: 64 + 191 × 0.5 = 159.5 → 160 = 0xa0
    expect(mixColor(0x400000, 0xffffff, 0.5)).toBe(0xa08080);
    // 검정 25%: 200 × 0.75 = 150 = 0x96
    expect(mixColor(0xc8c8c8, 0x000000, 0.25)).toBe(0x969696);
  });

  it('amount는 0~1로 자른다', () => {
    expect(mixColor(0x336699, 0xffffff, -1)).toBe(0x336699);
    expect(mixColor(0x336699, 0xffffff, 2)).toBe(0xffffff);
  });
});

describe('블록 색', () => {
  it('조각의 색 그룹마다 색이 있고 서로 다르다', () => {
    const groups = [...new Set(PIECES.map((piece) => piece.color))].sort();
    expect(groups).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const theme of THEME_LIST) {
      expect(theme.colors.blocks).toHaveLength(7);
      expect(new Set(theme.colors.blocks).size).toBe(7);
    }
  });

  it('텍스처 키는 테마와 색 그룹마다 다르고 키에서 다시 읽힌다', () => {
    const keys = THEME_LIST.flatMap((t) =>
      [0, 1, 2, 3, 4, 5, 6].flatMap((c) => [blockTextureKey(t.id, c), ghostTextureKey(t.id, c)]),
    );
    expect(new Set(keys).size).toBe(3 * 7 * 2);
    expect(parseBlockKey(blockTextureKey('orbit', 4))).toEqual({ theme: 'orbit', color: 4 });
    // 고스트·빈 칸·모르는 테마는 블록 키가 아니다
    expect(parseBlockKey(ghostTextureKey('orbit', 4))).toBeNull();
    expect(parseBlockKey('cell-empty-soda')).toBeNull();
    expect(parseBlockKey('block-neon-1')).toBeNull();
  });
});
