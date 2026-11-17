// 배경 장식 (메뉴·게임·랭킹 뒤). 코드로 그린 원·곡선·점·궤도선·언덕·잎이고 이미지 파일은 없다.
// 시안은 390×844 기준이라 폭 720 기준 좌표로 비례 환산한다 (배율 720/390). 위쪽 장식은 화면 위에서, 아래쪽 장식은 화면 아래에서 잰다.
// 보드 안에는 무늬를 넣지 않는다. 화면 크기가 바뀌면 draw를 다시 부른다.

import type Phaser from 'phaser';
import { GAME, VIEW } from '../../config';
import { themeOf } from './themeSetting';
import type { Deco } from './themes';

type Pt = { x: number; y: number };

const MOCK_W = 390;
const MOCK_H = 844;
const K = GAME.width / MOCK_W;

/** 2차 베지어(Q)를 점으로 나눈다 (끝점 포함) */
export function quadPoints(p0: Pt, p1: Pt, p2: Pt, steps = 14): Pt[] {
  const out: Pt[] = [];
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

/** 4갈래 반짝임 (시안 sparkle) */
export function sparklePoints(cx: number, cy: number, s: number): Pt[] {
  const arm = (from: Pt, ctrl: Pt, to: Pt): Pt[] => quadPoints(from, ctrl, to, 6);
  const c = { x: cx, y: cy };
  return [
    ...arm({ x: cx, y: cy - s }, c, { x: cx + s, y: cy }),
    ...arm({ x: cx + s, y: cy }, c, { x: cx, y: cy + s }),
    ...arm({ x: cx, y: cy + s }, c, { x: cx - s, y: cy }),
    ...arm({ x: cx - s, y: cy }, c, { x: cx, y: cy - s }),
  ];
}

/** 잎 한 장: 시안의 `M x y q-12 -17 4 -25 q12 11 -4 25` 모양을 점으로 */
function leafA(x: number, y: number, k: number): Pt[] {
  return [
    ...quadPoints({ x, y }, { x: x - 12 * k, y: y - 17 * k }, { x: x + 4 * k, y: y - 25 * k }),
    ...quadPoints({ x: x + 4 * k, y: y - 25 * k }, { x: x + 16 * k, y: y - 14 * k }, { x, y }),
  ];
}
function leafB(x: number, y: number, k: number): Pt[] {
  const sx = x + 4 * k;
  const sy = y + 1 * k;
  return [
    ...quadPoints(
      { x: sx, y: sy },
      { x: sx + 4 * k, y: sy - 18 * k },
      { x: sx + 17 * k, y: sy - 16 * k },
    ),
    ...quadPoints({ x: sx + 17 * k, y: sy - 16 * k }, { x: sx + 16 * k, y: sy }, { x: sx, y: sy }),
  ];
}

export class Backdrop {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(VIEW.depth.backdrop);
    this.draw();
    scene.events.once('shutdown', () => this.g.destroy());
  }

  /** 지금 화면 크기·테마로 다시 그린다 */
  draw(): void {
    const { width, height } = this.scene.scale;
    const deco = themeOf(this.scene).deco;
    const bg = themeOf(this.scene).colors.background;
    this.g.clear();
    // 화면 전체를 배경색으로 (카메라 색은 씬마다 따로 정하지만 장식 아래 바탕은 여기서 보장한다)
    this.g.fillStyle(bg, 1).fillRect(0, 0, width, height);
    const left = Math.max(width - GAME.width, 0) / 2;
    const h = Math.max(height, GAME.height);
    // 시안 좌표 → 화면 좌표. 위쪽은 위에서, 아래쪽은 아래에서 잰다
    const top = (x: number, y: number): Pt => ({ x: left + x * K, y: y * K });
    const bottom = (x: number, y: number): Pt => ({ x: left + x * K, y: h - (MOCK_H - y) * K });
    paintDeco(this.g, deco, { top, bottom, left, width: Math.max(width, GAME.width), height: h });
  }
}

interface Anchors {
  top: (x: number, y: number) => Pt;
  bottom: (x: number, y: number) => Pt;
  left: number;
  width: number;
  height: number;
}

