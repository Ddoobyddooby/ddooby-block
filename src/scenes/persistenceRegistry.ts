// Persistence 하나를 game.registry에 둔다. Boot가 만들어 넣고 Game·Pause·(W2-06) Menu가 꺼내 쓴다.
import type { Persistence } from '../storage/persistence';

const KEY = 'persistence';

/** Phaser.Data.DataManager에서 쓰는 부분 */
export interface PersistenceHolder {
  get(key: string): unknown;
  set(key: string, value: unknown): unknown;
}

export function putPersistence(store: PersistenceHolder, persistence: Persistence): void {
  store.set(KEY, persistence);
}

/** 없으면 null (저장 없이도 게임은 돌아간다) */
export function getPersistence(store: PersistenceHolder): Persistence | null {
  const value = store.get(KEY);
  return value === undefined || value === null ? null : (value as Persistence);
}
