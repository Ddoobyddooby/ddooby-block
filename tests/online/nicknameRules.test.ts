import { describe, expect, it } from 'vitest';
import {
  checkNickname,
  formatTag,
  isBannedNickname,
  isValidTag,
  normalizeNickname,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  TAG_MAX,
  TAG_MAX_ATTEMPTS,
  TAG_MIN,
} from '../../src/online/nicknameRules';
import { PASS_NAMES, REJECT_NAMES, TRIM_NAMES } from './corpus';

describe('닉네임 규칙 (SPEC 8절, PLAN 7절)', () => {
  it('상수: 2~10자, 태그 0~9999, 태그 재시도 20번', () => {
    expect([NICKNAME_MIN_LENGTH, NICKNAME_MAX_LENGTH]).toEqual([2, 10]);
    expect([TAG_MIN, TAG_MAX, TAG_MAX_ATTEMPTS]).toEqual([0, 9999, 20]);
  });

  it.each(PASS_NAMES)('통과: %s (저장 이름은 입력 그대로, 대소문자도 그대로)', (name) => {
    expect(checkNickname(name)).toEqual({ ok: true, nickname: name });
  });

  it.each(REJECT_NAMES)('거부: %j → %s', (name, code) => {
    expect(checkNickname(name)).toEqual({ ok: false, code });
  });

  it.each(TRIM_NAMES)('앞뒤 공백·NFC 정리 뒤 판정: %j → %s', (input, saved) => {
    expect(checkNickname(input)).toEqual({ ok: true, nickname: saved });
  });

  it('길이는 코드 포인트로 센다: 정확히 2자·10자는 통과, 1자·11자는 거부', () => {
    expect(checkNickname('가나').ok).toBe(true);
    expect(checkNickname('0123456789').ok).toBe(true);
    expect(checkNickname('가')).toEqual({ ok: false, code: 'too-short' });
    expect(checkNickname('01234567890')).toEqual({ ok: false, code: 'too-long' });
  });

  it('정규화는 멱등이고 NFD와 NFC가 같은 결과를 낸다', () => {
    for (const name of PASS_NAMES) {
      const nfd = name.normalize('NFD');
      expect(checkNickname(nfd)).toEqual(checkNickname(name));
      expect(normalizeNickname(normalizeNickname(nfd))).toBe(normalizeNickname(nfd));
    }
  });

  it('영문 대소문자는 저장 전에 바꾸지 않는다 (소문자화는 금칙어 비교에만)', () => {
    expect(checkNickname('BlueSky')).toEqual({ ok: true, nickname: 'BlueSky' });
    expect(isBannedNickname('FUCK')).toBe(true);
  });

  it('숫자는 금칙어 비교에서만 뺀다: 숫자를 끼워도 막히고, 숫자만 있는 이름은 통과', () => {
    expect(isBannedNickname('시1발')).toBe(true);
    expect(isBannedNickname('2시3발4')).toBe(true);
    expect(checkNickname('0000')).toEqual({ ok: true, nickname: '0000' });
  });

  it('태그: 0·9999만 끝값으로 유효하고 truthy 검사로 0을 버리지 않는다', () => {
    expect(isValidTag(0)).toBe(true);
    expect(isValidTag(9999)).toBe(true);
    for (const bad of [-1, 10000, 1.5, NaN, Infinity, -Infinity, '0', null, undefined, {}, [0]]) {
      expect(isValidTag(bad)).toBe(false);
    }
    expect(formatTag(0)).toBe('#0000');
    expect(formatTag(427)).toBe('#0427');
    expect(formatTag(9999)).toBe('#9999');
  });
});
