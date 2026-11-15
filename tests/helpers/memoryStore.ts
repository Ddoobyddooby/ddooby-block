import type { KeyValueStore } from '../../src/storage/adapters';

/**
 * 테스트용 저장소. 실패와 "느린 쓰기·읽기"를 주입한다 (시간 지연 대신 손으로 풀어 준다).
 * `writes`는 실제로 반영된 변경(set·remove)을 순서대로 적는다.
 */
export class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  readonly writes: string[] = [];
  /** 실패시킬 키 (읽기·쓰기·삭제 각각) */
  readonly failGet = new Set<string>();
  readonly failSet = new Set<string>();
  readonly failRemove = new Set<string>();
  /** 다음 읽기 한 번만 실패시킬 키 (일시 실패 뒤 복구) */
  readonly failGetOnce = new Set<string>();
  /** true면 쓰기·삭제·읽기가 `release`할 때까지 끝나지 않는다 */
  holdWrites = false;
  holdReads = false;
  private pending: (() => void)[] = [];
  /** 시작한 작업 수 (큐가 앞 작업을 기다리는지 확인한다) */
  started = 0;

  get(key: string): Promise<string | null> {
    this.started += 1;
    if (this.failGetOnce.delete(key)) return Promise.reject(new Error(`읽기 일시 실패 ${key}`));
    if (this.failGet.has(key)) return Promise.reject(new Error(`읽기 실패 ${key}`));
    return this.gate(this.holdReads, () => this.data.get(key) ?? null);
  }

  set(key: string, value: string): Promise<void> {
    this.started += 1;
    if (this.failSet.has(key)) return Promise.reject(new Error(`쓰기 실패 ${key}`));
    return this.gate(this.holdWrites, () => {
      this.data.set(key, value);
      this.writes.push(`set ${key}`);
    });
  }

  remove(key: string): Promise<void> {
    this.started += 1;
    if (this.failRemove.has(key)) return Promise.reject(new Error(`삭제 실패 ${key}`));
    return this.gate(this.holdWrites, () => {
      this.data.delete(key);
      this.writes.push(`remove ${key}`);
    });
  }

  /** 멈춰 둔 작업 중 가장 먼저 시작한 것 하나를 끝낸다 */
  releaseNext(): void {
    this.pending.shift()?.();
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  private gate<T>(hold: boolean, apply: () => T): Promise<T> {
    if (!hold) return Promise.resolve(apply());
    return new Promise<T>((resolve) => {
      this.pending.push(() => resolve(apply()));
    });
  }
}

/** 마이크로태스크를 충분히 돌려 큐가 갈 데까지 가게 한다 */
export async function flush(times = 20): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}
