// 온라인 기능 공개 API (PLAN 7절). scenes는 이 파일만 import한다.
// online은 view·scenes를 모른다. 어떤 함수도 게임을 막거나 throw하지 않는다
import { RULES_VERSION } from '../config';
import { ACCOUNT_TIMEOUT_MS, createAccount, type Account, type OnlineStatus } from './account';
import { createDefaultBackend, hasOnlineKeys } from './client';
import { createProfile, type MyProfile, type Profile, type SetNicknameResult } from './profile';
import { createRanking, type Ranking, type RankingResult } from './ranking';
import {
  createRuns,
  type Runs,
  type StartedRun,
  type SubmitOutcome,
  type SubmitPayload,
} from './runs';

export type { OnlineStatus } from './account';
export type { MyProfile, SetNicknameErrorCode, SetNicknameResult } from './profile';
export type { StartedRun, SubmitOutcome, SubmitPayload } from './runs';
export type { RankingMe, RankingResult, RankingRow } from './ranking';
export {
  checkNickname,
  formatTag,
  type NicknameCheck,
  type NicknameErrorCode,
} from './nicknameRules';

let instance: { account: Account; profile: Profile; runs: Runs; ranking: Ranking } | null = null;

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

function online() {
  if (!instance) {
    const account = createAccount({
      hasKeys: hasOnlineKeys(),
      loadBackend: createDefaultBackend,
      isOnline,
      onOnline: (listener) => {
        if (typeof window !== 'undefined') window.addEventListener('online', listener);
      },
      timeoutMs: ACCOUNT_TIMEOUT_MS,
    });
    instance = {
      account,
      profile: createProfile(account),
      runs: createRuns(account, { version: RULES_VERSION, isOnline }),
      ranking: createRanking(account, { isOnline }),
    };
  }
  return instance;
}

export function onlineStatus(): OnlineStatus {
  return online().account.status();
}

/** 브라우저가 지금 네트워크에 연결돼 있다고 알리는지 (계정이 저장된 세션으로 ready여도 실제로는 오프라인일 수 있다) */
export function isNetworkOnline(): boolean {
  return isOnline();
}

/** 세션 확인, 없으면 익명 로그인. 절대 throw하지 않으며 기다리지 않아도 된다 */
export function ensureAccount(): Promise<void> {
  return online().account.ensure();
}

/** 지금 계정의 사용자 ID (ready일 때만). 늦은 응답이 다른 계정의 것인지 가리는 데 쓴다 */
export function currentUserId(): string | null {
  return online().account.userId();
}

export function getMyProfile(): Promise<MyProfile | null | 'error'> {
  return online().profile.getMyProfile();
}

/** 규칙(checkNickname)으로 먼저 거른 뒤 set-nickname 함수를 부른다 */
export function setNickname(name: string): Promise<SetNicknameResult> {
  return online().profile.setNickname(name);
}

/**
 * 새 판을 시작하기 전에 서버에서 seed·run을 받는다 (계정 준비 포함 최대 2.5초). 키 없음·오프라인·실패·시간 초과면 null:
 * 그 판은 서버 기록 없이(랭킹 대상이 아닌 오프라인 판으로) 바로 시작한다. 절대 throw하지 않는다
 */
export function startRun(): Promise<StartedRun | null> {
  return online().runs.startRun();
}

/** 게임 오버 판을 제출한다 (최대 10초). 절대 throw하지 않고 결과를 분류해 돌려준다 */
export function submitScore(runId: string, payload: SubmitPayload): Promise<SubmitOutcome> {
  return online().runs.submitScore(runId, payload);
}

/**
 * 이번 주(서버 기준) 랭킹을 조회한다 (최대 5초, 계정 준비 포함). 절대 throw하지 않는다.
 * 키 없음·오프라인이면 요청 없이 offline, 계정이 없으면 공개 목록만(결과의 userId가 null)
 */
export function fetchRanking(): Promise<RankingResult> {
  return online().ranking.fetchRanking();
}
