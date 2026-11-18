import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { RULES_VERSION } from '../../src/config';
import type { FnRes } from '../../scripts/supabase-check/nicknameJudge';
import { exitCodeOf, type Row } from '../../scripts/supabase-check/report';
import {
  runRanking,
  type RankingClients,
  type RankingIo,
} from '../../scripts/supabase-check/ranking';
import { weekKey } from '../../src/replay/weekKey';
import { handleSetNickname } from '../../supabase/functions/set-nickname/handler';
import { handleStartRun } from '../../supabase/functions/start-run/handler';
import { handleSubmitScore } from '../../supabase/functions/submit-score/handler';
import { FakeRunsDb, HEADERS } from '../functions/fakeRunsDb';

// 원격 `--ranking` 시험의 로컬 리허설: 실제 handler(start-run·submit-score·set-nickname) + 가짜 DB·시계에 시험 스크립트를 돌린다.
// weekly_ranking은 SQL의 규칙(닉네임·tag 둘 다 있는 사람만, 점수 desc → user, rank()는 점수만, TOP 50·±5, me, 서버 주)을 따르는 모델이다
// (실제 SQL은 PGlite로 따로 확인했다). 이것은 원격 통과가 아니다. 시험 스크립트가 올바른 서버에서는 모두 PASS하고
// 잘못된 서버(개인정보 열 노출·anon에 is_me)에서는 허위 PASS를 내지 않는지 본다.

type Rec = Record<string, unknown>;

function setup(over: { leakUserId?: boolean; anonSeesMe?: boolean } = {}) {
  const db = new FakeRunsDb();
  db.rulesVersion = RULES_VERSION; // 규칙 버전은 서버 번들과 같게 (가짜 DB 기본값 1에 묶지 않는다)
  db.users = { tokenR: 'user-r', tokenN: 'user-n', tokenZ: 'user-z' };
  const profiles = new Map<string, { nickname: string; tag: number }>();
  let seedCounter = 2_000;
  const startDeps = db.startDeps(() => (seedCounter = (seedCounter * 1103515245 + 12345) >>> 0));
  let tagCounter = 100;
  const nickDeps = {
    allowHeaders: HEADERS,
    getUserId: async (token: string) => db.users[token] ?? null,
    getNickname: async (id: string) => profiles.get(id)?.nickname ?? null,
    saveNickname: async (id: string, nickname: string, tag: number) => {
      if (profiles.has(id)) return 'already-set' as const;
      profiles.set(id, { nickname, tag });
      return 'ok' as const;
    },
    randomTag: () => (tagCounter += 1),
  };

  const rpcModel = (token: string | null): FnRes => {
    if (token !== null && db.users[token] === undefined) {
      return { status: 401, body: { message: 'Invalid JWT' }, header: () => null };
    }
    const meId = token === null ? null : (db.users[token] ?? null);
    const week = weekKey(db.clock);
    const all = [...db.weekly.entries()]
      .map(([key, w]) => {
        const [user, wk] = key.split('|') as [string, string];
        return { user, wk, best: w.best };
      })
      .filter((r) => r.wk === week);
    const ranked = all
      .filter((r) => profiles.has(r.user))
      .sort((a, b) => b.best - a.best || a.user.localeCompare(b.user))
      .map((r, i, arr) => ({
        ...r,
        seq: i + 1,
        rank: arr.findIndex((x) => x.best === r.best) + 1,
        ...(profiles.get(r.user) as { nickname: string; tag: number }),
      }));
    const toRow = (section: string, r: (typeof ranked)[number]): Rec => ({
      week_key: week,
      section,
      seq: r.seq,
      rank: r.rank,
      nickname: r.nickname,
      tag: r.tag,
      best_score: r.best,
      is_me: r.user === meId || (over.anonSeesMe === true && section === 'top' && r.seq === 1),
      ...(over.leakUserId ? { user_id: r.user } : {}),
    });
    const rows: Rec[] = [
      {
        week_key: week,
        section: 'week',
        seq: null,
        rank: null,
        nickname: null,
        tag: null,
        best_score: null,
        is_me: false,
      },
    ];
    for (const r of ranked.filter((x) => x.seq <= 50)) rows.push(toRow('top', r));
    const mine = ranked.find((r) => r.user === meId);
    if (mine) {
      for (const r of ranked.filter((x) => Math.abs(x.seq - mine.seq) <= 5))
        rows.push(toRow('around', r));
      rows.push(toRow('me', mine));
    } else if (meId !== null) {
      const raw = all.find((r) => r.user === meId);
      if (raw) {
        rows.push({
          week_key: week,
          section: 'me',
          seq: null,
          rank: null,
          nickname: null,
          tag: null,
          best_score: raw.best,
          is_me: true,
        });
      }
    }
    return { status: 200, body: rows, header: () => null };
  };

  const io: RankingIo = {
    async call(fn, init) {
      const headers: Record<string, string> = {};
      if (init.origin !== null) headers.Origin = init.origin;
      if (init.token !== null) headers.Authorization = `Bearer ${init.token}`;
      const req = new Request(`https://f.example/${fn}`, {
        method: init.method,
        headers,
        body: JSON.stringify(init.body ?? {}),
      });
      const res =
        fn === 'start-run'
          ? await handleStartRun(startDeps, req)
          : fn === 'submit-score'
            ? await handleSubmitScore(db.deps(), req)
            : await handleSetNickname(nickDeps, req);
      let body: unknown = null;
      try {
        body = JSON.parse(await res.text());
      } catch {
        // 본문 없음
      }
      return { status: res.status, body, header: (n) => res.headers.get(n) };
    },
    rpc: async (token) => rpcModel(token),
    sleep: async (ms) => {
      db.clock += ms;
    },
    now: () => db.clock,
    clock: () => db.clock,
  };
  const denied = {
    data: null,
    error: { code: '42501', message: 'permission denied' },
    status: 403,
  };
  const chain = (): unknown => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'limit']) c[m] = () => c;
    c.then = (resolve: (v: unknown) => void) => resolve(denied);
    return c;
  };
  const client = { from: chain, rpc: () => Promise.resolve(denied) } as unknown as SupabaseClient;
  const clients: RankingClients = {
    anon: client,
    r: client,
    idR: 'user-r',
    idN: 'user-n',
    idZ: 'user-z',
    tokenR: 'tokenR',
    tokenN: 'tokenN',
    tokenZ: 'tokenZ',
  };
  return { io, clients, db };
}

