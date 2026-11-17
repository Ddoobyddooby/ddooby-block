// 앱이 백그라운드로 갈 때·돌아올 때 (W4-03, PLAN 6.2). 웹의 visibilitychange와 같은 처리를 하도록 Phaser가 쓰는 숨김·보임 이벤트를 대신 알린다.
// 시계 멈춤·elapsedMs 저장(GameScene)·음악 멈춤(Music)은 이 이벤트를 이미 듣고 있다. 웹 visibilitychange와 같이 와도 안전하다:
// 각 처리가 '숨김' 이유를 집합으로 다뤄 두 번 막아도 한 번으로 친다 (playClock.ts, musicRules의 hold).
// Phaser·Capacitor를 모르는 순수 함수: 둘 다 얇은 인터페이스로 받는다.

export interface AppStateSource {
  addListener(
    event: 'appStateChange',
    listener: (state: { isActive: boolean }) => void,
  ): Promise<{ remove(): void | Promise<void> }> | { remove(): void | Promise<void> };
}

export interface LifecycleSink {
  hidden(): void;
  visible(): void;
}

/** 앱 상태가 바뀔 때마다 sink에 알린다. 이미 같은 상태면 다시 알리지 않는다. 해제 함수를 돌려준다 */
export function bridgeAppState(app: AppStateSource, sink: LifecycleSink): () => void {
  let active = true;
  const handle = app.addListener('appStateChange', ({ isActive }) => {
    if (isActive === active) return;
    active = isActive;
    if (isActive) sink.visible();
    else sink.hidden();
  });
  return () => {
    void Promise.resolve(handle).then((h) => h.remove());
  };
}
