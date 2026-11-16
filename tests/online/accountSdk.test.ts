import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';
import { createAccount } from '../../src/online/account';
import { backendFromClient } from '../../src/online/client';
import { deferred } from './fakeBackend';

// 설치된 supabase-js(실제 GoTrueClient)에 가짜 fetch와 메모리 저장소만 끼워 account를 돌린다.
// 인증 시간 초과 뒤 재시도와 늦은 첫 응답이 겹쳐도 "앱 계정 ID = SDK 세션 ID"가 지켜지는지 본다 (W3-02 리뷰 지적 1).
// 키·URL은 시험용 가짜 문자열이고 실제 요청은 나가지 않는다.

const b64 = (o: object): string =>
  btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

function sessionBody(id: string): Response {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, exp, role: 'authenticated' })}.sig`;
  return new Response(
    JSON.stringify({
      access_token: jwt,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: exp,
      refresh_token: `refresh-${id}`,
      user: { id, aud: 'authenticated', role: 'authenticated', is_anonymous: true },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function setup(signups: (() => Promise<Response>)[]) {
  let count = 0;
  const store = new Map<string, string>();
  const client = createClient('https://example.invalid', 'test-key-not-real', {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => void store.set(k, v),
        removeItem: (k) => void store.delete(k),
      },
    },
    global: {
      fetch: async (input) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (!url.includes('/auth/v1/signup')) return new Response('{}', { status: 404 });
        const next = signups[count++];
        if (!next) throw new Error('예상 밖의 가입 요청');
        return next();
      },
    },
  });
  const account = createAccount({
    hasKeys: true,
    loadBackend: async () =>
      backendFromClient(client, {
        FunctionsHttpError: class extends Error {
          context = null;
        },
        FunctionsFetchError: class extends Error {},
      }),
    isOnline: () => true,
    onOnline: () => undefined,
    timeoutMs: 20,
  });
  const sdkUser = async (): Promise<string | null> =>
    (await client.auth.getSession()).data.session?.user.id ?? null;
  return { account, sdkUser, signups: () => count };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let pending: (() => void)[] = [];
afterEach(() => {
  for (const release of pending) release();
  pending = [];
});

describe('실제 supabase-js + account: 시간 초과 뒤 재시도', () => {
  it('첫 가입 응답이 timeout 뒤 늦게 성공해도 가입은 한 번이고 앱 ID = SDK 세션 ID', async () => {
    const first = deferred<Response>();
    const { account, sdkUser, signups } = setup([() => first.promise]);
    await account.ensure(); // 20ms 뒤 timeout
    expect(account.status()).toBe('offline');
    const retry = account.ensure(); // 같은 작업에 다시 붙는다 (새 가입 요청 없음)
    await sleep(5);
    first.resolve(sessionBody('first-user'));
    await retry;
    expect(signups()).toBe(1);
    expect(account.userId()).toBe('first-user');
    expect(await sdkUser()).toBe('first-user');
  });

  it('첫 가입 응답이 timeout 뒤 실패하면 다음 재시도가 새로 한 번 가입하고 앱 ID = SDK 세션 ID', async () => {
    const first = deferred<Response>();
    const { account, sdkUser, signups } = setup([
      () => first.promise,
      async () => sessionBody('retry-user'),
    ]);
    await account.ensure();
    const attach = account.ensure();
    first.reject(new TypeError('fetch failed'));
    await attach;
    expect(account.status()).toBe('offline');
    await account.ensure();
    expect(signups()).toBe(2);
    expect(account.userId()).toBe('retry-user');
    expect(await sdkUser()).toBe('retry-user');
  });

  it('가입 응답이 timeout을 넘겨 한참 뒤 오면 앱 계정이 그 사용자로 따라간다', async () => {
    const first = deferred<Response>();
    pending.push(() => first.resolve(sessionBody('late-user')));
    const { account, sdkUser } = setup([() => first.promise]);
    await account.ensure();
    expect(account.userId()).toBeNull();
    first.resolve(sessionBody('late-user'));
    await sleep(30);
    expect(account.userId()).toBe('late-user');
    expect(await sdkUser()).toBe('late-user');
  });
});
