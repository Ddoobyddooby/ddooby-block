import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAppBridge, type BackScene, type GameLike } from '../../src/scenes/appBridge';
import type { AppLike } from '../../src/scenes/appLifecycle';
import { resetNativeVisibility } from '../../src/scenes/appVisibility';

function setup() {
  const listeners: Record<string, (data?: unknown) => void> = {};
  const remove = vi.fn();
  const exitApp = vi.fn();
  const app = {
    exitApp,
    addListener: (event: string, fn: (data?: unknown) => void) => {
      listeners[event] = fn;
      return Promise.resolve({ remove });
    },
  } as unknown as AppLike & { exitApp(): void };
  const emitted: string[] = [];
  let destroy: () => void = () => undefined;
  let scenes: BackScene[] = [];
  const makeGame = (): GameLike => ({
    events: {
      emit: (e) => emitted.push(e),
      once: (e, fn) => {
        if (e === 'destroy') destroy = fn;
      },
    },
    scene: { getScenes: () => scenes },
  });
  const deps = (native = true, preparing = false) => ({
    app,
    isNative: () => native,
    isPreparing: () => preparing,
    isWebHidden: () => false,
  });
  return {
    app,
    remove,
    exitApp,
    emitted,
    listeners,
    makeGame,
    deps,
    destroy: () => destroy(),
    setScenes: (s: BackScene[]) => (scenes = s),
  };
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
const scene = (key: string, extra: Partial<BackScene> = {}): BackScene => ({
  sys: { settings: { key } },
  ...extra,
});

describe('registerAppBridge', () => {
  beforeEach(resetNativeVisibility);

  it('웹(native 아님)에서는 등록 0회', async () => {
    const s = setup();
    registerAppBridge(s.makeGame(), s.deps(false));
    await flush();
    expect(Object.keys(s.listeners)).toEqual([]);
  });

  it('등록 → destroy → 두 핸들 remove 2회 → 옛 콜백 무효 → 재등록', async () => {
    const s = setup();
    registerAppBridge(s.makeGame(), s.deps());
    await flush();
    const oldBack = s.listeners['backButton'];
    const oldState = s.listeners['appStateChange'];
    s.destroy();
    await flush();
    expect(s.remove).toHaveBeenCalledTimes(2);

    // 옛 콜백은 아무 일도 하지 않는다 (파괴된 Game을 건드려 터지지 않는다)
    s.setScenes([scene('Menu', { requestExit: () => true })]);
    oldBack?.();
    oldState?.({ isActive: false });
    expect(s.exitApp).not.toHaveBeenCalled();
    expect(s.emitted).toEqual([]);

    // 새 Game은 다시 등록된다
    registerAppBridge(s.makeGame(), s.deps());
    await flush();
    expect(s.listeners['backButton']).not.toBe(oldBack);
    s.listeners['appStateChange']?.({ isActive: false });
    expect(s.emitted).toEqual(['hidden']);
    s.destroy();
  });

  it('destroy 뒤 native 비활성 상태가 남지 않는다', async () => {
    const s = setup();
    registerAppBridge(s.makeGame(), s.deps());
    await flush();
    s.listeners['appStateChange']?.({ isActive: false });
    s.destroy();
    const { nativeBlocksResume } = await import('../../src/scenes/appVisibility');
    expect(nativeBlocksResume()).toBe(false);
  });

  it('이미 등록돼 있으면 두 번째 등록은 무시한다', async () => {
    const s = setup();
    registerAppBridge(s.makeGame(), s.deps());
    await flush();
    const first = s.listeners['backButton'];
    registerAppBridge(s.makeGame(), s.deps());
    await flush();
    expect(s.listeners['backButton']).toBe(first);
    s.destroy();
  });
});

describe('메뉴 뒤로 가기 종료', () => {
  beforeEach(resetNativeVisibility);

  async function menuBack(requestExit: () => boolean, hasOverlay = false, preparing = false) {
    const s = setup();
    const closeOverlay = vi.fn();
    s.setScenes([scene('Menu', { requestExit, hasOverlay: () => hasOverlay, closeOverlay })]);
    registerAppBridge(s.makeGame(), s.deps(true, preparing));
    await flush();
    s.listeners['backButton']?.();
    const result = { exitApp: s.exitApp, closeOverlay };
    s.destroy();
    return result;
  }

  it('정상 메뉴에서는 확인 없이 바로 종료', async () => {
    const r = await menuBack(() => true);
    expect(r.exitApp).toHaveBeenCalledTimes(1);
  });

  it('버튼 누름 잠금이 걸려 있으면 종료하지 않는다', async () => {
    const r = await menuBack(() => false);
    expect(r.exitApp).not.toHaveBeenCalled();
  });

  it('새 판 준비 중에는 종료하지 않는다', async () => {
    const r = await menuBack(() => true, false, true);
    expect(r.exitApp).not.toHaveBeenCalled();
  });

  it('창이 떠 있으면 창만 닫는다', async () => {
    const r = await menuBack(() => true, true);
    expect(r.closeOverlay).toHaveBeenCalledTimes(1);
    expect(r.exitApp).not.toHaveBeenCalled();
  });
});
