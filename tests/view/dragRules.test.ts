import { describe, expect, it } from 'vitest';
import { canPickUp } from '../../src/view/dragRules';

const FREE = { playing: false, paused: false, over: false, cooling: false };

describe('canPickUp', () => {
  it('재생 중·일시정지·게임 오버·배치 직후 간격이 모두 아니면 집을 수 있다', () => {
    expect(canPickUp(FREE)).toBe(true);
  });

  it('이벤트 재생 중에는 집을 수 없다 (PLAN 9절 4번)', () => {
    expect(canPickUp({ ...FREE, playing: true })).toBe(false);
  });

  it('일시정지 중에는 집을 수 없다', () => {
    expect(canPickUp({ ...FREE, paused: true })).toBe(false);
  });

  it('게임 오버에는 집을 수 없다', () => {
    expect(canPickUp({ ...FREE, over: true })).toBe(false);
  });

  it('배치 직후 최소 간격(200ms) 동안에는 집을 수 없다 (W2-05)', () => {
    expect(canPickUp({ ...FREE, cooling: true })).toBe(false);
  });

  it('16가지 조합: 넷 다 false일 때만 true', () => {
    for (const playing of [false, true]) {
      for (const paused of [false, true]) {
        for (const over of [false, true]) {
          for (const cooling of [false, true]) {
            expect(canPickUp({ playing, paused, over, cooling })).toBe(
              !playing && !paused && !over && !cooling,
            );
          }
        }
      }
    }
  });
});