describe('--ranking 로컬 리허설 (실제 handler + 가짜 DB·시계 + 랭킹 모델)', () => {
  it('올바른 서버에서는 모든 항목이 PASS하고 종료 코드 0이다', async () => {
    const { io, clients } = setup();
    const rows: Row[] = [];
    await runRanking(clients, io, rows, 'T1');
    const failures = rows
      .filter((r) => !r.outcome.pass)
      .map((r) => `${r.id} ${r.label}: ${r.outcome.detail}`);
    expect(failures).toEqual([]);
    expect(exitCodeOf(rows)).toBe(0);
    // 항목이 충분히 있다 (빈 표로 PASS하지 않는다)
    expect(rows.length).toBeGreaterThanOrEqual(18);
  }, 60_000);

  it('서버가 user_id 열을 내보내면 FAIL하고 종료 코드 1이다', async () => {
    const { io, clients } = setup({ leakUserId: true });
    const rows: Row[] = [];
    await runRanking(clients, io, rows, 'T2');
    expect(rows.some((r) => !r.outcome.pass && r.outcome.detail.includes('user_id'))).toBe(true);
    expect(exitCodeOf(rows)).toBe(1);
  }, 60_000);

  it('anon 응답에 is_me가 켜지면 FAIL하고 종료 코드 1이다', async () => {
    const { io, clients } = setup({ anonSeesMe: true });
    const rows: Row[] = [];
    await runRanking(clients, io, rows, 'T3');
    expect(rows.find((r) => r.label === '비로그인 anon 조회')?.outcome.pass).toBe(false);
    expect(exitCodeOf(rows)).toBe(1);
  }, 60_000);

  it('랭킹 서버가 내려가 있으면(status 0) 모두 PASS하지 못하고 종료 코드 1이다', async () => {
    const { io, clients } = setup();
    const down: RankingIo = {
      ...io,
      rpc: async () => ({ status: 0, body: null, header: () => null }),
    };
    const rows: Row[] = [];
    await runRanking(clients, down, rows, 'T4');
    expect(rows.filter((r) => r.outcome.unverified).length).toBeGreaterThan(0);
    expect(exitCodeOf(rows)).toBe(1);
  }, 60_000);
});
