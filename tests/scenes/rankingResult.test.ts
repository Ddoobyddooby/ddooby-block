import { describe, expect, it } from 'vitest';
import { RULES_VERSION, SAVE } from '../../src/config';
import { createGame } from '../../src/core/engine';
import type { GameState, Placement } from '../../src/core/types';
import type { SubmitOutcome } from '../../src/online';
import {
  buildSubmission,
  currentWeek,
  RankingTracker,
  rankingLine,
} from '../../src/scenes/rankingResult';
import { deferred } from '../online/fakeBackend';

const RUN = '123e4567-e89b-42d3-a456-426614174000';
const over: GameState = { ...createGame(1), score: 293, over: true };
const log: Placement[] = [
  { trayIndex: 0, row: 1, col: 2, t: 1000 },
  { trayIndex: 1, row: 3, col: 4, t: 1300 },
];
const base = {
  maxPlacements: SAVE.maxRunPlacements,
  runId: RUN,
  replayable: true,
  seed: 7,
  version: RULES_VERSION,
  state: over,
  placements: log,
};

describe('buildSubmission: 랭킹 대상 판만 제출한다', () => {
  it('끝난 서버 run 판은 seed·version·clientScore·로그 복사본을 만든다', () => {
    const s = buildSubmission(base);
    expect(s).toEqual({
      runId: RUN,
      payload: { seed: 7, version: RULES_VERSION, clientScore: 293, placements: log },
    });
    // 복사본이다: 이후 원본이 바뀌어도 제출 내용은 그대로
    log.push({ trayIndex: 2, row: 0, col: 0, t: 9999 });
    expect(s?.payload.placements).toHaveLength(2);
    log.pop();
    // 모르는 필드를 싣지 않는다
    expect(Object.keys(s?.payload.placements[0] ?? {})).toEqual(['trayIndex', 'row', 'col', 't']);
  });

  it('run이 없거나(오프라인 판) UUID 모양이 아니면(옛 저장·손상) 제출하지 않는다', () => {
    expect(buildSubmission({ ...base, runId: null })).toBeNull();
    for (const runId of ['', 'abc', 'saved-run', "1' or '1'='1", '123e4567-e89b-42d3-a456']) {
      expect(buildSubmission({ ...base, runId }), runId).toBeNull();
    }
  });

  it('리플레이할 수 없는 판(DEV ?fill=)·끝나지 않은 판·배치가 없는 판은 제출하지 않는다', () => {
    expect(buildSubmission({ ...base, replayable: false })).toBeNull();
    expect(buildSubmission({ ...base, state: { ...over, over: false } })).toBeNull();
    expect(buildSubmission({ ...base, placements: [] })).toBeNull();
  });

  it('기록 한도(20,000)를 넘어 잘린 판은 제출하지 않는다 (잘린 기록을 정상 점수로 내지 않는다)', () => {
    const many = (n: number): Placement[] =>
      Array.from({ length: n }, (_, i) => ({ trayIndex: 0, row: 0, col: 0, t: i * 250 }));
    expect(buildSubmission({ ...base, placements: many(SAVE.maxRunPlacements) })).not.toBeNull();
    expect(buildSubmission({ ...base, placements: many(SAVE.maxRunPlacements + 1) })).toBeNull();
  });
});

describe('RankingTracker', () => {
  const ok: SubmitOutcome = {
    kind: 'ok',
    score: 100,
    best: 100,
    weekKey: '2026-W46',
    isNewBest: true,
    userId: 'u',
  };

  it('응답 전에는 pending, 응답이 오면 done과 결과이고 구독자에게 알린다', async () => {
    const d = deferred<SubmitOutcome>();
    const t = new RankingTracker(d.promise);
    const seen: string[] = [];
    t.subscribe((s) => seen.push(s.phase));
    expect(t.state).toEqual({ phase: 'pending' });
    d.resolve(ok);
    await d.promise;
    await Promise.resolve();
    expect(t.state).toEqual({ phase: 'done', outcome: ok });
    expect(seen).toEqual(['done']);
  });

  it('구독을 끊으면 더 알리지 않는다 (떠난 화면)', async () => {
    const d = deferred<SubmitOutcome>();
    const t = new RankingTracker(d.promise);
    const seen: string[] = [];
    const off = t.subscribe((s) => seen.push(s.phase));
    off();
    d.resolve(ok);
    await d.promise;
    await Promise.resolve();
    expect(seen).toEqual([]);
    expect(t.state.phase).toBe('done');
  });

  it('이미 끝난 뒤의 구독도 지금 상태는 state로 읽는다 (화면이 늦게 떠도 같은 결과)', async () => {
    const t = new RankingTracker(Promise.resolve(ok));
    await Promise.resolve();
    await Promise.resolve();
    expect(t.state).toEqual({ phase: 'done', outcome: ok });
  });

  it('제출 약속이 거부돼도 failed로 끝낸다 (처리되지 않은 거부 없음)', async () => {
    const t = new RankingTracker(Promise.reject(new Error('boom')));
    await new Promise((r) => setTimeout(r, 0));
    expect(t.state).toEqual({ phase: 'done', outcome: { kind: 'failed' } });
  });
});

describe('rankingLine: 결과 줄 문구', () => {
  const done = (outcome: SubmitOutcome) => ({ phase: 'done' as const, outcome });

  it('제출 중 / 이번 주 / 지난주 / 실패 / 새 버전', () => {
    expect(rankingLine({ phase: 'pending' }, '2026-W46')).toBe('랭킹에 올리는 중…');
    const ok = (weekKey: string): SubmitOutcome => ({
      kind: 'ok',
      score: 1,
      best: 12840,
      weekKey,
      isNewBest: false,
      userId: 'u',
    });
    expect(rankingLine(done(ok('2026-W46')), '2026-W46')).toBe('이번 주 최고 12,840점');
    // 며칠 이어서 한 판: 최고 점수는 시작한 주의 것이다
    expect(rankingLine(done(ok('2026-W45')), '2026-W46')).toBe(
      '지난주 기록으로 올렸어요 · 최고 12,840점',
    );
    expect(rankingLine(done({ kind: 'failed' }), '2026-W46')).toBe('랭킹에 올리지 못했어요');
    expect(rankingLine(done({ kind: 'rejected', code: 'too-fast' }), '2026-W46')).toBe(
      '랭킹에 올리지 못했어요',
    );
    expect(rankingLine(done({ kind: 'outdated' }), '2026-W46')).toBe(
      '새 버전이 있어요. 새로고침해 주세요',
    );
  });

  it('currentWeek는 KST 월요일 00:00에 바뀐다', () => {
    expect(currentWeek(Date.parse('2026-11-15T14:59:59.999Z'))).toBe('2026-W46');
    expect(currentWeek(Date.parse('2026-11-15T15:00:00.000Z'))).toBe('2026-W47');
  });
});
