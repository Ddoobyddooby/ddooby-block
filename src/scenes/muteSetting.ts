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

/** Phaser 사운드 매니저에서 쓰는 부분. `mute`를 켜면 재생 중이거나 멈춰 있던 소리까지 전부 출력이 꺼진다 */
export interface SoundOutput {
  mute: boolean;
}

/** 저장값을 실제 출력(사운드 매니저)에 맞춘다. 게임을 켤 때(Boot) 부른다 */
export function applyMuted(store: MuteStore, output: SoundOutput): void {
  output.mute = readMuted(store);
}

/**
 * 음소거를 바꾼다: 저장값과 실제 출력을 같이 바꾼다. 음소거 버튼은 이것만 부른다.
 * 출력까지 끄므로 일시정지로 멈춘 소리가 [계속]에서 다시 나도 들리지 않는다.
 */
export function setMuted(store: MuteStore, output: SoundOutput, muted: boolean): void {
  writeMuted(store, muted);
  applyMuted(store, output);
}
