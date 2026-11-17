// 테마 글꼴·색으로 Phaser Text 스타일을 만든다. 화면 코드는 fontFamily·fontStyle·color를 직접 적지 않고 이것을 쓴다.

import type Phaser from 'phaser';
import type { Theme } from './themes';

/** logo = 영어 제목 글꼴, heading = 굵은 한글 UI, body = 보통 한글 UI, number = 점수 숫자 */
export type TextRole = 'logo' | 'heading' | 'body' | 'number';

/** 0xRRGGBB → Phaser Text가 받는 `#rrggbb` */
export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** 역할에 맞는 글꼴과 굵기 */
export function fontOf(theme: Theme, role: TextRole): { family: string; weight: number } {
  const f = theme.fonts;
  switch (role) {
    case 'logo':
      return { family: f.title, weight: f.titleWeight };
    case 'heading':
      return { family: f.ui, weight: f.uiBoldWeight };
    case 'body':
      return { family: f.ui, weight: f.uiWeight };
    case 'number':
      return { family: f.number, weight: f.numberWeight };
  }
}

export function textStyle(
  theme: Theme,
  role: TextRole,
  size: number,
  color: number,
): Phaser.Types.GameObjects.Text.TextStyle {
  const { family, weight } = fontOf(theme, role);
  return { fontFamily: family, fontSize: size, fontStyle: String(weight), color: cssColor(color) };
}
