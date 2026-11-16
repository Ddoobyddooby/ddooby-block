import { describe, expect, it } from 'vitest';
import { TAG_MAX_ATTEMPTS } from '../../supabase/functions/_shared/nicknameRules.js';
import {
  ALLOWED_ORIGINS,
  handleSetNickname,
  MAX_BODY_BYTES,
  type SaveResult,
  type SetNicknameDeps,
} from '../../supabase/functions/set-nickname/handler';

const ORIGIN = 'https://ddoobyddooby.github.io';
const HEADERS = 'authorization, x-client-info, apikey, content-type';

interface Fake {
  deps: SetNicknameDeps;
  calls: {
    getUserId: string[];
    getNickname: string[];
    save: [string, string, number][];
    errors: unknown[];
  };
}

function fake(over: Partial<SetNicknameDeps> = {}, tags: number[] = [7]): Fake {
  const calls: Fake['calls'] = { getUserId: [], getNickname: [], save: [], errors: [] };
  let i = 0;
  const deps: SetNicknameDeps = {
    allowHeaders: HEADERS,
    async getUserId(token) {
      calls.getUserId.push(token);
      return token === 'good' ? 'user-a' : null;
    },
    async getNickname(id) {
      calls.getNickname.push(id);
      return null;
    },
    async saveNickname(id, name, tag) {
      calls.save.push([id, name, tag]);
      return 'ok';
    },
    randomTag: () => tags[Math.min(i++, tags.length - 1)] ?? 0,
    reportError: (e) => calls.errors.push(e),
    ...over,
  };
  return { deps, calls };
}

function post(
  body: unknown,
  init: { token?: string | null; origin?: string | null; raw?: string } = {},
): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = init.token === undefined ? 'good' : init.token;
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  const origin = init.origin === undefined ? ORIGIN : init.origin;
  if (origin !== null) headers.Origin = origin;
  return new Request('https://f.example/set-nickname', {
    method: 'POST',
    headers,
    body: init.raw ?? JSON.stringify(body),
  });
}

const read = async (r: Response) => ({ status: r.status, body: (await r.json()) as unknown });

