import { describe, expect, it } from 'vitest';
import { VIEW } from '../../src/config';
import { blockOps, emptyCellOps, ghostOps, type PaintOp } from '../../src/view/theme/blockPaint';
import { mixColor, shadeColor } from '../../src/view/theme/colorMath';
import { THEME_LIST } from '../../src/view/theme/themes';

const { textureSize: SIZE, gap: GAP, ghostStroke } = VIEW.block;

/** 명령이 그리는 모든 좌표 */
function points(op: PaintOp): { x: number; y: number }[] {
  if (op.kind === 'line') return op.points;
  return [
    { x: op.x, y: op.y },
    { x: op.x + op.w, y: op.y + op.h },
  ];
}

describe('blockOps (테마별 블록 그리기 명령)', () => {
  for (const theme of THEME_LIST) {
    describe(theme.id, () => {
      theme.colors.blocks.forEach((base, group) => {
        it(`색 그룹 ${group}: 모든 좌표가 텍스처 안에 있고 값이 유한하다`, () => {
          const ops = blockOps(theme.block, base, SIZE, GAP);
          expect(ops.length).toBeGreaterThanOrEqual(4);
          for (const op of ops) {
            for (const p of points(op)) {
              expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
              expect(p.x).toBeGreaterThanOrEqual(0);
              expect(p.y).toBeGreaterThanOrEqual(0);
              expect(p.x).toBeLessThanOrEqual(SIZE);
              expect(p.y).toBeLessThanOrEqual(SIZE);
            }
          }
        });
      });

      it('두꺼운 아래 면(기본색×bottomMul)이 앞면(기본색×faceMul)보다 먼저 그려지고 앞면보다 아래로 depth만큼 내려간다', () => {
        const base = theme.colors.blocks[3]!;
        const rects = blockOps(theme.block, base, SIZE, GAP).filter(
          (op): op is Extract<PaintOp, { kind: 'rect' }> =>
            op.kind === 'rect' && op.fill !== null && op.alpha === 1,
        );
        const [bottom, face] = rects;
        expect(bottom!.fill).toBe(shadeColor(base, theme.block.bottomMul));
        expect(face!.fill).toBe(shadeColor(base, theme.block.faceMul));
        const side = SIZE - SIZE * GAP * 2;
        expect(bottom!.y - face!.y).toBeCloseTo(side * theme.block.depth, 6);
        // 칸의 맨 아래(= 아래 면 끝)는 테두리 틈 안쪽에서 끝난다
        expect(bottom!.y + bottom!.h).toBeCloseTo(SIZE - SIZE * GAP, 6);
        expect(face!.r).toBeCloseTo(side * theme.block.radius, 6);
      });

      it('테두리는 테마 수치대로: 있으면 한 개의 앞면에만, 없으면 하나도 없다', () => {
        const ops = blockOps(theme.block, theme.colors.blocks[0]!, SIZE, GAP);
        const stroked = ops.filter((op) => op.kind === 'rect' && op.stroke !== null);
        if (theme.block.stroke === null) {
          // 추가 표현(inner)의 가는 테두리도 없다
          expect(stroked).toHaveLength(theme.block.extra === 'inner' ? 1 : 0);
        } else {
          expect(stroked.length).toBeGreaterThanOrEqual(1);
          const color = mixColor(
            theme.colors.blocks[0]!,
            theme.block.stroke.target,
            theme.block.stroke.amount,
          );
          expect(stroked.some((op) => op.kind === 'rect' && op.stroke?.color === color)).toBe(true);
        }
      });

      it('광택은 흰색을 섞은 색의 선이다', () => {
        const base = theme.colors.blocks[5]!;
        const lines = blockOps(theme.block, base, SIZE, GAP).filter((op) => op.kind === 'line');
        expect(lines.length).toBeGreaterThanOrEqual(1);
        const gloss = lines[0]!;
        expect(gloss.kind === 'line' && gloss.color).toBe(
          mixColor(base, 0xffffff, theme.block.gloss.amount),
        );
      });

      it('같은 입력이면 같은 명령이다 (순수 함수)', () => {
        const a = blockOps(theme.block, theme.colors.blocks[2]!, SIZE, GAP);
        const b = blockOps(theme.block, theme.colors.blocks[2]!, SIZE, GAP);
        expect(b).toEqual(a);
        // 크기를 키우면 좌표도 비례해서 커진다
        const big = blockOps(theme.block, theme.colors.blocks[2]!, SIZE * 2, GAP);
        expect(big).toHaveLength(a.length);
        const first = a[0]!;
        const bigFirst = big[0]!;
        if (first.kind === 'rect' && bigFirst.kind === 'rect') {
          expect(bigFirst.w).toBeCloseTo(first.w * 2, 6);
        }
      });
    });
  }

  it('테마마다 블록이 서로 다르게 그려진다 (모서리·두께)', () => {
    const rs = THEME_LIST.map((t) => t.block.radius);
    expect(new Set(rs).size).toBe(3);
    expect(Math.max(...rs)).toBeLessThanOrEqual(0.29);
  });
});

describe('emptyCellOps·ghostOps', () => {
  it('빈 칸은 둥근 사각형 한 개, 테마 빈 칸 색', () => {
    for (const theme of THEME_LIST) {
      const ops = emptyCellOps(theme.block, theme.colors.empty, SIZE, GAP);
      expect(ops).toHaveLength(1);
      const op = ops[0]!;
      expect(op.kind === 'rect' && op.fill).toBe(theme.colors.empty);
    }
  });

  it('고스트는 블록 색 반투명 면 + 테두리이고 텍스처 안에 들어간다', () => {
    for (const theme of THEME_LIST) {
      const ops = ghostOps(
        theme.block,
        theme.ghost,
        theme.colors.blocks[1]!,
        SIZE,
        GAP,
        ghostStroke,
      );
      expect(ops).toHaveLength(2);
      const [fill, stroke] = ops as [
        Extract<PaintOp, { kind: 'rect' }>,
        Extract<PaintOp, { kind: 'rect' }>,
      ];
      expect(fill.fill).toBe(theme.colors.blocks[1]);
      expect(fill.alpha).toBe(theme.ghost.fillAlpha);
      expect(stroke.fill).toBeNull();
      expect(stroke.stroke?.width).toBeCloseTo(SIZE * ghostStroke, 6);
      for (const op of ops)
        for (const p of points(op))
          expect(p.x >= 0 && p.x <= SIZE && p.y >= 0 && p.y <= SIZE).toBe(true);
    }
  });
});
