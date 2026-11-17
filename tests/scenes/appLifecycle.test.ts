import { describe, expect, it, vi } from 'vitest';
import { bridgeAppState, type AppStateSource } from '../../src/scenes/appLifecycle';

/** 가짜 App: emit으로 appStateChange를 흉내 낸다 */
function fakeApp() {
  let listener: ((state: { isActive: boolean }) => void) | null = null;
  const remove = vi.fn();
  const app: AppStateSource = {
    addListener: (_event, fn) => {
      listener = fn;
      return Promise.resolve({ remove });
    },
  };
  return { app, remove, emit: (isActive: boolean) => listener?.({ isActive }) };
}

describe('bridgeAppState (앱 백그라운드·복귀)', () => {
  it('백그라운드로 가면 hidden, 돌아오면 visible', () => {
    const { app, emit } = fakeApp();
    const sink = { hidden: vi.fn(), visible: vi.fn() };
    bridgeAppState(app, sink);
    emit(false);
    expect(sink.hidden).toHaveBeenCalledTimes(1);
    emit(true);
    expect(sink.visible).toHaveBeenCalledTimes(1);
  });

  it('같은 상태가 거듭 와도 한 번만 알린다', () => {
    const { app, emit } = fakeApp();
    const sink = { hidden: vi.fn(), visible: vi.fn() };
    bridgeAppState(app, sink);
    emit(true); // 처음부터 활성: 알릴 것이 없다
    emit(false);
    emit(false);
    expect(sink.hidden).toHaveBeenCalledTimes(1);
    expect(sink.visible).not.toHaveBeenCalled();
  });

  it('해제 함수는 리스너를 지운다', async () => {
    const { app, remove } = fakeApp();
    const off = bridgeAppState(app, { hidden: vi.fn(), visible: vi.fn() });
    off();
    await Promise.resolve();
    await Promise.resolve();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
