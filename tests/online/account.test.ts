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

  it('getSession이 실패해도 throw하지 않고 offline, 다음 ensure에서 성공할 수 있다', async () => {
    let fail = true;
    const b = fakeBackend({
      session: 'u1',
      getSession: () => (fail ? Promise.reject(new Error('저장소 오류')) : Promise.resolve('u1')),
    });
    const { account } = setup(b);
    await expect(account.ensure()).resolves.toBeUndefined();
    expect(account.status()).toBe('offline');
    fail = false;
    await account.ensure();
    expect([account.status(), account.userId()]).toEqual(['ready', 'u1']);
  });

  it('signIn이 실패해도 throw하지 않고 offline, 다음 ensure에서 성공할 수 있다', async () => {
    let fail = true;
    const b = fakeBackend({
      session: null,
      signIn: () => (fail ? Promise.reject(new Error('429')) : Promise.resolve('user-ok')),
    });
    const { account } = setup(b);
    await expect(account.ensure()).resolves.toBeUndefined();
    expect(account.status()).toBe('offline');
    fail = false;
    await account.ensure();
    expect([account.status(), account.userId()]).toEqual(['ready', 'user-ok']);
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
    const getSessions = b.calls.getSession; // 로그인 전 확인 + 끝난 뒤 재조정
    await account.ensure();
    await account.ensure();
    expect(b.calls.signIn).toBe(1);
    expect(b.calls.getSession).toBe(getSessions); // ready면 더 묻지 않는다
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

  it('로그인을 기다리는 사이 로그아웃돼도 앱 계정은 SDK 세션을 따라간다 (SDK에 세션이 남으면 같은 사용자)', async () => {
    const gate = deferred<string>();
    const b = fakeBackend({ session: null, signIn: () => gate.promise });
    const { account } = setup(b);
    const p = account.ensure();
    await vi.advanceTimersByTimeAsync(0);
    b.signOut();
    gate.resolve('late-user');
    await p;
    expect(b.sessionUser()).toBe('late-user');
    expect(account.userId()).toBe(b.sessionUser());
    expect(b.calls.signIn).toBe(1);
  });

  it('SDK 세션이 로그아웃으로 사라지면 앱 계정도 즉시 offline이 된다', async () => {
    const b = fakeBackend({ session: 'u1' });
    const { account } = setup(b);
    await account.ensure();
    b.signOut();
    expect([account.status(), account.userId(), account.backend()]).toEqual([
      'offline',
      null,
      null,
    ]);
  });

  it('SDK 세션의 사용자가 A에서 B로 바뀌면(토큰 갱신·로그인 이벤트) 앱 계정 ID도 B로 바뀐다', async () => {
    const b = fakeBackend({ session: 'user-a' });
    const { account } = setup(b);
    await account.ensure();
    expect(account.userId()).toBe('user-a');
    const b2 = fakeBackend({ session: 'user-a', signInId: 'user-b' });
    const s2 = setup(b2);
    await s2.account.ensure();
    await b2.signInAnonymously();
    expect(s2.account.userId()).toBe('user-b');
  });

  describe('시간 초과와 재시도 (인증 작업은 한 번에 하나)', () => {
    it('첫 signIn 보류 → timeout → 재시도 → 첫 응답 성공: 새 가입 없이 같은 작업에 붙고 앱 ID = SDK 세션 ID', async () => {
      const first = deferred<string>();
      const b = fakeBackend({ session: null, signIn: () => first.promise });
      const { account } = setup(b, { timeoutMs: 1000 });
      const p1 = account.ensure();
      await vi.advanceTimersByTimeAsync(1000);
      await p1;
      expect(account.status()).toBe('offline');
      const p2 = account.ensure(); // 재시도: 같은 작업에 다시 붙는다
      expect(account.status()).toBe('signing-in');
      first.resolve('first-user');
      await p2;
      expect(b.calls.signIn).toBe(1);
      expect(account.userId()).toBe('first-user');
      expect(account.userId()).toBe(b.sessionUser());
    });

    it('첫 signIn 보류 → timeout → 재시도 → 첫 응답 실패: 재시도가 새로 한 번 로그인하고 앱 ID = SDK 세션 ID', async () => {
      const first = deferred<string>();
      let n = 0;
      const b = fakeBackend({
        session: null,
        signIn: () => (++n === 1 ? first.promise : Promise.resolve('retry-user')),
      });
      const { account } = setup(b, { timeoutMs: 1000 });
      const p1 = account.ensure();
      await vi.advanceTimersByTimeAsync(1000);
      await p1;
      const p2 = account.ensure();
      first.reject(new Error('network'));
      await p2;
      expect(account.status()).toBe('offline'); // 첫 작업은 실패로 끝났다
      await account.ensure(); // 그 뒤의 재시도는 새 작업
      expect(b.calls.signIn).toBe(2);
      expect(account.userId()).toBe('retry-user');
      expect(account.userId()).toBe(b.sessionUser());
    });

    it('timeout 뒤 늦게 끝난 첫 로그인이 오프라인 표시를 되돌려 ready로 만든다 (SDK 세션이 그 사용자이므로)', async () => {
      const first = deferred<string>();
      const b = fakeBackend({ session: null, signIn: () => first.promise });
      const { account } = setup(b, { timeoutMs: 1000 });
      const p = account.ensure();
      await vi.advanceTimersByTimeAsync(1000);
      await p;
      first.resolve('late-user');
      await vi.advanceTimersByTimeAsync(0);
      expect(account.userId()).toBe('late-user');
      expect(account.userId()).toBe(b.sessionUser());
    });

    it('첫 getSession 보류 → timeout → 재시도 → 옛 null 완료: 로그인은 한 번뿐', async () => {
      const gate = deferred<string | null>();
      let n = 0;
      const b = fakeBackend({
        session: null,
        getSession: () => (++n === 1 ? gate.promise : Promise.resolve(b.sessionUser())),
        signInId: 'only-user',
      });
      const { account } = setup(b, { timeoutMs: 1000 });
      const p1 = account.ensure();
      await vi.advanceTimersByTimeAsync(1000);
      await p1;
      const p2 = account.ensure();
      gate.resolve(null);
      await p2;
      expect(b.calls.signIn).toBe(1);
      expect(account.userId()).toBe('only-user');
      expect(account.userId()).toBe(b.sessionUser());
    });

    it('getSession을 기다리는 사이 계정이 바뀌었으면(옛 null) 새 가입을 시작하지 않는다', async () => {
      const gate = deferred<string | null>();
      let n = 0;
      const b = fakeBackend({
        session: null,
        getSession: () => (++n === 1 ? gate.promise : Promise.resolve(b.sessionUser())),
      });
      const { account } = setup(b);
      const p = account.ensure();
      await vi.advanceTimersByTimeAsync(0);
      // 기다리는 사이 다른 경로로 SDK 세션이 생긴다 (로그인 이벤트)
      await b.signInAnonymously();
      expect(b.calls.signIn).toBe(1);
      gate.resolve(null); // 옛 null 완료
      await p;
      expect(b.calls.signIn).toBe(1); // 폐기된 시도가 또 가입하지 않았다
      expect(account.userId()).toBe(b.sessionUser());
    });

    it('backend가 영원히 응답하지 않으면 시간 제한 뒤 offline으로 돌아오고 게임은 계속된다', async () => {
      const b = fakeBackend({ session: null, signIn: () => new Promise(() => undefined) });
      const { account } = setup(b, { timeoutMs: 1000 });
      const p = account.ensure();
      await vi.advanceTimersByTimeAsync(1000);
      await p;
      expect(account.status()).toBe('offline');
      expect(account.userId()).toBeNull();
      void account.ensure();
      expect(b.calls.signIn).toBe(1); // 같은 작업에 다시 붙을 뿐 새 로그인은 없다
    });
  });

  it('ready가 아니면 backend()는 null이다', async () => {
    const b: OnlineBackend = fakeBackend({ session: null });
    const { account } = setup(b as FakeBackend);
    expect(account.backend()).toBeNull();
  });
});
