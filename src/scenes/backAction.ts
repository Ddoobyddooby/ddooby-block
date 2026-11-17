// Android 뒤로 가기 → 할 일 (W4-03). Phaser·Capacitor 없는 순수 함수. 화면별로 한 단계 뒤로 간다.
//
//   창(테마 카드·닉네임)이 떠 있다 → 창 닫기          (새 판 준비 중이어도 닫을 수 있다: 창을 닫는 것은 판을 바꾸지 않는다)
//   새 판을 준비하는 중                → 아무것도 안 함  (버튼 잠금 규칙과 같다: newRun.ts)
//   일시정지 화면                      → [계속]
//   게임 오버 화면                     → 메뉴
//   게임 중                            → 일시정지
//   랭킹                               → 메뉴
//   메뉴                               → 앱 종료 (pang과 같이 바로 끝낸다)
//   그 밖(불러오는 중 등)              → 아무것도 안 함

export type BackAction = 'close-overlay' | 'pause' | 'resume' | 'menu' | 'exit' | 'none';

/**
 * activeKeys = 지금 돌고 있는 씬 키 (멈춘 씬은 빠진다: 일시정지 중이면 Game 없이 Pause만. 게임 오버 중에는 Game과 GameOver가 같이 돈다).
 * overlayOpen = 맨 위 화면에 창이 떠 있다, preparing = 새 판을 준비하는 중
 */
export function backAction(
  activeKeys: readonly string[],
  ctx: { overlayOpen?: boolean; preparing?: boolean } = {},
): BackAction {
  const has = (key: string): boolean => activeKeys.includes(key);
  if (ctx.overlayOpen === true && (has('Menu') || has('Ranking') || has('GameOver')))
    return 'close-overlay';
  if (ctx.preparing === true) return 'none';
  if (has('Pause')) return 'resume';
  if (has('GameOver')) return 'menu';
  if (has('Game')) return 'pause';
  if (has('Ranking')) return 'menu';
  if (has('Menu')) return 'exit';
  return 'none';
}
