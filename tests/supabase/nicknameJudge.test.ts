import { describe, expect, it } from 'vitest';
import {
  judgeCode,
  judgeCors,
  judgeDifferentTag,
  judgeNoNickname,
  judgePreflightAllowed,
  judgePreflightDenied,
  judgeProfile,
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
  it('동시 두 요청: 200 하나 + 409 already-set 하나만 PASS (둘 다 200이면 FAIL)', () => {
    const ok = res(200, { nickname: 'a', tag: 1 });
    const set = res(409, { code: 'already-set' });
    expect(judgeRace(ok, set).pass).toBe(true);
    expect(judgeRace(set, ok).pass).toBe(true);
    expect(judgeRace(ok, ok).pass).toBe(false);
    expect(judgeRace(set, set).pass).toBe(false);
    expect(judgeRace(ok, res(409, { code: 'other' })).pass).toBe(false);
    expect(judgeRace(ok, res(0))).toMatchObject({ pass: false, unverified: true });
  });
});
