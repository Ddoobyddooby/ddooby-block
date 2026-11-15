import { describe, expect, it } from 'vitest';
import {
  CapacitorPreferencesStorage,
  LocalStorageAdapter,
  type PreferencesLike,
  type StorageLike,
} from '../../src/storage/adapters';

function fakeStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe('LocalStorageAdapter', () => {
  it('저장 → 새 어댑터로 읽기 → 삭제 (키가 없으면 null)', async () => {
    const storage = fakeStorage();
    await new LocalStorageAdapter(() => storage).set('k', 'v1');
    const next = new LocalStorageAdapter(() => storage); // 새 인스턴스
    expect(await next.get('k')).toBe('v1');
    expect(await next.get('none')).toBeNull();
    await next.remove('k');
    expect(await next.get('k')).toBeNull();
  });

  it('localStorage 접근 자체가 예외여도 동기 예외가 새지 않고 거부로 알린다', async () => {
    const adapter = new LocalStorageAdapter(() => {
      throw new Error('SecurityError');
    });
    await expect(adapter.get('k')).rejects.toThrow('SecurityError');
    await expect(adapter.set('k', 'v')).rejects.toThrow('SecurityError');
    await expect(adapter.remove('k')).rejects.toThrow('SecurityError');
  });

  it('getItem·setItem·removeItem이 던져도(용량 초과 등) 거부로 알린다', async () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error('get');
      },
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('remove');
      },
    };
    const adapter = new LocalStorageAdapter(() => storage);
    await expect(adapter.get('k')).rejects.toThrow('get');
    await expect(adapter.set('k', 'v')).rejects.toThrow('quota');
    await expect(adapter.remove('k')).rejects.toThrow('remove');
  });
});

describe('CapacitorPreferencesStorage', () => {
  function fakePrefs(): PreferencesLike & { map: Map<string, string> } {
    const map = new Map<string, string>();
    return {
      map,
      get: ({ key }) => Promise.resolve({ value: map.get(key) ?? null }),
      set: ({ key, value }) => {
        map.set(key, value);
        return Promise.resolve();
      },
      remove: ({ key }) => {
        map.delete(key);
        return Promise.resolve();
      },
    };
  }

  it('저장 → 새 어댑터로 읽기 → 삭제', async () => {
    const prefs = fakePrefs();
    await new CapacitorPreferencesStorage(prefs).set('k', 'v1');
    const next = new CapacitorPreferencesStorage(prefs);
    expect(await next.get('k')).toBe('v1');
    expect(await next.get('none')).toBeNull();
    await next.remove('k');
    expect(await next.get('k')).toBeNull();
  });

  it('Preferences가 거부하면 그대로 거부 (읽기 실패를 기본값으로 삼키지 않는다)', async () => {
    const failing: PreferencesLike = {
      get: () => Promise.reject(new Error('get')),
      set: () => Promise.reject(new Error('set')),
      remove: () => Promise.reject(new Error('remove')),
    };
    const adapter = new CapacitorPreferencesStorage(failing);
    await expect(adapter.get('k')).rejects.toThrow('get');
    await expect(adapter.set('k', 'v')).rejects.toThrow('set');
    await expect(adapter.remove('k')).rejects.toThrow('remove');
  });

  it('Preferences 메서드가 동기로 던져도 거부로 알린다', async () => {
    const throwing: PreferencesLike = {
      get: () => {
        throw new Error('sync get');
      },
      set: () => {
        throw new Error('sync set');
      },
      remove: () => {
        throw new Error('sync remove');
      },
    };
    const adapter = new CapacitorPreferencesStorage(throwing);
    await expect(adapter.get('k')).rejects.toThrow('sync get');
    await expect(adapter.set('k', 'v')).rejects.toThrow('sync set');
    await expect(adapter.remove('k')).rejects.toThrow('sync remove');
  });
});
