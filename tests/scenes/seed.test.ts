import { describe, expect, it } from 'vitest';
import { parseSeedParam } from '../../src/scenes/seed';

describe('parseSeedParam', () => {
  it('?seed=N (0~4294967295의 10진 정수)', () => {
    expect(parseSeedParam('?seed=1')).toBe(1);
    expect(parseSeedParam('?seed=0')).toBe(0);
    expect(parseSeedParam('?seed=007')).toBe(7);
    expect(parseSeedParam('?seed=4294967295')).toBe(4294967295);
    expect(parseSeedParam('?foo=bar&seed=42')).toBe(42);
    expect(parseSeedParam('seed=42')).toBe(42); // 앞의 ?는 없어도 된다
  });

  it('seed가 없으면 null', () => {
    expect(parseSeedParam('')).toBeNull();
    expect(parseSeedParam('?')).toBeNull();
    expect(parseSeedParam('?fill=abc')).toBeNull();
    expect(parseSeedParam('?seeds=1')).toBeNull();
  });

  it.each([
    ['빈 값', '?seed='],
    ['키만', '?seed'],
    ['글자', '?seed=abc'],
    ['소수', '?seed=1.5'],
    ['음수', '?seed=-1'],
    ['부호', '?seed=%2B1'],
    ['지수 표기', '?seed=1e3'],
    ['16진수', '?seed=0x10'],
    ['숫자 뒤 글자', '?seed=12abc'],
    ['공백', '?seed=%201'],
    ['범위 초과', '?seed=4294967296'],
    ['자릿수 초과', '?seed=99999999999'],
    ['전각 숫자', '?seed=１'],
  ])('형식이 다르면 null: %s', (_name, search) => {
    expect(parseSeedParam(search)).toBeNull();
  });

  it('같은 키가 여러 번이면 첫 번째', () => {
    expect(parseSeedParam('?seed=3&seed=9')).toBe(3);
    expect(parseSeedParam('?seed=abc&seed=9')).toBeNull();
  });
});
