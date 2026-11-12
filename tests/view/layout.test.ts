import { describe, expect, it } from 'vitest';
import {
  boardLayout,
  cellAt,
  cellCenter,
  createLayout,
  screenLayout,
  type Rect,
} from '../../src/view/layout';

// 기대값은 손으로 계산해 적는다. 기준 보드: x 40, y 200, 640×640, 칸 80.
const AREA = { x: 40, y: 200, size: 640 };

describe('createLayout', () => {
  it('8x8: 칸 80px, 보드가 영역을 꽉 채운다', () => {
    expect(createLayout(8, 8, AREA)).toEqual({
      rows: 8,
      cols: 8,
      cell: 80,
      x: 40,
      y: 200,
      width: 640,
      height: 640,
    });
  });

  it('크기가 8의 배수가 아니면 칸은 Math.floor, 남는 px은 양쪽에 나눈다', () => {
    // 650 / 8 = 81.25 → 81, 81 × 8 = 648, 남는 2px을 반씩
    expect(createLayout(8, 8, { x: 40, y: 200.5, size: 650 })).toEqual({
      rows: 8,
      cols: 8,
      cell: 81,
      x: 41,
      y: 201.5,
      width: 648,
      height: 648,
    });
  });

  it('정사각형이 아니면 긴 쪽에 맞추고 짧은 쪽을 가운데 정렬', () => {
    const l = createLayout(5, 8, AREA);
    expect(l.cell).toBe(80);
    expect(l.width).toBe(640);
    expect(l.height).toBe(400);
    expect(l.x).toBe(40);
    expect(l.y).toBe(320); // 200 + (640 − 400) / 2
  });
});

describe('cellCenter / cellAt', () => {
  const l = createLayout(8, 8, AREA);

  it('cellCenter: 칸 중심', () => {
    expect(cellCenter(l, { r: 0, c: 0 })).toEqual({ x: 80, y: 240 });
    expect(cellCenter(l, { r: 7, c: 7 })).toEqual({ x: 640, y: 800 });
    expect(cellCenter(l, { r: 2, c: 5 })).toEqual({ x: 480, y: 400 }); // 행 → y, 열 → x
  });

  it('cellCenter: 보드 밖 칸도 산술 좌표를 돌려준다', () => {
    expect(cellCenter(l, { r: -1, c: 0 })).toEqual({ x: 80, y: 160 });
    expect(cellCenter(l, { r: 8, c: -2 })).toEqual({ x: -80, y: 880 });
  });

  it('cellCenter → cellAt 왕복 64칸', () => {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const { x, y } = cellCenter(l, { r, c });
        expect(cellAt(l, x, y)).toEqual({ r, c });
      }
    }
  });

  it('cellAt: 왼쪽 위 경계는 포함, 오른쪽 아래 끝은 제외', () => {
    expect(cellAt(l, 40, 200)).toEqual({ r: 0, c: 0 });
    expect(cellAt(l, 119.9, 279.9)).toEqual({ r: 0, c: 0 });
    expect(cellAt(l, 120, 200)).toEqual({ r: 0, c: 1 }); // 칸 경계는 다음 칸
    expect(cellAt(l, 40, 280)).toEqual({ r: 1, c: 0 });
    expect(cellAt(l, 679.9, 839.9)).toEqual({ r: 7, c: 7 });
    expect(cellAt(l, 680, 500)).toBeNull();
    expect(cellAt(l, 300, 840)).toBeNull();
  });

  it('cellAt: 네 변 밖은 null', () => {
    expect(cellAt(l, 39.9, 500)).toBeNull(); // 왼쪽
    expect(cellAt(l, 680.1, 500)).toBeNull(); // 오른쪽
    expect(cellAt(l, 300, 199.9)).toBeNull(); // 위
    expect(cellAt(l, 300, 840.1)).toBeNull(); // 아래
  });

  it('cellAt: 소수 y에서 시작하는 보드', () => {
    const f = createLayout(8, 8, { x: 40, y: 366.8, size: 640 });
    expect(cellAt(f, 40, 366.8)).toEqual({ r: 0, c: 0 });
    expect(cellAt(f, 40, 366.7)).toBeNull();
    expect(cellAt(f, 100, 450)).toEqual({ r: 1, c: 0 }); // (450 − 366.8) / 80 = 1.04
  });

  it('cellAt: NaN·Infinity 좌표는 null', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(cellAt(l, bad, 300)).toBeNull();
      expect(cellAt(l, 300, bad)).toBeNull();
      expect(cellAt(l, bad, bad)).toBeNull();
    }
  });
});

