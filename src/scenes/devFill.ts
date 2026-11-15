// DEV 전용 `?fill=<이름>`: 연출을 바로 볼 수 있게 보드·트레이를 미리 채운 판을 만든다 (PLAN 6.3, TASKS W2-04).
// 이름 해석과 상태 만들기는 순수 함수다. 프로덕션 빌드(dev=false)에서는 이름이 무엇이든 무시한다.
//
// ⚠️ `?fill=`로 시작한 판은 빈 보드에서 시작하지 않으므로 (seed, 배치 로그)만으로 리플레이할 수 없다.
//    W2-05(저장·이어하기)와 W3(점수 제출)에서 이런 판은 저장·제출하지 않아야 한다. GameScene.replayable이 false다.
//
// 트레이는 이름이 정한다 (seed와 무관). 조각을 안내한 자리(FILL_GUIDE)에 놓으면 이름대로 된다.
// 보드의 나머지 칸은 한 줄·한 열이 완성되지 않고 3×3 빈 자리가 없게 채워 두었다 (남은 조각 o3이 흐려진다).

import { BOARD } from '../config';
import { createGame } from '../core/engine';
import type { Board, GameState, PieceId, PlaceAction } from '../core/types';

export const FILL_NAMES = ['line1', 'line2', 'line3', 'combo3', 'clear'] as const;
export type FillName = (typeof FILL_NAMES)[number];

/** `?fill=` 값. dev가 아니거나 이름이 다섯 개 중 하나가 아니면 null */
export function parseFillParam(search: string, dev: boolean): FillName | null {
  if (!dev) return null;
  const value = new URLSearchParams(search).get('fill');
  return FILL_NAMES.find((name) => name === value) ?? null;
}

/** 줄 문자열 8개 → 보드. '.' = 빈 칸, 숫자 0~6 = 그 색 그룹 */
function boardOf(rows: readonly string[]): Board {
  const cells: (number | null)[] = [];
  for (const row of rows) {
    for (const ch of row) cells.push(ch === '.' ? null : Number(ch));
  }
  if (rows.length !== BOARD.size || cells.length !== BOARD.size * BOARD.size) {
    throw new Error('devFill: 보드는 8×8이어야 한다');
  }
  return { size: BOARD.size, cells };
}

// 한 줄 완성 직전: 맨 아래 줄이 0~2열만 비었다. 나머지는 줄마다 구멍 하나씩
const LINE1_ROWS = [
  '123.4561',
  '23.1.562',
  '34512.63',
  '456123.4',
  '5612345.',
  '.1234561',
  '2.345612',
  '...34561',
];

// 두 줄 완성 직전: 아래 두 줄이 3열만 비었다
const LINE2_ROWS = [
  '.123.561',
  '2.345.62',
  '34.561.3',
  '456.123.',
  '5.3456.1',
  '12.3456.',
  '123.4561',
  '234.5612',
];

// 세 줄 완성 직전: 아래 세 줄이 0열만 비었다
const LINE3_ROWS = [
  '.123.561',
  '2.345.62',
  '34.561.3',
  '456.123.',
  '5.3456.1',
  '.2345612',
  '.3456123',
  '.4561234',
];

// 보드 전체 비우기 직전: 아래 줄만 3~7열이 찼다
const CLEAR_ROWS = [
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
  '...34561',
];

interface FillSpec {
  readonly rows: readonly string[];
  readonly tray: readonly [PieceId, PieceId, PieceId];
  readonly combo: number;
  /** 안내하는 배치 (트레이 번호는 0) */
  readonly action: PlaceAction;
  readonly note: string;
}

const SPECS: Record<FillName, FillSpec> = {
  line1: {
    rows: LINE1_ROWS,
    tray: ['i3h', 'dot', 'o3'],
    combo: 0,
    action: { trayIndex: 0, row: 7, col: 0 },
    note: '가로 3칸(i3h)을 맨 아래 줄 왼쪽 끝에 놓으면 1줄 제거',
  },
  line2: {
    rows: LINE2_ROWS,
    tray: ['i2v', 'dot', 'o3'],
    combo: 0,
    action: { trayIndex: 0, row: 6, col: 3 },
    note: '세로 2칸(i2v)을 아래 두 줄의 빈 칸(위에서 7·8번째 줄, 왼쪽에서 4번째 열)에 놓으면 2줄 제거 → 더블!',
  },
  line3: {
    rows: LINE3_ROWS,
    tray: ['i3v', 'dot', 'o3'],
    combo: 0,
    action: { trayIndex: 0, row: 5, col: 0 },
    note: '세로 3칸(i3v)을 아래 세 줄의 왼쪽 끝 열에 놓으면 3줄 제거 → 트리플!',
  },
  combo3: {
    rows: LINE1_ROWS,
    tray: ['i3h', 'dot', 'o3'],
    combo: 2,
    action: { trayIndex: 0, row: 7, col: 0 },
    note: '콤보 2에서 시작. 가로 3칸(i3h)을 맨 아래 줄 왼쪽 끝에 놓으면 1줄 제거로 콤보 3 → 콤보 x3!',
  },
  clear: {
    rows: CLEAR_ROWS,
    tray: ['i3h', 'dot', 'o3'],
    combo: 0,
    action: { trayIndex: 0, row: 7, col: 0 },
    note: '가로 3칸(i3h)을 맨 아래 줄 왼쪽 끝에 놓으면 보드가 전부 비어 전체 비우기',
  },
};

/** 이름마다 안내하는 배치 (테스트·DEVELOPMENT용) */
export const FILL_GUIDE: Record<FillName, { action: PlaceAction; note: string }> = {
  line1: { action: SPECS.line1.action, note: SPECS.line1.note },
  line2: { action: SPECS.line2.action, note: SPECS.line2.note },
  line3: { action: SPECS.line3.action, note: SPECS.line3.note },
  combo3: { action: SPECS.combo3.action, note: SPECS.combo3.note },
  clear: { action: SPECS.clear.action, note: SPECS.clear.note },
};

/**
 * 이름에 맞게 미리 채운 판. 다음 조각들은 seed로 뽑히도록 RNG 상태는 `createGame(seed)`의 것을 그대로 쓴다.
 * 점수는 0이다.
 */
export function fillState(name: FillName, seed: number): GameState {
  const spec = SPECS[name];
  const base = createGame(seed);
  return {
    ...base,
    board: boardOf(spec.rows),
    tray: [...spec.tray],
    combo: spec.combo,
    missStreak: 0,
  };
}
