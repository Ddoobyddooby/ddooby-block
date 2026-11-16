import { describe, expect, it } from 'vitest';
import { createAccount } from '../../src/online/account';
import type { FunctionResult } from '../../src/online/client';
import { createProfile, parseProfileRow } from '../../src/online/profile';
import { deferred, fakeBackend, type FakeBackend, type FakeOptions } from './fakeBackend';

async function readyProfile(opts: FakeOptions = {}) {
  const backend: FakeBackend = fakeBackend({ session: 'user-a', ...opts });
  const account = createAccount({
    hasKeys: true,
    loadBackend: async () => backend,
    isOnline: () => true,
    onOnline: () => undefined,
    timeoutMs: 1000,
  });
  await account.ensure();
  return { backend, account, profile: createProfile(account) };
}

describe('parseProfileRow', () => {
  it('행 없음·닉네임/태그 모두 null이면 아직 안 정한 것(null)', () => {
    expect(parseProfileRow(null)).toBeNull();
    expect(parseProfileRow(undefined)).toBeNull();
    expect(parseProfileRow({ nickname: null, tag: null })).toBeNull();
  });

  it('정상 행은 태그 0도 설정됨으로 본다', () => {
    expect(parseProfileRow({ nickname: '뚜비', tag: 0 })).toEqual({ nickname: '뚜비', tag: 0 });
    expect(parseProfileRow({ nickname: '뚜비', tag: 9999 })).toEqual({
      nickname: '뚜비',
      tag: 9999,
    });
  });

  it.each([
    ['문자열 행', 'oops'],
    ['배열', []],
    ['닉네임만', { nickname: '뚜비', tag: null }],
    ['태그만', { nickname: null, tag: 5 }],
    ['태그 범위 밖', { nickname: '뚜비', tag: 10000 }],
    ['태그 소수', { nickname: '뚜비', tag: 1.5 }],
    ['태그 문자열', { nickname: '뚜비', tag: '5' }],
    ['빈 닉네임', { nickname: '', tag: 5 }],
    ['닉네임이 숫자', { nickname: 7, tag: 5 }],
    ['열 없음', {}],
  ])("손상된 행(%s)은 미설정으로 위장하지 않고 'error'", (_n, row) => {
    expect(parseProfileRow(row)).toBe('error');
  });
});

describe('getMyProfile', () => {
  it('프로필 없음 → null, 설정됨 → 객체, 조회 실패 → error', async () => {
    expect(
      await (await readyProfile({ fetchProfile: async () => null })).profile.getMyProfile(),
    ).toBeNull();
    expect(
      await (
        await readyProfile({ fetchProfile: async () => ({ nickname: null, tag: null }) })
      ).profile.getMyProfile(),
    ).toBeNull();
    expect(
      await (
        await readyProfile({ fetchProfile: async () => ({ nickname: '뚜비', tag: 0 }) })
      ).profile.getMyProfile(),
    ).toEqual({ nickname: '뚜비', tag: 0 });
    expect(
      await (
        await readyProfile({ fetchProfile: () => Promise.reject(new Error('x')) })
      ).profile.getMyProfile(),
    ).toBe('error');
  });

  it("계정이 준비되지 않았으면 'error' (조회하지 않는다)", async () => {
    const backend = fakeBackend({ session: null });
    const account = createAccount({
      hasKeys: true,
      loadBackend: async () => backend,
      isOnline: () => true,
      onOnline: () => undefined,
      timeoutMs: 1000,
    });
    expect(await createProfile(account).getMyProfile()).toBe('error');
    expect(backend.calls.fetchProfile).toBe(0);
  });

  it('조회를 기다리는 사이 계정이 바뀌면 그 응답은 지금 계정의 것이 아니다', async () => {
    let release!: () => void;
    const { backend, profile } = await readyProfile({
      fetchProfile: () =>
        new Promise((resolve) => {
          release = () => resolve({ nickname: 'A의이름', tag: 1 });
        }),
    });
    const p = profile.getMyProfile();
    backend.signOut(); // A 로그아웃
    release();
    expect(await p).toBe('error');
  });
});

