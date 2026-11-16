// Game 씬을 시작할 때 넘기는 데이터와 DEV 진입 옵션.
import type { StartedRun } from '../online';
import type { ResumableRun } from '../storage/persistence';
import { parseFillParam } from './devFill';
import { parseSeedParam } from './seed';

/**
 * `scene.start('Game', data)`. resume이 있으면 새 판 대신 그 판을 이어서 시작한다 (메뉴의 [이어하기]도 같은 길).
 * online은 서버가 발급한 새 판의 seed·runId다 (W3-03): 이 판의 상태·시계·저장에 함께 들어가고 게임 오버 때 점수를 제출한다.
 * 둘 다 없으면 서버 기록 없는 오프라인 판이다 (`?seed=N`이면 그 seed)
 */
export interface GameStartData {
  resume?: ResumableRun;
  online?: StartedRun;
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

/**
 * 새 판에서 서버 run을 받지 않는 경우: URL `?seed=N`(조각 순서를 고정해 다시 볼 수 있는 판)이나 DEV `?fill=`(리플레이할 수 없는 판).
 * 이런 판은 랭킹 대상이 아니다. 서버 seed를 받아도 URL seed가 덮어쓰는 모순을 피하려고 아예 받지 않는다.
 */
export function skipsRanking(search: string, dev: boolean): boolean {
  return parseSeedParam(search) !== null || parseFillParam(search, dev) !== null;
}

/**
 * 새 판·이어하기의 seed와 run ID를 정한다. 우선순위는 **이어하기 > 서버가 발급한 새 판 > URL `?seed=N` > 무작위**다:
 * 이어하는 판은 저장된 seed·runId 그대로이고 (같은 서버 run으로 제출한다), 서버 seed를 받은 판은 URL이나 무작위가 덮어쓰지 않는다.
 * runId는 seed와 같은 출처에서만 온다: 서버 run이 아닌 판(`?seed=N`, 무작위)은 null이라 랭킹 대상이 아니다.
 */
export function chooseSeedAndRun(input: {
  resume: ResumableRun | null;
  online: StartedRun | null;
  urlSeed: number | null;
  random(): number;
}): { seed: number; runId: string | null } {
  const { resume, online, urlSeed, random } = input;
  if (resume !== null) return { seed: resume.saved.seed, runId: resume.saved.runId };
  if (online !== null) return { seed: online.seed, runId: online.runId };
  return { seed: urlSeed ?? random(), runId: null };
}
