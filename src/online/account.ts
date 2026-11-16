// 익명 계정 (PLAN 7절). 게임을 막지 않는다: 실패·오프라인이면 조용히 넘어가고
// 브라우저 `online` 이벤트나 다음 ensureAccount() 호출 때 다시 시도한다.
// pang src/online/account.ts에서 복사해 다음을 더했다:
// - SDK 인증 작업(세션 확인 → 익명 로그인)은 **한 번에 하나**다. 시간 제한은 "기다림"만 끝내고 작업은 계속되며, 재시도는 그 작업에 다시 붙는다
//   (시간 초과 뒤 새 로그인을 또 시작하면 SDK 세션이 늦게 끝난 첫 로그인으로 바뀌어 앱 계정과 어긋난다)
// - 앱의 계정 ID는 **SDK 세션을 따라간다**: 세션 변경 이벤트(로그인·갱신·로그아웃)와 작업이 끝난 뒤의 getSession() 재조정으로 맞춘다
// - 세대 번호: 폐기된 시도(기다리는 사이 계정이 바뀜)가 새 가입을 시작하지 못하게 한다
import type { OnlineBackend } from './client';

/**
 * - disabled: 키 없는 빌드. 온라인 기능 꺼짐
 * - offline: 키는 있지만 계정(세션)이 없다. 오프라인이거나 로그인 실패
 * - signing-in: 세션 확인·익명 로그인 중
 * - ready: 계정 있음
 */
export type OnlineStatus = 'disabled' | 'offline' | 'signing-in' | 'ready';

export interface AccountDeps {
  hasKeys: boolean;
  loadBackend(): Promise<OnlineBackend | null>;
  isOnline(): boolean;
  /** 네트워크가 다시 연결되면 listener를 부른다 (브라우저 `online` 이벤트) */
  onOnline(listener: () => void): void;
  /** ensure()가 인증 작업을 기다리는 최대 시간(ms). 넘으면 offline으로 두고 돌아간다 (작업은 계속된다) */
  timeoutMs: number;
}

export interface Account {
  status(): OnlineStatus;
  /** 절대 throw하지 않는다. 기다리지 않아도 된다 */
  ensure(): Promise<void>;
  userId(): string | null;
  /** ready일 때만 백엔드를 준다 */
  backend(): OnlineBackend | null;
}

export const ACCOUNT_TIMEOUT_MS = 15_000;

export function createAccount(deps: AccountDeps): Account {
  let status: OnlineStatus = deps.hasKeys ? 'offline' : 'disabled';
  let userId: string | null = null;
  let backend: OnlineBackend | null = null;
  /** 진행 중인 SDK 인증 작업. 최대 하나 */
  let auth: Promise<void> | null = null;
  let retryArmed = false;
  /** 계정(사용자 ID)이 바뀔 때마다 올린다. 시작할 때의 값과 다르면 그 시도는 새 가입을 시작하지 않는다 */
  let generation = 0;

  const armRetry = () => {
    if (retryArmed) return;
    retryArmed = true;
    deps.onOnline(() => void ensure());
  };

  /** SDK 세션의 사용자(없으면 null)를 앱 계정에 반영한다 */
  const follow = (id: string | null) => {
    if (status === 'disabled') return;
    if (userId !== id) generation += 1;
    userId = id;
    if (id !== null) status = 'ready';
    else if (status === 'ready') status = 'offline';
  };

  const loadBackend = async (): Promise<OnlineBackend | null> => {
    if (backend) return backend;
    const loaded = await deps.loadBackend();
    if (loaded && !backend) {
      loaded.onSessionChange(follow);
      backend = loaded;
    }
    return backend ?? loaded;
  };

  /** 세션 확인 → 없으면 익명 로그인 → 마지막에 SDK 세션으로 재조정. 앱 상태를 직접 정한다 */
  const authenticate = async (): Promise<void> => {
    const started = generation;
    try {
      const b = await loadBackend();
      if (!b) {
        status = 'disabled';
        return;
      }
      let id = await b.getSessionUserId();
      if (id === null) {
        if (!deps.isOnline()) {
          follow(null);
          if (status !== 'ready') status = 'offline';
          armRetry();
          return;
        }
        if (generation !== started) {
          // 기다리는 사이 계정이 바뀌었다: 폐기된 시도가 새 가입을 시작하지 않는다 (다음 ensure가 다시 시작한다)
          if (status !== 'ready') status = 'offline';
          armRetry();
          return;
        }
        await b.signInAnonymously();
        id = await b.getSessionUserId();
      }
      follow(id);
      if (id === null) {
        status = 'offline';
        armRetry();
      }
    } catch {
      if (status !== 'ready') status = 'offline';
      armRetry();
    }
  };

  const ensure = (): Promise<void> => {
    if (status === 'disabled' || status === 'ready') return Promise.resolve();
    if (!auth) {
      status = 'signing-in';
      auth = authenticate().finally(() => (auth = null));
    } else if (status === 'offline') {
      status = 'signing-in';
    }
    const running = auth;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        // 기다림만 끝낸다. 인증 작업은 계속되고, 끝나면 세션 변경 이벤트·재조정이 앱 계정을 맞춘다
        if (status === 'signing-in') status = 'offline';
        armRetry();
        resolve();
      }, deps.timeoutMs);
    });
    return Promise.race([running, timedOut]).finally(() => clearTimeout(timer));
  };

  return {
    status: () => status,
    ensure,
    userId: () => (status === 'ready' ? userId : null),
    backend: () => (status === 'ready' ? backend : null),
  };
}
