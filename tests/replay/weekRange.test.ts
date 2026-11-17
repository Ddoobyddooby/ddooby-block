import { describe, expect, it } from 'vitest';
import { isoWeeksInYear, weekRange } from '../../src/replay/weekRange';
import { weekKey } from '../../src/replay/weekKey';

// 기대값은 달력에서 직접 센 리터럴이다 (구현의 계산을 다시 호출해 만들지 않는다)
describe('weekRange: 주 키 → 월~일의 [월, 일]', () => {
  it.each([
    ['2026-W45', [11, 2], [11, 8]],
    ['2026-W46', [11, 9], [11, 15]],
    ['2026-W47', [11, 16], [11, 22]],
    ['2020-W53', [12, 28], [1, 3]], // 연말에 걸치는 53주차
    ['2021-W01', [1, 4], [1, 10]],
    ['2019-W01', [12, 31], [1, 6]], // 1주차가 전년도 12월에 시작
    ['2026-W53', [12, 28], [1, 3]], // 2026년은 1월 1일이 목요일이라 53주
  ] as const)('%s → %j ~ %j', (key, start, end) => {
    expect(weekRange(key)).toEqual({ start, end });
  });

  it('해마다 52주 또는 53주: 53주인 해는 목요일 시작이거나 수요일 시작 윤년', () => {
    expect(isoWeeksInYear(2020)).toBe(53);
    expect(isoWeeksInYear(2026)).toBe(53);
    expect(isoWeeksInYear(2015)).toBe(53);
    expect(isoWeeksInYear(2021)).toBe(52);
    expect(isoWeeksInYear(2019)).toBe(52);
    expect(isoWeeksInYear(2024)).toBe(52); // 윤년이지만 월요일 시작
  });

  it.each([
    '2021-W53', // 2021년에는 53주가 없다 (다음 해로 넘기면 거짓 기간)
    '2019-W53',
    '2026-W00',
    '2026-W54',
    '2026-W5',
    '26-W10',
    '2026W10',
    '2026-w10',
    ' 2026-W10',
    '',
  ])('잘못되었거나 없는 주 %j → null', (key) => {
    expect(weekRange(key)).toBeNull();
  });

  it.each([null, undefined, 5, {}, [], true])('문자열이 아니면 null (%j)', (key) => {
    expect(weekRange(key)).toBeNull();
  });

  it('weekKey와 맞물린다: 2015~2032년 모든 날짜가 자기 주의 월~일 안에 있다', () => {
    const DAY = 86_400_000;
    for (let t = Date.UTC(2015, 0, 1); t < Date.UTC(2033, 0, 1); t += DAY) {
      const date = new Date(t);
      // 그 날 KST 정오 → weekKey가 그 날짜의 주를 준다
      const key = weekKey(t + 3 * 60 * 60 * 1000);
      const range = weekRange(key);
      expect(range, `${date.toISOString()} ${key}`).not.toBeNull();
      const dow = date.getUTCDay() || 7;
      const mon = new Date(t - (dow - 1) * DAY);
      const sun = new Date(t + (7 - dow) * DAY);
      expect(range?.start).toEqual([mon.getUTCMonth() + 1, mon.getUTCDate()]);
      expect(range?.end).toEqual([sun.getUTCMonth() + 1, sun.getUTCDate()]);
    }
  });
});
