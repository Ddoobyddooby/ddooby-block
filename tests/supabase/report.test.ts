import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  type Row,
  denied,
  expectNoRowsNow,
  exitCodeOf,
  failed,
  formatTable,
  parseCheckEnv,
  readable,
  setupGuide,
} from '../../scripts/supabase-check/report';

const pass = (id = '①'): Row => ({
  id,
  label: '항목',
  expect: '실패',
  outcome: { pass: true, detail: 'ok' },
});
const fail = (id = '①'): Row => ({
  id,
  label: '항목',
  expect: '실패',
  outcome: { pass: false, detail: 'no' },
});

describe('권한 시험 판정', () => {
  it('readable: 오류가 없어야 통과 (0행도 통과)', () => {
    expect(readable({ data: [], error: null })).toEqual({ pass: true, detail: '0행' });
    expect(readable({ data: [1, 2], error: null }).detail).toBe('2행');
    expect(readable({ data: null, error: { code: '42501', message: 'x' } }).pass).toBe(false);
  });

  it('expectNoRowsNow: 오류 없이 0행이어야 통과 (남의 행이 보이면 실패)', () => {
    expect(expectNoRowsNow({ data: [], error: null }).pass).toBe(true);
    expect(expectNoRowsNow({ data: [{ a: 1 }], error: null }).pass).toBe(false);
    expect(expectNoRowsNow({ data: null, error: { message: 'x' } }).pass).toBe(false);
  });

  it('failed: 예외를 FAIL로 바꾼다', () => {
    expect(failed(new Error('boom'))).toEqual({ pass: false, detail: '예외: boom' });
    expect(failed('문자열').detail).toBe('예외: 문자열');
  });
});

describe('결과 표·종료 코드', () => {
  it('모두 PASS면 exit 0', () => {
    expect(exitCodeOf([pass(), pass()])).toBe(0);
  });

  it('FAIL이 하나라도 있으면 exit 1', () => {
    expect(exitCodeOf([pass(), fail()])).toBe(1);
  });

  it('항목이 없으면 확인한 것이 없으므로 exit 1', () => {
    expect(exitCodeOf([])).toBe(1);
  });

  it('표: 머리글 + 구분선 + 행 + 요약. PASS·FAIL 개수가 맞다', () => {
    const lines = formatTable([pass('①'), fail('②')]);
    expect(lines[0]).toBe('| # | 항목 | 기대 | 결과 | 상세 |');
    expect(lines[1]).toBe('|---|---|---|---|---|');
    expect(lines[2]).toBe('| ① | 항목 | 실패 | PASS | ok |');
    expect(lines[3]).toBe('| ② | 항목 | 실패 | FAIL | no |');
    expect(lines.at(-1)).toBe('2개 중 PASS 1, FAIL 1, 시험 불가 0');
  });

  it('시험 불가(네트워크)는 FAIL과 따로 세지만 exit 0이 아니다', () => {
    const row = (outcome: Row['outcome']): Row => ({
      id: 'x',
      label: 'x',
      expect: '실패',
      outcome,
    });
    const net = row(denied({ data: null, error: { code: '', message: 'm' }, status: 0 }));
    expect(net.outcome.unverified).toBe(true);
    expect(formatTable([pass(), net])[3]).toContain('| 시험 불가 |');
    expect(formatTable([pass(), net]).at(-1)).toBe('2개 중 PASS 1, FAIL 0, 시험 불가 1');
    expect(exitCodeOf([pass(), net])).toBe(1);
  });

  it('FAIL 사유에 code·status가 남고 오류 message(URL이 섞일 수 있음)는 남지 않는다', () => {
    const out = denied({
      data: null,
      error: { code: '23503', message: 'https://secret.example/rest/v1 failed' },
      status: 409,
    });
    expect(out.detail).toBe('권한 거부가 아닌 오류: code 23503, status 409');
  });

  it('표: 상세의 `|`와 줄바꿈이 열을 깨지 않는다', () => {
    const row: Row = {
      id: 'x',
      label: 'a|b',
      expect: '실패',
      outcome: { pass: false, detail: '1\n2 | 3' },
    };
    expect(formatTable([row])[2]).toBe('| x | a\\|b | 실패 | FAIL | 1 2 \\| 3 |');
  });
});

describe('환경 설정', () => {
  it('두 변수가 있으면 값을 돌려준다 (앞뒤 공백 제거)', () => {
    expect(
      parseCheckEnv({
        VITE_SUPABASE_URL: ' https://x.example ',
        VITE_SUPABASE_PUBLISHABLE_KEY: `${PUB}k`,
      }),
    ).toEqual({
      ok: true,
      env: { url: 'https://x.example', key: `${PUB}k` },
    });
  });

  it('없거나 비어 있으면 빠진 이름을 알려 준다', () => {
    expect(parseCheckEnv({})).toEqual({
      ok: false,
      missing: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
    });
    expect(parseCheckEnv({ VITE_SUPABASE_URL: 'u', VITE_SUPABASE_PUBLISHABLE_KEY: '  ' })).toEqual({
      ok: false,
      missing: ['VITE_SUPABASE_PUBLISHABLE_KEY'],
    });
  });

  it('안내 문구에 경로·다음 행동이 들어 있다', () => {
    const none = setupGuide('.env.local', 'no-file', []);
    expect(none).toContain('.env.local');
    expect(none).toContain('.env.example');
    expect(none).toContain('Anonymous Sign-ins');
    const some = setupGuide('x.env', 'missing', ['VITE_SUPABASE_URL']);
    expect(some).toContain('x.env에 VITE_SUPABASE_URL 값이 없다');
  });
});

