import { describe, expect, it } from 'vitest';
import { getPiece } from '../../src/core/pieces';
import type { PieceDef, Pos } from '../../src/core/types';
import type { Preview } from '../../src/view/BoardView';
import { DragController, type DragHost } from '../../src/view/DragController';
import type { Point } from '../../src/view/drag';
import { boardLayout, screenLayout } from '../../src/view/layout';

// 기준 화면 1280: 보드 x 40, y 200, 칸 80. 트레이 y 980~1240, 슬롯 폭 240 (0~240, 240~480, 480~720).
// dot(1×1)을 들고 포인터가 (400, 600)이면 왼쪽 위 = (400 − 40, 600 − 120 − 40) = (360, 440)
// → 기준 칸 = ((440 − 200) / 80, (360 − 40) / 80) = (3, 4)
const SCREEN = screenLayout(1280);
const SLOT0: Point = { x: 120, y: 1100 };
const SLOT1: Point = { x: 360, y: 1100 };
const ON_BOARD: Point = { x: 400, y: 600 };
const ON_BOARD_ANCHOR: Pos = { r: 3, c: 4 };
const PREVIEW: Preview = { cells: [{ r: 3, c: 4 }], rows: [], cols: [] };

function piece(id: string): PieceDef {
  const p = getPiece(id);
  if (p === undefined) throw new Error(`모르는 조각 ${id}`);
  return p;
}

function setup(options: { dropOk?: boolean; previewOk?: boolean } = {}) {
  const lock = { playing: false, paused: false, over: false };
  const tray: (PieceDef | null)[] = [piece('dot'), piece('o2'), null];
  const calls: string[] = [];
  const lifts: { index: number; topLeft: Point }[] = [];
  const drops: { index: number; anchor: Pos }[] = [];
  const previews: Pos[] = [];
  const host: DragHost = {
    lock: () => lock,
    screen: () => SCREEN,
    layout: () => boardLayout(SCREEN),
    pieceAt: (index) => tray[index] ?? null,
    lift: (index, topLeft) => {
      calls.push('lift');
      lifts.push({ index, topLeft });
    },
    returnHome: (index) => calls.push(`returnHome ${index}`),
    preview: (_index, anchor) => {
      previews.push(anchor);
      return options.previewOk === false ? null : PREVIEW;
    },
    showPreview: () => calls.push('showPreview'),
    hidePreview: () => calls.push('hidePreview'),
    drop: (index, anchor) => {
      calls.push('drop');
      drops.push({ index, anchor });
      return options.dropOk !== false;
    },
  };
  return { drag: new DragController(host), lock, calls, lifts, drops, previews };
}

const pointer = (id: number, at: Point, wasCanceled = false) => ({ id, ...at, wasCanceled });

describe('DragController: 집기', () => {
  it('슬롯 안에서 누르면 집고, 바로 손가락 위에 그린다', () => {
    const t = setup();
    t.drag.onDown(pointer(1, SLOT0));
    expect(t.drag.dragging).toBe(true);
    // dot: 왼쪽 위 = (120 − 40, 1100 − 120 − 40)
    expect(t.lifts).toEqual([{ index: 0, topLeft: { x: 80, y: 940 } }]);
  });

  it('트레이 밖(보드 위)에서 누르면 집지 않는다', () => {
    const t = setup();
    t.drag.onDown(pointer(1, ON_BOARD));
    expect(t.drag.dragging).toBe(false);
    expect(t.calls).toEqual([]);
  });

  it('빈 슬롯은 집지 않는다', () => {
    const t = setup();
    t.drag.onDown(pointer(1, { x: 600, y: 1100 }));
    expect(t.drag.dragging).toBe(false);
    expect(t.calls).toEqual([]);
  });

  it('슬롯 경계: 240은 슬롯 1, 트레이 위·아래 끝 밖은 집지 않는다', () => {
    const a = setup();
    a.drag.onDown(pointer(1, { x: 240, y: 1100 }));
    expect(a.lifts[0]?.index).toBe(1);

    const b = setup();
    b.drag.onDown(pointer(1, { x: 239.9, y: 980 }));
    expect(b.lifts[0]?.index).toBe(0);

    const c = setup();
    c.drag.onDown(pointer(1, { x: 120, y: 979.9 }));
    c.drag.onDown(pointer(1, { x: 120, y: 1240 }));
    expect(c.drag.dragging).toBe(false);
  });

  it.each(['playing', 'paused', 'over'] as const)('%s이면 집을 수 없다', (key) => {
    const t = setup();
    t.lock[key] = true;
    t.drag.onDown(pointer(1, SLOT0));
    expect(t.drag.dragging).toBe(false);
    expect(t.calls).toEqual([]);
  });
});

