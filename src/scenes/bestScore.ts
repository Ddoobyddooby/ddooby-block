// 최고 점수의 화면용 값. game.registry에 기억한다 (점수 이벤트마다 올라 HUD에 보인다).
// 영구 저장은 여기서 하지 않는다: 게임 오버 때 Persistence.finishRun이 하고, Boot가 저장소에서 읽어 `writeBest`로 채운다.

const KEY = 'bestScore';

/** Phaser.Data.DataManager에서 쓰는 부분 */
export interface BestStore {
  get(key: string): unknown;
  set(key: string, value: unknown): unknown;
}

/** 현재 점수가 최고 점수를 넘을 때만 오른다 */
export function nextBest(best: number, score: number): number {
  return score > best ? score : best;
}

export function readBest(store: BestStore): number {
  const value = store.get(KEY);
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** 저장소에서 읽은 값을 반영한다 (Boot). 이미 더 큰 값이 있으면 그대로 둔다 */
export function writeBest(store: BestStore, best: number): void {
  store.set(KEY, nextBest(readBest(store), best));
}

/** 점수를 반영하고 갱신된 최고 점수를 돌려준다 */
export function recordBest(store: BestStore, score: number): number {
  const best = nextBest(readBest(store), score);
  store.set(KEY, best);
  return best;
}

/**
 * 판을 시작할 때 HUD에 보여 줄 최고 점수. 리플레이 가능한 판은 현재 점수를 반영한다 (이어한 판이 최고 점수보다 높은 점수로 시작할 수 있다).
 * `?fill=` 판(replayable false)은 저장된 최고 점수 그대로다. 영구 저장은 하지 않는다 (게임 오버 때).
 */
export function startBest(store: BestStore, score: number, replayable: boolean): number {
  return replayable ? recordBest(store, score) : readBest(store);
}
