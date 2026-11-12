import { describe, expect, it } from 'vitest';
import { place, previewPlacement } from '../../src/core/engine';
import { PIECES, getPiece } from '../../src/core/pieces';
import { createRng } from '../../src/core/rng';
import type { GameState, PieceDef, PieceId } from '../../src/core/types';
import {
  dragAnchor,
  dragTopLeft,
  pieceSize,
  trayPieceRect,
  traySlotRect,
} from '../../src/view/drag';
import { createLayout, screenLayout, type Layout, type Rect } from '../../src/view/layout';
import { boardFrom } from '../helpers/board';

// 기대값은 손으로 계산해 적는다 (구현을 거꾸로 불러 만들지 않는다).
// 기준 보드: x 40, y 200, 칸 80. 기본 lift 1.5칸 = 120px.
// 포인터 = 조각 bounding box 중심 + (0, 120). 상자 중심 = 왼쪽 위 + (열 수 × 40, 행 수 × 40).
const L: Layout = createLayout(8, 8, { x: 40, y: 200, size: 640 });

function piece(id: PieceId): PieceDef {
  const p = getPiece(id);
  if (p === undefined) throw new Error(`모르는 조각 ${id}`);
  return p;
}

const dot = piece('dot');

describe('pieceSize', () => {
  it('bounding box 크기 (행, 열)', () => {
    expect(pieceSize(dot)).toEqual({ rows: 1, cols: 1 });
    expect(pieceSize(piece('i5h'))).toEqual({ rows: 1, cols: 5 });
    expect(pieceSize(piece('i5v'))).toEqual({ rows: 5, cols: 1 });
    expect(pieceSize(piece('o2'))).toEqual({ rows: 2, cols: 2 });
    expect(pieceSize(piece('r2x3'))).toEqual({ rows: 2, cols: 3 });
    expect(pieceSize(piece('r3x2'))).toEqual({ rows: 3, cols: 2 });
    expect(pieceSize(piece('l5a'))).toEqual({ rows: 3, cols: 3 });
    expect(pieceSize(piece('l5b'))).toEqual({ rows: 3, cols: 3 });
    expect(pieceSize(piece('tu'))).toEqual({ rows: 2, cols: 3 });
    expect(pieceSize(piece('sv'))).toEqual({ rows: 3, cols: 2 });
  });

  it('29종 모두 1~5칸 범위', () => {
    for (const p of PIECES) {
      const { rows, cols } = pieceSize(p);
      expect(rows).toBeGreaterThanOrEqual(1);
      expect(rows).toBeLessThanOrEqual(5);
      expect(cols).toBeGreaterThanOrEqual(1);
      expect(cols).toBeLessThanOrEqual(5);
    }
  });
});

describe('dragTopLeft', () => {
  it('dot: 포인터 (80, 360) → 상자 중심 (80, 240), 왼쪽 위 (40, 200)', () => {
    expect(dragTopLeft(L, dot, { x: 80, y: 360 })).toEqual({ x: 40, y: 200 });
  });

  it('lift 0이면 상자 중심이 포인터 위치', () => {
    expect(dragTopLeft(L, dot, { x: 80, y: 360 }, 0)).toEqual({ x: 40, y: 320 });
  });

  it('상자 중심 = (pointer.x, pointer.y − lift × 칸): 가로·세로·짝수·3×3', () => {
    // i5h 400×80: 중심 (320, 320) → 왼쪽 위 (120, 280)
    expect(dragTopLeft(L, piece('i5h'), { x: 320, y: 440 })).toEqual({ x: 120, y: 280 });
    // i5v 80×400: 중심 (160, 480) → 왼쪽 위 (120, 280)
    expect(dragTopLeft(L, piece('i5v'), { x: 160, y: 600 })).toEqual({ x: 120, y: 280 });
    // o2 160×160: 중심 (360, 440) → 왼쪽 위 (280, 360)
    expect(dragTopLeft(L, piece('o2'), { x: 360, y: 560 })).toEqual({ x: 280, y: 360 });
    // l5a·l5b 240×240: 채운 칸이 한쪽에 몰려 있어도 상자 중심 (320, 480) → 왼쪽 위 (200, 360)
    expect(dragTopLeft(L, piece('l5a'), { x: 320, y: 600 })).toEqual({ x: 200, y: 360 });
    expect(dragTopLeft(L, piece('l5b'), { x: 320, y: 600 })).toEqual({ x: 200, y: 360 });
  });

  it('lift를 바꾸면 y만 그만큼 움직인다', () => {
    // r2x3 240×160, lift 2칸 = 160px: (300 − 120, 500 − 160 − 80)
    expect(dragTopLeft(L, piece('r2x3'), { x: 300, y: 500 }, 2)).toEqual({ x: 180, y: 260 });
  });
});