describe('setNickname', () => {
  const res = (status: number, body: unknown): { callFunction: () => Promise<FunctionResult> } => ({
    callFunction: async () => ({ status, body }),
  });

  it('잘못된 입력은 규칙 오류로 막고 함수를 부르지 않는다', async () => {
    for (const [name, code] of [
      ['뚜', 'too-short'],
      ['가나다라마바사아자차카', 'too-long'],
      ['뚜 비', 'bad-chars'],
      ['시발', 'banned'],
    ] as const) {
      const { backend, profile } = await readyProfile(res(200, {}));
      expect(await profile.setNickname(name)).toEqual({ ok: false, code });
      expect(backend.calls.callFunction).toBe(0);
    }
  });

  it('정규화한 이름을 set-nickname 함수에 보낸다', async () => {
    const { backend, profile } = await readyProfile(res(200, { nickname: '뚜비', tag: 7 }));
    await profile.setNickname('  뚜비 ');
    expect(backend.lastFunction).toEqual({ name: 'set-nickname', body: { nickname: '뚜비' } });
  });

  it('200: 요청한 이름과 같고 태그가 0~9999 정수일 때만 성공', async () => {
    expect(
      await (
        await readyProfile(res(200, { nickname: '뚜비', tag: 0 }))
      ).profile.setNickname('뚜비'),
    ).toEqual({
      ok: true,
      nickname: '뚜비',
      tag: 0,
    });
    for (const body of [
      null,
      [],
      'ok',
      {},
      { nickname: '뚜비' },
      { tag: 5 },
      { nickname: '다른이름', tag: 5 }, // 요청과 다른 이름
      { nickname: 7, tag: 5 },
      { nickname: '뚜비', tag: 10000 },
      { nickname: '뚜비', tag: -1 },
      { nickname: '뚜비', tag: 1.5 },
      { nickname: '뚜비', tag: '5' },
    ]) {
      expect(await (await readyProfile(res(200, body))).profile.setNickname('뚜비')).toEqual({
        ok: false,
        code: 'server',
      });
    }
  });

  it('400: 알려진 규칙 code만 그대로, 모르는 code·본문 없음은 server', async () => {
    for (const code of ['too-short', 'too-long', 'bad-chars', 'banned'] as const) {
      expect(await (await readyProfile(res(400, { code }))).profile.setNickname('뚜비')).toEqual({
        ok: false,
        code,
      });
    }
    for (const body of [{ code: 'bad-request' }, { code: 'already-set' }, {}, null, 'x']) {
      expect(await (await readyProfile(res(400, body))).profile.setNickname('뚜비')).toEqual({
        ok: false,
        code: 'server',
      });
    }
  });

  it('401 → unauthorized, 409 + already-set → already-set, 409의 다른 본문은 server', async () => {
    expect(
      await (await readyProfile(res(401, { code: 'unauthorized' }))).profile.setNickname('뚜비'),
    ).toEqual({
      ok: false,
      code: 'unauthorized',
    });
    expect(await (await readyProfile(res(401, null))).profile.setNickname('뚜비')).toEqual({
      ok: false,
      code: 'unauthorized',
    });
    expect(
      await (await readyProfile(res(409, { code: 'already-set' }))).profile.setNickname('뚜비'),
    ).toEqual({
      ok: false,
      code: 'already-set',
    });
    for (const body of [{}, null, { code: 'conflict' }]) {
      expect(await (await readyProfile(res(409, body))).profile.setNickname('뚜비')).toEqual({
        ok: false,
        code: 'server',
      });
    }
  });

  it.each([403, 404, 413, 429, 500, 502, 503])('%i → server', async (status) => {
    expect(
      await (await readyProfile(res(status, { code: 'server' }))).profile.setNickname('뚜비'),
    ).toEqual({
      ok: false,
      code: 'server',
    });
  });

  it("연결 실패('network')와 호출 예외는 network", async () => {
    expect(
      await (
        await readyProfile({ callFunction: async () => 'network' })
      ).profile.setNickname('뚜비'),
    ).toEqual({
      ok: false,
      code: 'network',
    });
    expect(
      await (
        await readyProfile({ callFunction: () => Promise.reject(new Error('boom')) })
      ).profile.setNickname('뚜비'),
    ).toEqual({ ok: false, code: 'network' });
  });

  it('계정이 없으면 network (함수를 부르지 않는다)', async () => {
    const backend = fakeBackend({ session: null });
    const account = createAccount({
      hasKeys: true,
      loadBackend: async () => backend,
      isOnline: () => true,
      onOnline: () => undefined,
      timeoutMs: 1000,
    });
    expect(await createProfile(account).setNickname('뚜비')).toEqual({
      ok: false,
      code: 'network',
    });
    expect(backend.calls.callFunction).toBe(0);
  });

  it('결과에 서버 본문의 message·내부 정보를 싣지 않는다', async () => {
    const r = await (
      await readyProfile(
        res(500, { code: 'server', message: 'duplicate key "profiles_nickname_tag_key"' }),
      )
    ).profile.setNickname('뚜비');
    expect(JSON.stringify(r)).not.toContain('profiles_nickname');
  });

  describe('제출을 기다리는 사이 계정이 바뀌면 (W3-02 리뷰 지적 2)', () => {
    const cases: [string, FunctionResult][] = [
      ['200', { status: 200, body: { nickname: '뚜비', tag: 427 } }],
      ['409 already-set', { status: 409, body: { code: 'already-set' } }],
      ['400 banned', { status: 400, body: { code: 'banned' } }],
      ['500', { status: 500, body: { code: 'server' } }],
    ];
    const change: [string, (b: FakeBackend) => Promise<void>][] = [
      ['로그아웃', async (b) => b.signOut()],
      ['다른 계정(B)으로 전환', async (b) => void (await b.signInAnonymously())],
    ];
    for (const [changeName, doChange] of change) {
      for (const [name, late] of cases) {
        it(`${changeName} 뒤 옛 계정의 ${name} 응답은 지금 계정의 결과로 쓰지 않는다 (network로 닫힘)`, async () => {
          const gate = deferred<FunctionResult>();
          const { backend, profile } = await readyProfile({
            callFunction: () => gate.promise,
            signInId: 'user-b',
          });
          const p = profile.setNickname('뚜비');
          await doChange(backend);
          gate.resolve(late);
          expect(await p).toEqual({ ok: false, code: 'network' });
        });
      }
    }

    it('같은 계정이면 늦게 와도 정상 응답은 그대로 성공', async () => {
      const gate = deferred<FunctionResult>();
      const { profile } = await readyProfile({ callFunction: () => gate.promise });
      const p = profile.setNickname('뚜비');
      gate.resolve({ status: 200, body: { nickname: '뚜비', tag: 427 } });
      expect(await p).toEqual({ ok: true, nickname: '뚜비', tag: 427 });
    });
  });
});
