import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RankingResult, SubmitOutcome } from '../../src/online';
import { GameOverRanking } from '../../src/scenes/gameOverRanking';
import { RankingTracker } from '../../src/scenes/rankingResult';
import { deferred } from '../online/fakeBackend';

// GameOverScene.create가 하는 연결(제출 결과 → 닉네임 묻기·순위 조회 → 결과 줄)을 Phaser 없이 그대로 돌린다.
// 화면이 하는 일은 같다: 만들고(create) → line()으로 글자 → subscribe로 갱신 → begin → resize마다 구독만 다시 → 종료에서 end.
afterEach(() => vi.useRealTimers());

const submitted = (over: Partial<Extract<SubmitOutcome, { kind: 'ok' }>> = {}): SubmitOutcome => ({
  kind: 'ok',
  score: 1234,
  best: 1234,
  weekKey: '2026-W47',
  isNewBest: true,
  userId: 'a',
  ...over,
});
const result = (
  me: { rank: number | null; score: number } | null,
  over: Partial<Extract<RankingResult, { kind: 'ok' }>> = {},
): RankingResult => ({
  kind: 'ok',
  weekKey: '2026-W47',
  top: [],
  around: [],
  me,
  userId: 'a',
  ...over,
});
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function setup() {
  const submission = deferred<SubmitOutcome>();
  const fetches: ReturnType<typeof deferred<RankingResult>>[] = [];
  const user = { id: 'a' as string | null };
  const tracker = new RankingTracker(submission.promise);
  const ui = new GameOverRanking(tracker, {
    fetchRanking: () => {
      const d = deferred<RankingResult>();
      fetches.push(d);
      return d.promise;
    },
    currentUserId: () => user.id,
  });
  // 화면: 글자 표시 흉내
  const screen = { text: ui.line(), history: [ui.line()] };
  const attach = () =>
    ui.subscribe((t) => {
      screen.text = t;
      screen.history.push(t);
    });
  const asked: string[] = [];
  return { submission, fetches, user, tracker, ui, screen, attach, asked };
}

describe('GameOverRanking: 최초 create 경로', () => {
  it('제출이 create 뒤에 끝난다: 제출 전 조회 0회 → 성공 → 조회 1회 → 화면 글자에 "· N위"가 실제로 반영된다', async () => {
    const w = setup();
    w.attach();
    w.ui.begin((o) => w.asked.push(o.kind));
    expect(w.screen.text).toBe('랭킹에 올리는 중…');
    await tick();
    expect(w.fetches).toHaveLength(0); // 제출이 끝나기 전에는 순위 조회 없음 (병렬 금지)
    w.submission.resolve(submitted());
    await tick();
    expect(w.asked).toEqual(['ok']); // 닉네임 묻기도 제출 뒤
    expect(w.screen.text).toBe('랭킹에 올렸어요 · 최고 1,234점'); // 조회 전: 주를 단정하지 않는다
    expect(w.fetches).toHaveLength(1);
    w.fetches[0]?.resolve(result({ rank: 7, score: 1234 }));
    await tick();
    expect(w.screen.text).toBe('이번 주 최고 1,234점 · 7위');
  });

  it('제출이 create 전에 이미 끝나 있었다: 같은 경로로 조회 1회, 글자 반영', async () => {
    const w = setup();
    w.submission.resolve(submitted());
    await tick();
    w.attach();
    w.ui.begin((o) => w.asked.push(o.kind));
    expect(w.asked).toEqual(['ok']);
    expect(w.fetches).toHaveLength(1);
    w.fetches[0]?.resolve(result({ rank: 3, score: 1500 }));
    await tick();
    expect(w.screen.text).toBe('이번 주 최고 1,500점 · 3위');
  });

  it('이름 없는 계정 → 이름 저장 뒤 refresh하면 같은 화면 글자가 순위로 바뀐다', async () => {
    const w = setup();
    w.attach();
    w.ui.begin(() => undefined);
    w.submission.resolve(submitted());
    await tick();
    w.fetches[0]?.resolve(result({ rank: null, score: 1234 }));
    await tick();
    expect(w.screen.text).toBe('이번 주 최고 1,234점 · 이름을 정하면 순위가 보여요');
    w.ui.refreshRank();
    expect(w.fetches).toHaveLength(2);
    w.fetches[1]?.resolve(result({ rank: 12, score: 1234 }));
    await tick();
    expect(w.screen.text).toBe('이번 주 최고 1,234점 · 12위');
  });

  it('순위 조회가 실패해도 제출 성공은 그대로: "랭킹에 올렸어요 · 최고 N점" 유지', async () => {
    const w = setup();
    w.attach();
    w.ui.begin(() => undefined);
    w.submission.resolve(submitted());
    await tick();
    w.fetches[0]?.resolve({ kind: 'offline' });
    await tick();
    expect(w.screen.text).toBe('랭킹에 올렸어요 · 최고 1,234점');
  });

  it('제출 실패·거부면 조회하지 않고 기존 문구', async () => {
    const w = setup();
    w.attach();
    w.ui.begin(() => undefined);
    w.submission.resolve({ kind: 'failed' });
    await tick();
    expect(w.fetches).toHaveLength(0);
    expect(w.screen.text).toBe('랭킹에 올리지 못했어요');
  });
});

