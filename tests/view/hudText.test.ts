import { describe, expect, it } from 'vitest';
import { comboLabel, formatScore } from '../../src/view/hudText';

describe('comboLabel', () => {
  it('콤보 0이면 표시 없음', () => {
    expect(comboLabel(0)).toBeNull();
  });
  it('1 이상이면 문구', () => {
    expect(comboLabel(1)).toBe('콤보 1');
    expect(comboLabel(12)).toBe('콤보 12');
  });
  it('음수·NaN은 표시 없음', () => {
    expect(comboLabel(-1)).toBeNull();
    expect(comboLabel(NaN)).toBeNull();
  });
});

describe('formatScore', () => {
  it('세 자리마다 쉼표', () => {
    expect(formatScore(0)).toBe('0');
    expect(formatScore(999)).toBe('999');
    expect(formatScore(1000)).toBe('1,000');
    expect(formatScore(12345)).toBe('12,345');
    expect(formatScore(1234567)).toBe('1,234,567');
  });
  it('이상한 값은 0', () => {
    expect(formatScore(-3)).toBe('0');
    expect(formatScore(NaN)).toBe('0');
    expect(formatScore(Infinity)).toBe('0');
  });
});
