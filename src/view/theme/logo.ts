// 메뉴 제목 로고와 그 위의 블록 장식. 로고 = 글꼴 + 직접 그린 도형 (그림 파일 없음). 시안 build_mockups.py의 logo·menu 함수가 원본이다.

import Phaser from 'phaser';
import { GAME, VIEW } from '../../config';
import { quadPoints, sparklePoints } from './backdrop';
import { blockOps, type PaintOp } from './blockPaint';
import { textStyle } from './textStyle';
import { themeOf } from './themeSetting';

const K = GAME.width / 390;

type Pt = { x: number; y: number };

/** 블록 한 칸 그리기: blockPaint 명령을 Graphics로 옮긴다 (텍스처가 아니라 크기가 제각각인 장식이라 그대로 그린다) */
function paintOps(
  g: Phaser.GameObjects.Graphics,
  ops: readonly PaintOp[],
  ox: number,
  oy: number,
): void {
  for (const op of ops) {
    if (op.kind === 'rect') {
      if (op.fill !== null)
        g.fillStyle(op.fill, op.alpha).fillRoundedRect(ox + op.x, oy + op.y, op.w, op.h, op.r);
      if (op.stroke !== null) {
        g.lineStyle(op.stroke.width, op.stroke.color, op.stroke.alpha).strokeRoundedRect(
          ox + op.x,
          oy + op.y,
          op.w,
          op.h,
          op.r,
        );
      }
    } else {
      g.lineStyle(op.width, op.color, op.alpha).strokePoints(
        op.points.map((p) => ({ x: ox + p.x, y: oy + p.y })),
        false,
      );
    }
  }
}

/** 메뉴의 로고 묶음. 가운데 x, 첫 줄 가운데 y를 받는다 */
export class MenuLogo {
  private readonly parts: Phaser.GameObjects.GameObject[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  destroy(): void {
    for (const part of this.parts) part.destroy();
    this.parts.length = 0;
  }

  /** (다시) 그린다: 이전 것은 지운다 */
  draw(cx: number, y1: number): void {
    this.destroy();
    const theme = themeOf(this.scene);
    const { logo, colors } = theme;
    const g = this.scene.add.graphics();
    this.parts.push(g);

    // 블록 장식 (로고 위): 시안은 세 칸(2×2에서 한 칸 빠진 모양)
    const cell = 35 * K;
    const my = y1 + VIEW.menu.motifDy;
    const tiles: [number, number, number][] =
      theme.id === 'butter'
        ? [
            [0, 0, 1],
            [1, 0, 0],
            [1, 1, 2],
          ]
        : theme.id === 'orbit'
          ? [
              [0, 0, 1],
              [1, 0, 5],
              [1, 1, 2],
            ]
          : [
              [0, 0, 3],
              [1, 0, 0],
              [1, 1, 2],
            ];
    const pitch = cell * (theme.id === 'butter' ? 1.15 : 1.17);
    const gx = cx - pitch - cell / 2 + (theme.id === 'soda' ? cell * 0.08 : 0);
    const gy = my - pitch / 2;
    if (theme.deco.kind === 'orbit') {
      // 블록 둘레의 얇은 궤도선과 작은 반짝임
      const rot = (-18 * Math.PI) / 180;
      const pts: Pt[] = [];
      for (let i = 0; i <= 64; i++) {
        const t = (i / 64) * Math.PI * 2;
        const ex = Math.cos(t) * 88 * K;
        const ey = Math.sin(t) * 27 * K;
        pts.push({
          x: cx + ex * Math.cos(rot) - ey * Math.sin(rot),
          y: my + 8 * K + ex * Math.sin(rot) + ey * Math.cos(rot),
        });
      }
      g.lineStyle(1.8, colors.edge, 1).strokePoints(pts, true);
    } else if (theme.deco.kind === 'soda') {
      g.fillStyle(theme.deco.hillFront, 1).fillRoundedRect(
        cx - 58 * K,
        gy + pitch * 2 - cell * 0.1 + 4 * K,
        117 * K,
        15 * K,
        7 * K,
      );
    }
    const tileLayer = this.scene.add.graphics();
    this.parts.push(tileLayer);
    tiles.forEach(([c, r, color]) => {
      const x = gx + c * pitch;
      const yy = gy + r * pitch;
      const base = colors.blocks[color] ?? colors.blocks[0];
      const ops = blockOps(theme.block, base, cell, 0);
      let layer: Phaser.GameObjects.Graphics = tileLayer;
      if (theme.id === 'butter') {
        // 시안은 세 칸을 -8도 기울여 놓는다: 칸마다 따로 회전한 그래픽으로
        layer = this.scene.add.graphics();
        this.parts.push(layer);
        layer.setPosition(cx, my).setRotation((-8 * Math.PI) / 180);
        paintOps(layer, ops, x - cx, yy - my);
        return;
      }
      paintOps(layer, ops, x, yy);
    });
    if (theme.deco.kind === 'orbit') {
      g.fillStyle(0xf3d679, 1).fillPoints(sparklePoints(cx + 90 * K, my + 30 * K, 5 * K), true);
    }

    // 두 줄 글자
    const [s1, s2] = logo.size;
    const y2 = y1 + (s1 / 2 + s2 / 2) * 0.88;
    const line = (text: string, y: number, size: number, color: number, dy = 0): void => {
      const t = this.scene.add
        .text(cx, y + dy, text, textStyle(theme, 'logo', size, color))
        .setOrigin(0.5)
        .setLetterSpacing(logo.spacing);
      this.parts.push(t);
    };
    // 아래 그림자는 첫 줄만 (시안)
    if (logo.shadow) line('Ddooby', y1, s1, logo.shadow.color, logo.shadow.dy);
    line('Ddooby', y1, s1, logo.color[0]);
    line('Block', y2, s2, logo.color[1]);

    // 밑줄·장식
    const under = this.scene.add.graphics();
    this.parts.push(under);
    const uy = y2 + s2 * 0.62;
    if (theme.id === 'butter') {
      under
        .lineStyle(4 * K, logo.accent, 1)
        .strokePoints(
          quadPoints(
            { x: cx - 92 * K, y: uy },
            { x: cx - 1 * K, y: uy + 10 * K },
            { x: cx + 91 * K, y: uy },
            20,
          ),
          false,
        );
    } else if (theme.id === 'orbit') {
      const x0 = cx - 92 * K;
      under.lineStyle(2 * K, logo.accent, 1).strokePoints(
        [
          { x: x0, y: uy },
          { x: cx + 84 * K, y: uy },
          { x: cx + 94 * K, y: uy - 10 * K },
        ],
        false,
      );
      under
        .fillStyle(logo.accent2, 1)
        .fillPoints(sparklePoints(cx + 107 * K, y1 - s1 * 0.46, 9 * K), true);
    } else {
      // 제목 옆 잎 도형
      const lx = cx + 81 * K;
      const ly = y1 - s1 * 0.4;
      under
        .fillStyle(logo.accent, 1)
        .fillPoints(
          [
            ...quadPoints(
              { x: lx, y: ly },
              { x: lx - 4 * K, y: ly - 24 * K },
              { x: lx + 17 * K, y: ly - 23 * K },
            ),
            ...quadPoints(
              { x: lx + 17 * K, y: ly - 23 * K },
              { x: lx + 19 * K, y: ly - 3 * K },
              { x: lx, y: ly },
            ),
          ],
          true,
        );
    }
  }
}
