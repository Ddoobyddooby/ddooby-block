import { describe, expect, it } from 'vitest';
import { weekKey } from '../../src/replay/weekKey';

// 기준값은 구현과 별도로 계산했다 (Python datetime.isocalendar). KST = UTC+9, 서머타임 없음.
const utc = (iso: string): number => Date.parse(iso);

describe('weekKey (KST 월요일 00:00에 바뀌는 ISO 주)', () => {
  it('일요일 23:59:59.999 KST는 2026-W46, 월요일 00:00 KST는 2026-W47', () => {
    expect(weekKey(utc('2026-11-15T14:59:59.999Z'))).toBe('2026-W46');
    expect(weekKey(utc('2026-11-15T15:00:00.000Z'))).toBe('2026-W47');
    // KST 일요일 아침(UTC로는 토요일)도 같은 주
    expect(weekKey(utc('2026-11-14T15:00:00.000Z'))).toBe('2026-W46');
  });

  it('달력 연도와 ISO 주 연도가 다른 연말·연초', () => {
    expect(weekKey(utc('2020-12-31T15:00:00.000Z'))).toBe('2020-W53'); // KST 2021-01-01
    expect(weekKey(utc('2021-01-03T14:59:59.999Z'))).toBe('2020-W53'); // KST 2021-01-03 일 23:59
    expect(weekKey(utc('2021-01-03T15:00:00.000Z'))).toBe('2021-W01'); // KST 2021-01-04 월 00:00
    expect(weekKey(utc('2018-12-30T15:00:00.000Z'))).toBe('2019-W01'); // KST 2018-12-31 월
    expect(weekKey(utc('2026-01-01T00:00:00.000Z'))).toBe('2026-W01');
    expect(weekKey(utc('2025-12-28T14:59:59.999Z'))).toBe('2025-W52');
  });

  it('주 번호는 두 자리로 채운다', () => {
    expect(weekKey(utc('2026-01-05T00:00:00.000Z'))).toBe('2026-W02');
  });
});
