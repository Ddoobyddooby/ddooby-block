// 이벤트 재생 루프 (PLAN 6.1). Phaser 없이 host로 받아서 테스트할 수 있다 (tests/scenes/playback.test.ts).
// 연출을 기다리는 await는 일시정지 중에도 외부 요인(화면 크기 변경으로 트윈이 멈춤 등)으로 풀릴 수 있다.
// 그래서 await 뒤에 "버린다 / 기다린다 / 계속한다"를 여기서 정한다.

export interface PlaybackHost {
  /** 같은 판이고 씬이 끝나지 않았다. 일시정지는 끝난 것이 아니다 */
  isCurrent(): boolean;
  isPaused(): boolean;
  /** 일시정지가 풀리거나 씬이 끝나면 풀린다. 풀린 뒤 isCurrent·isPaused를 다시 본다 */
  waitResume(): Promise<void>;
}

/**
 * 이벤트를 순서대로 handle한다. 끝까지 재생했으면 true, 판이 바뀌거나 씬이 끝나 버렸으면 false.
 * 일시정지 중에 await가 풀려도 다음 이벤트로 넘어가지 않고 [계속]까지 기다린다.
 */
export async function playEvents<E>(
  events: readonly E[],
  handle: (event: E) => Promise<void> | void,
  host: PlaybackHost,
): Promise<boolean> {
  for (const event of events) {
    await handle(event);
    if (!(await settle(host))) return false;
  }
  return host.isCurrent();
}

/** await 뒤: 일시정지면 풀릴 때까지 기다린다. 계속해도 되면 true, 버려야 하면 false */
async function settle(host: PlaybackHost): Promise<boolean> {
  while (host.isCurrent() && host.isPaused()) await host.waitResume();
  return host.isCurrent();
}
