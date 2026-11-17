// 랭킹 화면 문구 (W3-04, SPEC 6·8절, PLAN 6.3). 화면 글자를 한곳에 모은다.
// 시스템 글꼴이라 가운뎃점(·)·말줄임(⋯) 글리프가 있다. 순번이 끊기는 곳은 글자가 아니라 그린 점으로 보인다 (RankingScene.drawGap).

export const RANKING_TEXT = {
  title: '주간 랭킹',
  /** 메뉴 버튼 */
  menuButton: '주간 랭킹',
  loading: '불러오는 중…',
  offline: '인터넷에 연결되면 랭킹을 볼 수 있어요',
  error: '랭킹을 불러오지 못했어요',
  empty: '이번 주 첫 기록을 남겨 보세요!',
  retry: '다시 시도',
  refresh: '새로고침',
  back: '돌아가기',
  setName: '이름 정하기',
  noRecord: '이번 주 기록이 없어요',
  /** n = 순위 */
  myRank: (n: number) => `내 순위 ${n}위`,
  /** score = 천 단위 쉼표를 넣은 점수 */
  noNickname: (score: string) => `${score}점 · 이름을 정하면 랭킹에 보여요`,

  // ── 게임 오버 결과 줄 (rankingResult.ts) ──
  /** 제출 직후·순위를 아직 모르거나 못 읽었을 때. n = 점수 */
  weekBest: (n: string) => `이번 주 최고 ${n}점`,
  /** n = 점수, rank = 순위 */
  weekBestRank: (n: string, rank: number) => `이번 주 최고 ${n}점 · ${rank}위`,
  /** 이름이 없는 계정: n = 점수 */
  weekBestNoName: (n: string) => `이번 주 최고 ${n}점 · 이름을 정하면 순위가 보여요`,
} as const;
