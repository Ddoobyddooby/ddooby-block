// 효과음 음소거 설정. 화면과 소리가 읽는 값은 game.registry에 있고, 바꿀 때 `setMuted`의 persist로 저장소에도 쓴다.
// Boot가 저장소에서 읽은 값을 `writeMuted`로 채운다. 배경 음악은 이것과 별개다 (musicRules.ts의 readMusic).

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

/**
 * 음소거를 바꾼다: registry 값을 바꾸고, persist가 있으면 영구 저장도 요청한다. 음소거 버튼은 이것만 부른다.
 * 효과음만 끈다: 사운드 매니저 전체 mute는 쓰지 않는다 (배경 음악은 음악 버튼으로만 켜고 끈다, musicRules.ts).
 * 새 소리는 `Sfx.play`가 읽어 만들지 않고, 일시정지로 멈춘 소리는 `Sfx.resume`이 읽어 이어 내지 않고 버린다.
 */
export function setMuted(
  store: MuteStore,
  muted: boolean,
  persist?: (muted: boolean) => void,
): void {
  writeMuted(store, muted);
  // 저장은 실패해도 게임을 막지 않는다 (현재 판의 값은 이미 바뀌었다). persist는 예외를 던지지 않는다
  persist?.(muted);
}
