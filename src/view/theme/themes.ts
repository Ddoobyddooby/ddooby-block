// 테마 3종 정의 (W4-05). 색 토큰·블록 그리기 수치·배경 장식·로고·글꼴을 한곳에 모은다.
// 그림·장식 값이라 config.ts(게임 규칙·연출 수치)와 분리했다 (ddooby-pang의 view/theme/themes.ts와 같은 역할).
// 원본: 디자인 시안 `.codex-out/design-src/` (palette.json·README.md·build_mockups.py). 시안에 없는 토큰(combo·overlay·line·ghost·error·meFill·medal·popupStroke·spark)은 시안 색에서 정해 주석에 적었다.
// 테마는 보기만 바꾼다. core 규칙·점수·seed 재현·효과음과 무관하다.

import { DEFAULT_THEME, isThemeId, parseThemeId, THEME_IDS, type ThemeId } from '../../themeIds';

export { DEFAULT_THEME, isThemeId, parseThemeId, THEME_IDS, type ThemeId };

/** 색 토큰 (0xRRGGBB). blocks는 색 그룹 0~6 순서 (core/pieces.ts: 점, 직선, 사각형, L 소형, L 대형, T, S/Z) */
export interface ThemeColors {
  /** 화면 배경 */
  background: number;
  /** 보드 받침 */
  board: number;
  /** 보드 받침 테두리 */
  boardEdge: number;
  /** 빈 칸 */
  empty: number;
  /** 패널·보조 버튼·동그란 버튼 바탕 */
  panel: number;
  /** 주 버튼 바탕과 그 위 글자 */
  accent: number;
  accentText: number;
  /** 기본 글자·보조 글자 (배경과 패널 위에 놓인다) */
  ink: number;
  muted: number;
  /** 패널·버튼 테두리 */
  edge: number;
  /** 패널·버튼 아래 그림자 */
  shadow: number;
  blocks: readonly [number, number, number, number, number, number, number];
  /** 콤보 글자 (배경 위) */
  combo: number;
  /** 일시정지·게임 오버 때 화면을 덮는 색 */
  overlay: number;
  /** 채워질 줄 표시: 칸 위에 이 색을 alpha로 얹는다 */
  line: number;
  lineAlpha: number;
  /** 닉네임 창의 오류 글자 (패널 위) */
  error: number;
  /** 랭킹에서 내 줄 바탕 */
  meFill: number;
  /** 랭킹 1~3위 순위 숫자 (패널 위) */
  medal: readonly [number, number, number];
  /** 줄 제거·콤보 팝업 글자의 바깥선 */
  popupStroke: number;
}

/** 블록 한 칸을 그리는 수치. 비율은 모두 한 칸(보드 칸에서 틈을 뺀 정사각형) 한 변 대비 (시안은 약 40px 칸 기준) */
export interface BlockStyle {
  /** 블록 모서리 반지름 */
  radius: number;
  /** 빈 칸 모서리 반지름 */
  emptyRadius: number;
  /** 아래로 보이는 두꺼운 면의 높이 */
  depth: number;
  /** 앞면 색 = 기본색 × faceMul, 아래 면 색 = 기본색 × bottomMul */
  faceMul: number;
  bottomMul: number;
  /** 앞면 테두리: 기본색을 target 쪽으로 amount만큼 섞은 색, 두께 width. 없으면 null */
  stroke: { target: number; amount: number; width: number } | null;
  /** 광택 곡선: 흰색을 amount만큼 섞은 색, 두께 width */
  gloss: { amount: number; width: number; kind: 'curve' | 'top' };
  /** 추가 표현 */
  extra: 'inner' | 'glass' | 'foot';
}

/** 고스트(놓일 칸): 블록 색을 fillAlpha로 채우고 테두리는 target 쪽으로 섞은 색 */
export interface GhostStyle {
  fillAlpha: number;
  alpha: number;
  stroke: { target: number; amount: number };
}

export type Deco =
  | { kind: 'butter'; circle: number; curve: number; sparkle: number }
  | { kind: 'orbit'; glow: number; star: number; orbit: number }
  | { kind: 'soda'; hillBack: number; hillFront: number; leafDark: number; leafLight: number };

export interface Fonts {
  /** 영어 제목(로고) 글꼴과 굵기 */
  title: string;
  titleWeight: number;
  /** 한글 UI 글꼴과 보통·굵은 굵기 */
  ui: string;
  uiWeight: number;
  uiBoldWeight: number;
  /** 숫자(점수) 글꼴과 굵기 */
  number: string;
  numberWeight: number;
}