describe('dragAnchor', () => {
  it('TASKS: 조각은 손가락보다 1.5칸 위, anchor는 그 위치 기준', () => {
    expect(dragAnchor(L, dot, { x: 80, y: 360 })).toEqual({ r: 0, c: 0 });
    // 같은 포인터에서 lift가 없으면 조각이 1.5칸 아래: Math.round(1.5) = 2
    expect(dragAnchor(L, dot, { x: 80, y: 360 }, 0)).toEqual({ r: 2, c: 0 });
    // lift 0으로 같은 칸을 가리키려면 손가락이 1.5칸 위(y 240)에 있어야 한다
    expect(dragAnchor(L, dot, { x: 80, y: 240 }, 0)).toEqual({ r: 0, c: 0 });
  });

  it('기본 lift는 1.5칸', () => {
    for (const p of [dot, piece('i5v'), piece('l5a')]) {
      for (const pointer of [
        { x: 80, y: 360 },
        { x: 333.3, y: 701.7 },
      ]) {
        expect(dragAnchor(L, p, pointer)).toEqual(dragAnchor(L, p, pointer, 1.5));
        expect(dragTopLeft(L, p, pointer)).toEqual(dragTopLeft(L, p, pointer, 1.5));
      }
    }
  });

  // dot의 왼쪽 위 = (pointer.x − 40, pointer.y − 160)
  it('🔎 왼쪽 경계: 0.4칸 밖 → 0, 0.5칸 밖 → 0, 0.6칸 밖 → −1 (반올림)', () => {
    expect(dragAnchor(L, dot, { x: 48, y: 360 }).c).toBe(0); // 왼쪽 위 x 8 = −0.4칸
    expect(dragAnchor(L, dot, { x: 40, y: 360 }).c).toBe(0); // 왼쪽 위 x 0 = −0.5칸
    expect(dragAnchor(L, dot, { x: 39, y: 360 }).c).toBe(-1); // 경계 바로 바깥
    expect(dragAnchor(L, dot, { x: 32, y: 360 }).c).toBe(-1); // 왼쪽 위 x −8 = −0.6칸
  });

  it('🔎 위쪽 경계: r에도 같은 규칙', () => {
    expect(dragAnchor(L, dot, { x: 80, y: 328 }).r).toBe(0); // 왼쪽 위 y 168 = −0.4칸
    expect(dragAnchor(L, dot, { x: 80, y: 320 }).r).toBe(0); // −0.5칸
    expect(dragAnchor(L, dot, { x: 80, y: 319 }).r).toBe(-1);
    expect(dragAnchor(L, dot, { x: 80, y: 312 }).r).toBe(-1); // −0.6칸
  });

  it('🔎 -0을 돌려주지 않는다', () => {
    for (const pointer of [
      { x: 48, y: 328 }, // 둘 다 −0.4칸
      { x: 40, y: 320 }, // 둘 다 −0.5칸
      { x: 80, y: 360 }, // 정확히 0
    ]) {
      const a = dragAnchor(L, dot, pointer);
      expect(a).toEqual({ r: 0, c: 0 });
      expect(Object.is(a.r, -0)).toBe(false);
      expect(Object.is(a.c, -0)).toBe(false);
    }
  });

  it('반올림: +0.4 → 0, +0.5 → 1, −1.5 → −1, −1.6 → −2', () => {
    expect(dragAnchor(L, dot, { x: 112, y: 360 }).c).toBe(0); // 왼쪽 위 x 72
    expect(dragAnchor(L, dot, { x: 120, y: 360 }).c).toBe(1); // 왼쪽 위 x 80
    expect(dragAnchor(L, dot, { x: -40, y: 360 }).c).toBe(-1); // 왼쪽 위 x −80
    expect(dragAnchor(L, dot, { x: -48, y: 360 }).c).toBe(-2); // 왼쪽 위 x −88
  });

  it('오른쪽·아래쪽: +7.4칸 → 7, +7.6칸 → 8 (보드 밖 anchor를 자르지 않는다)', () => {
    expect(dragAnchor(L, dot, { x: 672, y: 360 }).c).toBe(7); // 왼쪽 위 x 632
    expect(dragAnchor(L, dot, { x: 688, y: 360 }).c).toBe(8); // 왼쪽 위 x 648
    expect(dragAnchor(L, dot, { x: 80, y: 952 }).r).toBe(7); // 왼쪽 위 y 792
    expect(dragAnchor(L, dot, { x: 80, y: 968 }).r).toBe(8); // 왼쪽 위 y 808
  });

  it('멀리 벗어난 값도 그대로: 모서리·대각선 밖', () => {
    // 왼쪽 위 (−250, −360) → ((−360 − 200) / 80, (−250 − 40) / 80) = (−7, −3.625)
    expect(dragAnchor(L, dot, { x: -210, y: -200 })).toEqual({ r: -7, c: -4 });
    // 왼쪽 위 (970, 1340) → (14.25, 11.625)
    expect(dragAnchor(L, dot, { x: 1010, y: 1500 })).toEqual({ r: 14, c: 12 });
  });

  it('bounding box 중심 기준: i5h·i5v (행·열을 바꿔 쓰면 실패)', () => {
    expect(dragAnchor(L, piece('i5h'), { x: 320, y: 440 })).toEqual({ r: 1, c: 1 });
    expect(dragAnchor(L, piece('i5v'), { x: 160, y: 600 })).toEqual({ r: 1, c: 1 });
    // 같은 포인터에서 가로·세로 조각의 anchor는 다르다: i5v 왼쪽 위 (280, 120) → (−1, 3)
    expect(dragAnchor(L, piece('i5v'), { x: 320, y: 440 })).toEqual({ r: -1, c: 3 });
  });

  it('bounding box 중심 기준: o2 (짝수 폭)', () => {
    // 왼쪽 위 (280, 360) = (2, 3)칸
    expect(dragAnchor(L, piece('o2'), { x: 360, y: 560 })).toEqual({ r: 2, c: 3 });
    // 반 칸 경계: 왼쪽 위 x 240 = 2.5칸 → 3, x 239 → 2
    expect(dragAnchor(L, piece('o2'), { x: 320, y: 560 }).c).toBe(3);
    expect(dragAnchor(L, piece('o2'), { x: 319, y: 560 }).c).toBe(2);
  });

  it('bounding box 중심 기준: l5a·l5b (채운 칸의 평균이 아니다)', () => {
    // l5a 왼쪽 위 (224, 384) = (2.3, 2.3)칸 → (2, 2). 채운 칸 평균을 쓰면 c가 2.7 → 3이 된다
    expect(dragAnchor(L, piece('l5a'), { x: 344, y: 624 })).toEqual({ r: 2, c: 2 });
    // l5b 왼쪽 위 (176, 336) = (1.7, 1.7)칸 → (2, 2). 채운 칸 평균을 쓰면 1.3 → 1이 된다
    expect(dragAnchor(L, piece('l5b'), { x: 296, y: 576 })).toEqual({ r: 2, c: 2 });
  });

  it('dragTopLeft를 칸 단위로 반올림한 것과 같다 (29종)', () => {
    const pointers = [
      { x: 80, y: 360 },
      { x: 37.5, y: 318.25 },
      { x: 511.11, y: 777.77 },
      { x: 700, y: 1100 },
    ];
    for (const p of PIECES) {
      for (const pointer of pointers) {
        const tl = dragTopLeft(L, p, pointer);
        expect(dragAnchor(L, p, pointer)).toEqual({
          r: Math.round((tl.y - 200) / 80) + 0,
          c: Math.round((tl.x - 40) / 80) + 0,
        });
      }
    }
  });

  it('소수 px 포인터, 칸 64짜리 다른 보드', () => {
    const small: Layout = { rows: 8, cols: 8, cell: 64, x: 104, y: 300.5, width: 512, height: 512 };
    // o2 128×128, lift 96px. 왼쪽 위 = (370.25 − 64, 568 − 96 − 64) = (306.25, 408)
    // → ((408 − 300.5) / 64, (306.25 − 104) / 64) = (1.68, 3.16) → (2, 3)
    expect(dragTopLeft(small, piece('o2'), { x: 370.25, y: 568 })).toEqual({ x: 306.25, y: 408 });
    expect(dragAnchor(small, piece('o2'), { x: 370.25, y: 568 })).toEqual({ r: 2, c: 3 });
    // dot 64×64: 왼쪽 위 y = 428.5 − 96 − 32 = 300.5 (0칸), x는 보드 왼쪽에서 −0.4칸(−25.6px) / −0.6칸(−38.4px)
    expect(dragAnchor(small, dot, { x: 110.4, y: 428.5 })).toEqual({ r: 0, c: 0 });
    expect(dragAnchor(small, dot, { x: 97.6, y: 428.5 })).toEqual({ r: 0, c: -1 });
  });

  it('같은 입력은 같은 결과, 입력을 바꾸지 않는다 (얼린 layout·piece·pointer)', () => {
    const layout = Object.freeze({ ...L });
    const pointer = Object.freeze({ x: 344, y: 624 });
    const p = piece('l5a'); // PIECES는 이미 얼려져 있다
    expect(Object.isFrozen(p)).toBe(true);
    const first = dragAnchor(layout, p, pointer);
    expect(dragAnchor(layout, p, pointer)).toEqual(first);
    expect(dragTopLeft(layout, p, pointer)).toEqual({ x: 224, y: 384 });
    expect(pieceSize(p)).toEqual({ rows: 3, cols: 3 });
    expect(layout).toEqual(L);
    expect(pointer).toEqual({ x: 344, y: 624 });
    expect(p.cells).toHaveLength(5);
  });
});