describe('set-nickname 핸들러: CORS·메서드', () => {
  it('허용 출처는 정확히 6개 (와일드카드·접두 없음)', () => {
    expect(ALLOWED_ORIGINS).toEqual([
      'https://ddoobyddooby.github.io',
      'https://localhost',
      'http://localhost:5180',
      'http://127.0.0.1:5180',
      'http://localhost:5181',
      'http://127.0.0.1:5181',
    ]);
    expect(ALLOWED_ORIGINS.some((o) => o.includes('*'))).toBe(false);
  });

  it.each(ALLOWED_ORIGINS)(
    '허용 출처 %s의 OPTIONS: 204, 정확한 허용 헤더, 인증·DB 호출 없음',
    async (origin) => {
      const { deps, calls } = fake();
      const res = await handleSetNickname(
        deps,
        new Request('https://f.example/', { method: 'OPTIONS', headers: { Origin: origin } }),
      );
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
      expect(res.headers.get('Access-Control-Allow-Headers')).toBe(HEADERS);
      expect(res.headers.get('Vary')).toBe('Origin');
      expect(calls.getUserId).toEqual([]);
      expect(calls.getNickname).toEqual([]);
    },
  );

  it.each([
    'https://evil.example',
    'http://localhost:5173', // pang의 개발 포트
    'http://localhost:5182',
    'http://localhost:51800',
    'http://localhost:5180/',
    'https://ddoobyddooby.github.io.evil.example',
    'https://x.ddoobyddooby.github.io',
    'http://ddoobyddooby.github.io',
    'null',
    '*',
  ])('허용 목록 밖 출처 %s의 OPTIONS: 403, 허용 헤더 없음(특히 * 아님)', async (origin) => {
    const { deps, calls } = fake();
    const res = await handleSetNickname(
      deps,
      new Request('https://f.example/', { method: 'OPTIONS', headers: { Origin: origin } }),
    );
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(calls.getUserId).toEqual([]);
  });

  it('Origin 없는 OPTIONS도 403 (브라우저 preflight가 아니다)', async () => {
    const res = await handleSetNickname(
      fake().deps,
      new Request('https://f.example/', { method: 'OPTIONS' }),
    );
    expect(res.status).toBe(403);
  });

  it.each(['GET', 'PUT', 'DELETE', 'PATCH'])('%s → 405 method, DB 호출 없음', async (method) => {
    const { deps, calls } = fake();
    const res = await handleSetNickname(
      deps,
      new Request('https://f.example/', { method, headers: { Origin: ORIGIN } }),
    );
    expect(await read(res)).toEqual({ status: 405, body: { code: 'method' } });
    expect(calls.getUserId).toEqual([]);
  });

  it('허용 목록 밖 Origin의 POST는 토큰이 유효해도 403, 허용 헤더 없음, 인증·DB 호출 없음', async () => {
    const { deps, calls } = fake();
    const res = await handleSetNickname(
      deps,
      post({ nickname: '뚜비' }, { origin: 'https://evil.example' }),
    );
    expect(await read(res.clone())).toEqual({ status: 403, body: { code: 'origin' } });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(calls.getUserId).toEqual([]);
    expect(calls.save).toEqual([]);
  });

  it('Origin 없는 POST(앱·서버)는 토큰 검사만 하고 처리한다. CORS 허용 헤더는 주지 않는다', async () => {
    const { deps, calls } = fake();
    const res = await handleSetNickname(deps, post({ nickname: '뚜비' }, { origin: null }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(calls.getUserId).toEqual(['good']);
    const noToken = await handleSetNickname(
      fake().deps,
      post({ nickname: '뚜비' }, { origin: null, token: null }),
    );
    expect(noToken.status).toBe(401);
  });

  it('성공·오류 응답 모두 허용 출처에 CORS 헤더를 단다 (오류 때 브라우저가 network 오류로만 보지 않게)', async () => {
    for (const [req, status] of [
      [post({ nickname: '뚜비' }), 200],
      [post({ nickname: '시발' }), 400],
      [post({ nickname: '뚜비' }, { token: 'bad' }), 401],
    ] as const) {
      const res = await handleSetNickname(fake().deps, req);
      expect(res.status).toBe(status);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
      expect(res.headers.get('Content-Type')).toBe('application/json');
    }
    const taken = await handleSetNickname(
      fake({ getNickname: async () => '이미' }).deps,
      post({ nickname: '뚜비' }),
    );
    expect(taken.status).toBe(409);
    expect(taken.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });
});

describe('set-nickname 핸들러: 인증', () => {
  it.each([
    ['토큰 없음', null],
    ['빈 토큰', ''],
    ['위조·만료', 'bad'],
  ])('%s → 401 unauthorized, 저장 없음', async (_n, token) => {
    const { deps, calls } = fake();
    const res = await handleSetNickname(deps, post({ nickname: '뚜비' }, { token }));
    expect(await read(res)).toEqual({ status: 401, body: { code: 'unauthorized' } });
    expect(calls.save).toEqual([]);
    expect(calls.getNickname).toEqual([]);
  });

  it('Bearer 문법이 틀리면 401 (getUserId를 부르지도 않는다)', async () => {
    const { deps, calls } = fake();
    for (const auth of ['good', 'Basic good', 'Bearer', 'Bearer a b']) {
      const req = new Request('https://f.example/', {
        method: 'POST',
        headers: { Authorization: auth, Origin: ORIGIN },
        body: JSON.stringify({ nickname: '뚜비' }),
      });
      expect((await handleSetNickname(deps, req)).status).toBe(401);
    }
    expect(calls.getUserId).toEqual([]);
  });

  it('인증 서버 장애(getUserId throw)는 401이 아니라 500 server', async () => {
    const { deps, calls } = fake({ getUserId: async () => Promise.reject(new Error('auth 503')) });
    const res = await handleSetNickname(deps, post({ nickname: '뚜비' }));
    expect(await read(res)).toEqual({ status: 500, body: { code: 'server' } });
    expect(calls.save).toEqual([]);
  });

  it('body에 다른 사용자 id·tag·role을 보내도 무시하고 검증된 토큰의 사용자에게만 저장한다', async () => {
    const { deps, calls } = fake({}, [321]);
    const res = await handleSetNickname(
      deps,
      post({ nickname: '뚜비', id: 'user-b', user_id: 'user-b', tag: 1, role: 'admin' }),
    );
    expect(await read(res)).toEqual({ status: 200, body: { nickname: '뚜비', tag: 321 } });
    expect(calls.save).toEqual([['user-a', '뚜비', 321]]);
    expect(calls.getNickname).toEqual(['user-a']);
  });
});

describe('set-nickname 핸들러: 요청 본문·규칙', () => {
  it.each([
    ['깨진 JSON', { raw: '{nickname' }],
    ['null', { raw: 'null' }],
    ['배열', { raw: '["뚜비"]' }],
    ['문자열', { raw: '"뚜비"' }],
    ['빈 본문', { raw: '' }],
    ['nickname 없음', { raw: '{}' }],
    ['nickname 숫자', { raw: '{"nickname":7}' }],
    ['nickname 객체', { raw: '{"nickname":{"a":1}}' }],
    ['nickname null', { raw: '{"nickname":null}' }],
  ])('%s → 400 bad-request, 저장 없음', async (_n, init) => {
    const { deps, calls } = fake();
    const res = await handleSetNickname(deps, post(null, init));
    expect(await read(res)).toEqual({ status: 400, body: { code: 'bad-request' } });
    expect(calls.save).toEqual([]);
  });

  it('본문이 상한(1024바이트)을 넘으면 413, 저장 없음 (Content-Length·실제 크기 둘 다)', async () => {
    const big = JSON.stringify({ nickname: '뚜비', pad: 'x'.repeat(MAX_BODY_BYTES) });
    const { deps, calls } = fake();
    expect(await read(await handleSetNickname(deps, post(null, { raw: big })))).toEqual({
      status: 413,
      body: { code: 'too-large' },
    });
    // 한글은 바이트가 더 크다: 글자 수는 상한 이하여도 UTF-8 바이트로 센다
    const korean = JSON.stringify({ nickname: '뚜비', pad: '가'.repeat(400) });
    expect(korean.length).toBeLessThan(MAX_BODY_BYTES);
    expect((await handleSetNickname(deps, post(null, { raw: korean }))).status).toBe(413);
    expect(calls.save).toEqual([]);
  });

  it.each([
    ['뚜', 'too-short'],
    ['가나다라마바사아자차카', 'too-long'],
    ['뚜 비', 'bad-chars'],
    ['시발', 'banned'],
    ['가보지', 'banned'], // R18 알려진 오탐 (유지)
  ])('규칙 위반 %s → 400 %s, DB 호출 없음', async (name, code) => {
    const { deps, calls } = fake();
    const res = await handleSetNickname(deps, post({ nickname: name }));
    expect(await read(res)).toEqual({ status: 400, body: { code } });
    expect(calls.getNickname).toEqual([]);
    expect(calls.save).toEqual([]);
  });

  it('앞뒤 공백·조합형은 정규화한 이름으로 저장하고 응답한다', async () => {
    const { deps, calls } = fake({}, [0]);
    const res = await handleSetNickname(deps, post({ nickname: `  ${'뚜비'.normalize('NFD')} ` }));
    expect(await read(res)).toEqual({ status: 200, body: { nickname: '뚜비', tag: 0 } });
    expect(calls.save).toEqual([['user-a', '뚜비', 0]]);
  });
});

describe('set-nickname 핸들러: 저장·태그 충돌', () => {
  it('이미 이름이 있으면 409 already-set, 태그를 뽑지도 저장하지도 않는다 (같은 이름 재요청도)', async () => {
    const { deps, calls } = fake({ getNickname: async () => '뚜비' });
    const res = await handleSetNickname(deps, post({ nickname: '뚜비' }));
    expect(await read(res)).toEqual({ status: 409, body: { code: 'already-set' } });
    expect(calls.save).toEqual([]);
  });

  it('첫 태그가 겹치면(tag-taken) 새 태그로 다시 저장해 200, 이름·사용자는 같다', async () => {
    const results: SaveResult[] = ['tag-taken', 'ok'];
    const { deps, calls } = fake(
      { saveNickname: async (id, n, t) => (calls.save.push([id, n, t]), results.shift() ?? 'ok') },
      [11, 22],
    );
    const res = await handleSetNickname(deps, post({ nickname: '뚜비' }));
    expect(await read(res)).toEqual({ status: 200, body: { nickname: '뚜비', tag: 22 } });
    expect(calls.save).toEqual([
      ['user-a', '뚜비', 11],
      ['user-a', '뚜비', 22],
    ]);
  });

  it(`${TAG_MAX_ATTEMPTS - 1}번 겹친 뒤 ${TAG_MAX_ATTEMPTS}번째에 성공하면 200`, async () => {
    let n = 0;
    const { deps, calls } = fake({
      saveNickname: async () => (++n < TAG_MAX_ATTEMPTS ? 'tag-taken' : 'ok'),
    });
    expect((await handleSetNickname(deps, post({ nickname: '뚜비' }))).status).toBe(200);
    expect(n).toBe(TAG_MAX_ATTEMPTS);
    expect(calls.errors).toEqual([]);
  });

  it(`${TAG_MAX_ATTEMPTS}번 모두 겹치면 500 server, 21번째 저장은 없다`, async () => {
    let n = 0;
    const { deps } = fake({ saveNickname: async () => (n++, 'tag-taken') });
    expect(await read(await handleSetNickname(deps, post({ nickname: '뚜비' })))).toEqual({
      status: 500,
      body: { code: 'server' },
    });
    expect(n).toBe(TAG_MAX_ATTEMPTS);
  });

  it('재시도 중 이미 설정됐다(already-set)는 결과가 나오면 반복하지 않고 409', async () => {
    let n = 0;
    const { deps } = fake({ saveNickname: async () => (++n === 1 ? 'tag-taken' : 'already-set') });
    expect(await read(await handleSetNickname(deps, post({ nickname: '뚜비' })))).toEqual({
      status: 409,
      body: { code: 'already-set' },
    });
    expect(n).toBe(2);
  });

  it('DB·네트워크·권한 오류는 500 server로 응답하고 내부 정보를 싣지 않는다 (서버 로그에만 남긴다)', async () => {
    const secret =
      'duplicate key value violates unique constraint "profiles_nickname_tag_key" service_role ' +
      ['sb', 'secret', 'x'].join('_');
    for (const failing of ['getNickname', 'saveNickname'] as const) {
      const { deps, calls } = fake({
        [failing]: async () => Promise.reject(Object.assign(new Error(secret), { code: '42501' })),
      });
      const res = await handleSetNickname(deps, post({ nickname: '뚜비' }));
      const text = await res.text();
      expect(res.status).toBe(500);
      expect(JSON.parse(text)).toEqual({ code: 'server' });
      expect(text).not.toContain('profiles_nickname');
      expect(text).not.toContain('sb_secret');
      expect(calls.errors).toHaveLength(1);
    }
  });

  it('같은 사용자의 두 요청이 모두 "미설정"을 읽은 뒤 저장을 겨루면 한쪽만 200, 한쪽은 409 (조건부 저장의 결과를 그대로 따른다)', async () => {
    // 저장소 흉내: 닉네임이 비어 있을 때만 채운다. 이 시험은 핸들러가 저장 결과를 올바르게 응답으로 바꾸는지만 본다.
    // 실제 SQL 조건(id·nickname IS NULL)은 tests/functions/adapter.test.ts가 본다
    const db = new Map<string, { nickname: string; tag: number }>();
    let reads = 0;
    let releaseReads!: () => void;
    const bothRead = new Promise<void>((r) => (releaseReads = r));
    const deps = fake(
      {
        async getNickname(id) {
          const current = db.get(id)?.nickname ?? null;
          if (++reads === 2) releaseReads();
          await bothRead; // 두 요청 다 읽은 뒤에 저장으로 간다
          return current;
        },
        async saveNickname(id, nickname, tag) {
          if (db.has(id)) return 'already-set';
          db.set(id, { nickname, tag });
          return 'ok';
        },
      },
      [1, 2],
    ).deps;
    const [a, b] = await Promise.all([
      handleSetNickname(deps, post({ nickname: '뚜비' })),
      handleSetNickname(deps, post({ nickname: '다른이름' })),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(db.size).toBe(1);
  });
});
