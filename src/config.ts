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
  /**
   * 색·글꼴·블록 모양 수치는 테마가 정한다 (view/theme/themes.ts). 여기에는 테마 공통 수치만 둔다.
   * 블록 텍스처 (view/blockTexture.ts). 비율은 텍스처 한 변 대비
   */
  block: {
    /** 텍스처 한 변 (px). 보드 칸(80)보다 커서 줄여 그린다 */
    textureSize: 96,
    /** 칸 사이 틈 (한쪽) */
    gap: 0.04,
    /** 고스트 테두리 두께 */
    ghostStroke: 0.07,
  },
  /** 보드 판이 칸 바깥으로 나오는 폭 (px) */
  boardPad: 14,
  boardRadius: 22,
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
    /** 배경 장식은 모든 것의 아래 */
    backdrop: -10,
  },
  menu: {
    /** 화면 높이 대비 세로 위치: 로고 첫 줄 가운데, 버튼 가운데 */
    titleY: 0.31,
    buttonY: 0.56,
    buttonW: 500,
    buttonH: 114,
    buttonTextSize: 40,
    /** 로고 위의 장식(블록 세 개 등)이 로고 첫 줄 가운데보다 얼마나 위인지 (px) */
    motifDy: -190,
    /** [이어하기]는 [새 게임] 위로 이만큼 (px) 떨어진다. [새 게임]은 이어하기 유무와 상관없이 제자리다 */
    buttonStep: 148,
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
    buttonTextSize: 44,
    /** 소리 버튼 줄(음악 ♫ · 음소거 스피커): 제목 아래, 가운데. 원 반지름과 두 원 중심 사이 간격, 줄 아래 간격 */
    muteRadius: 36,
    soundStep: 108,
    soundGap: 44,
  },
  /** 게임 오버 화면 (scenes/GameOverScene.ts). 일시정지 창과 같은 판 + 버튼 */
  gameOver: {
    dimAlpha: 0.72,
    panelW: 560,
    panelRadius: 32,
    panelPad: 52,
    titleSize: 72,
    /** 제목 아래 간격 */
    titleGap: 44,
    scoreLabelSize: 30,
    scoreSize: 104,
    /** 점수 아래 간격 */
    scoreGap: 20,
    bestSize: 38,
    newBestSize: 44,
    /** 랭킹 등록 결과 줄 ("랭킹에 올리는 중…", "이번 주 최고 N점" 등) */
    rankingSize: 30,
    /** 최고 점수 아래(또는 최고 기록 문구 아래) 버튼까지 간격 */
    textGap: 22,
    buttonsGap: 40,
    buttonW: 440,
    buttonH: 104,
    buttonStep: 128,
    buttonTextSize: 44,
    /** 마지막 연출·게임 오버 소리를 보여 준 뒤 이 시간(ms) 지나서 화면이 뜬다 */
    showDelayMs: 700,
    /** 화면이 뜬 뒤 이 시간(ms) 동안은 버튼이 눌리지 않는다 (마지막 배치를 놓던 손가락이 바로 누르지 않게) */
    inputDelayMs: 600,
  },
  /** 새 판을 시작하기 전 서버 run을 기다리는 동안의 "준비 중…" 문구 (W3-03). 기다림이 이 시간(ms)을 넘으면 보인다 */
  preparing: { size: 40, y: 0.86, showAfterMs: 200 },
} as const;

/**
 * 주간 랭킹 화면 (W3-04, scenes/RankingScene.ts). 좌표는 폭 720 기준 px, x는 목록 왼쪽 끝 기준. 390×844에서 게임 좌표 약 82px = 44 CSS px
 * 10자 닉네임(30px) + #0000(22px) + 6~7자리 점수가 한 줄에 들어가게 잡았고, 넘치면 닉네임·태그를 줄여 맞춘다 (RankingScene.drawRow)
 */
