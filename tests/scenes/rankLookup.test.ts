import { describe, expect, it } from 'vitest';
import type { RankingResult, SubmitOutcome } from '../../src/online';
import { RankLookup, type RankLookupDeps } from '../../src/scenes/rankLookup';
import { onSubmitDone, rankingLine, RankingTracker } from '../../src/scenes/rankingResult';
import { deferred } from '../online/fakeBackend';

const WEEK = '2026-W47';
const submitted = (over: Partial<Extract<SubmitOutcome, { kind: 'ok' }>> = {}): SubmitOutcome => ({
  kind: 'ok',
  score: 5000,
  best: 5000,
  weekKey: WEEK,
  isNewBest: true,
  userId: 'a',
  ...over,
});
const result = (
  me: { rank: number | null; score: number } | null,
  over: Partial<Extract<RankingResult, { kind: 'ok' }>> = {},
): RankingResult => ({
  kind: 'ok',
  weekKey: WEEK,
  top: [],
  around: [],
  me,
  userId: 'a',
  ...over,
});
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function world(user: { id: string | null } = { id: 'a' }) {
  const fetches: ReturnType<typeof deferred<RankingResult>>[] = [];
  const deps: RankLookupDeps = {
    fetchRanking() {
      const d = deferred<RankingResult>();
      fetches.push(d);
      return d.promise;
    },
    currentUserId: () => user.id,
  };
  return { fetches, lookup: new RankLookup(deps), user };
}

describe('RankLookup: 제출 성공 뒤 이번 주 순위', () => {
  it('시작 전에는 조회하지 않는다 (idle). 제출 성공으로 start하면 한 번 조회하고 순위가 된다', async () => {
    const w = world();
    expect(w.lookup.state).toEqual({ phase: 'idle' });
    expect(w.fetches).toHaveLength(0);
    w.lookup.start(submitted());
    expect(w.fetches).toHaveLength(1);
    expect(w.lookup.state).toEqual({ phase: 'loading' });
    w.fetches[0]?.resolve(result({ rank: 3, score: 5200 }));
    await tick();
    // 점수는 제출 응답이 아니라 조회값(5200)
    expect(w.lookup.state).toEqual({ phase: 'ranked', score: 5200, rank: 3 });
  });

  it.each<[string, SubmitOutcome]>([
    ['실패', { kind: 'failed' }],
    ['거부', { kind: 'rejected', code: 'too-fast' }],
    ['새 버전', { kind: 'outdated' }],
  ])('제출이 %s면 순위를 조회하지 않는다', (_n, outcome) => {
    const w = world();
    w.lookup.start(outcome);
    expect(w.fetches).toHaveLength(0);
    expect(w.lookup.state).toEqual({ phase: 'idle' });
  });

  it('제출한 계정이 지금 계정과 다르면(기다리는 사이 계정이 바뀜) 조회하지 않는다', () => {
    const w = world({ id: 'b' });
    w.lookup.start(submitted({ userId: 'a' }));
    expect(w.fetches).toHaveLength(0);
  });

  it('이름 없는 계정: rank null → unnamed. 이름을 정하고 refresh하면 순위가 된다', async () => {
    const w = world();
    w.lookup.start(submitted());
    w.fetches[0]?.resolve(result({ rank: null, score: 5000 }));
    await tick();
    expect(w.lookup.state).toEqual({ phase: 'unnamed', score: 5000 });
    w.lookup.refresh();
    expect(w.fetches).toHaveLength(2);
    expect(w.lookup.state).toEqual({ phase: 'unnamed', score: 5000 }); // 조회 중에도 이전 줄 유지 (깜빡임 없음)
    w.fetches[1]?.resolve(result({ rank: 12, score: 5000 }));
    await tick();
    expect(w.lookup.state).toEqual({ phase: 'ranked', score: 5000, rank: 12 });
  });

  it.each<[string, RankingResult]>([
    ['오프라인', { kind: 'offline' }],
    ['오류', { kind: 'error' }],
    [
      '다른 주의 응답 (지난주 판에 이번 주 순위를 붙이지 않는다)',
      result({ rank: 1, score: 1 }, { weekKey: '2026-W48' }),
    ],
    ['다른 계정의 응답', result({ rank: 1, score: 1 }, { userId: 'b' })],
    ['계정 없이 본 응답', result({ rank: 1, score: 1 }, { userId: null })],
    ['제출은 성공했는데 내 기록이 없다', result(null)],
  ])('조회 결과가 %s면 failed (제출 성공은 그대로)', async (_n, res) => {
    const w = world();
    w.lookup.start(submitted());
    w.fetches[0]?.resolve(res);
    await tick();
    expect(w.lookup.state).toEqual({ phase: 'failed' });
  });

  it('조회 중 계정이 바뀌어 응답이 도착하면 순위를 붙이지 않는다', async () => {
    const w = world();
    w.lookup.start(submitted());
    w.user.id = 'b';
    w.fetches[0]?.resolve(result({ rank: 1, score: 9 }));
    await tick();
    expect(w.lookup.state).toEqual({ phase: 'failed' });
  });

  it('조회가 거부(throw)돼도 failed로 끝난다', async () => {
    const w = world();
    w.lookup.start(submitted());
    w.fetches[0]?.reject(new Error('x'));
    await tick();
    expect(w.lookup.state).toEqual({ phase: 'failed' });
  });

  it('refresh가 겹치면 옛 응답은 버린다 (최신 조회만 반영)', async () => {
    const w = world();
    w.lookup.start(submitted());
    w.lookup.refresh();
    w.fetches[1]?.resolve(result({ rank: 2, score: 7 }));
    await tick();
    w.fetches[0]?.resolve(result({ rank: 9, score: 1 }));
    await tick();
    expect(w.lookup.state).toEqual({ phase: 'ranked', score: 7, rank: 2 });
  });

  it('화면을 떠나면(end) 늦은 응답이 상태·구독자를 건드리지 않고, 이후 refresh도 조회하지 않는다', async () => {
    const w = world();
    const seen: string[] = [];
    w.lookup.subscribe((s) => seen.push(s.phase));
    w.lookup.start(submitted());
    w.lookup.end();
    w.fetches[0]?.resolve(result({ rank: 1, score: 1 }));
    await tick();
    expect(seen).toEqual(['loading']);
    w.lookup.refresh();
    expect(w.fetches).toHaveLength(1);
  });

  it('start가 시작되지 않았으면 refresh는 아무것도 하지 않는다 (제출 실패한 판에서 이름만 정한 경우)', () => {
    const w = world();
    w.lookup.refresh();
    expect(w.fetches).toHaveLength(0);
  });

  it('start는 한 번만 유효하다 (중복 호출로 조회가 겹치지 않는다)', () => {
    const w = world();
    w.lookup.start(submitted());
    w.lookup.start(submitted());
    expect(w.fetches).toHaveLength(1);
  });
});

