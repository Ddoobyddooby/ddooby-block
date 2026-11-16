import { describe, expect, it } from 'vitest';
import {
  handleStartRun,
  MAX_BODY_BYTES,
  type NewRun,
  type StartRunDeps,
} from '../../supabase/functions/start-run/handler';
import { HEADERS, ORIGIN, post } from './fakeRunsDb';

const URL_ = 'https://f.example/start-run';
// 2026-11-15T14:59:59.999Z = KST 일요일 23:59:59.999 (2026-W46), 1ms 뒤가 월요일 00:00 KST (W47)
const SUNDAY_END = Date.parse('2026-11-15T14:59:59.999Z');

function fake(over: Partial<StartRunDeps> = {}) {
  const inserted: NewRun[] = [];
  const errors: unknown[] = [];
  const calls = { getUserId: [] as string[], random: 0 };
  const deps: StartRunDeps = {
    allowHeaders: HEADERS,
    rulesVersion: 1,
    now: () => SUNDAY_END,
    getUserId: async (token) => {
      calls.getUserId.push(token);
      return token === 'tokenA' ? 'user-a' : null;
    },
    randomSeed: () => {
      calls.random += 1;
      return 4_000_000_000;
    },
    insertRun: async (run) => {
      inserted.push(run);
      return '10000000-0000-4000-8000-000000000001';
    },
    reportError: (e) => errors.push(e),
    ...over,
  };
  return { deps, inserted, errors, calls };
}

async function call(deps: StartRunDeps, body: unknown, init: Parameters<typeof post>[2] = {}) {
  const res = await handleStartRun(deps, post(URL_, body, init));
  return { status: res.status, body: (await res.json().catch(() => null)) as unknown, res };
}

describe('start-run', () => {
  it('정상: 200 {runId, seed, version, weekKey}, runs에 발급 시각·주·seed가 들어간다', async () => {
    const { deps, inserted } = fake();
    const r = await call(deps, { version: 1 });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      runId: '10000000-0000-4000-8000-000000000001',
      seed: 4_000_000_000,
      version: 1,
      weekKey: '2026-W46',
    });
    expect(inserted).toEqual([
      {
        userId: 'user-a',
        seed: 4_000_000_000,
        rulesVersion: 1,
        weekKey: '2026-W46',
        createdAtMs: SUNDAY_END,
      },
    ]);
    // seed는 JSON 숫자 (문자열이 아니다)
    expect(typeof (r.body as { seed: unknown }).seed).toBe('number');
  });

  it('월요일 00:00 KST가 되면 다음 주로 발급한다', async () => {
    const { deps, inserted } = fake({ now: () => SUNDAY_END + 1 });
    const r = await call(deps, { version: 1 });
    expect((r.body as { weekKey: string }).weekKey).toBe('2026-W47');
    expect(inserted[0]?.weekKey).toBe('2026-W47');
  });

  it('seed 경계 0과 4294967295는 정상', async () => {
    for (const seed of [0, 4294967295]) {
      const { deps } = fake({ randomSeed: () => seed });
      const r = await call(deps, { version: 1 });
      expect([r.status, (r.body as { seed: number }).seed]).toEqual([200, seed]);
    }
  });

  it('서버가 범위 밖·소수 seed를 만들면 500 (발급하지 않는다)', async () => {
    for (const seed of [-1, 4294967296, 1.5, NaN]) {
      const { deps, inserted } = fake({ randomSeed: () => seed });
      const r = await call(deps, { version: 1 });
      expect([r.status, inserted.length], String(seed)).toEqual([500, 0]);
    }
  });

  it('version 형태가 틀리면 400 version-invalid (발급 없음)', async () => {
    for (const version of ['1', null, 1.5, 0, -1, 2 ** 31, undefined, true]) {
      const { deps, inserted } = fake();
      const r = await call(deps, { version });
      expect([r.status, r.body, inserted.length], String(version)).toEqual([
        400,
        { code: 'version-invalid' },
        0,
      ]);
    }
  });

  it('정상 정수지만 서버와 다른 버전이면 409 version-mismatch (발급 없음, seed 추첨도 없음)', async () => {
    const { deps, inserted, calls } = fake();
    const r = await call(deps, { version: 2 });
    expect([r.status, r.body, inserted.length, calls.random]).toEqual([
      409,
      { code: 'version-mismatch' },
      0,
      0,
    ]);
  });

  it('본문이 깨졌거나 객체가 아니면 400 payload-invalid', async () => {
    for (const raw of ['{"version":', 'null', '[]', '5', '']) {
      const { deps, inserted } = fake();
      const res = await handleStartRun(deps, post(URL_, null, { raw }));
      expect([res.status, await res.json(), inserted.length], raw).toEqual([
        400,
        { code: 'payload-invalid' },
        0,
      ]);
    }
  });

  it('본문 상한(1024바이트): 정확히 상한은 통과, +1은 413', async () => {
    const pad = (bytes: number) => {
      const t = JSON.stringify({ version: 1 });
      return t + ' '.repeat(bytes - t.length);
    };
    const ok = fake();
    expect(
      (await handleStartRun(ok.deps, post(URL_, null, { raw: pad(MAX_BODY_BYTES) }))).status,
    ).toBe(200);
    const big = fake();
    const res = await handleStartRun(big.deps, post(URL_, null, { raw: pad(MAX_BODY_BYTES + 1) }));
    expect([res.status, await res.json(), big.inserted.length]).toEqual([
      413,
      { code: 'too-large' },
      0,
    ]);
  });

  it('토큰 없음·무효는 401, 인증 서버 장애는 500 (오류 내용 비노출)', async () => {
    for (const token of [null, 'bad']) {
      const { deps, inserted } = fake();
      const r = await call(deps, { version: 1 }, { token });
      expect([r.status, r.body, inserted.length], String(token)).toEqual([
        401,
        { code: 'unauthorized' },
        0,
      ]);
    }
    const { deps, errors } = fake({
      getUserId: async () => {
        throw new Error('internal secret SQL');
      },
    });
    const r = await call(deps, { version: 1 });
    expect([r.status, r.body]).toEqual([500, { code: 'server' }]);
    expect(JSON.stringify(r.body)).not.toMatch(/secret|SQL/);
    expect(errors).toHaveLength(1);
  });

  it('DB 오류는 500', async () => {
    const { deps } = fake({
      insertRun: async () => {
        throw new Error('db down');
      },
    });
    const r = await call(deps, { version: 1 });
    expect([r.status, r.body]).toEqual([500, { code: 'server' }]);
  });

  it('Origin·메서드: 허용 밖 Origin POST 403, OPTIONS 204/403, GET 405, Origin 없는 POST는 토큰으로 판정', async () => {
    const { deps, calls } = fake();
    expect((await call(deps, { version: 1 }, { origin: 'https://evil.example' })).status).toBe(403);
    expect(calls.getUserId).toEqual([]);
    const ok = await handleStartRun(
      deps,
      new Request(URL_, { method: 'OPTIONS', headers: { Origin: ORIGIN } }),
    );
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const bad = await handleStartRun(
      deps,
      new Request(URL_, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }),
    );
    expect([bad.status, bad.headers.get('Access-Control-Allow-Origin')]).toEqual([403, null]);
    expect((await handleStartRun(deps, new Request(URL_, { method: 'GET' }))).status).toBe(405);
    expect((await call(deps, { version: 1 }, { origin: null })).status).toBe(200);
    expect((await call(deps, { version: 1 }, { origin: null, token: null })).status).toBe(401);
  });
});
