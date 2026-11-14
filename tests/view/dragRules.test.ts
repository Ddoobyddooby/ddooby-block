import { describe, expect, it } from 'vitest';
import { canPickUp } from '../../src/view/dragRules';

describe('canPickUp', () => {
  it('재생 중·일시정지·게임 오버가 모두 아니면 집을 수 있다', () => {
    expect(canPickUp({ playing: false, paused: false, over: false })).toBe(true);
  });

  it('이벤트 재생 중에는 집을 수 없다 (PLAN 9절 4번)', () => {
    expect(canPickUp({ playing: true, paused: false, over: false })).toBe(false);
  });

  it('일시정지 중에는 집을 수 없다', () => {
    expect(canPickUp({ playing: false, paused: true, over: false })).toBe(false);
  });

  it('게임 오버에는 집을 수 없다', () => {
    expect(canPickUp({ playing: false, paused: false, over: true })).toBe(false);
  });

  it('8가지 조합: 셋 다 false일 때만 true', () => {
    for (const playing of [false, true]) {
      for (const paused of [false, true]) {
        for (const over of [false, true]) {
          expect(canPickUp({ playing, paused, over })).toBe(!playing && !paused && !over);
        }
      }
    }
  });
});
