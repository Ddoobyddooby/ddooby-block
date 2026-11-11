// 게임 수치는 전부 여기서 관리한다 (PLAN 5절). 규칙에 영향을 주는 값을 바꾸면 RULES_VERSION을 올린다 (PLAN 1절).

export const RULES_VERSION = 1;

export const GAME = { width: 720, height: 1280 } as const;

export const BOARD = { size: 8 } as const;

export const TRAY = { size: 3 } as const;

export const GENERATOR = { maxRerolls: 10 } as const;

export const SCORE = {
  perCell: 1,
  lines: [0, 100, 300, 600],
  line4: 1000,
  lineExtra: 500,
  boardClear: 3000,
} as const;

export const COMBO = { graceMisses: 2, step: 0.5 } as const;

export const REPLAY = { minIntervalMs: 200 } as const;

export const ANIM = {
  place: 90,
  clearPerCell: 25,
  clearFade: 180,
  trayIn: 200,
  returnToTray: 160,
} as const;

export const SAVE = { key: 'ddooby-block-save', runKey: 'ddooby-block-run' } as const;
