// 익명 계정 (PLAN 7절). 게임을 막지 않는다: 실패·오프라인이면 조용히 넘어가고
// 브라우저 `online` 이벤트나 다음 ensureAccount() 호출 때 다시 시도한다.
// pang src/online/account.ts에서 복사해 다음을 더했다:
// - SDK 인증 작업(세션 확인 → 익명 로그인)은 **한 번에 하나**다. 시간 제한은 "기다림"만 끝내고 작업은 계속되며, 재시도는 그 작업에 다시 붙는다
//   (시간 초과 뒤 새 로그인을 또 시작하면 SDK 세션이 늦게 끝난 첫 로그인으로 바뀌어 앱 계정과 어긋난다)
// - 앱의 계정 ID는 **SDK 세션을 따라간다**: 세션 변경 이벤트(로그인·갱신·로그아웃)와 작업이 끝난 뒤의 getSession() 재조정으로 맞춘다
// - 세션 이벤트 번호: 세션 조회를 기다리는 사이 더 최신 세션 이벤트(로그아웃·계정 전환)가 오면 옛 조회 결과는 적용하지 않는다
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
  /**
   * 세션 이벤트(onSessionChange)가 올 때마다 올린다. 사용자 ID가 그대로여도(null → null의 SIGNED_OUT 포함) 오른다.
   * 세션 조회는 시작할 때 이 값을 기억하고, 끝났을 때 달라졌으면 결과를 버린다: 이벤트가 이미 더 최신 상태를 앱에 반영했다
   */
  let revision = 0;

  const armRetry = () => {
    if (retryArmed) return;
    retryArmed = true;
    deps.onOnline(() => void ensure());
  };

  /** SDK 세션의 사용자(없으면 null)를 앱 계정에 반영한다 */
  const follow = (id: string | null) => {
    if (status === 'disabled') return;
    userId = id;
    if (id !== null) status = 'ready';
    else if (status === 'ready') status = 'offline';
  };

  const loadBackend = async (): Promise<OnlineBackend | null> => {
    if (backend) return backend;
    const loaded = await deps.loadBackend();
    if (loaded && !backend) {
      loaded.onSessionChange((id) => {
        revision += 1;
        follow(id);
      });
      backend = loaded;
    }
    return backend ?? loaded;
  };

  /** SDK 세션 조회. 기다리는 사이 세션 이벤트가 왔으면 이 결과는 옛 것이라 'superseded' (이벤트가 이미 앱 상태를 맞췄다) */
  const readSession = async (b: OnlineBackend): Promise<{ id: string | null } | 'superseded'> => {
    const started = revision;
    const id = await b.getSessionUserId();
    return revision === started ? { id } : 'superseded';
  };

  /**
   * 세션 확인 → 없으면 익명 로그인 → 마지막에 SDK 세션으로 재조정.
   * 조회마다 더 최신 이벤트가 있었는지 보고, 있었으면 그 결과를 적용하지 않고 끝낸다 (다시 조회하지 않는다. 필요하면 다음 ensure가 시작한다).
   * 가입이 일으키는 SIGNED_IN 이벤트는 앱 ID를 이미 그 사용자로 맞추므로, 가입 뒤의 재조회가 버려져도 상태는 맞다
   */
  const authenticate = async (): Promise<void> => {
    try {
      const b = await loadBackend();
      if (!b) {
        status = 'disabled';
        return;
      }
      let read = await readSession(b);
      if (read !== 'superseded' && read.id === null) {
        if (!deps.isOnline()) {
          follow(null);
          return;
        }
        await b.signInAnonymously();
        read = await readSession(b);
      }
      if (read !== 'superseded') follow(read.id);
    } catch {
      // 아래에서 offline 처리
    } finally {
      if (status === 'signing-in') status = 'offline';
      if (status !== 'ready' && status !== 'disabled') armRetry();
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
