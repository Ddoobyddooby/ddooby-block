import { describe, expect, it } from 'vitest';
import type { RankingResult } from '../../src/online';
import {
  RankingController,
  type RankingControllerHost,
  type RankingScreen,
} from '../../src/scenes/rankingController';
import { deferred } from '../online/fakeBackend';

const okResult = (
  n: number,
  over: Partial<Extract<RankingResult, { kind: 'ok' }>> = {},
): RankingResult => ({
  kind: 'ok',
  weekKey: '2026-W47',
  top: Array.from({ length: n }, (_, i) => ({
    seq: i + 1,
    rank: i + 1,
    nickname: `u${i + 1}`,
    tag: i + 1,
    score: 100 - i,
    isMe: false,
  })),
  around: [],
  me: null,
  userId: 'a',
  ...over,
});

/** 가짜 host: 조회는 deferred로 직접 끝내고, 타이머는 직접 울린다 */
function world(opts: { wait?: () => Promise<void> | null } = {}) {
  const fetches: ReturnType<typeof deferred<RankingResult>>[] = [];
  const timers: { ms: number; fn: () => void; cancelled: boolean }[] = [];
  const screens: RankingScreen[] = [];
  const host: RankingControllerHost = {
    fetchRanking() {
      const d = deferred<RankingResult>();
      fetches.push(d);
      return d.promise;
    },
    waitSubmission: opts.wait ?? (() => null),
    after(ms, fn) {
      const t = { ms, fn, cancelled: false };
      timers.push(t);
      return () => {
        t.cancelled = true;
      };
    },
    loadingMs: 300,
    onScreen: (s) => screens.push(s),
  };
  const fire = (i: number) => {
    const t = timers[i];
    if (t && !t.cancelled) t.fn();
  };
  return { host, fetches, timers, screens, fire };
}
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const last = (s: RankingScreen[]): RankingScreen | undefined => s.at(-1);

describe('RankingController: 조회와 상태', () => {
  it('열면 조회하고, 0.3초가 넘어야 "불러오는 중"이 보이며, 응답이 오면 목록이 된다', async () => {
    const w = world();
    const c = new RankingController(w.host);
    c.open();
    expect(w.fetches).toHaveLength(1);
    expect(last(w.screens)).toEqual({ phase: 'loading', visible: false });
    expect(w.timers[0]?.ms).toBe(300);
    w.fire(0);
    expect(last(w.screens)).toEqual({ phase: 'loading', visible: true });
    w.fetches[0]?.resolve(okResult(3));
    await tick();
    const screen = last(w.screens);
    expect(screen?.phase === 'view' && screen.view.state).toBe('list');
    expect(screen?.phase === 'view' && screen.weekKey).toBe('2026-W47');
    expect(w.timers[0]?.cancelled).toBe(true);
  });

  it('빠른 응답이면 "불러오는 중"이 한 번도 보이지 않는다 (타이머 취소)', async () => {
    const w = world();
    new RankingController(w.host).open();
    w.fetches[0]?.resolve(okResult(1));
    await tick();
    w.fire(0); // 취소된 타이머는 울려도 아무 일 없다
    expect(w.screens.filter((s) => s.phase === 'loading' && s.visible)).toEqual([]);
  });

  it('조회가 거부(throw)돼도 error 화면으로 끝난다', async () => {
    const w = world();
    const c = new RankingController(w.host);
    c.open();
    w.fetches[0]?.reject(new Error('x'));
    await tick();
    expect(last(w.screens)).toMatchObject({
      phase: 'view',
      view: { state: 'error' },
      weekKey: null,
    });
    // 동기 예외도 안전
    const c2 = new RankingController({
      ...w.host,
      fetchRanking: () => {
        throw new Error('sync');
      },
    });
    c2.open();
    await tick();
    expect(last(w.screens)).toMatchObject({ view: { state: 'error' } });
  });

  it('A 조회 → [새로고침] B: B가 먼저 오고 A가 늦게 와도 B만 보인다', async () => {
    const w = world();
    const c = new RankingController(w.host);
    c.open();
    c.reload();
    expect(w.fetches).toHaveLength(2);
    w.fetches[1]?.resolve(okResult(2));
    await tick();
    const shown = w.screens.length;
    w.fetches[0]?.resolve(okResult(5)); // 옛 응답
    await tick();
    expect(w.screens).toHaveLength(shown); // 아무것도 바뀌지 않았다
    const s = last(w.screens);
    expect(s?.phase === 'view' && s.view.state === 'list' && s.view.items).toHaveLength(2);
  });

  it('새 조회가 시작되면 옛 조회의 타이머는 취소되고, 옛 타이머가 새 로딩 상태를 지우지 못한다', async () => {
    const w = world();
    const c = new RankingController(w.host);
    c.open();
    c.reload();
    expect(w.timers[0]?.cancelled).toBe(true);
    w.fire(0); // 옛 타이머가 울려도 무시
    expect(last(w.screens)).toEqual({ phase: 'loading', visible: false });
    w.fire(1);
    expect(last(w.screens)).toEqual({ phase: 'loading', visible: true });
    // 옛 응답이 와도 새 조회의 "불러오는 중"을 지우지 않는다
    w.fetches[0]?.resolve(okResult(9));
    await tick();
    expect(last(w.screens)).toEqual({ phase: 'loading', visible: true });
    w.fetches[1]?.resolve(okResult(1));
    await tick();
    expect(last(w.screens)?.phase).toBe('view');
  });

  it('화면을 떠나면(close) 기다리던 응답·타이머가 버려지고 이후 호출은 아무 일도 하지 않는다', async () => {
    const w = world();
    const c = new RankingController(w.host);
    c.open();
    const before = w.screens.length;
    c.close();
    w.fire(0);
    w.fetches[0]?.resolve(okResult(3));
    await tick();
    expect(w.screens).toHaveLength(before);
    c.reload();
    expect(w.fetches).toHaveLength(1);
  });

  it('같은 씬 객체가 다시 열려도(새 컨트롤러) 옛 컨트롤러의 늦은 응답이 새 화면을 건드리지 않는다', async () => {
    const w = world();
    const first = new RankingController(w.host);
    first.open(); // 요청 번호가 새 컨트롤러와 같은 1이어도
    first.close();
    const second = new RankingController(w.host);
    second.open();
    w.fetches[1]?.resolve(okResult(2));
    await tick();
    const shown = w.screens.length;
    w.fetches[0]?.resolve(okResult(7)); // 옛 응답
    await tick();
    expect(w.screens).toHaveLength(shown);
    const s = last(w.screens);
    expect(s?.phase === 'view' && s.view.state === 'list' && s.view.items).toHaveLength(2);
  });

  it('offline 응답은 상태 offline (다시 시도로 새 요청)', async () => {
    const w = world();
    const c = new RankingController(w.host);
    c.open();
    w.fetches[0]?.resolve({ kind: 'offline' });
    await tick();
    expect(last(w.screens)).toMatchObject({ view: { state: 'offline' } });
    c.reload();
    expect(w.fetches).toHaveLength(2);
    expect(last(w.screens)).toEqual({ phase: 'loading', visible: false });
  });
});

