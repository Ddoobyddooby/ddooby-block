// 최고 점수. 저장은 W2-05에서 한다. 지금은 앱이 켜져 있는 동안만 game.registry에 기억한다.
// 읽고 쓰는 곳을 이 파일로 모아 두었으니 W2-05에서는 여기만 저장소로 바꿔 끼운다.

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

/** 점수를 반영하고 갱신된 최고 점수를 돌려준다 */
export function recordBest(store: BestStore, score: number): number {
  const best = nextBest(readBest(store), score);
  store.set(KEY, best);
  return best;
}
