import { afterEach, describe, expect, it } from 'vitest';
import type { StartedRun } from '../../src/online';
import { chooseSeedAndRun, skipsRanking, type GameStartData } from '../../src/scenes/gameStart';
import { requestNewGame, resetNewGameFlow, type NewGameDeps } from '../../src/scenes/newRun';
import type { ResumableRun } from '../../src/storage/persistence';
import { deferred } from '../online/fakeBackend';

const RUN: StartedRun = { runId: '123e4567-e89b-42d3-a456-426614174000', seed: 4000000000 };

function flow(over: Partial<NewGameDeps> = {}) {
  const begun: GameStartData[] = [];
  const log: string[] = [];
  let alive = true;
  const deps: NewGameDeps = {
    startRun: async () => RUN,
    skipOnline: () => false,
    isAlive: () => alive,
    showWait: () => {
      log.push('wait-show');
      return () => log.push('wait-hide');
    },
    begin: (data) => begun.push(data),
    ...over,
  };
  return { deps, begun, log, close: () => (alive = false) };
}
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

afterEach(() => resetNewGameFlow());

describe('새 판 시작 공통 경로', () => {
  it('서버 run을 받으면 그 seed·runId로 시작한다 (준비 표시를 보였다가 지운다)', async () => {
    const f = flow();
    expect(requestNewGame(f.deps)).toBe(true);
    await tick();
    expect(f.begun).toEqual([{ online: RUN }]);
    expect(f.log).toEqual(['wait-show', 'wait-hide']);
  });

  it('run을 못 받으면(null) 오프라인 판으로 바로 시작한다 (빈 데이터)', async () => {
    const f = flow({ startRun: async () => null });
    requestNewGame(f.deps);
    await tick();
    expect(f.begun).toEqual([{}]);
  });

  it('startRun이 throw·거부돼도 오프라인 판으로 시작한다 (게임을 막지 않는다)', async () => {
    const a = flow({
      startRun: () => {
        throw new Error('sync');
      },
    });
    requestNewGame(a.deps);
    await tick();
    expect(a.begun).toEqual([{}]);
    resetNewGameFlow();
    const b = flow({ startRun: () => Promise.reject(new Error('async')) });
    requestNewGame(b.deps);
    await tick();
    expect(b.begun).toEqual([{}]);
  });

  it('?seed·DEV ?fill이면 서버 run을 받지 않고 즉시 시작한다 (startRun 호출 없음)', async () => {
    let called = 0;
    const f = flow({
      skipOnline: () => true,
      startRun: async () => {
        called += 1;
        return RUN;
      },
    });
    requestNewGame(f.deps);
    expect(f.begun).toEqual([{}]); // 기다리지 않는다
    await tick();
    expect(called).toBe(0);
    expect(f.log).toEqual([]);
  });

  it('준비 중에 다시 눌러도(연타·다시 그려진 버튼) 두 번째 요청은 무시한다: 시작은 한 번, startRun도 한 번', async () => {
    const hold = deferred<StartedRun | null>();
    let called = 0;
    const f = flow({
      startRun: () => {
        called += 1;
        return hold.promise;
      },
    });
    expect(requestNewGame(f.deps)).toBe(true);
    expect(requestNewGame(f.deps)).toBe(false);
    expect(requestNewGame(flow().deps)).toBe(false); // 다른 화면에서 눌러도 앱 전체에서 하나
    hold.resolve(RUN);
    await tick();
    expect(f.begun).toEqual([{ online: RUN }]);
    expect(called).toBe(1);
    // 끝나면 다시 요청할 수 있다
    expect(requestNewGame(flow().deps)).toBe(true);
  });

  it('기다리는 사이 화면이 끝났으면(메뉴로 이동 등) 늦은 응답으로 새 판을 시작하지 않는다', async () => {
    const hold = deferred<StartedRun | null>();
    const f = flow({ startRun: () => hold.promise });
    requestNewGame(f.deps);
    f.close();
    hold.resolve(RUN);
    await tick();
    expect(f.begun).toEqual([]);
    expect(f.log).toEqual(['wait-show', 'wait-hide']);
    // 준비 중 표시는 풀려 다음 요청을 받는다
    expect(requestNewGame(flow().deps)).toBe(true);
  });
});

describe('skipsRanking', () => {
  it('?seed=N이면 서버 run을 받지 않는다 (배포본 포함)', () => {
    expect(skipsRanking('?seed=7', false)).toBe(true);
    expect(skipsRanking('?seed=7', true)).toBe(true);
    expect(skipsRanking('?seed=abc', false)).toBe(false);
  });
  it('DEV ?fill=만 받지 않는다 (프로덕션에서는 ?fill이 무시되므로 run을 받는다)', () => {
    expect(skipsRanking('?fill=line1', true)).toBe(true);
    expect(skipsRanking('?fill=line1', false)).toBe(false);
    expect(skipsRanking('', true)).toBe(false);
    expect(skipsRanking('?over', true)).toBe(false);
  });
});

describe('chooseSeedAndRun: 이어하기 > 서버 새 판 > ?seed > 무작위', () => {
  const resume = {
    saved: { seed: 11, runId: 'saved-run' },
  } as unknown as ResumableRun;
  const random = () => 99;

  it('이어하기는 저장된 seed·runId 그대로 (서버 seed·URL seed가 있어도)', () => {
    expect(chooseSeedAndRun({ resume, online: RUN, urlSeed: 5, random })).toEqual({
      seed: 11,
      runId: 'saved-run',
    });
    const offline = { saved: { seed: 12, runId: null } } as unknown as ResumableRun;
    expect(chooseSeedAndRun({ resume: offline, online: RUN, urlSeed: 5, random })).toEqual({
      seed: 12,
      runId: null,
    });
  });

  it('서버가 발급한 새 판은 서버 seed·runId (URL seed·무작위가 덮지 않는다)', () => {
    expect(chooseSeedAndRun({ resume: null, online: RUN, urlSeed: 5, random })).toEqual(RUN);
  });

  it('?seed 판과 무작위 판은 runId가 없다 (랭킹 대상 아님)', () => {
    expect(chooseSeedAndRun({ resume: null, online: null, urlSeed: 5, random })).toEqual({
      seed: 5,
      runId: null,
    });
    expect(chooseSeedAndRun({ resume: null, online: null, urlSeed: 0, random })).toEqual({
      seed: 0,
      runId: null,
    });
    expect(chooseSeedAndRun({ resume: null, online: null, urlSeed: null, random })).toEqual({
      seed: 99,
      runId: null,
    });
  });
});
