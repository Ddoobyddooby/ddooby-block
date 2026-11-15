// 효과음 음소거 설정. 저장은 W2-05에서 한다. 지금은 앱이 켜져 있는 동안만 game.registry에 기억한다
// (새로고침하면 소리가 켜진다). 읽고 쓰는 곳을 이 파일로 모아 두었으니 W2-05에서는 여기만 저장소로 바꿔 끼운다.

const KEY = 'muted';

/** Phaser.Data.DataManager에서 쓰는 부분 (bestScore.ts의 BestStore와 같다) */
export interface MuteStore {
  get(key: string): unknown;
  set(key: string, value: unknown): unknown;
}

/** 기록이 없거나 불리언이 아니면 소리를 켜 둔 것(false)으로 본다 */
export function readMuted(store: MuteStore): boolean {
  return store.get(KEY) === true;
}

export function writeMuted(store: MuteStore, muted: boolean): void {
  store.set(KEY, muted);
}