const right = (a: Rect) => a.x + a.w;
const bottom = (a: Rect) => a.y + a.h;

describe('screenLayout', () => {
  it('기준 1280: HUD 0~180, 보드 (40, 200) 640×640, 트레이 980~1240', () => {
    expect(screenLayout(1280)).toEqual({
      width: 720,
      height: 1280,
      hud: { x: 0, y: 0, w: 720, h: 180 },
      board: { x: 40, y: 200, w: 640, h: 640 },
      tray: { x: 0, y: 980, w: 720, h: 260 },
    });
  });

  it('1558(390×844): 늘어난 278 중 60%만큼 보드가 내려가고 트레이는 아래에 붙는다', () => {
    const s = screenLayout(1558);
    expect(s.hud).toEqual({ x: 0, y: 0, w: 720, h: 180 });
    expect(s.board.y).toBeCloseTo(366.8, 6); // 200 + 278 × 0.6
    expect(s.tray).toEqual({ x: 0, y: 1258, w: 720, h: 260 }); // 1558 − 40 − 260
  });

  it.each([1280, 1400, 1558, 1558.15, 1800])('높이 %d: 구역 조건', (height) => {
    const s = screenLayout(height);
    expect(s.width).toBe(720);
    expect(s.height).toBe(height);

    // 보드는 x 40, 640×640 고정
    expect(s.board.x).toBe(40);
    expect(s.board.w).toBe(640);
    expect(s.board.h).toBe(640);

    // 위→아래 순서로 겹치지 않는다
    expect(s.hud.y).toBe(0);
    expect(bottom(s.hud)).toBeLessThanOrEqual(s.board.y);
    expect(bottom(s.board)).toBeLessThanOrEqual(s.tray.y);

    // 전부 화면 안
    for (const zone of [s.hud, s.board, s.tray]) {
      expect(zone.w).toBeGreaterThan(0);
      expect(zone.h).toBeGreaterThan(0);
      expect(zone.x).toBeGreaterThanOrEqual(0);
      expect(right(zone)).toBeLessThanOrEqual(720);
      expect(zone.y).toBeGreaterThanOrEqual(0);
      expect(bottom(zone)).toBeLessThanOrEqual(height);
    }

    // 트레이 전체가 화면 아래 1/4 안
    expect(s.tray.y).toBeGreaterThanOrEqual(0.75 * height);

    // 맨 아랫줄에 dot을 놓을 때 손가락 위치: 칸 중심(7.5칸) + 1.5칸 = 보드 위에서 9칸
    expect(s.board.y + 9 * 80).toBeLessThanOrEqual(height);
  });

  it('1280보다 짧으면 1280과 같다', () => {
    expect(screenLayout(1000)).toEqual(screenLayout(1280));
    expect(screenLayout(0)).toEqual(screenLayout(1280));
    expect(screenLayout(-5)).toEqual(screenLayout(1280));
  });

  it('유한한 수가 아니면 1280과 같다', () => {
    expect(screenLayout(Number.NaN)).toEqual(screenLayout(1280));
    expect(screenLayout(Number.POSITIVE_INFINITY)).toEqual(screenLayout(1280));
  });

  it('boardLayout: 보드 구역에 맞춘 8×8, 칸 80', () => {
    expect(boardLayout(screenLayout(1280))).toEqual({
      rows: 8,
      cols: 8,
      cell: 80,
      x: 40,
      y: 200,
      width: 640,
      height: 640,
    });
    const tall = boardLayout(screenLayout(1800)); // 200 + 520 × 0.6 = 512
    expect(tall.cell).toBe(80);
    expect(tall.x).toBe(40);
    expect(tall.y).toBe(512);
  });
});
