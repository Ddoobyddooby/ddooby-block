// RULES_VERSION 2(L·J 4칸 조각 추가) 이후: 옛 규칙(버전 1)으로 만든 판은 서버가 거부한다 (기존 version-mismatch 동작의 근거).
// 서버는 번들(_shared/replay.js)의 RULES_VERSION을 handler에 넘긴다 (start-run·submit-score의 index.ts). 여기서는 같은 값으로 handler를 돌린다.
import { describe, expect, it } from 'vitest';
import { RULES_VERSION } from '../../src/config';
import { RULES_VERSION as SERVER_RULES_VERSION } from '../../supabase/functions/_shared/replay.js';
import { handleStartRun } from '../../supabase/functions/start-run/handler';
import { handleSubmitScore } from '../../supabase/functions/submit-score/handler';
import { games, withTimes } from '../helpers/randomBot';
import { FakeRunsDb, HEADERS, post } from './fakeRunsDb';

const RUN = '10000000-0000-4000-8000-000000000001';

describe('옛 규칙 버전(1)의 요청은 서버가 거부한다', () => {
  it('서버 번들의 RULES_VERSION은 src/config와 같은 2다', () => {
    expect(SERVER_RULES_VERSION).toBe(RULES_VERSION);
    expect(SERVER_RULES_VERSION).toBe(2);
  });

  it('start-run: version 1 요청은 409 version-mismatch, 발급 없음', async () => {
    const inserted: unknown[] = [];
    const res = await handleStartRun(
      {
        allowHeaders: HEADERS,
        rulesVersion: SERVER_RULES_VERSION,
        now: () => Date.parse('2026-11-12T00:00:00Z'),
        getUserId: async () => 'user-a',
        randomSeed: () => 7,
        insertRun: async (run) => {
          inserted.push(run);
          return RUN;
        },
        reportError: () => undefined,
      },
      post('https://f.example/start-run', { version: 1 }),
    );
    expect([res.status, await res.json(), inserted.length]).toEqual([
      409,
      { code: 'version-mismatch' },
      0,
    ]);
  });

  it('submit-score: 옛 버전(1)으로 발급된 run·version 1 제출은 409 version-mismatch, 저장 없음', async () => {
    const g = games()[0]!;
    const db = new FakeRunsDb();
    db.rulesVersion = SERVER_RULES_VERSION;
    const lastT = withTimes(g.log).at(-1)?.t ?? 0;
    // 옛 배포 때 발급된 run (rulesVersion 1)
    db.addRun(RUN, 'user-a', g.seed, { createdAtMs: db.clock - lastT - 5000, rulesVersion: 1 });
    const res = await handleSubmitScore(
      db.deps(),
      post('https://f.example/submit-score', {
        runId: RUN,
        seed: g.seed,
        version: 1,
        clientScore: g.state.score,
        placements: withTimes(g.log),
      }),
    );
    expect([res.status, await res.json()]).toEqual([409, { ok: false, code: 'version-mismatch' }]);
    expect(db.commits).toBe(0);
  });
});