describe('dragAnchor → core 연계 (PLAN 9절 1번)', () => {
  const EMPTY = new Array<string>(8).fill('........').join('\n');
  const state: GameState = {
    board: boardFrom(EMPTY),
    tray: ['i5h', 'i5v', 'dot'],
    rngState: createRng(1),
    score: 0,
    combo: 0,
    missStreak: 0,
    over: false,
  };

  function act(trayIndex: number, pointer: { x: number; y: number }) {
    const id = state.tray[trayIndex];
    if (id === null || id === undefined) throw new Error('빈 슬롯');
    const anchor = dragAnchor(L, piece(id), pointer);
    const action = { trayIndex, row: anchor.r, col: anchor.c };
    return { anchor, preview: previewPlacement(state, action), result: place(state, action) };
  }

  it('놓을 수 있는 위치: 미리보기 칸과 place 이벤트의 칸이 같다', () => {
    const { anchor, preview, result } = act(0, { x: 320, y: 440 });
    const cells = [1, 2, 3, 4, 5].map((c) => ({ r: 1, c }));
    expect(anchor).toEqual({ r: 1, c: 1 });
    expect(preview?.cells).toEqual(cells);
    if (!result.ok) throw new Error(`place 실패: ${result.reason}`);
    const placed = result.events.find((e) => e.type === 'place');
    expect(placed?.cells).toEqual(cells);
    expect(placed?.cells).toEqual(preview?.cells);
  });

  it('i5h가 오른쪽으로 넘치면 anchor는 보드 안이어도 미리보기 null, place는 blocked', () => {
    // 왼쪽 위 (360, 280) → anchor (1, 4), 칸은 4~8열
    const { anchor, preview, result } = act(0, { x: 560, y: 440 });
    expect(anchor).toEqual({ r: 1, c: 4 });
    expect(preview).toBeNull();
    expect(result).toEqual({ ok: false, reason: 'blocked' });
  });

  it('i5v: 마지막 합법 행 3은 놓이고 4는 막힌다', () => {
    // anchor (3, 0): 왼쪽 위 (40, 440), 중심 (80, 640), 포인터 (80, 760)
    const ok = act(1, { x: 80, y: 760 });
    expect(ok.anchor).toEqual({ r: 3, c: 0 });
    expect(ok.preview?.cells).toEqual([3, 4, 5, 6, 7].map((r) => ({ r, c: 0 })));
    expect(ok.result.ok).toBe(true);
    // 한 칸 아래: 포인터 (80, 840)
    const blocked = act(1, { x: 80, y: 840 });
    expect(blocked.anchor).toEqual({ r: 4, c: 0 });
    expect(blocked.preview).toBeNull();
    expect(blocked.result).toEqual({ ok: false, reason: 'blocked' });
  });

  it('보드 밖 anchor(음수)도 그대로 넘기면 core가 막는다', () => {
    const { anchor, preview, result } = act(2, { x: 32, y: 360 });
    expect(anchor).toEqual({ r: 0, c: -1 });
    expect(preview).toBeNull();
    expect(result).toEqual({ ok: false, reason: 'blocked' });
  });
});

