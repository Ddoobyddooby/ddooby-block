import { describe, expect, it } from 'vitest';
import {
  nextBest,
  readBest,
  recordBest,
  startBest,
  writeBest,
  type BestStore,
} from '../../src/scenes/bestScore';

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

describe('writeBest (저장소에서 읽은 값을 채움)', () => {
  it('더 크면 올리고, 작거나 같으면 그대로', () => {
    const store = fakeStore();
    writeBest(store, 500);
    expect(readBest(store)).toBe(500);
    writeBest(store, 100);
    expect(readBest(store)).toBe(500);
  });
});

describe('startBest (판 시작 때 HUD 최고 점수)', () => {
  it('이어한 점수가 저장 최고보다 높으면 그 점수 (저장 302, 점수 500 → 500)', () => {
    const store = fakeStore(302);
    expect(startBest(store, 500, true)).toBe(500);
    expect(readBest(store)).toBe(500);
  });
  it('저장 최고가 더 높으면 그대로 (900, 500 → 900)', () => {
    expect(startBest(fakeStore(900), 500, true)).toBe(900);
  });
  it('새 판(점수 0)은 저장 최고 그대로', () => {
    expect(startBest(fakeStore(302), 0, true)).toBe(302);
  });
  it('fill 판은 점수가 높아도 저장 최고 그대로이고 registry도 안 바뀐다', () => {
    const store = fakeStore(302);
    expect(startBest(store, 3103, false)).toBe(302);
    expect(readBest(store)).toBe(302);
  });
});
