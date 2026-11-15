import { describe, expect, it } from 'vitest';
import { beginPress, finishPress, type PressLock } from '../../src/view/ui/pressLock';

describe('beginPress / finishPress', () => {
  it('잠금이 비었으면 누름을 받고 잠근다. 잠겨 있으면 거부한다', () => {
    const lock: PressLock = { pressed: false };
    expect(beginPress(lock)).toBe(true);
    expect(lock.pressed).toBe(true);
    expect(beginPress(lock)).toBe(false);
  });

  it('끝났을 때 버튼이 살아 있으면 onPress를 실행한다 (잠금은 화면을 떠날 때까지 유지)', () => {
    const lock: PressLock = { pressed: false };
    let calls = 0;
    beginPress(lock);
    finishPress(lock, true, () => calls++);
    expect(calls).toBe(1);
    expect(lock.pressed).toBe(true);
  });

  it('끝났을 때 버튼이 이미 버려졌으면 onPress를 실행하지 않고 잠금을 푼다 (다시 누를 수 있다)', () => {
    const lock: PressLock = { pressed: false };
    let calls = 0;
    beginPress(lock);
    finishPress(lock, false, () => calls++);
    expect(calls).toBe(0);
    expect(lock.pressed).toBe(false);
  });

  it('누름 → 다시 그림(같은 잠금 유지) → 새 버튼 누름은 거부 → 옛 트윈 끝 → 다시 누름: 전환은 한 번', () => {
    const lock: PressLock = { pressed: false };
    let transitions = 0;
    const go = (): void => {
      transitions++;
    };
    expect(beginPress(lock)).toBe(true); // 옛 버튼 누름
    expect(beginPress(lock)).toBe(false); // 다시 그린 새 버튼: 옛 누름이 진행 중이라 거부
    finishPress(lock, false, go); // 옛 버튼은 버려졌다: 실행 안 함, 잠금 해제
    expect(transitions).toBe(0);
    expect(beginPress(lock)).toBe(true); // 새 버튼을 다시 누름
    finishPress(lock, true, go);
    expect(transitions).toBe(1);
  });
});
