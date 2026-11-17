// 메뉴 규칙 (PLAN 6.3). Phaser 없는 순수 함수. pauseRules의 pauseButtons와 같은 방식이다.

export type MenuButton = 'resume' | 'new' | 'ranking';

/**
 * 메뉴에 보일 버튼을 위에서 아래 순서로. 이어할 판이 있을 때만 [이어하기]가 [새 게임] 위에 붙고, [주간 랭킹]은 늘 [새 게임] 아래다.
 * (저장된 판이 있어도 [새 게임]은 확인 없이 바로 시작한다: 첫 수를 둘 때 저장된 판이 덮인다)
 */
export function menuButtons(hasResume: boolean): MenuButton[] {
  return hasResume ? ['resume', 'new', 'ranking'] : ['new', 'ranking'];
}