const right = (a: Rect) => a.x + a.w;
const bottom = (a: Rect) => a.y + a.h;

/** 두 사각형이 겹치는 면적. 맞닿기만 하면 0 */
function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(right(a), right(b)) - Math.max(a.x, b.x);
  const h = Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y);
  return Math.max(0, w) * Math.max(0, h);
}

function expectInside(inner: Rect, outer: Rect): void {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y);
  expect(right(inner)).toBeLessThanOrEqual(right(outer));
  expect(bottom(inner)).toBeLessThanOrEqual(bottom(outer));
}

describe('traySlotRect', () => {
  it('기준 1280: 240×260 슬롯 3개, x 0 / 240 / 480, y 980', () => {
    const s = screenLayout(1280);
    expect(traySlotRect(s, 0)).toEqual({ x: 0, y: 980, w: 240, h: 260 });
    expect(traySlotRect(s, 1)).toEqual({ x: 240, y: 980, w: 240, h: 260 });
    expect(traySlotRect(s, 2)).toEqual({ x: 480, y: 980, w: 240, h: 260 });
  });

  it('1558: 같은 폭, y 1258', () => {
    const s = screenLayout(1558);
    expect(traySlotRect(s, 0)).toEqual({ x: 0, y: 1258, w: 240, h: 260 });
    expect(traySlotRect(s, 2)).toEqual({ x: 480, y: 1258, w: 240, h: 260 });
  });

  it.each([1280, 1558])('TASKS 높이 %d: 3개가 겹치지 않고 화면 폭 0~720, 트레이 안', (height) => {
    const s = screenLayout(height);
    const slots = [0, 1, 2].map((i) => traySlotRect(s, i));
    for (const slot of slots) {
      expect(slot.w).toBeGreaterThan(0);
      expect(slot.h).toBeGreaterThan(0);
      expect(slot.x).toBeGreaterThanOrEqual(0);
      expect(right(slot)).toBeLessThanOrEqual(720);
      expectInside(slot, s.tray);
    }
    expect(overlapArea(slots[0]!, slots[1]!)).toBe(0);
    expect(overlapArea(slots[1]!, slots[2]!)).toBe(0);
    expect(overlapArea(slots[0]!, slots[2]!)).toBe(0);
    // 왼쪽에서 오른쪽 순서
    expect(slots[0]!.x).toBeLessThan(slots[1]!.x);
    expect(slots[1]!.x).toBeLessThan(slots[2]!.x);
  });

  it('index가 0~2의 정수가 아니면 RangeError', () => {
    const s = screenLayout(1280);
    for (const bad of [-1, 3, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => traySlotRect(s, bad)).toThrow(RangeError);
      expect(() => trayPieceRect(s, bad, dot)).toThrow(RangeError);
    }
  });

  it('입력을 바꾸지 않는다', () => {
    const s = screenLayout(1280);
    const frozen = Object.freeze({ ...s, tray: Object.freeze({ ...s.tray }) });
    expect(traySlotRect(frozen, 1)).toEqual({ x: 240, y: 980, w: 240, h: 260 });
    expect(frozen).toEqual(s);
  });
});

