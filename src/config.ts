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
    /** 게임 오버·일시정지 때 화면을 덮는 색 */
    overlay: 0x0a0e1c,
    /** 콤보 글자 */
    combo: 0xffd43b,
    /** 둥근 버튼·팝업 판의 바탕과 테두리 */
    uiFill: 0x2a3558,
    uiEdge: 0x4a5a8c,
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
  /** HUD (view/Hud.ts). 위치는 화면 구역의 hud 안, y는 hud 위쪽 기준 (px) */
  hud: {
    padX: 40,
    labelSize: 24,
    labelY: 26,
    scoreSize: 80,
    scoreY: 82,
    comboSize: 40,
    comboY: 146,
    bestSize: 30,
    bestY: 146,
    /** 일시정지 버튼 반지름과 가운데 y */
    buttonRadius: 40,
    buttonY: 64,
  },
  /** 버튼을 눌렀을 때 말랑하게 줄었다 돌아오는 정도 */
  button: { pressScale: 0.92, pressMs: 70 },
  /** 일시정지 창 (scenes/PauseScene.ts) */
  pause: {
    dimAlpha: 0.72,
    panelW: 520,
    panelRadius: 32,
    panelPad: 48,
    titleSize: 64,
    /** 제목 아래 간격 */
    titleGap: 56,
    buttonW: 400,
    buttonH: 104,
    buttonStep: 128,
    buttonRadius: 28,
    buttonTextSize: 44,
    /** 음소거 버튼: 판 오른쪽 위, 제목과 같은 높이. 판 오른쪽 끝에서 안쪽으로 inset */
    muteRadius: 36,
    muteInset: 72,
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
  /** 놓을 수 없는 조각이 흐려지는 시간 */
  trayDim: 150,
  /** 보드 전체 비우기 빛이 켜졌다 꺼지는 시간 (이 시간만큼 입력이 잠긴다) */
  boardClearGlow: 500,
} as const;

/**
 * 연출 수치 (PLAN 6.4). 시간 ms, 색 0xRRGGBB. 규칙이 아니라서 바꿔도 RULES_VERSION과 무관하다.
 * 흔들림 단계는 `view/fx/shake.ts`의 shakeFor가 읽는다.
 */
export const FX = {
  /** 줄 제거 파티클: 지워지는 칸마다 터진다 */
  particles: {
    perCell: 4,
    /** 흩어지는 거리 (px) */
    distMin: 50,
    distMax: 130,
    /** 아래로 처지는 정도 (px) */
    gravity: 50,
    lifeMin: 380,
    lifeMax: 620,
    /** 조각 크기 (텍스처 한 변 대비 배율) */
    scaleMin: 0.12,
    scaleMax: 0.26,
    /** 칸 색에 흰색을 섞는 정도 (0~1) */
    whiteMix: 0.35,
    texture: 24,
  },
  popup: {
    /** 글자 크기 (px) */
    lineSize: 88,
    comboSize: 64,
    boardClearSize: 104,
    strokeWidth: 10,
    /** 보드 높이 대비 팝업 중심 위치 (위가 0) */
    lineY: 0.42,
    boardClearY: 0.2,
    /** 글자 여러 줄이 쌓일 때 줄 사이 간격 (px)과 나타나는 시차 */
    stackGap: 96,
    stagger: 110,
    popInMs: 160,
    holdMs: 520,
    fadeMs: 260,
    /** 사라지면서 올라가는 거리 (px) */
    riseY: 56,
    /** 처음 크기 (원래 크기 대비) */
    fromScale: 0.4,
    lineColor: 0xffffff,
    boardClearColor: 0xffd43b,
    strokeColor: 0x0d1326,
  },
  /** 흔들림 단계. 단계 = (줄 수 - 1) + (콤보 - 1). 0이면 흔들지 않고, 표보다 크면 마지막 값 (view/fx/shake.ts) */
  shake: {
    levels: [
      { duration: 120, intensity: 0.003 },
      { duration: 160, intensity: 0.005 },
      { duration: 200, intensity: 0.008 },
      { duration: 240, intensity: 0.011 },
    ],
    boardClear: { duration: 420, intensity: 0.014 },
  },
  boardClear: {
    /** 보드 전체를 덮는 빛 */
    glowColor: 0xffffff,
    glowAlpha: 0.55,
  },
  /** 놓을 수 없는 트레이 조각의 투명도 */
  dimAlpha: 0.35,
  /** 그리는 순서 (VIEW.depth.overlay 아래·위) */
  depth: { particle: 12, glow: 13, popup: 14 },
} as const;

/**
 * 효과음 (PLAN 6.4). 파일은 public/audio/<file>.<형식>, 출처는 public/audio/CREDITS.md.
 * volume 0~1. 형식은 ogg 먼저, iOS Safari용 m4a 다음 (브라우저가 읽을 수 있는 첫 번째를 쓴다)
 */
export const SOUND = {
  effects: {
    place: { file: 'place', volume: 0.45 },
    /** 놓기 실패 (트레이로 돌아감) */
    return: { file: 'return', volume: 0.35 },
    clear: { file: 'clear', volume: 0.5 },
    boardClear: { file: 'boardClear', volume: 0.5 },
    gameOver: { file: 'gameOver', volume: 0.4 },
    button: { file: 'button', volume: 0.5 },
  },
  formats: ['ogg', 'm4a'],
  /** 줄 제거 소리의 콤보별 재생 속도(음 높이). index = 콤보 - 1, 마지막 값이 상한 */
  clearRateByCombo: [1, 1.12, 1.26, 1.33, 1.5],
  /** 같은 소리를 이 시간(ms) 안에 다시 부르면 건너뛴다 */
  minGapMs: 60,
} as const;

export const SAVE = { key: 'ddooby-block-save', runKey: 'ddooby-block-run' } as const;
