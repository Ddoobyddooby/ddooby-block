import { afterEach, describe, expect, it } from 'vitest';
import type { StartedRun } from '../../src/online';
import { requestNewGame, resetNewGameFlow } from '../../src/scenes/newRun';
import { handleMenuButton, type MenuHost } from '../../src/scenes/screenActions';
import { beginPress, type PressLock } from '../../src/view/ui/pressLock';
import { deferred } from '../online/fakeBackend';

afterEach(() => resetNewGameFlow());

function host(over: Partial<MenuHost> = {}) {
  const calls = { ranking: 0, startRun: 0, startGame: 0, startResume: 0, redraw: 0, resumeData: 0 };
  const lock: PressLock = { pressed: false };
  const h: MenuHost = {
    lock,
    startRun: async () => {
      calls.startRun += 1;
      return null;
    },
    skipOnline: () => false,
    showWait: () => () => undefined,
    startGame: () => {
      calls.startGame += 1;
    },
    resumeData: () => {
      calls.resumeData += 1;
      return { resume: {} as never };
    },
    startResume: () => {
      calls.startResume += 1;
    },
    redraw: () => {
      calls.redraw += 1;
    },
    openRanking: () => {
      calls.ranking += 1;
    },
    ...over,
  };
  return { h, calls, lock };
}

describe('메뉴 [주간 랭킹]', () => {
  it('누르면 랭킹 화면으로만 간다: 새 판 요청·이어하기·다시 그리기 없음, 잠금은 떠나는 동안 유지', () => {
    const { h, calls, lock } = host();
    beginPress(lock);
    handleMenuButton('ranking', h);
    expect(calls).toEqual({
      ranking: 1,
      startRun: 0,
      startGame: 0,
      startResume: 0,
      redraw: 0,
      resumeData: 0, // 저장된 판은 읽지도 건드리지도 않는다 (이어하기 유무와 무관)
    });
    expect(lock.pressed).toBe(true);
  });

  it('새 판 준비 중에는 무시하고 잠금을 풀어 준다 (준비 중 버튼 무시 규칙)', async () => {
    const gate = deferred<StartedRun | null>();
    const started: string[] = [];
    requestNewGame({
      owner: 'Menu',
      startRun: () => gate.promise,
      skipOnline: () => false,
      begin: () => started.push('begin'),
    });
    const { h, calls, lock } = host();
    beginPress(lock);
    handleMenuButton('ranking', h);
    expect(calls.ranking).toBe(0);
    expect(lock.pressed).toBe(false);
    // 준비가 끝난 뒤에는 다시 눌린다
    gate.resolve(null);
    await new Promise((r) => setTimeout(r, 0));
    expect(started).toEqual(['begin']);
    handleMenuButton('ranking', h);
    expect(calls.ranking).toBe(1);
  });

  it('[새 게임]·[이어하기] 동작은 그대로', async () => {
    const { h, calls } = host();
    handleMenuButton('resume', h);
    expect(calls.startResume).toBe(1);
    handleMenuButton('new', h);
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.startRun).toBe(1);
  });
});
