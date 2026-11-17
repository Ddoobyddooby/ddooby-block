import { describe, expect, it } from 'vitest';
import { defaultSave, parseSave } from '../../src/storage/progress';

const DEFAULT = {
  version: 1,
  bestScore: 0,
  settings: { muted: false, music: true, theme: 'soda' },
};

describe('parseSave', () => {
  it('정상 데이터는 그대로', () => {
    const json = JSON.stringify({
      version: 1,
      bestScore: 1234,
      settings: { muted: true, music: false, theme: 'soda' },
    });
    expect(parseSave(json)).toEqual({
      version: 1,
      bestScore: 1234,
      settings: { muted: true, music: false, theme: 'soda' },
    });
  });

  it('설정이 일부 빠지면 그 부분만 기본값 (muted=false를 빠진 값으로 보지 않는다)', () => {
    expect(
      parseSave(JSON.stringify({ version: 1, bestScore: 50, settings: { muted: false } })),
    ).toEqual({
      version: 1,
      bestScore: 50,
      settings: { muted: false, music: true, theme: 'soda' },
    });
    expect(parseSave(JSON.stringify({ version: 1, bestScore: 50 })).settings).toEqual({
      muted: false,
      music: true,
      theme: 'soda',
    });
    expect(
      parseSave(JSON.stringify({ version: 1, settings: { music: false, theme: 'soda' } })),
    ).toEqual({
      version: 1,
      bestScore: 0,
      settings: { muted: false, music: false, theme: 'soda' },
    });
  });

  it('없음·잘림·객체가 아님·다른 version → 기본값 (예외 없음)', () => {
    expect(parseSave(null)).toEqual(DEFAULT);
    expect(parseSave('')).toEqual(DEFAULT);
    expect(parseSave('{"version":1,"bestSc')).toEqual(DEFAULT);
    expect(parseSave('null')).toEqual(DEFAULT);
    expect(parseSave('[]')).toEqual(DEFAULT);
    expect(parseSave('"x"')).toEqual(DEFAULT);
    expect(parseSave('7')).toEqual(DEFAULT);
    // 다른 version을 지금 version으로 읽지 않는다
    expect(parseSave(JSON.stringify({ version: 2, bestScore: 99 }))).toEqual(DEFAULT);
    expect(parseSave(JSON.stringify({ version: '1', bestScore: 99 }))).toEqual(DEFAULT);
    expect(parseSave(JSON.stringify({ bestScore: 99 }))).toEqual(DEFAULT);
  });

  it('최고 점수는 0 이상의 안전한 정수만: 음수·소수·문자열·null·Infinity·큰 수는 0', () => {
    const best = (value: string): number =>
      parseSave(`{"version":1,"bestScore":${value}}`).bestScore;
    expect(best('0')).toBe(0);
    expect(best('9007199254740991')).toBe(9007199254740991);
    expect(best('-1')).toBe(0);
    expect(best('12.5')).toBe(0);
    expect(best('"300"')).toBe(0);
    expect(best('null')).toBe(0);
    expect(best('1e309')).toBe(0); // JSON.parse는 Infinity로 읽는다
    expect(best('9007199254740993')).toBe(0); // 안전한 정수 범위 밖
    expect(best('[5]')).toBe(0);
  });

  it('설정은 진짜 불리언만: "false"·0·null·배열은 기본값', () => {
    const settings = (value: string) =>
      parseSave(`{"version":1,"settings":{"muted":${value},"music":${value}}}`).settings;
    for (const bad of ['"false"', '"true"', '0', '1', 'null', '[]', '{}']) {
      expect(settings(bad)).toEqual({ muted: false, music: true, theme: 'soda' });
    }
    expect(parseSave('{"version":1,"settings":"x"}').settings).toEqual({
      muted: false,
      music: true,
      theme: 'soda',
    });
    expect(parseSave('{"version":1,"settings":[true]}').settings).toEqual({
      muted: false,
      music: true,
      theme: 'soda',
    });
  });

  it('모르는 필드와 __proto__ 키는 무시한다', () => {
    const json =
      '{"version":1,"bestScore":7,"extra":1,"__proto__":{"bestScore":99},"settings":{"__proto__":{"muted":true}}}';
    const parsed = parseSave(json);
    expect(parsed).toEqual({
      version: 1,
      bestScore: 7,
      settings: { muted: false, music: true, theme: 'soda' },
    });
    expect(({} as Record<string, unknown>).bestScore).toBeUndefined();
  });

  it('defaultSave는 호출마다 새 객체 (한쪽을 바꿔도 다른 쪽이 안 변한다)', () => {
    const a = defaultSave();
    a.bestScore = 5;
    a.settings.muted = true;
    expect(defaultSave()).toEqual(DEFAULT);
  });
});

describe('parseSave: 테마 (W4-05)', () => {
  const theme = (value: string | null): unknown =>
    parseSave(
      value === null
        ? '{"version":1,"settings":{}}'
        : `{"version":1,"settings":{"theme":${value}}}`,
    ).settings.theme;

  it('정상 테마 ID는 그대로 읽는다', () => {
    expect(theme('"butter"')).toBe('butter');
    expect(theme('"orbit"')).toBe('orbit');
    expect(theme('"soda"')).toBe('soda');
  });

  it('없으면 기본 테마(소다 가든)다: 테마가 생기기 전에 저장한 데이터도 읽힌다', () => {
    expect(theme(null)).toBe('soda');
    expect(
      parseSave(
        JSON.stringify({ version: 1, bestScore: 5, settings: { muted: true, music: false } }),
      ).settings,
    ).toEqual({ muted: true, music: false, theme: 'soda' });
    expect(parseSave('{"version":1}').settings.theme).toBe('soda');
  });

  it('모르는 값·다른 형식은 기본 테마다 (예전 이름·대소문자·숫자·null·객체)', () => {
    for (const bad of [
      '"navy"',
      '"Butter"',
      '""',
      '0',
      '1',
      'null',
      'true',
      '[]',
      '{}',
      '["orbit"]',
    ]) {
      expect(theme(bad)).toBe('soda');
    }
  });

  it('다른 설정이 깨져도 테마는 따로 읽는다', () => {
    const settings = parseSave('{"version":1,"settings":{"muted":"x","theme":"orbit"}}').settings;
    expect(settings).toEqual({ muted: false, music: true, theme: 'orbit' });
  });
});
