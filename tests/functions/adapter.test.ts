import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createDeps } from '../../supabase/functions/set-nickname/adapter';

// 실제 profiles 쓰기가 "id = 검증된 사용자 AND nickname IS NULL" 조건을 거는지, 오류를 어떻게 나누는지 본다.
// 핸들러 시험의 가짜 DB("두 번째면 already-set")만으로는 이 SQL 조건을 증명하지 못한다.

type Result = {
  data?: unknown;
  error?: { code?: string; message?: string; status?: number } | null;
};

function fakeAdmin(results: {
  upsert?: Result;
  update?: Result;
  select?: Result;
  getUser?: Result;
}) {
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
      let kind: 'upsert' | 'update' | 'select' = 'select';
      const chain = {
        upsert(...args: unknown[]) {
          kind = 'upsert';
          log.push(`upsert(${JSON.stringify(args)})`);
          return chain;
        },
        update(...args: unknown[]) {
          kind = 'update';
          log.push(`update(${JSON.stringify(args)})`);
          return chain;
        },
        select(...args: unknown[]) {
          log.push(`select(${JSON.stringify(args)})`);
          return chain;
        },
        eq(...args: unknown[]) {
          log.push(`eq(${JSON.stringify(args)})`);
          return chain;
        },
        is(...args: unknown[]) {
          log.push(`is(${JSON.stringify(args)})`);
          return chain;
        },
        async maybeSingle() {
          log.push('maybeSingle()');
          return { data: null, error: null, ...results.select };
        },
        then(resolve: (v: Result) => void) {
          const r = kind === 'upsert' ? results.upsert : results.update;
          resolve({ data: [], error: null, ...r });
        },
      };
      return chain;
    },
  };
  return { admin: admin as unknown as SupabaseClient, log };
}

const options = (n = 12345) => ({ allowHeaders: 'h', randomUint32: () => n });

describe('set-nickname 저장 어댑터', () => {
  it('저장: 빈 행을 만들되 이미 있으면 그대로 두고(ignoreDuplicates), 같은 사용자의 닉네임이 비어 있을 때만 UPDATE한다', async () => {
    const { admin, log } = fakeAdmin({ update: { data: [{ id: 'user-a' }] } });
    const result = await createDeps(admin, options()).saveNickname('user-a', '뚜비', 427);
    expect(result).toBe('ok');
    expect(log).toEqual([
      'from(profiles)',
      'upsert([{"id":"user-a"},{"onConflict":"id","ignoreDuplicates":true}])',
      'from(profiles)',
      'update([{"nickname":"뚜비","tag":427}])',
      'eq(["id","user-a"])',
      'is(["nickname",null])',
      'select(["id"])',
    ]);
  });

  it('조건에 맞는 행이 없으면(이미 닉네임이 있어 UPDATE 0행) already-set', async () => {
    const { admin } = fakeAdmin({ update: { data: [] } });
    expect(await createDeps(admin, options()).saveNickname('user-a', '뚜비', 1)).toBe(
      'already-set',
    );
  });

  it('UPDATE의 unique 위반(23505)만 tag-taken, 그 밖의 오류는 throw', async () => {
    const taken = fakeAdmin({ update: { data: null, error: { code: '23505' } } });
    expect(await createDeps(taken.admin, options()).saveNickname('user-a', '뚜비', 1)).toBe(
      'tag-taken',
    );
    for (const code of ['42501', '23514', '08006', undefined]) {
      const bad = fakeAdmin({ update: { data: null, error: { code } } });
      await expect(
        createDeps(bad.admin, options()).saveNickname('user-a', '뚜비', 1),
      ).rejects.toBeDefined();
    }
  });

  it('빈 행을 만드는 단계의 23505는 태그 충돌이 아니다: throw하고 UPDATE로 가지 않는다', async () => {
    const { admin, log } = fakeAdmin({ upsert: { error: { code: '23505' } } });
    await expect(
      createDeps(admin, options()).saveNickname('user-a', '뚜비', 1),
    ).rejects.toBeDefined();
    expect(log.some((l) => l.startsWith('update('))).toBe(false);
  });

  it('조회: 본인 행의 닉네임만 읽는다. 행이 없거나 null이면 null, 오류는 throw', async () => {
    const mine = fakeAdmin({ select: { data: { nickname: '뚜비' } } });
    expect(await createDeps(mine.admin, options()).getNickname('user-a')).toBe('뚜비');
    expect(mine.log).toEqual([
      'from(profiles)',
      'select(["nickname"])',
      'eq(["id","user-a"])',
      'maybeSingle()',
    ]);
    expect(
      await createDeps(fakeAdmin({ select: { data: null } }).admin, options()).getNickname('u'),
    ).toBeNull();
    expect(
      await createDeps(
        fakeAdmin({ select: { data: { nickname: null } } }).admin,
        options(),
      ).getNickname('u'),
    ).toBeNull();
    await expect(
      createDeps(fakeAdmin({ select: { error: { code: '42501' } } }).admin, options()).getNickname(
        'u',
      ),
    ).rejects.toBeDefined();
  });

  it('토큰 검증: 유효하면 사용자 ID, 토큰 오류(4xx)는 null, 장애·요청 한도(408·429)·상태 없는 오류는 throw', async () => {
    const ok = fakeAdmin({ getUser: { data: { user: { id: 'user-a' } } } });
    expect(await createDeps(ok.admin, options()).getUserId('tok')).toBe('user-a');
    expect(ok.log).toEqual(['auth.getUser(tok)']);
    for (const status of [400, 401, 403, 404]) {
      const bad = fakeAdmin({ getUser: { data: { user: null }, error: { status } } });
      expect(await createDeps(bad.admin, options()).getUserId('tok')).toBeNull();
    }
    for (const status of [408, 429, 500, 502, 503, undefined]) {
      const down = fakeAdmin({ getUser: { data: { user: null }, error: { status } } });
      await expect(createDeps(down.admin, options()).getUserId('tok')).rejects.toBeDefined();
    }
    expect(
      await createDeps(fakeAdmin({ getUser: { data: { user: null } } }).admin, options()).getUserId(
        't',
      ),
    ).toBeNull();
  });

  it('난수 태그는 항상 0~9999 정수다', () => {
    const { admin } = fakeAdmin({});
    for (const n of [0, 1, 9999, 10000, 10001, 4294967295, 2 ** 31]) {
      const tag = createDeps(admin, options(n)).randomTag();
      expect(Number.isInteger(tag) && tag >= 0 && tag <= 9999).toBe(true);
    }
    expect(createDeps(admin, options(10000)).randomTag()).toBe(0);
  });
});