describe('DragController: 이동과 놓기', () => {
  it('이동하면 고스트를 보이고, 놓을 수 없는 곳이면 숨긴다', () => {
    const ok = setup();
    ok.drag.onDown(pointer(1, SLOT0));
    ok.calls.length = 0;
    ok.drag.onMove(pointer(1, ON_BOARD));
    expect(ok.calls).toEqual(['lift', 'showPreview']);
    expect(ok.previews.at(-1)).toEqual(ON_BOARD_ANCHOR);

    const blocked = setup({ previewOk: false });
    blocked.drag.onDown(pointer(1, SLOT0));
    blocked.calls.length = 0;
    blocked.drag.onMove(pointer(1, ON_BOARD));
    expect(blocked.calls).toEqual(['lift', 'hidePreview']);
  });

  it('놓기는 마지막 이동에서 계산한 anchor를 쓴다 (up 좌표로 다시 계산하지 않는다, PLAN 9절 1번)', () => {
    const t = setup();
    t.drag.onDown(pointer(1, SLOT0));
    t.drag.onMove(pointer(1, ON_BOARD));
    // up 좌표는 두 칸 오른쪽·한 칸 아래. 다시 계산하면 (4, 6)이 된다
    t.drag.onUp(pointer(1, { x: 560, y: 680 }));
    expect(t.drops).toEqual([{ index: 0, anchor: ON_BOARD_ANCHOR }]);
    expect(t.drag.dragging).toBe(false);
  });

  it('놓기에 성공하면 고스트를 숨기고 조각을 되돌리지 않는다', () => {
    const t = setup();
    t.drag.onDown(pointer(1, SLOT0));
    t.drag.onMove(pointer(1, ON_BOARD));
    t.calls.length = 0;
    t.drag.onUp(pointer(1, ON_BOARD));
    expect(t.calls).toEqual(['hidePreview', 'drop']);
  });

  it('놓기에 실패하면 슬롯으로 되돌린다', () => {
    const t = setup({ dropOk: false, previewOk: false });
    t.drag.onDown(pointer(1, SLOT0));
    t.drag.onMove(pointer(1, { x: 400, y: 100 }));
    t.calls.length = 0;
    t.drag.onUp(pointer(1, { x: 400, y: 100 }));
    expect(t.calls).toEqual(['hidePreview', 'drop', 'returnHome 0']);
    expect(t.drag.dragging).toBe(false);
  });

  it('움직이지 않고 떼면 누른 자리의 anchor로 놓기를 시도한다 (보드 밖이라 core가 거부한다)', () => {
    const t = setup({ dropOk: false, previewOk: false });
    t.drag.onDown(pointer(1, SLOT0));
    t.drag.onUp(pointer(1, SLOT0));
    // 왼쪽 위 (80, 940) → ((940 − 200) / 80, (80 − 40) / 80) = (9.25, 0.5) → (9, 1)
    expect(t.drops).toEqual([{ index: 0, anchor: { r: 9, c: 1 } }]);
    expect(t.calls.at(-1)).toBe('returnHome 0');
  });

  it('놓은 뒤에는 다시 집을 수 있다', () => {
    const t = setup();
    t.drag.onDown(pointer(1, SLOT0));
    t.drag.onUp(pointer(1, SLOT0));
    t.drag.onDown(pointer(1, SLOT1));
    expect(t.lifts.at(-1)?.index).toBe(1);
  });
});

describe('DragController: 포인터 하나만 추적', () => {
  it('드래그 중 다른 포인터의 down·move·up은 무시한다', () => {
    const t = setup();
    t.drag.onDown(pointer(1, SLOT0));
    t.drag.onMove(pointer(1, ON_BOARD));
    const before = [...t.calls];

    t.drag.onDown(pointer(2, SLOT1));
    t.drag.onMove(pointer(2, { x: 200, y: 300 }));
    t.drag.onUp(pointer(2, { x: 200, y: 300 }));

    expect(t.calls).toEqual(before);
    expect(t.lifts.every((lift) => lift.index === 0)).toBe(true);
    expect(t.drag.dragging).toBe(true);

    // 원래 포인터는 그대로 이어진다
    t.drag.onUp(pointer(1, ON_BOARD));
    expect(t.drops).toEqual([{ index: 0, anchor: ON_BOARD_ANCHOR }]);
  });

  it('드래그가 없을 때의 move·up은 무시한다', () => {
    const t = setup();
    t.drag.onMove(pointer(1, ON_BOARD));
    t.drag.onUp(pointer(1, ON_BOARD));
    expect(t.calls).toEqual([]);
  });
});

describe('DragController: 취소', () => {
  it('touchcancel로 끝나면 놓지 않고 되돌린다', () => {
    const t = setup();
    t.drag.onDown(pointer(1, SLOT0));
    t.drag.onMove(pointer(1, ON_BOARD));
    t.calls.length = 0;
    t.drag.onUp(pointer(1, ON_BOARD, true));
    expect(t.calls).toEqual(['hidePreview', 'returnHome 0']);
    expect(t.drops).toEqual([]);
    expect(t.drag.dragging).toBe(false);
  });

  it('cancel: 고스트를 숨기고 되돌린다. 그 뒤의 move·up은 무시한다', () => {
    const t = setup();
    t.drag.onDown(pointer(1, SLOT0));
    t.drag.onMove(pointer(1, ON_BOARD));
    t.calls.length = 0;
    t.drag.cancel();
    expect(t.calls).toEqual(['hidePreview', 'returnHome 0']);
    t.drag.onMove(pointer(1, ON_BOARD));
    t.drag.onUp(pointer(1, ON_BOARD));
    expect(t.calls).toEqual(['hidePreview', 'returnHome 0']);
    expect(t.drops).toEqual([]);
  });

  it('드래그가 없을 때 cancel은 아무것도 하지 않는다', () => {
    const t = setup();
    t.drag.cancel();
    expect(t.calls).toEqual([]);
  });

  it.each(['playing', 'paused', 'over'] as const)(
    '드래그 중에 %s이 되면 update에서 취소한다',
    (key) => {
      const t = setup();
      t.drag.onDown(pointer(1, SLOT0));
      t.drag.update();
      expect(t.drag.dragging).toBe(true);
      t.lock[key] = true;
      t.calls.length = 0;
      t.drag.update();
      expect(t.calls).toEqual(['hidePreview', 'returnHome 0']);
      expect(t.drag.dragging).toBe(false);
    },
  );
});
