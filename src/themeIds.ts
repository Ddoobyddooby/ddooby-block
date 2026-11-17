// 테마 ID 목록과 기본 테마. 저장(storage)과 화면(view)이 함께 쓰므로 어느 쪽에도 속하지 않는 이 파일에 둔다 (ddooby-pang의 data/themeIds.ts와 같은 역할).
// 색·글꼴·장식 값은 `view/theme/themes.ts`에 있다.

export const THEME_IDS = ['butter', 'orbit', 'soda'] as const;

export type ThemeId = (typeof THEME_IDS)[number];

/** 저장값이 없거나 모르는 값일 때의 테마: 소다 가든 */
export const DEFAULT_THEME: ThemeId = 'soda';

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

/** 없거나 모르는 값이면 기본 테마 */
export function parseThemeId(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME;
}