describe('순서: 제출이 끝난 뒤에만 순위를 조회한다 (R19, 병렬 금지)', () => {
  it('제출 pending 동안 조회 0회 → 성공으로 resolve → 조회 1회 → 순위가 결과 줄에 반영', async () => {
    const submission = deferred<SubmitOutcome>();
    const tracker = new RankingTracker(submission.promise);
    const w = world();
    const log: string[] = [];
    onSubmitDone(tracker, (outcome) => {
      log.push('submitted');
      w.lookup.start(outcome);
      log.push(`fetches:${w.fetches.length}`);
    });
    await tick();
    expect(w.fetches).toHaveLength(0); // 제출이 끝나기 전에는 순위 조회 없음
    expect(log).toEqual([]);
    submission.resolve(submitted());
    await tick();
    expect(log).toEqual(['submitted', 'fetches:1']);
    w.fetches[0]?.resolve(result({ rank: 4, score: 5100 }));
    await tick();
    expect(rankingLine(tracker.state, WEEK, w.lookup.state)).toBe('이번 주 최고 5,100점 · 4위');
  });

  it('제출이 화면보다 먼저 끝나 있었어도 같은 경로 (바로 한 번 호출)', async () => {
    const tracker = new RankingTracker(Promise.resolve(submitted()));
    await tick();
    const calls: string[] = [];
    onSubmitDone(tracker, (o) => calls.push(o.kind));
    expect(calls).toEqual(['ok']);
  });

  it('구독을 끊으면 끝나도 부르지 않고, 두 번 부르지도 않는다', async () => {
    const submission = deferred<SubmitOutcome>();
    const tracker = new RankingTracker(submission.promise);
    const calls: string[] = [];
    const off = onSubmitDone(tracker, (o) => calls.push(o.kind));
    off();
    submission.resolve(submitted());
    await tick();
    expect(calls).toEqual([]);
  });
});

describe('rankingLine: 순위 조회를 붙인 결과 줄', () => {
  const done = (outcome: SubmitOutcome) => ({ phase: 'done' as const, outcome });

  it('순위가 있으면 "이번 주 최고 N점 · N위" — 점수·순위는 조회값 (isNewBest=false여도, 제출 응답 best와 달라도)', () => {
    const line = rankingLine(done(submitted({ best: 100, isNewBest: false })), WEEK, {
      phase: 'ranked',
      score: 9000,
      rank: 3,
    });
    expect(line).toBe('이번 주 최고 9,000점 · 3위');
  });

  it('이름 없는 계정: "이번 주 최고 N점 · 이름을 정하면 순위가 보여요" (0위·null위 없음)', () => {
    const line = rankingLine(done(submitted()), WEEK, { phase: 'unnamed', score: 4200 });
    expect(line).toBe('이번 주 최고 4,200점 · 이름을 정하면 순위가 보여요');
    expect(line).not.toMatch(/0위|null|undefined/);
  });

  it.each([[{ phase: 'idle' }], [{ phase: 'loading' }], [{ phase: 'failed' }]] as const)(
    '순위를 모르거나 못 읽었으면(%j) "이번 주 최고 N점"만',
    (lookup) => {
      expect(rankingLine(done(submitted({ best: 12840 })), WEEK, lookup)).toBe(
        '이번 주 최고 12,840점',
      );
    },
  );

  it('조회 인자를 생략해도 기존 문구 그대로', () => {
    expect(rankingLine(done(submitted({ best: 12840 })), WEEK)).toBe('이번 주 최고 12,840점');
  });

  it('지난주 판은 순위가 있어도 붙이지 않는다 (기존 "지난주 기록으로 올렸어요")', () => {
    const line = rankingLine(done(submitted({ weekKey: '2026-W46', best: 777 })), WEEK, {
      phase: 'ranked',
      score: 1,
      rank: 1,
    });
    expect(line).toBe('지난주 기록으로 올렸어요 · 최고 777점');
  });

  it('거부·실패·새 버전은 순위와 무관하게 기존 문구', () => {
    const lookup = { phase: 'ranked', score: 1, rank: 1 } as const;
    expect(rankingLine(done({ kind: 'failed' }), WEEK, lookup)).toBe('랭킹에 올리지 못했어요');
    expect(rankingLine(done({ kind: 'outdated' }), WEEK, lookup)).toBe(
      '새 버전이 있어요. 새로고침해 주세요',
    );
  });
});
