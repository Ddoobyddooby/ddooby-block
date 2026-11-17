import { describe, expect, it, vi } from 'vitest';
import {
  backendFromClient,
  parsePublicEnv,
  PUBLISHABLE_PREFIX,
  type FunctionErrorClasses,
} from '../../src/online/client';

describe('parsePublicEnv (브라우저에 넣는 키는 publishable만)', () => {
  const key = `${PUBLISHABLE_PREFIX}abcdefghij`;
  it('URL과 publishable key가 있으면 접속 정보', () => {
    expect(parsePublicEnv(' https://x.example ', ` ${key} `)).toEqual({
      url: 'https://x.example',
      key,
    });
  });
  it.each([
    ['URL 없음', undefined, key],
    ['키 없음', 'https://x.example', undefined],
    ['빈 값', '', key],
    ['빈 키', 'https://x.example', '  '],
    ['접두어만', 'https://x.example', PUBLISHABLE_PREFIX],
    ['secret 키 모양', 'https://x.example', ['sb', 'secret', 'abcdefghij'].join('_')],
    [
      'JWT 모양(service_role·레거시 anon)',
      'https://x.example',
      ['eyJ' + 'hbGciOiJIUzI1', 'eyJ' + 'yb2xlIjoic2VydmljZQ', 'sig'].join('.'),
    ],
    ['문자열이 아님', 'https://x.example', 5],
  ])('%s → null (조용히 온라인을 끈다, 서버 권한 키를 쓰지 않는다)', (_n, url, k) => {
    expect(parsePublicEnv(url, k)).toBeNull();
  });
});

describe('backendFromClient.callFunction', () => {
  class HttpError extends Error {
    constructor(public context: unknown) {
      super('http');
    }
  }
  class FetchError extends Error {}
  class RelayError extends Error {}
  const errors: FunctionErrorClasses = {
    FunctionsHttpError: HttpError,
    FunctionsFetchError: FetchError,
  };
  const make = (invoke: () => Promise<{ data: unknown; error: unknown }>) =>
    backendFromClient({ functions: { invoke } } as never, errors);

  it('성공은 200 + 본문', async () => {
    const b = make(async () => ({ data: { nickname: '뚜비', tag: 1 }, error: null }));
    expect(await b.callFunction('set-nickname', {})).toEqual({
      status: 200,
      body: { nickname: '뚜비', tag: 1 },
    });
  });

  it('HTTP 오류는 상태 코드와 JSON 본문을 보존하고, 비JSON 본문이면 null', async () => {
    const json = make(async () => ({
      data: null,
      error: new HttpError(new Response(JSON.stringify({ code: 'banned' }), { status: 400 })),
    }));
    expect(await json.callFunction('f', {})).toEqual({ status: 400, body: { code: 'banned' } });
    const text = make(async () => ({
      data: null,
      error: new HttpError(new Response('<html>', { status: 502 })),
    }));
    expect(await text.callFunction('f', {})).toEqual({ status: 502, body: null });
  });

  it('연결 실패는 network, 그 밖(relay 등)은 502', async () => {
    expect(
      await make(async () => ({ data: null, error: new FetchError('x') })).callFunction('f', {}),
    ).toBe('network');
    expect(
      await make(async () => ({ data: null, error: new RelayError('x') })).callFunction('f', {}),
    ).toEqual({
      status: 502,
      body: null,
    });
  });

  it('세션 변경 이벤트: 로그인·갱신·사용자 갱신은 사용자 ID, SIGNED_OUT은 null, 그 밖(INITIAL_SESSION 등)은 무시', () => {
    type Handler = (e: string, session: { user: { id: string } } | null) => void;
    const handlers: Handler[] = [];
    const b = backendFromClient(
      { auth: { onAuthStateChange: (h: Handler) => handlers.push(h) } } as never,
      errors,
    );
    const listener = vi.fn();
    b.onSessionChange(listener);
    const session = { user: { id: 'user-x' } };
    handlers[0]?.('INITIAL_SESSION', session);
    handlers[0]?.('PASSWORD_RECOVERY', session);
    handlers[0]?.('SIGNED_IN', null); // 세션 없는 로그인 이벤트는 쓰지 않는다
    expect(listener).not.toHaveBeenCalled();
    for (const event of ['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED']) {
      handlers[0]?.(event, session);
    }
    expect(listener.mock.calls).toEqual([['user-x'], ['user-x'], ['user-x']]);
    handlers[0]?.('SIGNED_OUT', null);
    expect(listener).toHaveBeenLastCalledWith(null);
  });
});

describe('backendFromClient.callRpc', () => {
  const make = (rpc: () => Promise<{ data: unknown; error: unknown; status: number }>) =>
    backendFromClient({ rpc } as never, {
      FunctionsHttpError: class {} as never,
      FunctionsFetchError: class {} as never,
    });

  it('성공은 상태와 data 그대로 (빈 배열도 그대로: 오류와 구분)', async () => {
    const rows = [{ week_key: '2026-W47' }];
    expect(await make(async () => ({ data: rows, error: null, status: 200 })).callRpc('x')).toEqual(
      { status: 200, data: rows },
    );
    expect(await make(async () => ({ data: [], error: null, status: 200 })).callRpc('x')).toEqual({
      status: 200,
      data: [],
    });
  });

  it('인자 없이 이름만 넘긴다', async () => {
    let args: unknown[] = [];
    const b = backendFromClient(
      {
        rpc: async (...a: unknown[]) => {
          args = a;
          return { data: [], error: null, status: 200 };
        },
      } as never,
      { FunctionsHttpError: class {} as never, FunctionsFetchError: class {} as never },
    );
    await b.callRpc('weekly_ranking');
    expect(args).toEqual(['weekly_ranking']);
  });

  it('서버 오류는 상태 코드를 보존하고 data는 null (빈 목록으로 바꾸지 않는다)', async () => {
    const b = make(async () => ({ data: null, error: { message: 'x' }, status: 503 }));
    expect(await b.callRpc('x')).toEqual({ status: 503, data: null });
  });

  it('네트워크 실패(SDK는 reject하지 않고 error + status 0) → network', async () => {
    const b = make(async () => ({ data: null, error: { message: 'Failed to fetch' }, status: 0 }));
    expect(await b.callRpc('x')).toBe('network');
  });
});
