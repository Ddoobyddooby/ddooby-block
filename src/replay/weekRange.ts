// 주 키('2026-W47') → 그 주 월~일의 월·일 (W3-04 랭킹 화면의 기간 줄). weekKey.ts의 반대 방향이다. import 없음.
// ISO 8601 규칙: 1주차 = 1월 4일이 든 주. 한 해는 52주 또는 53주라서 존재하지 않는 주(2021-W53 등)는 null이다
// (단순히 1~53만 검사하면 없는 주를 다음 해로 넘겨 거짓 기간을 보인다).

const DAY_MS = 24 * 60 * 60 * 1000;

/** 그 해의 ISO 주 수 (52 또는 53). 1월 1일이 목요일이거나, 윤년이면서 수요일인 해가 53주다 */
export function isoWeeksInYear(year: number): 52 | 53 {
  const jan1 = new Date(Date.UTC(year, 0, 1)).getUTCDay(); // 일 0 … 토 6
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return jan1 === 4 || (leap && jan1 === 3) ? 53 : 52;
}

export interface WeekRange {
  /** [월, 일] 월요일 */
  start: readonly [number, number];
  /** [월, 일] 일요일 */
  end: readonly [number, number];
}

/** '2026-W47' → 월요일·일요일의 [월, 일]. 형식이 틀리거나 그 해에 없는 주면 null */
export function weekRange(key: unknown): WeekRange | null {
  if (typeof key !== 'string') return null;
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > isoWeeksInYear(year)) return null;
  const jan4 = Date.UTC(year, 0, 4);
  const jan4Dow = new Date(jan4).getUTCDay() || 7; // 월 1 … 일 7
  const monday = jan4 - (jan4Dow - 1) * DAY_MS + (week - 1) * 7 * DAY_MS;
  const mon = new Date(monday);
  const sun = new Date(monday + 6 * DAY_MS);
  return {
    start: [mon.getUTCMonth() + 1, mon.getUTCDate()],
    end: [sun.getUTCMonth() + 1, sun.getUTCDate()],
  };
}
