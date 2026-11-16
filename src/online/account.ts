// 익명 계정 (PLAN 7절). 게임을 막지 않는다: 실패·오프라인이면 조용히 넘어가고
// 브라우저 `online` 이벤트나 다음 ensureAccount() 호출 때 다시 시도한다.
// pang src/online/account.ts에서 복사해 세대 번호(로그아웃·계정 교체 중의 늦은 응답 무시)와 시간 제한을 더했다
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
  /** 세션 확인·로그인이 이 시간(ms) 안에 끝나지 않으면 포기한다 (오프라인으로 보고 다음 기회에 다시 시도) */
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
  let inflight: Promise<void> | null = null;
  let retryArmed = false;
  /** 로그아웃·시간 초과 때마다 올린다. 시작할 때의 값과 다르면 그 시도의 결과는 버린다 */
  let generation = 0;

  const armRetry = () => {
    if (retryArmed) return;
    retryArmed = true;
    deps.onOnline(() => void ensure());
  };

  const dropSession = () => {
    generation += 1;
    userId = null;
    status = 'offline';
  };

  const loadBackend = async (): Promise<OnlineBackend | null> => {
    if (backend) return backend;
    const loaded = await deps.loadBackend();
    if (loaded && !backend) {
      loaded.onSignedOut(dropSession);
      backend = loaded;
    }
    return backend ?? loaded;
  };

  /** 세션 확인 → 없으면 익명 로그인. 사용자 ID, 키 없음은 'disabled', 오프라인은 'offline' */
  const connect = async (): Promise<string | 'disabled' | 'offline'> => {
    const b = await loadBackend();
    if (!b) return 'disabled';
    let id = await b.getSessionUserId();
    if (!id) {
      if (!deps.isOnline()) return 'offline';
      id = await b.signInAnonymously();
    }
    return id;
  };

  const run = async () => {
    status = 'signing-in';
    const started = generation;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), deps.timeoutMs);
    });
    try {
      const result = await Promise.race([connect(), timedOut]);
      if (generation !== started) {
        // 기다리는 사이 로그아웃됐다. 늦게 온 결과로 계정을 되살리지 않는다
        status = 'offline';
        armRetry();
        return;
      }
      if (result === 'timeout') {
        generation += 1; // 뒤늦게 끝나는 시도의 결과를 버린다
        userId = null;
        status = 'offline';
        armRetry();
      } else if (result === 'disabled') {
        status = 'disabled';
      } else if (result === 'offline') {
        status = 'offline';
        armRetry();
      } else {
        userId = result;
        status = 'ready';
      }
    } catch {
      if (generation === started) {
        userId = null;
        status = 'offline';
      }
      armRetry();
    } finally {
      clearTimeout(timer);
    }
  };

  const ensure = (): Promise<void> => {
    if (status === 'disabled' || status === 'ready') return Promise.resolve();
    if (!inflight) inflight = run().finally(() => (inflight = null));
    return inflight;
  };

  return {
    status: () => status,
    ensure,
    userId: () => (status === 'ready' ? userId : null),
    backend: () => (status === 'ready' ? backend : null),
  };
}
