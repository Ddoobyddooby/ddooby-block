// 주간 랭킹의 주 (SPEC 8절): KST(UTC+9, 서머타임 없음) 날짜의 ISO 8601 주차. 월요일 00:00 KST에 바뀐다.
// 서버(start-run)가 run 발급 시각으로 정하고, 클라이언트의 결과 문구(이번 주인지 지난주인지)와 W3-04 랭킹 화면도 같은 함수를 쓴다.
// ddooby-pang src/replay/weekKey.ts에서 복사. import 없음 (서버 번들에 그대로 들어간다)

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** ms(Unix 시각) → '2026-W46'. ISO 주차는 그 주 목요일이 속한 해를 쓴다 (연말·연초에 해가 바뀔 수 있다) */
export function weekKey(ms: number): string {
  // KST 벽시계 시각을 UTC 필드로 읽는다 (실행 환경의 시간대와 무관하다)
  const kst = new Date(ms + KST_OFFSET_MS);
  const day = kst.getUTCDay() || 7; // 월 1 … 일 7
  const thursday = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 4 - day);
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}
