import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createDeps as startDeps } from '../../supabase/functions/start-run/adapter';
import { createDeps as submitDeps } from '../../supabase/functions/submit-score/adapter';

// 실제 SQL 조건·RPC 인자를 어떻게 거는지, 오류를 어떻게 나누는지 본다 (핸들러 시험의 가짜 DB로는 증명되지 않는다)

interface Out {
  data?: unknown;
  error?: { code?: string; message?: string; status?: number } | null;
}

function fakeAdmin(results: { insert?: Out; select?: Out; rpc?: Out; getUser?: Out }) {
  const log: string[] = [];
  const admin = {
    auth: {
      async getUser(token: string) {
        log.push(`auth.getUser(${token})`);
        return { data: { user: null }, error: null, ...results.getUser };
      },
    },
    from(table: string) {
      log.push(`from(${table})`);
      const chain = {
        insert(...a: unknown[]) {
          log.push(`insert(${JSON.stringify(a)})`);
          return chain;
        },
        select(...a: unknown[]) {
          log.push(`select(${JSON.stringify(a)})`);
          return chain;
        },
        eq(...a: unknown[]) {
          log.push(`eq(${JSON.stringify(a)})`);
          return chain;
        },
        async single() {
          return { data: null, error: null, ...results.insert };
        },
        async maybeSingle() {
          return { data: null, error: null, ...results.select };
        },
      };
      return chain;
    },
    rpc(name: string, args: unknown) {
      log.push(`rpc(${name},${JSON.stringify(args)})`);
      return {
        async single() {
          return { data: null, error: null, ...results.rpc };
        },
      };
    },
  };
  return { admin: admin as unknown as SupabaseClient, log };
}

const opts = { allowHeaders: 'h', rulesVersion: 1, now: () => 1 };

describe('start-run 어댑터', () => {
  it('insertRun: 발급 시각을 ms 정밀도 ISO로 넣고 새 id를 돌려준다', async () => {
    const { admin, log } = fakeAdmin({ insert: { data: { id: 'run-1' } } });
    const deps = startDeps(admin, { ...opts, randomUint32: () => 9 });
    const id = await deps.insertRun({
      userId: 'user-a',
      seed: 4294967295,
      rulesVersion: 1,
      weekKey: '2026-W46',
      createdAtMs: Date.parse('2026-11-15T14:59:59.999Z'),
    });
    expect(id).toBe('run-1');
    expect(log).toEqual([
      'from(runs)',
      'insert([{"user_id":"user-a","seed":4294967295,"rules_version":1,"week_key":"2026-W46","created_at":"2026-11-15T14:59:59.999Z"}])',
      'select(["id"])',
    ]);
  });

  it('insert 오류는 throw (handler가 500으로 바꾼다)', async () => {
    const { admin } = fakeAdmin({ insert: { error: { code: '23514', message: 'x' } } });
    const deps = startDeps(admin, { ...opts, randomUint32: () => 1 });
    await expect(
      deps.insertRun({ userId: 'u', seed: 1, rulesVersion: 1, weekKey: 'bad', createdAtMs: 0 }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('토큰: 4xx(무효·만료)는 null, 408·429·5xx·네트워크는 throw', async () => {
    const run = (getUser: Out) =>
      startDeps(fakeAdmin({ getUser }).admin, { ...opts, randomUint32: () => 1 }).getUserId('t');
    expect(await run({ data: { user: { id: 'u' } } })).toBe('u');
    expect(await run({ error: { status: 401 } })).toBeNull();
    expect(await run({ error: { status: 403 } })).toBeNull();
    for (const status of [408, 429, 500, 503, undefined]) {
      await expect(run({ error: { status } }), String(status)).rejects.toBeDefined();
    }
  });
});

describe('submit-score 어댑터', () => {
  const record = {
    id: 'run-1',
    seed: 7,
    rules_version: 1,
    week_key: '2026-W46',
    created_at: '2026-11-10T00:00:00.123+00:00',
    submission_hash: null,
    result: null,
  };

  it('getRun: id와 user_id를 함께 조건으로 걸어 읽고 created_at을 ms로 바꾼다', async () => {
    const { admin, log } = fakeAdmin({ select: { data: record } });
    const run = await submitDeps(admin, opts).getRun('run-1', 'user-a');
    expect(run).toEqual({
      id: 'run-1',
      seed: 7,
      rulesVersion: 1,
      weekKey: '2026-W46',
      createdAtMs: Date.parse('2026-11-10T00:00:00.123Z'),
      submissionHash: null,
      result: null,
    });
    expect(log).toEqual([
      'from(runs)',
      'select(["id, seed, rules_version, week_key, created_at, submission_hash, result"])',
      'eq(["id","run-1"])',
      'eq(["user_id","user-a"])',
    ]);
  });

  it('getRun: 행이 없으면 null, 조회 오류·손상된 행은 throw (없는 run으로 위장하지 않는다)', async () => {
    expect(
      await submitDeps(fakeAdmin({ select: { data: null } }).admin, opts).getRun('r', 'u'),
    ).toBeNull();
    await expect(
      submitDeps(fakeAdmin({ select: { error: { code: '500' } } }).admin, opts).getRun('r', 'u'),
    ).rejects.toBeDefined();
    for (const bad of [
      { ...record, created_at: 'nope' },
      { ...record, seed: 1.5 },
      { ...record, rules_version: '1' },
    ]) {
      await expect(
        submitDeps(fakeAdmin({ select: { data: bad } }).admin, opts).getRun('r', 'u'),
      ).rejects.toBeDefined();
    }
  });

  it('commit: RPC commit_submission에 run·사용자·해시·판정·ISO 시각을 넘기고 상태를 읽는다', async () => {
    const { admin, log } = fakeAdmin({
      rpc: { data: { out_status: 'committed', out_hash: 'h', out_result: { ok: true, score: 5 } } },
    });
    const r = await submitDeps(admin, opts).commit({
      runId: 'run-1',
      userId: 'user-a',
      hash: 'h',
      verdict: { ok: true, score: 5 },
      submittedAtMs: Date.parse('2026-11-10T00:10:00.000Z'),
    });
    expect(r).toEqual({ status: 'committed', hash: 'h', result: { ok: true, score: 5 } });
    expect(log).toEqual([
      'rpc(commit_submission,{"p_run":"run-1","p_user":"user-a","p_hash":"h","p_result":{"ok":true,"score":5},"p_submitted_at":"2026-11-10T00:10:00.000Z"})',
    ]);
  });

  it('commit: not-found·existing를 나누고, 알 수 없는 상태·해시 없는 응답·RPC 오류는 throw', async () => {
    const run = (rpc: Out) =>
      submitDeps(fakeAdmin({ rpc }).admin, opts).commit({
        runId: 'r',
        userId: 'u',
        hash: 'h',
        verdict: { ok: false, code: 'not-over' },
        submittedAtMs: 0,
      });
    expect(
      await run({ data: { out_status: 'not-found', out_hash: null, out_result: null } }),
    ).toEqual({
      status: 'not-found',
    });
    expect(
      await run({ data: { out_status: 'existing', out_hash: 'h0', out_result: { ok: false } } }),
    ).toEqual({
      status: 'existing',
      hash: 'h0',
      result: { ok: false },
    });
    await expect(
      run({ data: { out_status: 'weird', out_hash: 'h', out_result: null } }),
    ).rejects.toBeDefined();
    await expect(
      run({ data: { out_status: 'committed', out_hash: null, out_result: null } }),
    ).rejects.toBeDefined();
    await expect(run({ error: { code: '22003' } })).rejects.toMatchObject({ code: '22003' });
  });
});
