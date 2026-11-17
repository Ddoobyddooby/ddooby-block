import { afterEach, describe, expect, it } from 'vitest';
import { lateThemeAction } from '../../src/scenes/lateTheme';
import {
  cancelNewGame,
  isPreparing,
  requestNewGame,
  resetNewGameFlow,
} from '../../src/scenes/newRun';
import type { GameStartData } from '../../src/scenes/gameStart';
import type { StartedRun } from '../../src/online';
import { deferred } from '../online/fakeBackend';

// 지적 2 회귀: 새 게임을 준비하는 중에 저장 테마가 늦게 도착해도 메뉴를 다시 만들지 않아 요청이 취소되지 않는다.
const RUN: StartedRun = { runId: '123e4567-e89b-42d3-a456-426614174000', seed: 4000000000 };
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

afterEach(() => resetNewGameFlow());

function menuPress() {
  const begun: GameStartData[] = [];
  const response = deferred<StartedRun | null>();
  requestNewGame({
    owner: 'Menu',
    startRun: () => response.promise,
    skipOnline: () => false,
    begin: (d) => begun.push(d),
  });
  return { begun, response };
}

describe('늦은 저장 테마와 준비 중인 새 게임', () => {
  it('lateThemeAction: 준비 중이면 다시 만들지 않고, 아니고 테마가 다르면 다시 만든다', () => {
    expect(lateThemeAction(true, true)).toBe('redraw');
    expect(lateThemeAction(false, true)).toBe('restart');
    expect(lateThemeAction(false, false)).toBe('redraw');
    expect(lateThemeAction(true, false)).toBe('redraw');
  });

  it('준비 중 읽기 완료·테마 차이: 다시 만들지 않으므로 응답에서 전환이 정확히 1회 일어난다', async () => {
    const { begun, response } = menuPress();
    expect(isPreparing()).toBe(true);
    // 읽기 완료 + 저장 테마 차이: 메뉴가 고르는 동작
    const action = lateThemeAction(isPreparing(), true);
    if (action === 'restart') cancelNewGame('Menu'); // 다시 만들면 SHUTDOWN이 하는 일 (여기 오면 안 된다)
    expect(action).toBe('redraw');
    response.resolve(RUN);
    await tick();
    expect(begun).toEqual([{ online: RUN }]);
    expect(isPreparing()).toBe(false);
  });

  it('이 변경 전의 동작(준비 중에도 다시 만듦)은 요청을 취소해 전환이 0회다 — 회귀 방지의 근거', async () => {
    const { begun, response } = menuPress();
    cancelNewGame('Menu'); // 준비 중 restart의 SHUTDOWN
    response.resolve(RUN);
    await tick();
    expect(begun).toEqual([]);
  });

  it('실제로 화면을 떠나면(SHUTDOWN) 취소하고 옛 응답은 새 요청을 시작시키지 않는다', async () => {
    const { begun, response } = menuPress();
    cancelNewGame('Menu');
    expect(isPreparing()).toBe(false);
    response.resolve(RUN);
    await tick();
    expect(begun).toEqual([]);
  });
});
