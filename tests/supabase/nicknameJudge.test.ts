import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  judgeCode,
  judgeCors,
  judgeDifferentTag,
  judgeNoNickname,
  judgePreflightAllowed,
  judgePreflightDenied,
  judgeProfile,
  judgeProfileReadError,
  readProfile,
  REQUIRED_REQUEST_HEADERS,
  judgeRace,
  judgeSet,
  judgeSuccessCors,
  judgeUnauthorized,
  type FnRes,
} from '../../scripts/supabase-check/nicknameJudge';

const ORIGIN = 'http://localhost:5181';
const res = (
  status: number,
  body: unknown = null,
  headers: Record<string, string> = {},
): FnRes => ({
  status,
  body,
  header: (name) => headers[name.toLowerCase()] ?? null,
});
const PREFLIGHT = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  vary: 'Origin',
};

describe('judgeSet (정상 설정)', () => {
  it('200 + 요청한 이름 + 0~9999 정수 태그만 PASS, 태그를 돌려준다', () => {
    expect(judgeSet(res(200, { nickname: '뚜비', tag: 0 }), '뚜비')).toMatchObject({
      pass: true,
      tag: 0,
    });
    expect(judgeSet(res(200, { nickname: '뚜비', tag: 9999 }), '뚜비')).toMatchObject({
      pass: true,
      tag: 9999,
    });
  });
  it.each([
    ['다른 이름', { nickname: '다른', tag: 1 }],
    ['태그 범위 밖', { nickname: '뚜비', tag: 10000 }],
    ['태그 음수', { nickname: '뚜비', tag: -1 }],
    ['태그 소수', { nickname: '뚜비', tag: 1.5 }],
    ['태그 문자열', { nickname: '뚜비', tag: '1' }],
    ['태그 없음', { nickname: '뚜비' }],
    ['본문 null', null],
  ])('200이어도 %s이면 FAIL', (_n, body) => {
    const r = judgeSet(res(200, body), '뚜비');
    expect(r.pass).toBe(false);
    expect(r.unverified).toBeUndefined();
  });
  it('다른 status는 FAIL, 연결 실패·5xx는 시험 불가', () => {
    expect(judgeSet(res(401, { code: 'unauthorized' }), '뚜비').pass).toBe(false);
    expect(judgeSet(res(0), '뚜비')).toMatchObject({ pass: false, unverified: true });
    expect(judgeSet(res(500, { code: 'server' }), '뚜비')).toMatchObject({
      pass: false,
      unverified: true,
    });
  });
});

describe('judgeCode (규칙 거부·409)', () => {
  it('status와 code가 모두 정확해야 PASS', () => {
    expect(judgeCode(res(400, { code: 'banned' }), 400, 'banned').pass).toBe(true);
    expect(judgeCode(res(409, { code: 'already-set' }), 409, 'already-set').pass).toBe(true);
  });
  it.each([
    ['code가 다름', res(400, { code: 'too-long' })],
    ['status가 다름', res(409, { code: 'banned' })],
    ['본문 없음', res(400)],
    ['200 성공', res(200, { nickname: 'x', tag: 1 })],
  ])('%s → FAIL', (_n, r) => {
    expect(judgeCode(r, 400, 'banned')).toMatchObject({ pass: false });
    expect(judgeCode(r, 400, 'banned').unverified).toBeUndefined();
  });
  it('연결 실패·5xx는 시험 불가 (규칙 거부로 인정하지 않는다)', () => {
    expect(judgeCode(res(0), 400, 'banned')).toMatchObject({ pass: false, unverified: true });
    expect(judgeCode(res(502), 400, 'banned')).toMatchObject({ pass: false, unverified: true });
  });
  it('상세에 본문의 message를 싣지 않는다', () => {
    const r = judgeCode(res(400, { code: 'x', message: 'secret-token-abc' }), 400, 'banned');
    expect(r.detail).not.toContain('secret-token-abc');
  });
});