function paintDeco(g: Phaser.GameObjects.Graphics, deco: Deco, a: Anchors): void {
  if (deco.kind === 'butter') {
    for (const [x, y, r, anchor] of [
      [20, 130, 50, a.top],
      [370, 620, 110, a.bottom],
      [65, 835, 95, a.bottom],
    ] as const) {
      const c = anchor(x, y);
      g.fillStyle(deco.circle, 0.65).fillCircle(c.x, c.y, r * K);
    }
    const p0 = a.bottom(-30, 760);
    const p1 = a.bottom(150, 715);
    const p2 = a.bottom(445, 775);
    g.lineStyle(1.5, deco.curve, 1).strokePoints(quadPoints(p0, p1, p2, 24), false);
    const sparkles = [a.top(26, 178), a.top(354, 185), a.bottom(40, 819)];
    for (const s of sparkles)
      g.fillStyle(deco.sparkle, 1).fillPoints(sparklePoints(s.x, s.y, 6 * K), true);
  } else if (deco.kind === 'orbit') {
    // 약한 보라 광원: 시안의 방사형 그라데이션을 겹친 원으로 흉내 낸다
    const c = a.top(195, 230);
    const steps = 14;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      g.fillStyle(deco.glow, 0.65 / steps + 0.012).fillCircle(c.x, c.y, 300 * K * (1 - t * 0.98));
    }
    const stars: [number, number, number, boolean][] = [
      [27, 130, 1, true],
      [346, 74, 1.3, true],
      [82, 160, 0.7, true],
      [304, 656, 1, false],
      [35, 762, 1, false],
      [370, 403, 0.7, true],
      [145, 39, 0.8, true],
      [300, 804, 1, false],
    ];
    for (const [x, y, r, isTop] of stars) {
      const p = isTop ? a.top(x, y) : a.bottom(x, y);
      g.fillStyle(deco.star, 0.7).fillCircle(p.x, p.y, Math.max(r * K, 1.4));
    }
    // 아래쪽 궤도선: 타원을 -15도 기울여 그린다
    const o = a.bottom(195, 780);
    const rot = (-15 * Math.PI) / 180;
    const pts: Pt[] = [];
    for (let i = 0; i <= 72; i++) {
      const t = (i / 72) * Math.PI * 2;
      const ex = Math.cos(t) * 230 * K;
      const ey = Math.sin(t) * 48 * K;
      pts.push({
        x: o.x + ex * Math.cos(rot) - ey * Math.sin(rot),
        y: o.y + ex * Math.sin(rot) + ey * Math.cos(rot),
      });
    }
    g.lineStyle(1.6, deco.orbit, 0.3).strokePoints(pts, true);
  } else {
    // 낮은 언덕 두 겹: 시안의 `M0 698 Q88 646 172 705 T390 677` (T는 앞 제어점의 반사)
    const hill = (pts: [number, number][], color: number): void => {
      const [s, c1, m, e] = pts.map(([x, y]) => a.bottom(x, y)) as [Pt, Pt, Pt, Pt];
      const reflect = { x: 2 * m.x - c1.x, y: 2 * m.y - c1.y };
      const poly = [
        { x: -50, y: s.y },
        ...quadPoints(s, c1, m),
        ...quadPoints(m, reflect, e),
        { x: a.width + 50, y: e.y },
        { x: a.width + 50, y: a.height + 50 },
        { x: -50, y: a.height + 50 },
      ];
      g.fillStyle(color, 1).fillPoints(poly, true);
    };
    hill(
      [
        [0, 698],
        [88, 646],
        [172, 705],
        [390, 677],
      ],
      deco.hillBack,
    );
    hill(
      [
        [0, 788],
        [150, 724],
        [295, 789],
        [450, 773],
      ],
      deco.hillFront,
    );
    for (const [x, y, isTop] of [
      [29, 154, true],
      [353, 180, true],
      [343, 671, false],
    ] as const) {
      const p = isTop ? a.top(x, y) : a.bottom(x, y);
      g.fillStyle(deco.leafLight, 1).fillPoints(leafA(p.x, p.y, K), true);
      g.fillStyle(deco.leafDark, 1).fillPoints(leafB(p.x, p.y, K), true);
    }
  }
}
