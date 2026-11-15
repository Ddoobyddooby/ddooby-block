// Game 씬을 시작할 때 넘기는 데이터와 DEV 진입 옵션.
import type { ResumableRun } from '../storage/persistence';

/** `scene.start('Game', data)`. resume이 있으면 새 판 대신 그 판을 이어서 시작한다 (W2-06 이어하기 버튼도 같은 길) */
export interface GameStartData {
  resume?: ResumableRun;
}

/**
 * DEV 전용 `?resume`: 메뉴의 이어하기 버튼(W2-06)이 생기기 전에 이어하기를 브라우저에서 확인하는 진입.
 * 프로덕션 빌드(dev=false)에서는 무시한다 (호출부의 `import.meta.env.DEV`와 함께 빌드에서 지워진다).
 */
export function hasResumeParam(search: string, dev: boolean): boolean {
  return dev && new URLSearchParams(search).has('resume');
}
