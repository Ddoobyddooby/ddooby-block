import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bridgeAppState, listen, type AppLike } from '../../src/scenes/appLifecycle';
import { resetNativeVisibility } from '../../src/scenes/appVisibility';

/** 가짜 App: 핸들을 늦게 줄 수 있다 */
function fakeApp(opts: { lateHandle?: boolean; failAdd?: boolean; failRemove?: boolean } = {}) {
  const listeners: Record<string, (data?: never) => void> = {};
  const remove = vi.fn(() => (opts.failRemove ? Promise.reject(new Error('x')) : undefined));
  let release: () => void = () => undefined;
  const app = {
    addListener: (event: string, fn: (data?: never) => void) => {
      if (opts.failAdd) return Promise.reject(new Error('add'));
      listeners[event] = fn;
      if (opts.lateHandle)
        return new Promise<{ remove: typeof remove }>((resolve) => {
          release = () => resolve({ remove });
        });
      return Promise.resolve({ remove });
    },
  } as unknown as AppLike;
  return {
    app,
    remove,
    release: () => release(),
    state: (isActive: boolean) =>
      (listeners['appStateChange'] as unknown as (s: { isActive: boolean }) => void)({ isActive }),
  };
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('bridgeAppState (앱 백그라운드·복귀)', () => {
  beforeEach(resetNativeVisibility);

  it('백그라운드로 가면 hidden, 돌아오면 visible', async () => {
    const f = fakeApp();
    const sink = { hidden: vi.fn(), visible: vi.fn() };
    bridgeAppState(f.app, sink, () => false);
    await flush();
    f.state(false);
    expect(sink.hidden).toHaveBeenCalledTimes(1);
    f.state(true);
    expect(sink.visible).toHaveBeenCalledTimes(1);
  });

  it('같은 상태가 거듭 와도 한 번만 알린다', async () => {
    const f = fakeApp();
    const sink = { hidden: vi.fn(), visible: vi.fn() };
    bridgeAppState(f.app, sink, () => false);
    await flush();
    f.state(true);
    f.state(false);
    f.state(false);
    expect(sink.hidden).toHaveBeenCalledTimes(1);
    expect(sink.visible).not.toHaveBeenCalled();
  });

  it('웹이 숨겨져 있으면 복귀를 알리지 않는다', async () => {
    const f = fakeApp();
    const sink = { hidden: vi.fn(), visible: vi.fn() };
    bridgeAppState(f.app, sink, () => true);
    await flush();
    f.state(false);
    f.state(true);
    expect(sink.visible).not.toHaveBeenCalled();
  });
});

describe('listen (리스너 수명)', () => {
  it('해제하면 핸들을 지우고, 이후 콜백은 무시한다', async () => {
    const f = fakeApp();
    const sink = { hidden: vi.fn(), visible: vi.fn() };
    const off = bridgeAppState(f.app, sink, () => false);
    await flush();
    off();
    await flush();
    expect(f.remove).toHaveBeenCalledTimes(1);
    f.state(false);
    expect(sink.hidden).not.toHaveBeenCalled();
    off(); // 두 번 불러도 한 번만 지운다
    await flush();
    expect(f.remove).toHaveBeenCalledTimes(1);
  });

  it('핸들이 해제 뒤에 늦게 도착해도 지운다', async () => {
    const f = fakeApp({ lateHandle: true });
    const off = listen(
      (l) => f.app.addListener('backButton', l as () => void),
      () => undefined,
    );
    await flush();
    off();
    expect(f.remove).not.toHaveBeenCalled();
    f.release();
    await flush();
    expect(f.remove).toHaveBeenCalledTimes(1);
  });

  it('addListener·remove가 실패해도 처리되지 않은 거부가 없다', async () => {
    const f1 = fakeApp({ failAdd: true });
    listen(
      (l) => f1.app.addListener('backButton', l as () => void),
      () => undefined,
    )();
    const f2 = fakeApp({ failRemove: true });
    const off = listen(
      (l) => f2.app.addListener('backButton', l as () => void),
      () => undefined,
    );
    await flush();
    off();
    await flush();
    expect(f2.remove).toHaveBeenCalledTimes(1);
  });
});