describe('RankingController: R19 — 제출 중 [메뉴] → [주간 랭킹]', () => {
  it('진행 중인 제출이 있으면 열 때 한 번 조회하고, 제출이 끝난 뒤 한 번 더 조회한다 (정확히 2번)', async () => {
    const submission = deferred<void>();
    const w = world({ wait: () => submission.promise });
    new RankingController(w.host).open();
    expect(w.fetches).toHaveLength(1);
    await tick();
    expect(w.fetches).toHaveLength(1); // 제출 중에는 더 부르지 않는다
    submission.resolve();
    await tick();
    expect(w.fetches).toHaveLength(2);
  });

  it('제출이 끝나기 전에 돌아가기(close)하면 끝난 뒤에도 조회하지 않는다 (돌아가기는 막지 않는다)', async () => {
    const submission = deferred<void>();
    const w = world({ wait: () => submission.promise });
    const c = new RankingController(w.host);
    c.open();
    c.close();
    submission.resolve();
    await tick();
    expect(w.fetches).toHaveLength(1);
  });

  it('제출 전에 온 옛 목록 응답이 제출 뒤 갱신보다 늦게 와도 갱신된 목록이 이긴다', async () => {
    const submission = deferred<void>();
    const w = world({ wait: () => submission.promise });
    new RankingController(w.host).open();
    submission.resolve();
    await tick();
    w.fetches[1]?.resolve(okResult(4)); // 제출 뒤 조회: 방금 기록 포함
    await tick();
    w.fetches[0]?.resolve(okResult(3)); // 제출 전 조회: 방금 기록 없음
    await tick();
    const s = last(w.screens);
    expect(s?.phase === 'view' && s.view.state === 'list' && s.view.items).toHaveLength(4);
  });

  it('진행 중인 제출이 없으면 조회는 한 번뿐', async () => {
    const w = world();
    new RankingController(w.host).open();
    await tick();
    expect(w.fetches).toHaveLength(1);
  });
});