describe('trayPieceRect', () => {
  // 트레이 칸 = 80 × 0.55 = 44
  it('기준 1280, 슬롯 0: dot 44×44, i5h 220×44, i5v 44×220이 슬롯 가운데', () => {
    const s = screenLayout(1280);
    // 슬롯 0: x 0~240 (가운데 120), y 980~1240 (가운데 1110)
    const d = trayPieceRect(s, 0, dot);
    expect(d.x).toBeCloseTo(98, 6);
    expect(d.y).toBeCloseTo(1088, 6);
    expect(d.w).toBeCloseTo(44, 6);
    expect(d.h).toBeCloseTo(44, 6);
    const h = trayPieceRect(s, 0, piece('i5h'));
    expect(h.x).toBeCloseTo(10, 6);
    expect(h.y).toBeCloseTo(1088, 6);
    expect(h.w).toBeCloseTo(220, 6);
    expect(h.h).toBeCloseTo(44, 6);
    const v = trayPieceRect(s, 0, piece('i5v'));
    expect(v.x).toBeCloseTo(98, 6);
    expect(v.y).toBeCloseTo(1000, 6);
    expect(v.w).toBeCloseTo(44, 6);
    expect(v.h).toBeCloseTo(220, 6);
  });

  it('슬롯 2에서는 x만 480만큼 옮겨진다', () => {
    const s = screenLayout(1280);
    const h = trayPieceRect(s, 2, piece('i5h'));
    expect(h.x).toBeCloseTo(490, 6);
    expect(h.y).toBeCloseTo(1088, 6);
  });

  it.each([1280, 1558])('높이 %d: 29종이 슬롯마다 슬롯 안에 들어가고 가운데 정렬', (height) => {
    const s = screenLayout(height);
    for (const index of [0, 1, 2]) {
      const slot = traySlotRect(s, index);
      for (const p of PIECES) {
        const rect = trayPieceRect(s, index, p);
        const { rows, cols } = pieceSize(p);
        expect(rect.w).toBeCloseTo(cols * 44, 6);
        expect(rect.h).toBeCloseTo(rows * 44, 6);
        expectInside(rect, slot);
        expect(rect.x + rect.w / 2).toBeCloseTo(slot.x + 120, 6);
        expect(rect.y + rect.h / 2).toBeCloseTo(slot.y + 130, 6);
      }
    }
  });
});