export const RANKING = {
  titleY: 84,
  titleSize: 60,
  /** 주 기간 줄 */
  weekY: 164,
  weekSize: 30,
  /** 요청이 이 시간(ms)을 넘길 때만 "불러오는 중…"을 보인다 */
  loadingMs: 300,
  /** 목록: top = 목록 칸 맨 위 y, bottomReserve = 목록 칸 맨 아래에서 화면 아래까지 남기는 거리(하단 줄과 버튼 자리) */
  list: { top: 210, bottomReserve: 270, width: 648, rowH: 84, rowGap: 8, gapH: 52, pad: 8 },
  row: {
    radius: 22,
    /** 순위는 오른쪽 정렬(이 x), 닉네임은 왼쪽 정렬(이 x), 점수는 오른쪽 정렬(이 x) */
    rankRight: 80,
    nameLeft: 96,
    scoreRight: 632,
    fontSize: 30,
    tagFontSize: 22,
    tagGap: 8,
    /** 닉네임·태그와 점수 사이 최소 간격 */
    minGap: 14,
    meStroke: 4,
  },
  /** 줄 바탕 투명도. 1~3위 순위 숫자 색과 내 줄 바탕은 테마가 정한다 */
  rowAlpha: 0.9,
  gapDot: { r: 5, spacing: 22 },
  /** 안내 문구 (연결 불가·오류·빈 주·불러오는 중) */
  message: { size: 36, wrapWidth: 560 },
  /** 하단 고정 줄: height, bottomY = 줄 가운데에서 화면 아래까지 */
  footer: {
    height: 96,
    bottomY: 204,
    fontSize: 32,
    subFontSize: 26,
    textWrap: 330,
    button: { width: 230, height: 76, fontSize: 30 },
  },
  /** 아래 버튼 두 개 (터치 영역 44 CSS px 이상 = 게임 좌표 약 82) */
  button: { bottomY: 100, width: 300, height: 96, fontSize: 40, dx: 170 },
  /** 손가락이 이만큼(px) 넘게 움직이면 끌기(스크롤), 아니면 누르기 */
  dragThreshold: 12,
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
    /** 게임 오버 화면: 최고 기록을 새로 세웠을 때 (W4-01). 이때는 `gameOverShow` 대신 이것만 낸다 */
    newBest: { file: 'newBest', volume: 0.5 },
    /** 게임 오버 화면: 최고 기록이 아닐 때 화면이 뜨며 낸다 (W4-01). 연출 속 `gameOver` 소리와는 showDelayMs만큼 떨어져 있다 */
    gameOverShow: { file: 'gameOverShow', volume: 0.3 },
  },
  formats: ['ogg', 'm4a'],
  /** 줄 제거 소리의 콤보별 재생 속도(음 높이). index = 콤보 - 1, 마지막 값이 상한 */
  clearRateByCombo: [1, 1.12, 1.26, 1.33, 1.5],
  /** 같은 소리를 이 시간(ms) 안에 다시 부르면 건너뛴다 */
  minGapMs: 60,
  /**
   * 배경 음악 (W4-01, PLAN 6.4). 파일은 public/audio/music/<이름>.<형식> (formats와 같은 대체), 출처는 public/audio/CREDITS.md.
   * 메뉴·랭킹은 `menu`, 게임은 한 판의 테마(runTheme)별 곡이다. 곡 이름이 곧 파일 이름이다.
   */
  music: {
    tracks: ['menu', 'game-soda', 'game-butter', 'game-orbit'],
    menuTrack: 'menu',
    gameTracks: { soda: 'game-soda', butter: 'game-butter', orbit: 'game-orbit' },
    /**
     * 곡별 소리 크기. 원본 음량이 달라 곡마다 따로 맞췄다 (codex-design 측정, 재생 후 약 -38 LUFS로 정렬해 효과음 아래에 둔다).
     * 기기 스피커에서의 최종 튜닝은 귀로 한다.
     */
    volumes: { menu: 0.22, 'game-soda': 0.07, 'game-butter': 0.12, 'game-orbit': 0.25 },
    /** 곡이 바뀔 때 페이드 (나가는 곡은 줄이며 끝내고 들어오는 곡은 0에서 올린다) */
    fadeMs: 600,
    /** 음악 버튼으로 켜고 끌 때 페이드 */
    quickFadeMs: 200,
  },
} as const;

/**
 * 저장 (PLAN 6.2). 키는 block 전용이다 (ddooby-pang 키를 읽지 않는다).
 * maxRunPlacements: 저장하는 배치 로그 길이 한도. 넘으면 parseRun이 null이고, 플레이 중 닿으면 그 판은 계속하되 저장을 멈춘다.
 * maxRunJsonChars: run JSON 문자열 길이 한도. JSON.parse 전에 거른다 (배치 하나 약 40~60자 × 한도 + snapshot).
 * bootTimeoutMs: 저장소 읽기가 이만큼 늦으면 기다리지 않고 메뉴로 간다.
 */
export const SAVE = {
  key: 'ddooby-block-save',
  runKey: 'ddooby-block-run',
  maxRunPlacements: 20000,
  maxRunJsonChars: 2_000_000,
  bootTimeoutMs: 3000,
} as const;
