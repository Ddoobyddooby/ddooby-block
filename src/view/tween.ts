import type Phaser from 'phaser';

/**
 * 트윈이 끝나면 풀리는 Promise. 중간에 멈춰도(`stopTweensOf`) 풀리고, 씬이 끝나도 풀린다.
 * 그래서 await 뒤에는 씬이 아직 살아 있는지 호출한 쪽이 확인한다.
 * `scene.tweens.killTweensOf`는 이벤트 없이 지워서 Promise가 풀리지 않는다. 대신 `stopTweensOf`를 쓴다.
 */
export function tweenAsync(
  scene: Phaser.Scene,
  config: Phaser.Types.Tweens.TweenBuilderConfig,
): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      scene.events.off('shutdown', done);
      resolve();
    };
    const tween = scene.tweens.add(config);
    tween.once('complete', done);
    tween.once('stop', done);
    scene.events.once('shutdown', done);
  });
}

/** 대상에 걸린 트윈을 멈춘다 (`tweenAsync`의 Promise가 풀린다). 값은 멈춘 자리에 남는다 */
export function stopTweensOf(scene: Phaser.Scene, target: object): void {
  for (const tween of scene.tweens.getTweensOf(target)) tween.stop();
}
