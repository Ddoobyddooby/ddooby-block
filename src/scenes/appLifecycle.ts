// 앱이 백그라운드로 갈 때·돌아올 때 (W4-03, PLAN 6.2). 웹의 visibilitychange와 같은 처리를 하도록 Phaser가 쓰는 숨김·보임 이벤트를 대신 알린다.
// 시계 멈춤·elapsedMs 저장(GameScene)·음악 멈춤(Music)은 이 이벤트를 이미 듣는다.
// 웹 숨김과 native 비활성은 별도 출처다 (appVisibility.ts): 둘 다 활성일 때만 이어진다.
// Phaser·Capacitor를 모르는 순수 함수: 둘 다 얇은 인터페이스로 받는다.
import { nativeChange } from './appVisibility';

export interface ListenerHandle {
  remove(): void | Promise<void>;
}

/** @capacitor/app의 필요한 부분 (addListener는 핸들을 Promise로 줄 수 있다) */
export interface AppLike {
  addListener(
    event: 'appStateChange',
    listener: (state: { isActive: boolean }) => void,
  ): Promise<ListenerHandle> | ListenerHandle;
  addListener(event: 'backButton', listener: () => void): Promise<ListenerHandle> | ListenerHandle;
}

function removeQuietly(handle: ListenerHandle): void {
  try {
    void Promise.resolve(handle.remove()).catch(() => undefined);
  } catch {
    // 이미 지워졌거나 실패: 정리는 최선만 한다
  }
}

/**
 * 리스너를 달고 해제 함수를 돌려준다. 핸들이 늦게 도착해도 해제 뒤에 도착하면 바로 지운다.
 * 해제 뒤에는 콜백이 와도 무시한다. addListener·remove가 실패해도 처리되지 않은 거부로 남기지 않는다.
 */
export function listen<A extends unknown[]>(
  add: (listener: (...args: A) => void) => Promise<ListenerHandle> | ListenerHandle,
  fn: (...args: A) => void,
): () => void {
  let disposed = false;
  let handle: ListenerHandle | null = null;
  void Promise.resolve()
    .then(() =>
      add((...args: A) => {
        if (!disposed) fn(...args);
      }),
    )
    .then((h) => {
      if (disposed) removeQuietly(h);
      else handle = h;
    })
    .catch(() => undefined);
  return () => {
    if (disposed) return;
    disposed = true;
    if (handle) removeQuietly(handle);
    handle = null;
  };
}

export interface LifecycleSink {
  hidden(): void;
  visible(): void;
}

/** 앱 상태가 바뀔 때마다 sink에 알린다. 같은 상태 반복은 걸러내고, 웹이 숨겨져 있으면 복귀를 알리지 않는다. 해제 함수를 돌려준다 */
export function bridgeAppState(
  app: AppLike,
  sink: LifecycleSink,
  isWebHidden: () => boolean,
): () => void {
  return listen<[{ isActive: boolean }]>(
    (l) => app.addListener('appStateChange', l),
    ({ isActive }) => {
      const change = nativeChange(isActive, isWebHidden());
      if (change === 'hidden') sink.hidden();
      else if (change === 'visible') sink.visible();
    },
  );
}
