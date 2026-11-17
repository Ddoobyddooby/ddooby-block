import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE } from '../../src/config';
import { Persistence } from '../../src/storage/persistence';
import { parseSave } from '../../src/storage/progress';
import { MemoryStore } from '../helpers/memoryStore';

// W4-01: settings.music도 W2-05의 writeProgress 병합 규칙을 따른다 (이번 실행에서 setMusic을 부른 경우에만 메모리 값, 아니면 저장값).
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

describe('Persistence 음악 저장', () => {
  it('load는 저장된 music을 돌려주고, 없으면 켬(true)이다', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, json(10, { muted: false, music: false, theme: 'soda' }));
    expect((await new Persistence(store).load()).settings.music).toBe(false);
    expect((await new Persistence(new MemoryStore()).load()).settings.music).toBe(true);
  });

  it('setMusic은 music만 바꾸고 최고 점수·음소거·테마는 그대로 둔다', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, json(700, { muted: true, music: true, theme: 'orbit' }));
    const p = new Persistence(store);
    await p.load();
    expect(await p.setMusic(false)).toBe(true);
    expect(saved(store)).toEqual({
      version: 1,
      bestScore: 700,
      settings: { muted: true, music: false, theme: 'orbit' },
    });
  });

  it('setMusic을 부르지 않았다면 다른 설정 저장이 그 사이 저장된 music을 덮지 않는다', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, json(0, { muted: false, music: true, theme: 'soda' }));
    const p = new Persistence(store);
    await p.load();
    // 다른 탭이 music을 껐다
    store.data.set(PROGRESS, json(0, { muted: false, music: false, theme: 'soda' }));
    await p.setMuted(true);
    expect(saved(store).settings).toEqual({ muted: true, music: false, theme: 'soda' });
  });

  it('읽는 중에 사용자가 음악을 바꿨다면 읽은 값보다 우선한다', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, json(0, { muted: false, music: true, theme: 'soda' }));
    const p = new Persistence(store);
    const loading = p.load();
    const saving = p.setMusic(false);
    const result = await loading;
    await saving;
    expect(result.settings.music).toBe(false);
    expect(saved(store).settings.music).toBe(false);
  });

  it('setMusic 뒤 setMuted·setTheme을 해도 바꾼 music이 유지된다', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, json(0, { muted: false, music: true, theme: 'soda' }));
    const p = new Persistence(store);
    await p.load();
    await p.setMusic(false);
    await p.setMuted(true);
    await p.setTheme('butter');
    expect(saved(store).settings).toEqual({ muted: true, music: false, theme: 'butter' });
  });
});