describe('judgeUnauthorized', () => {
  it('401만 PASS: 함수 거부와 게이트웨이 거부를 상세로 구분한다', () => {
    expect(judgeUnauthorized(res(401, { code: 'unauthorized' }))).toMatchObject({
      pass: true,
      detail: expect.stringContaining('함수'),
    });
    expect(judgeUnauthorized(res(401, { message: 'Invalid JWT' }))).toMatchObject({
      pass: true,
      detail: expect.stringContaining('게이트웨이'),
    });
  });
  it('200·400·403은 FAIL, 연결 실패·5xx는 시험 불가 (인증 차단 PASS가 아니다)', () => {
    for (const status of [200, 400, 403, 404])
      expect(judgeUnauthorized(res(status)).pass).toBe(false);
    expect(judgeUnauthorized(res(0))).toMatchObject({ pass: false, unverified: true });
    expect(judgeUnauthorized(res(500))).toMatchObject({ pass: false, unverified: true });
  });
});

describe('CORS 판정', () => {
  it('허용 출처 preflight: 204 + 출처·메서드·헤더·Vary가 모두 맞아야 PASS', () => {
    expect(judgePreflightAllowed(res(204, null, PREFLIGHT), ORIGIN).pass).toBe(true);
  });
  it('헤더가 맞아도 status가 204가 아니면 FAIL (500에 헤더만 있는 응답)', () => {
    expect(judgePreflightAllowed(res(200, null, PREFLIGHT), ORIGIN).pass).toBe(false);
    expect(judgePreflightAllowed(res(404, null, PREFLIGHT), ORIGIN).pass).toBe(false);
  });
  it('출처가 다르거나 필요한 헤더·메서드·Vary가 빠지면 FAIL', () => {
    expect(
      judgePreflightAllowed(
        res(204, null, { ...PREFLIGHT, 'access-control-allow-origin': '*' }),
        ORIGIN,
      ).pass,
    ).toBe(false);
    expect(
      judgePreflightAllowed(
        res(204, null, { ...PREFLIGHT, 'access-control-allow-methods': 'GET' }),
        ORIGIN,
      ).pass,
    ).toBe(false);
    expect(
      judgePreflightAllowed(
        res(204, null, { ...PREFLIGHT, 'access-control-allow-headers': 'content-type' }),
        ORIGIN,
      ).pass,
    ).toBe(false);
    expect(judgePreflightAllowed(res(204, null, { ...PREFLIGHT, vary: '' }), ORIGIN).pass).toBe(
      false,
    );
  });
  it('필수 요청 헤더는 authorization·apikey·content-type·x-client-info', () => {
    expect([...REQUIRED_REQUEST_HEADERS]).toEqual([
      'authorization',
      'apikey',
      'content-type',
      'x-client-info',
    ]);
  });
  it('토큰 단위로 정확히 비교한다: 대소문자·공백은 정리하고, 접두·접미가 붙은 이름과 NOTPOST는 FAIL', () => {
    const ok = {
      ...PREFLIGHT,
      'access-control-allow-headers':
        ' Authorization , APIKEY,Content-Type, X-Client-Info,x-retry-count ',
    };
    expect(
      judgePreflightAllowed(
        res(204, null, { ...ok, 'access-control-allow-methods': 'get, Post' }),
        ORIGIN,
      ).pass,
    ).toBe(true);
    expect(
      judgePreflightAllowed(
        res(204, null, { ...PREFLIGHT, 'access-control-allow-methods': 'NOTPOST' }),
        ORIGIN,
      ).pass,
    ).toBe(false);
    expect(
      judgePreflightAllowed(
        res(204, null, { ...PREFLIGHT, 'access-control-allow-methods': 'POSTX, XPOST' }),
        ORIGIN,
      ).pass,
    ).toBe(false);
    expect(
      judgePreflightAllowed(
        res(204, null, {
          ...PREFLIGHT,
          'access-control-allow-headers':
            'x-authorization, x-content-type, x-apikey, x-x-client-info',
        }),
        ORIGIN,
      ).pass,
    ).toBe(false);
    expect(
      judgePreflightAllowed(res(204, null, { ...PREFLIGHT, vary: 'Accept-Origin' }), ORIGIN).pass,
    ).toBe(false);
  });
  it.each(REQUIRED_REQUEST_HEADERS)(
    '필수 헤더 %s 하나만 빠져도 FAIL (상세에 그 이름)',
    (missing) => {
      const headers = REQUIRED_REQUEST_HEADERS.filter((h) => h !== missing).join(', ');
      const r = judgePreflightAllowed(
        res(204, null, { ...PREFLIGHT, 'access-control-allow-headers': headers }),
        ORIGIN,
      );
      expect(r.pass).toBe(false);
      expect(r.detail).toContain(missing);
    },
  );
  it('허용 밖 출처 preflight: 403 + 허용 헤더 없음만 PASS. 404·500이라 헤더가 없는 응답은 PASS가 아니다', () => {
    expect(judgePreflightDenied(res(403)).pass).toBe(true);
    expect(judgePreflightDenied(res(404)).pass).toBe(false);
    expect(judgePreflightDenied(res(403, null, { 'access-control-allow-origin': '*' })).pass).toBe(
      false,
    );
    expect(judgePreflightDenied(res(204, null, PREFLIGHT)).pass).toBe(false);
    expect(judgePreflightDenied(res(500))).toMatchObject({ pass: false, unverified: true });
    expect(judgePreflightDenied(res(0))).toMatchObject({ pass: false, unverified: true });
  });
  it('오류·성공 응답에도 허용 출처의 Allow-Origin이 붙어야 PASS', () => {
    const h = { 'access-control-allow-origin': ORIGIN };
    expect(judgeCors(res(400, { code: 'banned' }, h), ORIGIN, 400, 'banned').pass).toBe(true);
    expect(judgeCors(res(400, { code: 'banned' }), ORIGIN, 400, 'banned').pass).toBe(false);
    expect(judgeCors(res(400, { code: 'other' }, h), ORIGIN, 400, 'banned').pass).toBe(false);
    expect(judgeSuccessCors(res(200, {}, h), ORIGIN).pass).toBe(true);
    expect(judgeSuccessCors(res(200, {}), ORIGIN).pass).toBe(false);
    expect(judgeSuccessCors(res(401, {}, h), ORIGIN).pass).toBe(false);
  });
});

