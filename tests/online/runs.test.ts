import { describe, expect, it } from 'vitest';
import { createAccount } from '../../src/online/account';
import type { FunctionResult } from '../../src/online/client';
import { createRuns, type SubmitPayload } from '../../src/online/runs';
import { deferred, fakeBackend, type FakeBackend, type FakeOptions } from './fakeBackend';

const RUN = '123e4567-e89b-42d3-a456-426614174000';
const PAYLOAD: SubmitPayload = {
  seed: 7,
  version: 1,
  clientScore: 100,
  placements: [{ trayIndex: 0, row: 1, col: 2, t: 1000 }],
};
const OK = { ok: true, score: 100, best: 150, weekKey: '2026-W46', isNewBest: false };

async function setup(
  opts: FakeOptions = {},
  deps: {
    online?: boolean;
    start?: number;
    submit?: number;
    hasKeys?: boolean;
    ready?: boolean;
  } = {},
) {
  const backend: FakeBackend = fakeBackend({ session: 'user-a', ...opts });
  const account = createAccount({
    hasKeys: deps.hasKeys ?? true,
    loadBackend: async () => (deps.hasKeys === false ? null : backend),
    isOnline: () => deps.online ?? true,
    onOnline: () => undefined,
    timeoutMs: 1000,
  });
  if (deps.ready !== false) await account.ensure();
  const runs = createRuns(account, {
    version: 1,
    isOnline: () => deps.online ?? true,
    startTimeoutMs: deps.start ?? 200,
    submitTimeoutMs: deps.submit ?? 200,
  });
  return { backend, account, runs };
}
const respond = (status: number, body: unknown): FakeOptions => ({
  callFunction: async () => ({ status, body }),
});

describe('startRun', () => {
  it('정상: runId(UUID)·seed를 돌려주고 버전을 함께 보낸다', async () => {
    const { runs, backend } = await setup(
      respond(200, { runId: RUN, seed: 4294967295, version: 1 }),
    );
    expect(await runs.startRun()).toEqual({ runId: RUN, seed: 4294967295 });
    expect(backend.lastFunction).toEqual({ name: 'start-run', body: { version: 1 } });
  });

  it('seed 0과 4294967295는 정상', async () => {
    for (const seed of [0, 4294967295]) {
      const { runs } = await setup(respond(200, { runId: RUN, seed }));
      expect((await runs.startRun())?.seed).toBe(seed);
    }
  });

  it('손상된 200은 null: null·문자열·음수·2^32·소수 seed, UUID가 아닌 runId, 본문 없음', async () => {
    const bads: unknown[] = [
      null,
      'ok',
      [],
      {},
      { runId: RUN },
      { runId: RUN, seed: '7' },
      { runId: RUN, seed: -1 },
      { runId: RUN, seed: 4294967296 },
      { runId: RUN, seed: 1.5 },
      { runId: RUN, seed: null },
      { runId: 'abc', seed: 7 },
      { runId: '', seed: 7 },
      { runId: 5, seed: 7 },
    ];
    for (const body of bads) {
      const { runs } = await setup(respond(200, body));
      expect(await runs.startRun(), JSON.stringify(body)).toBeNull();
    }
  });

  it('200이 아니거나 네트워크 오류·throw면 null', async () => {
    for (const status of [400, 401, 409, 413, 500, 502]) {
      const { runs } = await setup(respond(status, { runId: RUN, seed: 7 }));
      expect(await runs.startRun(), String(status)).toBeNull();
    }
    expect(await (await setup({ callFunction: async () => 'network' })).runs.startRun()).toBeNull();
    const boom = await setup({
      callFunction: async () => {
        throw new Error('boom');
      },
    });
    expect(await boom.runs.startRun()).toBeNull();
  });

  it('키 없는 빌드·오프라인이면 함수를 부르지 않고 null', async () => {
    const off = await setup(respond(200, { runId: RUN, seed: 7 }), { online: false });
    expect(await off.runs.startRun()).toBeNull();
    expect(off.backend.calls.callFunction).toBe(0);
    const none = await setup({}, { hasKeys: false });
    expect(await none.runs.startRun()).toBeNull();
  });

  it('계정 준비(익명 로그인)도 같은 제한 시간 안이다: 로그인이 늦으면 null이고 그 뒤 함수를 부르지 않는다', async () => {
    const signIn = deferred<string>();
    const { runs, backend } = await setup(
      { session: null, signIn: () => signIn.promise, ...respond(200, { runId: RUN, seed: 7 }) },
      { ready: false, start: 30 },
    );
    expect(await runs.startRun()).toBeNull();
    // 시간이 지난 뒤 로그인이 끝나도 이미 끝난 요청이 새 서버 호출을 추가로 만들지 않는다
    signIn.resolve('user-a');
    await new Promise((r) => setTimeout(r, 40));
    expect(backend.calls.callFunction).toBe(0);
  });

  it('응답이 제한 시간(2.5초 역할)을 넘기면 null, 늦게 온 성공은 쓰지 않는다', async () => {
    const slow = deferred<FunctionResult>();
    const { runs } = await setup({ callFunction: () => slow.promise }, { start: 30 });
    const started = Date.now();
    expect(await runs.startRun()).toBeNull();
    expect(Date.now() - started).toBeLessThan(150);
    slow.resolve({ status: 200, body: { runId: RUN, seed: 7 } }); // 늦은 성공: 이미 null로 끝났다
    await new Promise((r) => setTimeout(r, 10));
  });

  it('기다리는 사이 계정이 바뀌면(로그아웃) 그 run은 null', async () => {
    const hold = deferred<FunctionResult>();
    const { runs, backend } = await setup({ callFunction: () => hold.promise });
    const pending = runs.startRun();
    await new Promise((r) => setTimeout(r, 5));
    backend.signOut();
    hold.resolve({ status: 200, body: { runId: RUN, seed: 7 } });
    expect(await pending).toBeNull();
  });
});