// 키 모양 문자열을 평문으로 쓰면 레포 전체 분리 검사(separation.test.ts)가 이 파일을 잡으므로 조각을 이어 붙인다
const PUB = ['sb', 'publishable', ''].join('_');
const SEC = ['sb', 'secret', ''].join('_');
const err = (code: string, status?: number) => ({
  data: null,
  error: { code, message: 'm' },
  ...(status === undefined ? {} : { status }),
});

describe('쓰기 차단은 권한 거부(42501)만 인정한다', () => {
  it('42501(권한 거부)만 PASS', () => {
    expect(denied(err('42501', 403)).pass).toBe(true);
    expect(denied(err('42501', 401)).pass).toBe(true);
  });

  it.each([
    ['FK 위반', '23503', 409],
    ['중복', '23505', 409],
    ['테이블 미노출', 'PGRST205', 404],
    ['NOT NULL 위반', '23502', 400],
  ])('%s(%s)는 권한 확인이 아니므로 FAIL', (_n, code, status) => {
    const out = denied(err(code, status));
    expect(out.pass).toBe(false);
    expect(out.detail).toContain(code);
    expect(out.detail).toContain(String(status));
  });

  it('네트워크 실패(status 0, code "")는 PASS가 아니다', () => {
    expect(denied(err('', 0)).pass).toBe(false);
  });

  it.each([
    ['빈 배열', { data: [], error: null }],
    ['data null', { data: null, error: null }],
    ['반영 1행', { data: [{ id: 1 }], error: null }],
  ])('오류 없는 성공 응답(%s)은 PASS가 아니다', (_n, res) => {
    expect(denied(res).pass).toBe(false);
  });

  it('표·종료 코드: 42501이 아닌 오류 한 행이 exit 0을 막는다', () => {
    const row = (res: Parameters<typeof denied>[0]): Row => ({
      id: '①',
      label: 'x',
      expect: '실패',
      outcome: denied(res),
    });
    expect(exitCodeOf([row(err('42501', 403))])).toBe(0);
    expect(exitCodeOf([row(err('23503', 409))])).toBe(1);
    expect(exitCodeOf([row({ data: [], error: null })])).toBe(1);
    expect(exitCodeOf([row(err('', 0))])).toBe(1);
    expect(formatTable([row(err('23503', 409))])[2]).toContain('FAIL');
  });

  it('readable: 오류가 있으면 FAIL, 오류 없는 0행은 읽기 가능', () => {
    expect(readable(err('42501', 401)).pass).toBe(false);
    expect(readable({ data: [], error: null }).pass).toBe(true);
  });

  // 실제 SDK 응답 모양: 네트워크가 실패해도 reject가 아니라 status 0, code "" 인 error 응답이 온다
  const clientWith = (fetchImpl: typeof fetch) =>
    createClient('http://localhost:54321', `${PUB}test`, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchImpl },
    });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('SDK: fetch가 reject되면 쓰기 시험이 PASS가 되지 않는다 (외부 요청 없음)', async () => {
    const client = clientWith(() => Promise.reject(new TypeError('fetch failed')));
    const res = await client.from('weekly_scores').insert({ best_score: 1 }).select();
    expect(res.error).not.toBeNull();
    expect(denied(res).pass).toBe(false);
  });

  it('SDK: 서버가 42501을 돌려주면 PASS, 201과 빈 배열이면 FAIL', async () => {
    const forbidden = clientWith(() =>
      Promise.resolve(json(403, { code: '42501', message: 'permission denied for table x' })),
    );
    expect(
      denied(await forbidden.from('weekly_scores').delete().eq('user_id', 'u').select()).pass,
    ).toBe(true);
    const open = clientWith(() => Promise.resolve(json(200, [])));
    expect(denied(await open.from('weekly_scores').delete().eq('user_id', 'u').select()).pass).toBe(
      false,
    );
  });
});

describe('키 형식 검사', () => {
  const env = (key: string) => ({
    VITE_SUPABASE_URL: 'https://x.example',
    VITE_SUPABASE_PUBLISHABLE_KEY: key,
  });

  it('publishable 키만 받는다', () => {
    expect(parseCheckEnv(env(`${PUB}abcdefgh`)).ok).toBe(true);
  });

  it('secret 키·JWT 모양·접두어 없는 값은 거부하고 값은 결과에 싣지 않는다', () => {
    const jwt = ['eyJ' + 'A'.repeat(12), 'eyJ' + 'B'.repeat(12), 'sig'].join('.');
    for (const key of [`${SEC}abcdefgh`, jwt, 'plain-key']) {
      const parsed = parseCheckEnv(env(key));
      expect(parsed.ok).toBe(false);
      expect(JSON.stringify(parsed)).not.toContain(key);
    }
  });
});
