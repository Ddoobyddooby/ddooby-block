// 버튼 누름 잠금 (Phaser 없는 순수 함수). 한 화면에서 전환 요청이 한 번만 나가게 한다.
// 눌림 트윈이 끝날 때(`finishPress`) 버튼이 이미 버려졌다면 (화면을 다시 그리느라 destroy됨) Phaser는 트윈을 지우지 않아
// onComplete가 그래도 실행되므로, 버려진 버튼의 누름은 실행하지 않고 잠금을 풀어 새 버튼을 다시 누를 수 있게 한다.

/** 한 화면에서 버튼이 한 번만 눌리게 한다 (화면을 떠나는 중에 다른 버튼이 또 눌리지 않게) */
export interface PressLock {
  pressed: boolean;
}

/** 누름을 받을 수 있으면 잠그고 true */
export function beginPress(lock: PressLock): boolean {
  if (lock.pressed) return false;
  lock.pressed = true;
  return true;
}

/** 눌림 연출이 끝났다. 버튼이 살아 있으면 onPress (잠금은 화면을 떠날 때까지 유지), 버려졌으면 실행하지 않고 잠금을 푼다 */
export function finishPress(lock: PressLock, alive: boolean, onPress: () => void): void {
  if (!alive) {
    lock.pressed = false;
    return;
  }
  onPress();
}
