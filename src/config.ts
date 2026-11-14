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
  /** Phaser가 따로 추적하는 터치 수. 드래그는 그중 처음 누른 하나만 쓴다 (PLAN 6.1) */
  touchPointers: 3,
  /** 시스템 글꼴 (Jua는 뒤 태스크에서 넣는다) */
  fontFamily: 'system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
  /** 색 (0xRRGGBB). blocks는 색 그룹 0~6 순서 (core/pieces.ts) */
  colors: {
    background: 0x141a2e,
    /** 보드 판 */
    panel: 0x1e2742,
    emptyCell: 0x2a3558,
    /** 점, 직선, 사각형, L 소형, L 대형, T, S/Z */
    blocks: [0xe8ecf4, 0x33b1ff, 0xffd43b, 0x42d67a, 0xff8a3d, 0xb07cff, 0xff5c6c],
    /** 채워질 줄 표시 */
    lineHighlight: 0xffffff,
    text: 0xf4f6fb,
    textDim: 0x9aa6c7,
    button: 0x33b1ff,
    buttonText: 0x0d1326,
    /** 게임 오버 때 화면을 덮는 색 */
    overlay: 0x0a0e1c,
  },
  /** 블록 텍스처 (view/blockTexture.ts). 비율은 텍스처 한 변 대비 */
  block: {
    /** 텍스처 한 변 (px). 보드 칸(80)보다 커서 줄여 그린다 */
    textureSize: 96,
    /** 칸 사이 틈 (한쪽) */
    gap: 0.04,
    radius: 0.18,
    /** 위쪽 밝은 띠·아래쪽 어두운 띠의 높이 */
    band: 0.16,
    /** 밝은 띠는 흰색을, 어두운 띠는 검정을 이만큼 섞는다 (0~1) */
    light: 0.38,
    dark: 0.28,
    /** 고스트 테두리 두께 */
    ghostStroke: 0.07,
  },
  /** 보드 판이 칸 바깥으로 나오는 폭 (px) */
  boardPad: 14,
  boardRadius: 22,
  ghostAlpha: 0.6,
  ghostFillAlpha: 0.5,
  lineHighlightAlpha: 0.22,
  /** 연출의 시작·끝 크기 (원래 크기 대비) */
  placeFromScale: 0.72,
  clearToScale: 0.2,
  trayInFromScale: 0.3,
  /** 그리는 순서 */
  depth: {
    panel: 0,
    cell: 1,
    block: 2,
    lineHighlight: 3,
    ghost: 4,
    tray: 5,
    drag: 10,
    overlay: 20,
  },
  menu: {
    /** 화면 높이 대비 세로 위치 */
    titleY: 0.32,
    buttonY: 0.56,
    titleSize: 84,
    buttonW: 400,
    buttonH: 120,
    buttonRadius: 28,
    buttonTextSize: 48,
    /** 버튼을 누르고 있을 때의 투명도 */
    buttonDownAlpha: 0.75,
  },
  gameOver: {
    overlayAlpha: 0.72,
    titleSize: 88,
    hintSize: 34,
    /** 제목과 안내 사이 간격 (px) */
    hintGap: 100,
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
