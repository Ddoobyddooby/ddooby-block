import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccount, type AccountDeps } from '../../src/online/account';
import type { OnlineBackend } from '../../src/online/client';
import { deferred, fakeBackend, type FakeBackend } from './fakeBackend';

function setup(
  backend: FakeBackend | null,
  over: Partial<AccountDeps> = {},
): {
  account: ReturnType<typeof createAccount>;
  online: { set(v: boolean): void; fire(): void; listeners: number };
  loads: { n: number };
} {
  const online = { value: true, listeners: [] as (() => void)[] };
  const loads = { n: 0 };
  const account = createAccount({
    hasKeys: backend !== null,
    loadBackend: async () => {
      loads.n += 1;
      return backend;
    },
    isOnline: () => online.value,
    onOnline: (l) => online.listeners.push(l),
    timeoutMs: 1000,
    ...over,
  });
  return {
    account,
    online: {
      set: (v) => (online.value = v),
      fire: () => online.listeners.forEach((l) => l()),
      get listeners() {
        return online.listeners.length;
      },
    },
    loads,
  };
}

describe('익명 계정 상태 전이', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('키 없음: disabled, 백엔드·로그인 요청 없음', async () => {
    const { account, loads } = setup(null, { hasKeys: false });
    expect(account.status()).toBe('disabled');
    await account.ensure();
    expect(account.status()).toBe('disabled');
    expect(loads.n).toBe(0);
    expect(account.userId()).toBeNull();
    expect(account.backend()).toBeNull();
  });

  it('키는 있는데 백엔드가 null이면 disabled', async () => {
    const { account } = setup(null, { hasKeys: true });
    await account.ensure();
    expect(account.status()).toBe('disabled');
  });

  it('저장된 세션이 있으면 로그인 없이 ready', async () => {
    const b = fakeBackend({ session: 'saved-user' });
    const { account } = setup(b);
    expect(account.status()).toBe('offline');
    await account.ensure();
    expect(account.status()).toBe('ready');
    expect(account.userId()).toBe('saved-user');
    expect(account.backend()).toBe(b);
    expect(b.calls.signIn).toBe(0);
    expect(b.calls.getSession).toBe(1);
  });

  it('세션이 없고 온라인이면 signing-in을 거쳐 익명 로그인 한 번 → ready', async () => {
    const b = fakeBackend({ session: null, signInId: 'new-user' });
    const { account } = setup(b);
    const p = account.ensure();
    expect(account.status()).toBe('signing-in');
    await p;
    expect(account.status()).toBe('ready');
    expect(account.userId()).toBe('new-user');
    expect(b.calls.signIn).toBe(1);
  });

  it('ensure()는 기다리지 않아도 된다: 호출이 바로 돌아오고 backend가 응답하기 전에도 게임은 계속', () => {
    const b = fakeBackend({ getSession: () => new Promise(() => undefined) });
    const { account } = setup(b);
    void account.ensure();
    expect(account.status()).toBe('signing-in');
    expect(account.userId()).toBeNull();
  });

  it('세션 없음 + 오프라인: offline, 로그인 요청 없음. online 이벤트에서 다시 시도해 ready', async () => {
    const b = fakeBackend({ session: null });
    const { account, online } = setup(b);
    online.set(false);
    await account.ensure();
    expect(account.status()).toBe('offline');
    expect(b.calls.signIn).toBe(0);
    expect(online.listeners).toBe(1);

    online.set(true);
    online.fire();
    await vi.advanceTimersByTimeAsync(0);
    expect(account.status()).toBe('ready');
    expect(b.calls.signIn).toBe(1);
  });

  it('오프라인이어도 로컬 세션이 있으면 ready (닉네임 게이트는 네트워크 상태를 따로 본다)', async () => {
    const b = fakeBackend({ session: 'saved-user' });
    const { account, online } = setup(b);
    online.set(false);
    await account.ensure();
    expect(account.status()).toBe('ready');
  });

  it.each([
    ['getSession', { getSession: () => Promise.reject(new Error('저장소 오류')) }],
    ['signIn', { session: null, signIn: () => Promise.reject(new Error('429')) }],
  ])('%s가 실패해도 throw하지 않고 offline, 다음 ensure에서 성공할 수 있다', async (_n, opts) => {
    let fail = true;
    const b = fakeBackend({
      ...opts,
      getSession: () =>
        fail && 'getSession' in opts ? Promise.reject(new Error('x')) : Promise.resolve(null),
      signIn: () => (fail ? Promise.reject(new Error('x')) : Promise.resolve('user-ok')),
    });
    const { account } = setup(b);
    await expect(account.ensure()).resolves.toBeUndefined();
    expect(account.status()).toBe('offline');
    fail = false;
    await account.ensure();
    expect(account.status()).toBe('ready');
    expect(account.userId()).toBe('user-ok');
  });

  it('백엔드를 못 불러와도(동적 import 실패) throw하지 않고 offline, 다음에 다시 불러온다', async () => {
    const b = fakeBackend({ session: 'u' });
    let first = true;
    const account = createAccount({
      hasKeys: true,
      loadBackend: async () => {
        if (first) {
          first = false;
          throw new Error('chunk load failed');
        }
        return b;
      },
      isOnline: () => true,
      onOnline: () => undefined,
      timeoutMs: 1000,
    });
    await expect(account.ensure()).resolves.toBeUndefined();
    expect(account.status()).toBe('offline');
    await account.ensure();
    expect(account.status()).toBe('ready');
  });

  it('동시에 여러 번 ensure해도 진행 중인 한 번을 같이 기다린다 (로그인 1회, 백엔드 로드 1회)', async () => {
    const gate = deferred<string>();
    const b = fakeBackend({ session: null, signIn: () => gate.promise });
    const { account, loads } = setup(b);
    const ps = Array.from({ length: 10 }, () => account.ensure());
    gate.resolve('shared-user');
    await Promise.all(ps);
    expect(b.calls.signIn).toBe(1);
    expect(loads.n).toBe(1);
    expect(account.userId()).toBe('shared-user');
    await account.ensure();
    await account.ensure();
    expect(b.calls.signIn).toBe(1);
    expect(b.calls.getSession).toBe(1);
  });

  it('실패를 반복해도 online 리스너는 한 번만 등록되고, 성공 뒤 online 이벤트는 로그인을 또 하지 않는다', async () => {
    const b = fakeBackend({ session: null, signIn: () => Promise.reject(new Error('x')) });
    const { account, online } = setup(b);
    for (let i = 0; i < 5; i++) await account.ensure();
    expect(online.listeners).toBe(1);
    expect(b.calls.signIn).toBe(5);

    const ok = fakeBackend({ session: 'u' });
    const s2 = setup(ok);
    s2.online.set(false);
    await s2.account.ensure(); // 세션이 있어 ready
    s2.online.fire();
    await vi.advanceTimersByTimeAsync(0);
    expect(ok.calls.signIn).toBe(0);
    expect(ok.calls.getSession).toBe(1);
  });

  it('SIGNED_OUT: userId·backend를 즉시 막고, 다음 ensure에서 새 계정(B)을 만든다', async () => {
    let n = 0;
    const b = fakeBackend({ session: null, signIn: async () => (++n === 1 ? 'user-a' : 'user-b') });
    const { account } = setup(b);
    await account.ensure();
    expect(account.userId()).toBe('user-a');
    b.signOut();
    expect(account.status()).toBe('offline');
    expect(account.userId()).toBeNull();
    expect(account.backend()).toBeNull();
    await account.ensure();
    expect(account.userId()).toBe('user-b');
  });

  it('로그인을 기다리는 사이 로그아웃되면 늦게 온 결과로 계정을 되살리지 않는다', async () => {
    const gate = deferred<string>();
    const b = fakeBackend({ session: null, signIn: () => gate.promise });
    const { account } = setup(b);
    const p = account.ensure();
    await vi.advanceTimersByTimeAsync(0);
    b.signOut();
    gate.resolve('stale-user');
    await p;
    expect(account.status()).toBe('offline');
    expect(account.userId()).toBeNull();
    expect(account.backend()).toBeNull();
  });

  it('backend가 영원히 응답하지 않으면 시간 제한 뒤 offline이 되고, 뒤늦은 완료가 상태를 되돌리지 않는다', async () => {
    const gate = deferred<string>();
    const b = fakeBackend({ session: null, signIn: () => gate.promise });
    const { account } = setup(b, { timeoutMs: 1000 });
    const p = account.ensure();
    await vi.advanceTimersByTimeAsync(1000);
    await p;
    expect(account.status()).toBe('offline');
    gate.resolve('late-user');
    await vi.advanceTimersByTimeAsync(0);
    expect(account.status()).toBe('offline');
    expect(account.userId()).toBeNull();
    // 다음 기회에 다시 시도할 수 있다 (진행 중 표시가 남아 있지 않다)
    const retry = account.ensure();
    expect(account.status()).toBe('signing-in');
    void retry;
  });

  it('ready가 아니면 backend()는 null이다', async () => {
    const b: OnlineBackend = fakeBackend({ session: null });
    const { account } = setup(b as FakeBackend);
    expect(account.backend()).toBeNull();
  });
});
