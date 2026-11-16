// 닉네임 입력 창을 띄울지 정하는 규칙 (순수). W3-03부터는 **점수 제출이 성공한 뒤**에만 배포본에서도 연다 (SPEC 8.1, 사용자 결정).
// DEV 전용 `?ranking=fake`는 온라인 없이 창만 보는 확인용으로 남긴다 (호출부의 `import.meta.env.DEV`와 함께 프로덕션 빌드에서 지워진다).
import type { OnlineStatus, SubmitOutcome } from '../online';

/** DEV `?ranking=fake`: 서버·계정 없이 가짜 제출로 닉네임 창의 입력·거부 문구·[나중에]·연타를 본다. 그 밖의 값과 프로덕션(dev=false)은 false */
export function parseFakeRanking(search: string, dev: boolean): boolean {
  if (!dev) return false;
  return new URLSearchParams(search).get('ranking') === 'fake';
}

export interface GateInput {
  /** 점수 제출 결과 */
  outcome: SubmitOutcome;
  /** 지금 계정의 사용자 ID (ready일 때만, 아니면 null) */
  userId: string | null;
  status: OnlineStatus;
  /** 브라우저가 네트워크에 연결돼 있다고 알리는가 (저장된 세션이 있어 ready여도 오프라인일 수 있다) */
  networkOnline: boolean;
}

/**
 * 프로필을 조회해 이름을 물을지 (조회 전 판단). false면 프로필 조회도 하지 않는다.
 * 제출이 성공했고, 그 제출을 한 계정이 지금 계정과 같고(기다리는 사이 계정이 바뀌지 않음), 온라인이고 계정이 준비된 경우만.
 * 거부·실패·시간 초과·새 버전 안내에는 열지 않는다
 */
export function shouldCheckProfile(g: GateInput): boolean {
  return (
    g.outcome.kind === 'ok' &&
    g.userId !== null &&
    g.outcome.userId === g.userId &&
    g.status === 'ready' &&
    g.networkOnline
  );
}

/** 프로필 조회 뒤: 아직 이름이 없을 때(null)만 연다. 조회 실패('error')는 미설정으로 취급하지 않는다 */
export function shouldOpenPrompt(profile: unknown): boolean {
  return profile === null;
}
