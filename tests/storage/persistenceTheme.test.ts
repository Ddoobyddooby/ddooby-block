import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE } from '../../src/config';
import { Persistence } from '../../src/storage/persistence';
import { parseSave } from '../../src/storage/progress';
import { flush, MemoryStore } from '../helpers/memoryStore';

// W4-05: settings.theme도 W2-05의 writeProgress 병합 규칙을 따른다 (이번 실행에서 setTheme을 부른 경우에만 메모리 값, 아니면 저장값).
const PROGRESS = SAVE.key;

function json(bestScore: number, settings: Record<string, unknown>): string {
  return JSON.stringify({ version: 1, bestScore, settings });
}

function saved(store: MemoryStore) {
  return parseSave(store.data.get(PROGRESS) ?? null);
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warn.mockRestore();
});

describe('Persistence 테마 저장', () => {
  it('load는 저장된 테마를 돌려주고, 없으면 기본 테마(soda)다', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, json(10, { muted: false, music: true, theme: 'orbit' }));
    expect((await new Persistence(store).load()).settings.theme).toBe('orbit');
    const empty = new MemoryStore();
    expect((await new Persistence(empty).load()).settings.theme).toBe('soda');
    expect(empty.writes).toEqual([]);
  });

  it('setTheme은 테마를 저장하고 최고 점수·음소거·music은 그대로 둔다', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, json(700, { muted: true, music: false, theme: 'soda' }));
    const p = new Persistence(store);
    await p.load();
    expect(await p.setTheme('butter')).toBe(true);
    expect(saved(store)).toEqual({
      version: 1,
      bestScore: 700,
      settings: { muted: true, music: false, theme: 'butter' },
    });
    expect(p.settings().theme).toBe('butter');
  });

  it('테마를 바꾸지 않은 실행은 저장값을 덮지 않는다 (다른 탭이 바꾼 테마도)', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, json(100, { muted: false, music: true, theme: 'soda' }));
    const p = new Persistence(store);
    await p.load();
    store.data.set(PROGRESS, json(100, { muted: false, music: true, theme: 'orbit' })); // 다른 탭
    await p.finishRun(p.beginRun(), null, 500);
    expect(saved(store).settings.theme).toBe('orbit');
    expect(saved(store).bestScore).toBe(500);
  });

  it('음소거만 바꿔도 저장된 테마는 그대로다', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, json(1, { muted: false, music: true, theme: 'butter' }));
    const p = new Persistence(store);
    await p.load();
    await p.setMuted(true);
    expect(saved(store).settings).toEqual({ muted: true, music: true, theme: 'butter' });
  });

  it('읽기가 끝나기 전에 고른 테마는 읽은 값에 덮이지 않는다', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, json(700, { muted: false, music: true, theme: 'orbit' }));
    store.holdReads = true;
    const p = new Persistence(store);
    const loading = p.load();
    const saving = p.setTheme('butter');
    await flush();
    store.holdReads = false;
    store.releaseNext(); // progress 읽기
    await flush();
    store.releaseNext(); // run 읽기
    const result = await loading;
    await saving;
    expect(result.settings.theme).toBe('butter');
    expect(saved(store)).toEqual({
      version: 1,
      bestScore: 700,
      settings: { muted: false, music: true, theme: 'butter' },
    });
  });

  it('첫 읽기가 일시 실패했다가 복구돼도 고른 테마만 덮고 나머지는 저장값을 지킨다', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, json(900, { muted: true, music: false, theme: 'orbit' }));
    store.failGetOnce.add(PROGRESS);
    const p = new Persistence(store);
    expect((await p.load()).readable).toBe(false);
    expect(await p.setTheme('butter')).toBe(true);
    expect(saved(store)).toEqual({
      version: 1,
      bestScore: 900,
      settings: { muted: true, music: false, theme: 'butter' },
    });
  });

  it('저장이 실패하면 false지만 메모리 값은 바뀐다 (게임은 계속된다)', async () => {
    const store = new MemoryStore();
    store.failSet.add(PROGRESS);
    const p = new Persistence(store);
    await p.load();
    expect(await p.setTheme('orbit')).toBe(false);
    expect(p.settings().theme).toBe('orbit');
  });

  it('저장소에 모르는 테마가 있으면 기본 테마로 읽고, 고르면 정상 값으로 고쳐 쓴다', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, json(5, { muted: false, music: true, theme: 'navy' }));
    const p = new Persistence(store);
    expect((await p.load()).settings.theme).toBe('soda');
    await p.setTheme('orbit');
    expect(saved(store).settings.theme).toBe('orbit');
  });
});
