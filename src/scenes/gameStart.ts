// Game 씬을 시작할 때 넘기는 데이터와 DEV 진입 옵션.
import type { ResumableRun } from '../storage/persistence';

/** `scene.start('Game', data)`. resume이 있으면 새 판 대신 그 판을 이어서 시작한다 (메뉴의 [이어하기]도 같은 길) */
export interface GameStartData {
  resume?: ResumableRun;
}

/**
 * DEV 전용 `?resume`: 메뉴를 거치지 않고 저장된 판으로 바로 이어하는 진입 (자동 확인용).
 * 프로덕션 빌드(dev=false)에서는 무시한다 (호출부의 `import.meta.env.DEV`와 함께 빌드에서 지워진다).
 */
export function hasResumeParam(search: string, dev: boolean): boolean {
  return dev && new URLSearchParams(search).has('resume');
}

/**
 * 새 판을 시작할 때 `scene.start('Game', newGameData())`로 넘긴다.
 * Phaser는 데이터 없이 `scene.start`하면 그 씬이 전에 받은 데이터를 그대로 쓴다. 이어한 뒤 [새 게임]·[다시 하기]가
 * 저장된 판을 또 이어하지 않도록 새 판은 항상 빈 데이터를 명시한다.
 */
export function newGameData(): GameStartData {
  return {};
}
