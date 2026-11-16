// 닉네임 입력 창을 띄울지 정하는 규칙 (순수). 이번 태스크(W3-02)에서는 DEV `?ranking`일 때만 연다.
// 점수 제출·랭킹 등록은 W3-03·04에서 이 자리에 이어 붙인다. 호출부의 `import.meta.env.DEV`와 함께 프로덕션 빌드에서 지워진다.
import type { OnlineStatus } from '../online';

/** DEV `?ranking`의 뜻: 닉네임 입력 흐름을 시험한다. `?ranking=fake`는 온라인 없이 가짜 제출로 창만 본다 */
export type RankingParam = 'online' | 'fake';

/** `?ranking`·`?ranking=1`은 'online', `?ranking=fake`는 'fake'. 그 밖의 값과 프로덕션(dev=false)은 null (무시) */
export function parseRankingParam(search: string, dev: boolean): RankingParam | null {
  if (!dev) return null;
  const value = new URLSearchParams(search).get('ranking');
  if (value === null) return null;
  if (value === '' || value === '1') return 'online';
  if (value === 'fake') return 'fake';
  return null;
}

export interface GateInput {
  /** parseRankingParam 결과 */
  ranking: RankingParam | null;
  /** 이 판이 정상 종료 화면인가 (`?fill=`·`?over` 미리보기가 아니다) */
  eligible: boolean;
  status: OnlineStatus;
  /** 브라우저가 네트워크에 연결돼 있다고 알리는가 (저장된 세션이 있어 ready여도 오프라인일 수 있다) */
  networkOnline: boolean;
}

/**
 * 프로필을 조회해 이름을 물을지 (조회 전 판단). false면 프로필 조회도 하지 않는다.
 * - 'fake'는 온라인 없이 창만 보는 확인용이라 다른 조건을 보지 않는다
 * - 'online'은 정상 종료 화면 + 온라인 + 계정이 이미 준비된 경우만. 계정이 이 화면 뒤에 늦게 준비되면 다음 게임 오버부터 묻는다
 */
export function shouldCheckProfile(g: GateInput): boolean {
  if (g.ranking === 'fake') return true;
  return g.ranking === 'online' && g.eligible && g.status === 'ready' && g.networkOnline;
}

/** 프로필 조회 뒤: 아직 이름이 없을 때(null)만 연다. 조회 실패('error')는 미설정으로 취급하지 않는다 */
export function shouldOpenPrompt(profile: unknown): boolean {
  return profile === null;
}