export interface Logo {
  /** 두 줄 크기 (게임 좌표 px) */
  size: [number, number];
  /** 두 줄의 글자색 */
  color: [number, number];
  /** 글자 아래 그림자: 색과 아래로 옮기는 px. 없으면 null */
  shadow: { color: number; dy: number } | null;
  /** 자간 (px) */
  spacing: number;
  /** 밑줄·장식 색 */
  accent: number;
  accent2: number;
}

export interface Theme {
  id: ThemeId;
  /** 메뉴 테마 카드에 보이는 이름 */
  name: string;
  colors: ThemeColors;
  block: BlockStyle;
  ghost: GhostStyle;
  /** 줄 제거 파티클 색: 블록 색을 target 쪽으로 amount만큼 섞는다 */
  spark: { target: number; amount: number };
  deco: Deco;
  fonts: Fonts;
  logo: Logo;
  /** 버튼 모서리 반지름 (게임 좌표 px). 'pill'은 높이의 절반 */
  buttonRadius: number | 'pill';
  /** 패널 위쪽 장식 */
  panelDeco: 'sparkles' | 'lines' | 'dot';
}

/** 글꼴 뒤에 붙이는 시스템 글꼴. 글꼴 파일이 늦거나 없어도, 서브셋에 없는 글자(닉네임 등)도 이걸로 보인다 */
const SYSTEM_FONTS = 'system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

const stack = (...names: string[]): string =>
  [...names.map((n) => `"${n}"`), SYSTEM_FONTS].join(', ');

