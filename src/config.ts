// 게임 수치는 전부 여기서 관리한다 (PLAN 5절). 규칙에 영향을 주는 값을 바꾸면 RULES_VERSION을 올린다 (PLAN 1절).

import type { PieceId } from './core/types';

export const RULES_VERSION = 1;

export const GAME = { width: 720, height: 1280 } as const;

export const BOARD = { size: 8 } as const;

export const TRAY = { size: 3 } as const;

export const GENERATOR = { maxRerolls: 10 } as const;

/** 조각별 추첨 가중치 (PLAN 4.2 표). 키는 core/pieces.ts의 PIECES ID와 같아야 하고 순서도 표 순서다 */
export const PIECE_WEIGHTS: Record<PieceId, number> = {
  dot: 4,
  i2h: 6,
  i2v: 6,
  i3h: 6,
  i3v: 6,
  i4h: 4,
  i4v: 4,
  i5h: 2,
  i5v: 2,
  o2: 6,
  r2x3: 3,
  r3x2: 3,
  o3: 1,
  l3a: 5,
  l3b: 5,
  l3c: 5,
  l3d: 5,
  l5a: 2,
  l5b: 2,
  l5c: 2,
  l5d: 2,
  tu: 4,
  td: 4,
  tl: 4,
  tr: 4,
  sh: 3,
  sv: 3,
  zh: 3,
  zv: 3,
};

export const SCORE = {
  perCell: 1,
  lines: [0, 100, 300, 600],
  line4: 1000,
  lineExtra: 500,
  boardClear: 3000,
} as const;

export const COMBO = { graceMisses: 2, step: 0.5 } as const;

export const REPLAY = { minIntervalMs: 200 } as const;

/**
 * 화면 수치 (PLAN 6.1). 규칙이 아니라서 바꿔도 RULES_VERSION과 무관하다.
 * screen은 논리 좌표(폭 GAME.width, 기준 높이 GAME.height)에서의 구역이고 view/layout.ts의 screenLayout이 읽는다.
 */
export const VIEW = {
  /** 드래그 중인 조각의 중심을 손가락보다 몇 칸 위에 둘지 (SPEC 3.4) */
  dragLiftCells: 1.5,
  /** 트레이에 놓인 조각의 크기 (보드 칸 대비) */
  trayScale: 0.55,
  screen: {
    /** HUD 높이 (화면 맨 위부터) */
    hudH: 180,
    /** 보드 (정사각형). boardY는 기준 높이에서의 값이다 */
    boardX: 40,
    boardY: 200,
    boardSize: 640,
    /** 트레이 높이와 화면 아래 여백. 트레이는 화면 아래에 붙는다 */
    trayH: 260,
    trayBottom: 40,
    /** 기준 높이보다 늘어난 만큼 중 보드를 아래로 내리는 비율 */
    boardShare: 0.6,
  },
} as const;

export const ANIM = {
  place: 90,
  clearPerCell: 25,
  clearFade: 180,
  trayIn: 200,
  returnToTray: 160,
} as const;

export const SAVE = { key: 'ddooby-block-save', runKey: 'ddooby-block-run' } as const;
