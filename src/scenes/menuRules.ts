// 메뉴 규칙 (PLAN 6.3). Phaser 없는 순수 함수. pauseRules의 pauseButtons와 같은 방식이다.

export type MenuButton = 'resume' | 'new' | 'ranking';

/**
 * 메뉴에 보일 버튼을 위에서 아래 순서로. 이어할 판이 있을 때만 [이어하기]가 [새 게임] 위에 붙고, [주간 랭킹]은 늘 [새 게임] 아래다.
 * (저장된 판이 있어도 [새 게임]은 확인 없이 바로 시작한다: 첫 수를 둘 때 저장된 판이 덮인다)
 */
export function menuButtons(hasResume: boolean): MenuButton[] {
  return hasResume ? ['resume', 'new', 'ranking'] : ['new', 'ranking'];
}

/**
 * 메뉴 버튼(테마 버튼 포함)의 가운데 y. 맨 위 버튼이 `buttonY`에서 시작해 `buttonStep`씩 내려간다.
 * 이어하기가 있으면 버튼이 하나 늘어 [새 게임]이 한 칸 아래로 밀린다 (이어하기가 원래 [새 게임] 자리에서 시작): 로고 둘째 줄과 겹치지 않게
 */
export function menuButtonYs(
  count: number,
  height: number,
  menu: { buttonY: number; buttonStep: number },
): number[] {
  return Array.from({ length: count }, (_, i) => height * menu.buttonY + i * menu.buttonStep);
}

/** 로고 아래끝 y (둘째 줄 밑줄 기준). 첫 줄 가운데 y1과 두 줄의 글자 크기를 받는다 (view/theme/logo.ts의 배치와 같은 식) */
export function logoBottomY(y1: number, [s1, s2]: readonly [number, number]): number {
  const y2 = y1 + (s1 / 2 + s2 / 2) * 0.88;
  return y2 + s2 * 0.62;
}
