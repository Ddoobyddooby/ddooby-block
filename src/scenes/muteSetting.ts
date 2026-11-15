// 효과음 음소거 설정. 화면과 소리가 읽는 값은 game.registry에 있고, 바꿀 때 `setMuted`의 persist로 저장소에도 쓴다.
// Boot가 저장소에서 읽은 값을 `writeMuted`로 채운다.

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
 * 음소거를 바꾼다: registry 값과 실제 출력을 같이 바꾸고, persist가 있으면 영구 저장도 요청한다. 음소거 버튼은 이것만 부른다.
 * 출력까지 끄므로 일시정지로 멈춘 소리가 [계속]에서 다시 나도 들리지 않는다.
 */
export function setMuted(
  store: MuteStore,
  output: SoundOutput,
  muted: boolean,
  persist?: (muted: boolean) => void,
): void {
  writeMuted(store, muted);
  applyMuted(store, output);
  // 저장은 실패해도 게임을 막지 않는다 (현재 판의 값은 이미 바뀌었다). persist는 예외를 던지지 않는다
  persist?.(muted);
}
