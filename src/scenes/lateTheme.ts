// 늦게 읽힌 저장 테마를 메뉴에 반영할지 (순수 함수, tests/scenes/lateTheme.test.ts).
// 메뉴를 다시 만들면(scene.restart) SHUTDOWN이 준비 중인 새 게임 요청을 취소하므로, 준비 중에는 다시 만들지 않는다.
// 그때 반영하지 않은 테마는 준비가 끝나 화면을 떠나면 필요 없고, 준비가 취소돼 메뉴에 남으면 다음 메뉴 진입 때 반영된다.

/** 'restart' = 메뉴를 새 테마로 다시 만든다, 'redraw' = 테마는 그대로 두고 버튼만 다시 그린다 */
export function lateThemeAction(preparing: boolean, themePending: boolean): 'restart' | 'redraw' {
  return themePending && !preparing ? 'restart' : 'redraw';
}
