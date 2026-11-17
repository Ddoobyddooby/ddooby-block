// 블록·빈 칸·고스트를 그리는 "명령 목록"을 만든다 (순수 함수, Phaser 없음). 시안 build_mockups.py의 tile 함수가 원본이다.
// blockTexture.ts가 이 명령을 Phaser Graphics로 옮겨 텍스처 한 장으로 만든다. 좌표는 텍스처 왼쪽 위가 (0,0)이다.

import { mixColor, shadeColor } from './colorMath';
import type { BlockStyle, GhostStyle } from './themes';

export type Point = { x: number; y: number };

export type PaintOp =
  /** 둥근 사각형: fill(없으면 null)과 테두리(없으면 null) */
  | {
      kind: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      r: number;
      fill: number | null;
      alpha: number;
      stroke: { color: number; width: number; alpha: number } | null;
    }
  /** 꺾은선(곡선은 점으로 나눠 둔다) */
  | { kind: 'line'; points: Point[]; color: number; width: number; alpha: number };

/** 시안의 2차 베지어(Q)를 점으로 나눈다. 끝점 p0과 p2는 포함한다 */
function quad(p0: Point, p1: Point, p2: Point, steps = 8): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    });
  }
  return out;
}

/**
 * 블록 한 칸. size = 텍스처 한 변, gap = 칸 사이 틈(한쪽, size 대비). 둥근 사각형이 텍스처 안쪽 (size − 2×틈) 정사각형 안에 들어간다.
 * 그리는 순서가 곧 겹치는 순서다 (아래 면 → 앞면 → 광택 → 추가 표현).
 */
export function blockOps(style: BlockStyle, base: number, size: number, gap: number): PaintOp[] {
  const inset = size * gap;
  const s = size - inset * 2;
  const x = inset;
  const y = inset;
  const r = s * style.radius;
  const d = s * style.depth;
  const faceH = s - d;
  const face = shadeColor(base, style.faceMul);
  const at = (fx: number, fy: number): Point => ({ x: x + s * fx, y: y + s * fy });
  const ops: PaintOp[] = [];

  // 추가 표현(유리): 앞면 둘레의 같은 색 면
  if (style.extra === 'glass') {
    const halo = s * 0.025;
    ops.push({
      kind: 'rect',
      x: x - halo,
      y: y - halo,
      w: s + halo * 2,
      h: faceH + halo * 2,
      r: r + halo,
      fill: base,
      alpha: 0.07,
      stroke: null,
    });
  }
  // 아래 면(두께)
  ops.push({
    kind: 'rect',
    x,
    y: y + d,
    w: s,
    h: faceH,
    r,
    fill: shadeColor(base, style.bottomMul),
    alpha: 1,
    stroke: null,
  });
  // 앞면
  ops.push({
    kind: 'rect',
    x,
    y,
    w: s,
    h: faceH,
    r,
    fill: face,
    alpha: 1,
    stroke: style.stroke
      ? {
          color: mixColor(base, style.stroke.target, style.stroke.amount),
          width: s * style.stroke.width,
          alpha: 1,
        }
      : null,
  });

  const glossColor = mixColor(base, 0xffffff, style.gloss.amount);
  const gw = s * style.gloss.width;
  if (style.gloss.kind === 'curve') {
    // 왼쪽 위 짧은 곡선
    const left = style.extra === 'foot' ? 0.22 : 0.19;
    const top = style.extra === 'foot' ? 0.12 : 0.12;
    const mid = style.extra === 'foot' ? 0.24 : 0.19;
    const startY = style.extra === 'foot' ? 0.23 : 0.21;
    const endX = style.extra === 'foot' ? 0.6 : 0.7;
    const turnX = style.extra === 'foot' ? 0.38 : 0.29;
    ops.push({
      kind: 'line',
      points: [...quad(at(left, startY), at(mid, top), at(turnX, top)), at(endX, top)],
      color: glossColor,
      width: gw,
      alpha: 1,
    });
  } else {
    // 윗선: 위쪽 가로선이 오른쪽 위 모서리에서 꺾여 내려간다
    ops.push({
      kind: 'line',
      points: [
        at(0.14, 0.14),
        at(0.77, 0.14),
        ...quad(at(0.77, 0.14), at(0.87, 0.14), at(0.87, 0.25)),
      ],
      color: glossColor,
      width: gw,
      alpha: 1,
    });
  }

  if (style.extra === 'inner') {
    // 안쪽 64%×59%의 가는 테두리
    ops.push({
      kind: 'rect',
      x: x + s * 0.17,
      y: y + s * 0.19,
      w: s * 0.64,
      h: s * 0.59,
      r: r * 0.6,
      fill: null,
      alpha: 1,
      stroke: { color: mixColor(base, 0xffffff, 0.35), width: s * 0.016, alpha: 1 },
    });
  } else if (style.extra === 'glass') {
    // 위쪽 30% 띠
    ops.push({
      kind: 'rect',
      x: x + s * 0.12,
      y: y + s * 0.13,
      w: s * 0.76,
      h: s * 0.3,
      r: r * 0.4,
      fill: mixColor(base, 0xffffff, 0.16),
      alpha: 0.6,
      stroke: null,
    });
  } else {
    // 아래쪽 짧은 선
    ops.push({
      kind: 'line',
      points: [at(0.28, 0.74), at(0.7, 0.74)],
      color: shadeColor(base, 0.83),
      width: s * 0.035,
      alpha: 1,
    });
  }
  return ops;
}

/** 빈 칸: 둥근 사각형 한 개 */
export function emptyCellOps(
  style: BlockStyle,
  color: number,
  size: number,
  gap: number,
): PaintOp[] {
  const inset = size * gap;
  const s = size - inset * 2;
  return [
    {
      kind: 'rect',
      x: inset,
      y: inset,
      w: s,
      h: s,
      r: s * style.emptyRadius,
      fill: color,
      alpha: 1,
      stroke: null,
    },
  ];
}

/** 고스트(놓일 칸) 한 칸: 블록 색 반투명 면 + 테두리 */
export function ghostOps(
  block: BlockStyle,
  ghost: GhostStyle,
  base: number,
  size: number,
  gap: number,
  strokeRatio: number,
): PaintOp[] {
  const inset = size * gap;
  const s = size - inset * 2;
  const w = size * strokeRatio;
  return [
    {
      kind: 'rect',
      x: inset,
      y: inset,
      w: s,
      h: s,
      r: s * block.radius,
      fill: base,
      alpha: ghost.fillAlpha,
      stroke: null,
    },
    {
      kind: 'rect',
      x: inset + w / 2,
      y: inset + w / 2,
      w: s - w,
      h: s - w,
      r: Math.max(s * block.radius - w / 2, 0),
      fill: null,
      alpha: 1,
      stroke: {
        color: mixColor(base, ghost.stroke.target, ghost.stroke.amount),
        width: w,
        alpha: 1,
      },
    },
  ];
}
