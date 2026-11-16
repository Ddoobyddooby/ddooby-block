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

  it('SIGNED_OUT 이벤트만 listener를 부른다', () => {
    const handlers: ((e: string) => void)[] = [];
    const b = backendFromClient(
      { auth: { onAuthStateChange: (h: (e: string) => void) => handlers.push(h) } } as never,
      errors,
    );
    const listener = vi.fn();
    b.onSignedOut(listener);
    handlers[0]?.('TOKEN_REFRESHED');
    expect(listener).not.toHaveBeenCalled();
    handlers[0]?.('SIGNED_OUT');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
