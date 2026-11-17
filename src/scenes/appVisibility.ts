// 숨김 출처 두 개 (W4-03 리뷰 1): 웹(탭·창 숨김, Phaser HIDDEN/VISIBLE)과 Android 앱 상태(appStateChange).
// 둘은 서로 독립이다. 한쪽이 돌아와도 다른 쪽이 아직 숨겨져 있으면 시계·음악을 이어서는 안 된다.
// 웹 쪽은 Phaser가 이벤트로 알리므로, 여기서는 native 쪽 상태만 들고 있다가 시계·음악이 웹 VISIBLE을 받을 때 `nativeBlocksResume()`으로 거른다.
// "모두 활성"일 때만 이어진다: 웹 VISIBLE은 native가 활성일 때, native 복귀는 웹이 보일 때(문서가 숨겨져 있으면 이후 웹 VISIBLE이 이어 준다).

let nativeInactive = false;

/** native 앱이 백그라운드다: 웹 VISIBLE이 와도 이어서는 안 된다 */
export function nativeBlocksResume(): boolean {
  return nativeInactive;
}

/**
 * 새 시계·새 음악이 시작할 때의 숨김 판정: 웹이 숨겨져 있거나 native 앱이 백그라운드면 멈춘 채 시작한다.
 * 이후 이어지는 것은 VISIBLE 이벤트(웹)와 native 복귀(웹이 보일 때만 알림)가 정한다
 */
export function isAppHidden(webHidden: boolean): boolean {
  return webHidden || nativeInactive;
}

/** 시험용·Game 정리용: native 상태를 활성으로 되돌린다 */
export function resetNativeVisibility(): void {
  nativeInactive = false;
}

/**
 * native 앱 상태가 바뀌었다. 바뀐 상태에 따라 알려야 할 이벤트를 돌려준다 (없으면 null).
 * 같은 상태 반복은 null. 활성으로 돌아와도 웹이 아직 숨겨져 있으면 알리지 않는다 (웹 VISIBLE이 오면 그때 이어진다)
 */
export function nativeChange(active: boolean, webHidden: boolean): 'hidden' | 'visible' | null {
  if (active === !nativeInactive) return null;
  nativeInactive = !active;
  if (!active) return 'hidden';
  return webHidden ? null : 'visible';
}