describe('GameOverRanking: resize·종료', () => {
  it('resize: 구독만 끊고 다시 건다 (같은 객체). 진행 중인 조회 결과가 새 구독으로 반영되고 begin은 다시 해도 조회가 겹치지 않는다', async () => {
    const w = setup();
    let off = w.attach();
    w.ui.begin(() => undefined);
    w.submission.resolve(submitted());
    await tick();
    // 조회 중에 resize: 화면 다시 그리기 = 옛 구독 끊고 새 구독
    off();
    w.screen.text = w.ui.line(); // 다시 그린 화면의 첫 글자
    off = w.attach();
    w.ui.begin(() => w.asked.push('again')); // 다시 그린 create는 begin을 부르지 않지만, 불러도 무시된다
    expect(w.asked).toEqual([]);
    w.fetches[0]?.resolve(result({ rank: 5, score: 900 }));
    await tick();
    expect(w.fetches).toHaveLength(1);
    expect(w.screen.text).toBe('이번 주 최고 900점 · 5위');
    off();
  });

  it('resize로 끊긴 옛 화면 구독은 더는 글자를 바꾸지 않는다', async () => {
    const w = setup();
    const old: string[] = [];
    const offOld = w.ui.subscribe((t) => old.push(t));
    w.ui.begin(() => undefined);
    offOld();
    w.attach();
    w.submission.resolve(submitted());
    await tick();
    w.fetches[0]?.resolve(result({ rank: 1, score: 1 }));
    await tick();
    expect(old).toEqual([]);
  });

  it('종료(end) 뒤의 늦은 응답은 글자·구독자를 건드리지 않고, refresh도 조회하지 않는다', async () => {
    const w = setup();
    w.attach();
    w.ui.begin((o) => w.asked.push(o.kind));
    w.submission.resolve(submitted());
    await tick();
    const before = w.screen.history.length;
    w.ui.end();
    w.fetches[0]?.resolve(result({ rank: 1, score: 1 }));
    await tick();
    expect(w.screen.history).toHaveLength(before);
    w.ui.refreshRank();
    expect(w.fetches).toHaveLength(1);
  });

  it('제출이 끝나기 전에 종료하면 끝나도 닉네임 묻기·조회를 시작하지 않는다', async () => {
    const w = setup();
    w.attach();
    w.ui.begin((o) => w.asked.push(o.kind));
    w.ui.end();
    w.submission.resolve(submitted());
    await tick();
    expect(w.asked).toEqual([]);
    expect(w.fetches).toHaveLength(0);
  });
});

describe('서버 주 기준 (기기 시계와 무관)', () => {
  const run = async (deviceNow: string, serverWeek: string, submitWeek: string) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(deviceNow));
    const w = setup();
    w.attach();
    w.ui.begin(() => undefined);
    w.submission.resolve(submitted({ weekKey: submitWeek }));
    // fake Date만 쓰므로 setTimeout은 실제다
    vi.useRealTimers();
    await tick();
    expect(w.fetches).toHaveLength(1); // 기기 시계가 틀려도 정상 제출은 서버에 순위를 묻는다
    w.fetches[0]?.resolve(result({ rank: 2, score: 777 }, { weekKey: serverWeek }));
    await tick();
    return w.screen.text;
  };

  it.each([
    ['기기 시계 +1년', '2027-11-17T03:00:00Z'],
    ['기기 시계 -1년', '2025-11-17T03:00:00Z'],
  ])('%s: 서버 주와 제출 주가 같으면 순위가 붙는다', async (_n, device) => {
    expect(await run(device, '2026-W47', '2026-W47')).toBe('이번 주 최고 777점 · 2위');
  });

  it.each([
    ['KST 주 경계 직전 기기 시각(일 23:59:59)', '2026-11-15T14:59:59Z'],
    ['KST 주 경계 직후 기기 시각(월 00:00:00)', '2026-11-15T15:00:00Z'],
  ])('%s: 판단은 서버 주(같음)라서 결과가 같다', async (_n, device) => {
    expect(await run(device, '2026-W47', '2026-W47')).toBe('이번 주 최고 777점 · 2위');
  });

  it('실제 지난주 판(서버 이번 주 W48, 제출 W47): 순위 없이 "지난주 기록으로 올렸어요"', async () => {
    expect(await run('2026-11-23T03:00:00Z', '2026-W48', '2026-W47')).toBe(
      '지난주 기록으로 올렸어요 · 최고 1,234점',
    );
  });

  it('기기 시계가 틀려도 지난주 판은 서버 기준으로만 지난주가 된다 (기기 시계만으로 지난주라고 하지 않는다)', async () => {
    // 기기 시계는 2년 뒤지만 서버 주와 제출 주가 같다 → 이번 주 순위
    expect(await run('2028-11-17T03:00:00Z', '2026-W47', '2026-W47')).toBe(
      '이번 주 최고 777점 · 2위',
    );
  });
});