describe('profiles 재조회·태그·동시 요청', () => {
  it('재조회가 함수 응답과 같아야 PASS (태그 0도 일치)', () => {
    expect(judgeProfile({ nickname: '뚜비', tag: 0 }, '뚜비', 0).pass).toBe(true);
    expect(judgeProfile({ nickname: '뚜비', tag: 1 }, '뚜비', 0).pass).toBe(false);
    expect(judgeProfile(null, '뚜비', 0).pass).toBe(false);
    expect(judgeProfile({ nickname: '뚜비', tag: 0 }, '뚜비', undefined).pass).toBe(false); // 앞 단계 실패
  });
  it('규칙 거부 뒤에는 행이 없거나 nickname이 null이어야 PASS', () => {
    expect(judgeNoNickname(null).pass).toBe(true);
    expect(judgeNoNickname({ nickname: null, tag: null }).pass).toBe(true);
    expect(judgeNoNickname({ nickname: '뚜', tag: 1 }).pass).toBe(false);
  });
  it('같은 이름의 두 번째 사용자는 다른 태그. 앞 단계가 실패했으면 PASS하지 않는다 (연쇄 PASS 금지)', () => {
    expect(judgeDifferentTag(1, 2).pass).toBe(true);
    expect(judgeDifferentTag(1, 1).pass).toBe(false);
    expect(judgeDifferentTag(undefined, 2).pass).toBe(false);
    expect(judgeDifferentTag(1, undefined).pass).toBe(false);
  });
  it('동시 두 요청: 200 하나(유효 본문) + 409 already-set 하나만 PASS, 승자 정보를 돌려준다', () => {
    const names = ['가나', '다라'] as const;
    const ok = res(200, { nickname: '가나', tag: 5 });
    const set = res(409, { code: 'already-set' });
    expect(judgeRace(ok, set, names)).toMatchObject({
      pass: true,
      winner: { nickname: '가나', tag: 5 },
    });
    expect(judgeRace(set, res(200, { nickname: '다라', tag: 0 }), names)).toMatchObject({
      pass: true,
      winner: { nickname: '다라', tag: 0 },
    });
    expect(judgeRace(ok, ok, names).pass).toBe(false);
    expect(judgeRace(set, set, names).pass).toBe(false);
    expect(judgeRace(ok, res(409, { code: 'other' }), names).pass).toBe(false);
    expect(judgeRace(ok, res(0), names)).toMatchObject({ pass: false, unverified: true });
  });

  it.each([
    ['본문 null', null],
    ['태그 없음', { nickname: '가나' }],
    ['태그 범위 밖', { nickname: '가나', tag: 10000 }],
    ['다른 요청의 이름', { nickname: '다라', tag: 1 }],
    ['이름이 숫자', { nickname: 7, tag: 1 }],
  ])('승자 200의 본문이 비정상(%s)이면 다른 하나가 409여도 FAIL', (_n, body) => {
    const r = judgeRace(res(200, body), res(409, { code: 'already-set' }), ['가나', '다라']);
    expect(r.pass).toBe(false);
    expect(r.winner).toBeUndefined();
  });
});

