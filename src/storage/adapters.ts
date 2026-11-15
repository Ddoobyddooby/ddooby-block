// 저장소 어댑터. ddooby-pang의 `storage/progress.ts`(LocalStorageAdapter, CapacitorPreferencesStorage)에서 가져와 맞췄다.
// 바뀐 점: (1) 값 하나를 읽고 쓰는 최소 인터페이스(KeyValueStore)로 줄이고 삭제(remove)를 더했다.
// (2) 읽기 실패를 기본값으로 삼키지 않고 거부(reject)로 알린다. 읽기에 실패한 저장소에 기본값을 써서 기존 기록을 덮지 않게
// 하기 위해서다 (그 판단은 Persistence가 한다). (3) pang의 legacy(localStorage → Preferences) 이식은 가져오지 않았다.
// Phaser·window·Capacitor에 직접 기대지 않는다: Boot가 같은 모양의 객체를 넘겨준다.

/** 키 하나에 문자열 하나. 모든 메서드는 실패하면 거부한다 (예외가 동기로 새지 않는다) */
export interface KeyValueStore {
  /** 없으면 null */
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Web Storage(localStorage) 모양의 최소 인터페이스 (테스트에서 가짜를 넣는다) */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 동기 호출의 예외도 거부로 바꾼다 */
function attempt<T>(job: () => T | Promise<T>): Promise<T> {
  return new Promise<T>((resolve) => {
    resolve(job());
  });
}

/**
 * 웹용. `window.localStorage`는 접근만 해도 예외가 날 수 있어(사파리 사생활 보호, 쿠키 차단) 객체 대신 꺼내는 함수를 받는다.
 */
export class LocalStorageAdapter implements KeyValueStore {
  constructor(private readonly getStorage: () => StorageLike) {}

  get(key: string): Promise<string | null> {
    return attempt(() => this.getStorage().getItem(key));
  }

  set(key: string, value: string): Promise<void> {
    return attempt(() => this.getStorage().setItem(key, value));
  }

  remove(key: string): Promise<void> {
    return attempt(() => this.getStorage().removeItem(key));
  }
}

/** `@capacitor/preferences`의 Preferences 모양 (테스트에서 가짜를 넣는다) */
export interface PreferencesLike {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

/** 앱(Android)용: Capacitor Preferences(SharedPreferences). 실기기 동작은 W4-03 이후에 확인한다 */
export class CapacitorPreferencesStorage implements KeyValueStore {
  constructor(private readonly prefs: PreferencesLike) {}

  async get(key: string): Promise<string | null> {
    return (await this.prefs.get({ key })).value;
  }

  set(key: string, value: string): Promise<void> {
    return attempt(() => this.prefs.set({ key, value }));
  }

  remove(key: string): Promise<void> {
    return attempt(() => this.prefs.remove({ key }));
  }
}
