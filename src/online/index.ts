// 온라인 기능 공개 API (PLAN 7절). scenes는 이 파일만 import한다.
// online은 view·scenes를 모른다. 어떤 함수도 게임을 막거나 throw하지 않는다
import { ACCOUNT_TIMEOUT_MS, createAccount, type Account, type OnlineStatus } from './account';
import { createDefaultBackend, hasOnlineKeys } from './client';
import { createProfile, type MyProfile, type Profile, type SetNicknameResult } from './profile';

export type { OnlineStatus } from './account';
export type { MyProfile, SetNicknameErrorCode, SetNicknameResult } from './profile';
export {
  checkNickname,
  formatTag,
  type NicknameCheck,
  type NicknameErrorCode,
} from './nicknameRules';

let instance: { account: Account; profile: Profile } | null = null;

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
    instance = { account, profile: createProfile(account) };
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