describe('profiles 조회 오류 (W3-02 리뷰 지적 3)', () => {
  /** 설치된 supabase-js에 가짜 fetch만 끼운다. 실제 요청은 나가지 않는다 */
  const clientWith = (status: number, body: unknown) =>
    createClient('https://example.invalid', 'test-key-not-real', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async () =>
          new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
          }),
      },
    });

  it('403 + 42501 응답은 data null이어도 "행 없음" PASS가 아니라 FAIL이다 (옛 judgeNoNickname(data)는 PASS였다)', async () => {
    const res = await readProfile(
      clientWith(403, { code: '42501', message: 'permission denied' }),
      'u1',
    );
    expect(res.data).toBeNull();
    expect(res.error?.code).toBe('42501');
    const verdict = judgeProfileReadError(res);
    expect(verdict).toMatchObject({ pass: false });
    expect(verdict?.unverified).toBeUndefined();
    expect(verdict?.detail).not.toContain('permission denied'); // message는 남기지 않는다
  });

  it('401 응답과 0·5xx 상태는 시험 불가 (SDK는 5xx·연결 실패를 재시도하므로 0·5xx는 응답 모양으로 직접 시험한다)', async () => {
    const unauthorized = await readProfile(clientWith(401, { code: 'x', message: 'm' }), 'u1');
    expect(judgeProfileReadError(unauthorized)).toMatchObject({ pass: false, unverified: true });
    for (const status of [0, 500, 503]) {
      expect(
        judgeProfileReadError({ data: null, error: { code: 'x', message: 'm' }, status }),
      ).toMatchObject({
        pass: false,
        unverified: true,
      });
    }
  });

  it('오류 없는 응답은 판정하지 않고(null) 값을 넘긴다: 빈 결과(행 없음)와 정상 행', async () => {
    const none = await readProfile(clientWith(200, []), 'u1');
    expect(judgeProfileReadError(none)).toBeNull();
    expect(judgeNoNickname(none.data).pass).toBe(true);
    const row = await readProfile(clientWith(200, [{ nickname: '뚜비', tag: 3 }]), 'u1');
    expect(judgeProfileReadError(row)).toBeNull();
    expect(judgeProfile(row.data, '뚜비', 3).pass).toBe(true);
  });
});
