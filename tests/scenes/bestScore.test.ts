import { describe, expect, it } from 'vitest';
import { nextBest, readBest, recordBest, type BestStore } from '../../src/scenes/bestScore';

function fakeStore(initial?: unknown): BestStore {
  const map = new Map<string, unknown>();
  if (initial !== undefined) map.set('bestScore', initial);
  return { get: (k) => map.get(k), set: (k, v) => map.set(k, v) };
}

describe('nextBest', () => {
  it('넘을 때만 오른다', () => {
    expect(nextBest(100, 150)).toBe(150);
    expect(nextBest(100, 100)).toBe(100);
    expect(nextBest(100, 40)).toBe(100);
  });
});

describe('readBest / recordBest', () => {
  it('기록이 없으면 0', () => {
    expect(readBest(fakeStore())).toBe(0);
  });
  it('숫자가 아니거나 음수인 값은 0으로 본다', () => {
    expect(readBest(fakeStore('abc'))).toBe(0);
    expect(readBest(fakeStore(-5))).toBe(0);
    expect(readBest(fakeStore(NaN))).toBe(0);
  });
  it('recordBest: 넘으면 저장하고, 못 넘으면 그대로', () => {
    const store = fakeStore();
    expect(recordBest(store, 120)).toBe(120);
    expect(recordBest(store, 80)).toBe(120);
    expect(readBest(store)).toBe(120);
    expect(recordBest(store, 121)).toBe(121);
  });
});
