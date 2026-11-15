import { describe, expect, it } from 'vitest';
import { hasResumeParam, newGameData } from '../../src/scenes/gameStart';

describe('newGameData', () => {
  it('이어하기 데이터가 없는 빈 데이터를 매번 새로 만든다 (Phaser가 전에 받은 데이터를 재사용하지 않게)', () => {
    expect(newGameData()).toEqual({});
    expect(newGameData().resume).toBeUndefined();
    expect(newGameData()).not.toBe(newGameData());
  });
});

describe('hasResumeParam', () => {
  it('DEV에서만 ?resume을 받는다', () => {
    expect(hasResumeParam('?resume', true)).toBe(true);
    expect(hasResumeParam('?seed=1&resume', true)).toBe(true);
    expect(hasResumeParam('?resume', false)).toBe(false);
    expect(hasResumeParam('', true)).toBe(false);
  });
});