describe('submitScore', () => {
  it('정상 200은 점수·best·weekKey·isNewBest와 제출한 계정을 돌려주고 요청 본문을 정확히 보낸다', async () => {
    const { runs, backend } = await setup(respond(200, OK));
    expect(await runs.submitScore(RUN, PAYLOAD)).toEqual({
      kind: 'ok',
      score: 100,
      best: 150,
      weekKey: '2026-W46',
      isNewBest: false,
      userId: 'user-a',
    });
    expect(backend.lastFunction).toEqual({
      name: 'submit-score',
      body: { runId: RUN, seed: 7, version: 1, clientScore: 100, placements: PAYLOAD.placements },
    });
  });

  it('손상된 200은 성공으로 치지 않는다 (failed)', async () => {
    const bads: unknown[] = [
      null,
      {},
      { ...OK, ok: false },
      { ...OK, ok: 'yes' },
      { ...OK, best: '150' },
      { ...OK, best: -1 },
      { ...OK, best: 1.5 },
      { ...OK, score: null },
      { ...OK, weekKey: '2026-46' },
      { ...OK, weekKey: 5 },
      { ...OK, isNewBest: 'no' },
      'ok',
    ];
    for (const body of bads) {
      const { runs } = await setup(respond(200, body));
      expect(await runs.submitScore(RUN, PAYLOAD), JSON.stringify(body)).toEqual({
        kind: 'failed',
      });
    }
  });

  it('409 version-mismatch는 outdated, 그 밖의 409는 코드가 있으면 rejected, 없으면 failed', async () => {
    expect(
      await (
        await setup(respond(409, { ok: false, code: 'version-mismatch' }))
      ).runs.submitScore(RUN, PAYLOAD),
    ).toEqual({ kind: 'outdated' });
    expect(
      await (
        await setup(respond(409, { ok: false, code: 'resubmit-conflict' }))
      ).runs.submitScore(RUN, PAYLOAD),
    ).toEqual({ kind: 'rejected', code: 'resubmit-conflict' });
    expect(await (await setup(respond(409, null))).runs.submitScore(RUN, PAYLOAD)).toEqual({
      kind: 'failed',
    });
  });

  it('400·404·413은 rejected (코드가 없으면 http-상태)', async () => {
    for (const [status, body, code] of [
      [400, { ok: false, code: 'score-mismatch' }, 'score-mismatch'],
      [400, { ok: false, code: 'too-fast' }, 'too-fast'],
      [404, { ok: false, code: 'not-found' }, 'not-found'],
      [413, { code: 'too-large' }, 'too-large'],
      [400, null, 'http-400'],
    ] as const) {
      const { runs } = await setup(respond(status, body));
      expect(await runs.submitScore(RUN, PAYLOAD), String(status)).toEqual({
        kind: 'rejected',
        code,
      });
    }
  });

  it('401·5xx·네트워크·throw는 failed', async () => {
    for (const status of [401, 403, 500, 502, 503]) {
      const { runs } = await setup(respond(status, { code: 'x' }));
      expect(await runs.submitScore(RUN, PAYLOAD), String(status)).toEqual({ kind: 'failed' });
    }
    expect(
      await (await setup({ callFunction: async () => 'network' })).runs.submitScore(RUN, PAYLOAD),
    ).toEqual({ kind: 'failed' });
    const boom = await setup({
      callFunction: async () => {
        throw new Error('boom');
      },
    });
    expect(await boom.runs.submitScore(RUN, PAYLOAD)).toEqual({ kind: 'failed' });
  });

  it('응답이 없으면 제한 시간 뒤 failed (throw 없음, 늦은 응답은 무시)', async () => {
    const slow = deferred<FunctionResult>();
    const { runs } = await setup({ callFunction: () => slow.promise }, { submit: 30 });
    expect(await runs.submitScore(RUN, PAYLOAD)).toEqual({ kind: 'failed' });
    slow.resolve({ status: 200, body: OK });
    await new Promise((r) => setTimeout(r, 10));
  });

  it('제출 대기 중 로그아웃·다른 계정으로 바뀌면 그 결과는 성공으로 쓰지 않는다 (failed)', async () => {
    const hold = deferred<FunctionResult>();
    const { runs, backend } = await setup({ callFunction: () => hold.promise });
    const pending = runs.submitScore(RUN, PAYLOAD);
    await new Promise((r) => setTimeout(r, 5));
    backend.signOut();
    hold.resolve({ status: 200, body: OK });
    expect(await pending).toEqual({ kind: 'failed' });
  });

  it('같은 사용자의 토큰 갱신 이벤트는 정상 제출을 실패시키지 않는다', async () => {
    const hold = deferred<FunctionResult>();
    const { runs, backend } = await setup({ callFunction: () => hold.promise });
    const pending = runs.submitScore(RUN, PAYLOAD);
    await new Promise((r) => setTimeout(r, 5));
    // 같은 사용자 ID로 세션 이벤트(TOKEN_REFRESHED)
    await backend.signInAnonymously().catch(() => undefined);
    hold.resolve({ status: 200, body: OK });
    const out = await pending;
    expect(out.kind).toBe('ok'); // 같은 사용자이므로 정상 제출이다
  });

  it('키 없는 빌드·계정 없음이면 함수를 부르지 않고 failed', async () => {
    const none = await setup({}, { hasKeys: false });
    expect(await none.runs.submitScore(RUN, PAYLOAD)).toEqual({ kind: 'failed' });
    const noAccount = await setup(
      {
        session: null,
        signIn: async () => {
          throw new Error('no');
        },
      },
      { ready: false },
    );
    expect(await noAccount.runs.submitScore(RUN, PAYLOAD)).toEqual({ kind: 'failed' });
    expect(noAccount.backend.calls.callFunction).toBe(0);
  });

  it('같은 payload로 다시 불러도 그대로 다시 보낸다 (재제출 멱등은 서버가 보장한다)', async () => {
    const { runs, backend } = await setup(respond(200, OK));
    const a = await runs.submitScore(RUN, PAYLOAD);
    const b = await runs.submitScore(RUN, PAYLOAD);
    expect(a).toEqual(b);
    expect(backend.calls.callFunction).toBe(2);
  });
});
