import { describe, expect, it } from 'vitest';
import { canPause, pauseButtons } from '../../src/scenes/pauseRules';

describe('canPause', () => {
  it('진행 중이면 멈출 수 있다', () => {
    expect(canPause({ over: false, paused: false })).toBe(true);
  });
  it('게임 오버면 멈출 수 없다', () => {
    expect(canPause({ over: true, paused: false })).toBe(false);
  });
  it('이미 멈췄으면 또 멈출 수 없다', () => {
    expect(canPause({ over: false, paused: true })).toBe(false);
  });
  it('둘 다면 멈출 수 없다', () => {
    expect(canPause({ over: true, paused: true })).toBe(false);
  });
});

describe('pauseButtons', () => {
  it('[계속] [다시 하기] [메뉴] 순서', () => {
    expect(pauseButtons()).toEqual(['resume', 'retry', 'menu']);
  });
});
