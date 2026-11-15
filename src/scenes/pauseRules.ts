// 일시정지 규칙 (PLAN 6.1). Phaser 없는 순수 함수. ddooby-pang의 pauseRules에서 복사해 맞췄다.

export type PauseButton = 'resume' | 'retry' | 'menu';

/** 게임 오버거나 이미 멈췄으면 일시정지하지 않는다. 이벤트 재생 중에는 된다 */
export function canPause({ over, paused }: { over: boolean; paused: boolean }): boolean {
  return !over && !paused;
}

/** [계속] [다시 하기] [메뉴] 순서 */
export function pauseButtons(): PauseButton[] {
  return ['resume', 'retry', 'menu'];
}

/** [다시 하기]를 누르면 PauseScene이 Game 씬에 보내는 이벤트. 그 판의 저장된 run을 지운다 */
export const RETRY_EVENT = 'retry';