export const THEMES: Readonly<Record<ThemeId, Theme>> = {
  butter: {
    id: 'butter',
    name: '버터 스튜디오',
    colors: {
      background: 0xfff5d8,
      board: 0xe8d5a8,
      boardEdge: 0xd4bd88,
      empty: 0xf5e7c5,
      panel: 0xfffcf3,
      accent: 0x2856c5,
      accentText: 0xffffff,
      ink: 0x243e73,
      muted: 0x676d78,
      edge: 0xd4bd88,
      shadow: 0xbda568,
      blocks: [0xf9cf55, 0x4f83d4, 0xe96e60, 0x5faf96, 0xf69f50, 0x9b82ca, 0xd98baa],
      // 시안: 콤보는 주 버튼색. 덮는 색은 게임 오버 시안의 #33486C
      combo: 0x2856c5,
      overlay: 0x33486c,
      line: 0x2856c5,
      lineAlpha: 0.26,
      error: 0xb3261e,
      meFill: 0xffefb0,
      medal: [0x9a6f00, 0x6a7586, 0xa4551d],
      popupStroke: 0x243e73,
    },
    block: {
      radius: 0.17,
      emptyRadius: 0.175,
      depth: 0.075,
      faceMul: 1,
      bottomMul: 0.68,
      stroke: { target: 0x000000, amount: 0.24, width: 0.016 },
      gloss: { amount: 0.67, width: 0.06, kind: 'curve' },
      extra: 'inner',
    },
    ghost: { fillAlpha: 0.7, alpha: 0.9, stroke: { target: 0x243e73, amount: 0.4 } },
    spark: { target: 0x243e73, amount: 0.12 },
    deco: { kind: 'butter', circle: 0xf8e6b6, curve: 0xe7d7ae, sparkle: 0x2856c5 },
    fonts: {
      title: stack('Fredoka'),
      titleWeight: 650,
      ui: stack('Gowun Dodum'),
      uiWeight: 400,
      uiBoldWeight: 700,
      number: stack('SUIT'),
      numberWeight: 750,
    },
    logo: {
      size: [126, 139],
      color: [0x243e73, 0x2856c5],
      shadow: { color: 0xbda568, dy: 7 },
      spacing: 0,
      accent: 0xddb63a,
      accent2: 0xf9cf55,
    },
    buttonRadius: 30,
    panelDeco: 'sparkles',
  },
  orbit: {
    id: 'orbit',
    name: '밤의 오비트',
    colors: {
      background: 0x181229,
      board: 0x2b2345,
      boardEdge: 0x645080,
      empty: 0x352c50,
      panel: 0x302647,
      accent: 0xa997ff,
      accentText: 0x201633,
      ink: 0xfbf6ff,
      muted: 0xb8a9cc,
      edge: 0x645080,
      shadow: 0x0b0715,
      blocks: [0xf3d679, 0x58cfda, 0xf7809b, 0x72d2a0, 0xffa46c, 0xaf96f3, 0xe593dc],
      // 시안: 콤보는 노란색(블록 0). 덮는 색은 게임 오버 시안의 #110C20
      combo: 0xf3d679,
      overlay: 0x110c20,
      line: 0xffffff,
      lineAlpha: 0.2,
      error: 0xff8fa3,
      meFill: 0x4a3a7a,
      medal: [0xffd43b, 0xc0c8d8, 0xff8a3d],
      popupStroke: 0x0b0715,
    },
    block: {
      radius: 0.19,
      emptyRadius: 0.15,
      depth: 0.05,
      faceMul: 0.89,
      bottomMul: 0.48,
      stroke: { target: 0xffffff, amount: 0.32, width: 0.02 },
      gloss: { amount: 0.6, width: 0.045, kind: 'top' },
      extra: 'glass',
    },
    ghost: { fillAlpha: 0.5, alpha: 0.7, stroke: { target: 0xffffff, amount: 0.5 } },
    spark: { target: 0xffffff, amount: 0.3 },
    deco: { kind: 'orbit', glow: 0x5b3b7d, star: 0xc6afff, orbit: 0x645080 },
    fonts: {
      title: stack('Space Grotesk'),
      titleWeight: 700,
      ui: stack('SUIT'),
      uiWeight: 600,
      uiBoldWeight: 750,
      number: stack('SUIT'),
      numberWeight: 750,
    },
    logo: {
      size: [113, 140],
      color: [0xfbf6ff, 0xaf96f3],
      shadow: null,
      spacing: -5,
      accent: 0x58cfda,
      accent2: 0xf7809b,
    },
    buttonRadius: 22,
    panelDeco: 'lines',
  },
  soda: {
    id: 'soda',
    name: '소다 가든',
    colors: {
      background: 0xddf3e8,
      board: 0x4b786c,
      boardEdge: 0x6b9383,
      empty: 0x345d53,
      panel: 0xf4fff6,
      accent: 0x246956,
      accentText: 0xf4fff6,
      ink: 0x173f36,
      muted: 0x526e64,
      edge: 0x98c3ad,
      shadow: 0x9cbcaa,
      blocks: [0xf4d563, 0x84b5d2, 0xf29789, 0x8ac5a5, 0xeda864, 0xa8a1d3, 0xeba9bf],
      // 시안: 콤보는 주 버튼색. 덮는 색은 게임 오버 시안의 #173C36
      combo: 0x246956,
      overlay: 0x173c36,
      line: 0xffffff,
      lineAlpha: 0.26,
      error: 0xb3261e,
      meFill: 0xd7efb8,
      medal: [0x9a6f00, 0x5f6e7e, 0xa4551d],
      popupStroke: 0x173f36,
    },
    block: {
      radius: 0.29,
      emptyRadius: 0.25,
      depth: 0.1,
      faceMul: 1,
      bottomMul: 0.63,
      stroke: null,
      gloss: { amount: 0.56, width: 0.065, kind: 'curve' },
      extra: 'foot',
    },
    ghost: { fillAlpha: 0.55, alpha: 0.8, stroke: { target: 0xffffff, amount: 0.55 } },
    spark: { target: 0xffffff, amount: 0.25 },
    deco: {
      kind: 'soda',
      hillBack: 0xc3e4d2,
      hillFront: 0xb0d8c2,
      leafDark: 0x79af95,
      leafLight: 0xa5d1b9,
    },
    fonts: {
      title: stack('Baloo 2'),
      titleWeight: 750,
      ui: stack('SUIT'),
      uiWeight: 600,
      uiBoldWeight: 750,
      number: stack('SUIT'),
      numberWeight: 750,
    },
    logo: {
      size: [124, 144],
      color: [0x173f36, 0x246956],
      shadow: { color: 0x9cbcaa, dy: 7 },
      spacing: 0,
      accent: 0x80b591,
      accent2: 0xf4d563,
    },
    buttonRadius: 'pill',
    panelDeco: 'dot',
  },
};

/** 메뉴 테마 카드의 순서 */
export const THEME_LIST: readonly Theme[] = THEME_IDS.map((id) => THEMES[id]);

export function getTheme(id: ThemeId): Theme {
  return THEMES[id];
}

/**
 * 개발 주소 `?theme=<id>`: 저장하지 않고 그 실행에만 적용한다. DEV 빌드에서만 (프로덕션에서는 항상 null).
 * 없거나 모르는 값이면 null (저장값을 쓴다). ddooby-pang의 devTheme과 같다.
 */
export function devTheme(search: string, dev: boolean): ThemeId | null {
  if (!dev) return null;
  const value = new URLSearchParams(search).get('theme');
  return isThemeId(value) ? value : null;
}
