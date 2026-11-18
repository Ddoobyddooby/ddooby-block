import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE } from '../../src/config';
import { Persistence } from '../../src/storage/persistence';
import { parseSave } from '../../src/storage/progress';
import { parseRun, serializeRun, type RunInput } from '../../src/storage/run';
import { flush, MemoryStore } from '../helpers/memoryStore';
import { playGreedy } from '../helpers/bot';

const PROGRESS = SAVE.key;
const RUN = SAVE.runKey;

function input(seed: number, count: number, elapsedMs = 100000): RunInput {
  const played = playGreedy(seed, count);
  return { seed, runId: null, placements: played.placements, elapsedMs, state: played.state };
}

function progressJson(bestScore: number, muted = false): string {
  return JSON.stringify({ version: 1, bestScore, settings: { muted, music: true, theme: 'soda' } });
}

function storedBest(store: MemoryStore): number {
  return parseSave(store.data.get(PROGRESS) ?? null).bestScore;
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warn.mockRestore();
});

describe('부팅 읽기 (load)', () => {
  it('저장된 최고 점수·설정·이어할 판을 읽는다', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, progressJson(700, true));
    store.data.set(RUN, serializeRun(input(16, 10, 3300)));
    const result = await new Persistence(store).load();
    expect(result.bestScore).toBe(700);
    expect(result.settings).toEqual({ muted: true, music: true, theme: 'soda' });
    expect(result.readable).toBe(true);
    expect(result.resume?.state.score).toBe(483);
    expect(result.resume?.saved.elapsedMs).toBe(3300);
    expect(store.writes).toEqual([]); // 읽기만으로는 아무것도 쓰지 않는다
  });

  it('저장된 것이 없으면 기본값이고, 기본값을 자동으로 저장하지 않는다', async () => {
    const store = new MemoryStore();
    const result = await new Persistence(store).load();
    expect(result).toEqual({
      bestScore: 0,
      storedBest: 0,
      settings: { muted: false, music: true, theme: 'soda' },
      resume: null,
      readable: true,
    });
    expect(store.writes).toEqual([]);
  });

  it('끝난 판은 이어하기에서 빼고 그 점수로 최고 점수를 되살린 뒤 run을 지운다 (두 번 부팅해도 같다)', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, progressJson(100));
    store.data.set(RUN, serializeRun(input(294, 3000))); // seed 294: 14수에 게임 오버, 305점
    const first = await new Persistence(store).load();
    expect(first.resume).toBeNull();
    expect(first.bestScore).toBe(305);
    expect(store.data.has(RUN)).toBe(false);
    expect(storedBest(store)).toBe(305);
    // 순서: 최고 점수 저장 → run 삭제
    expect(store.writes).toEqual([`set ${PROGRESS}`, `remove ${RUN}`]);

    const second = await new Persistence(store).load();
    expect(second.resume).toBeNull();
    expect(second.bestScore).toBe(305);
  });

  it('끝난 판의 점수가 저장된 최고 점수보다 낮으면 최고 점수는 그대로 (줄지 않는다)', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, progressJson(5000));
    store.data.set(RUN, serializeRun(input(294, 3000)));
    const result = await new Persistence(store).load();
    expect(result.bestScore).toBe(5000);
    expect(store.data.has(RUN)).toBe(false);
  });

  it('끝난 판 복구 중 최고 점수 저장이 실패하면 run을 지우지 않는다 (다음 부팅에 다시 시도)', async () => {
    const store = new MemoryStore();
    store.data.set(RUN, serializeRun(input(294, 3000)));
    store.failSet.add(PROGRESS);
    const first = await new Persistence(store).load();
    expect(first.resume).toBeNull();
    expect(first.bestScore).toBe(305); // 화면용 값은 복구된다
    expect(store.data.has(RUN)).toBe(true);

    store.failSet.clear();
    const second = await new Persistence(store).load();
    expect(second.bestScore).toBe(305);
    expect(store.data.has(RUN)).toBe(false);
    expect(storedBest(store)).toBe(305);
  });

  it('버전이 다르거나 깨진 run은 이어하기 대상이 아니고 건드리지 않는다', async () => {
    const store = new MemoryStore();
    const broken = '{"version":2}';
    store.data.set(RUN, broken);
    const result = await new Persistence(store).load();
    expect(result.resume).toBeNull();
    expect(store.data.get(RUN)).toBe(broken);
    expect(store.writes).toEqual([]);
  });

  it('옛 규칙 버전(rulesVersion 1)으로 저장된 판은 예외 없이 이어하기에서 빠지고 건드리지 않는다 (RULES_VERSION 2 이후)', async () => {
    const store = new MemoryStore();
    const raw = JSON.parse(serializeRun(input(16, 5, 3300))) as Record<string, unknown>;
    raw.rulesVersion = 1; // 조각 29종 시절의 저장
    const old = JSON.stringify(raw);
    store.data.set(RUN, old);
    store.data.set(PROGRESS, progressJson(700));
    const result = await new Persistence(store).load();
    expect(result.resume).toBeNull();
    expect(result.bestScore).toBe(700);
    expect(store.data.get(RUN)).toBe(old);
    expect(store.writes).toEqual([]);
  });

  it('깨진 progress는 기본값으로 시작하지만 run은 읽는다', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, '{"vers');
    store.data.set(RUN, serializeRun(input(16, 10, 3300)));
    const result = await new Persistence(store).load();
    expect(result.bestScore).toBe(0);
    expect(result.resume).not.toBeNull();
  });
});

describe('읽기에 실패한 저장소에는 쓰지 않는다', () => {
  it('전부 읽기 실패: 예외 없이 기본값으로 진행하고, 쓰기·삭제 요청은 저장소를 건드리지 않는다', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, progressJson(900, true));
    store.data.set(RUN, serializeRun(input(16, 10, 3300)));
    store.failGet.add(PROGRESS);
    store.failGet.add(RUN);
    const p = new Persistence(store);
    const result = await p.load();
    expect(result.readable).toBe(false);
    expect(result.bestScore).toBe(0);
    expect(result.resume).toBeNull();

    expect(await p.setMuted(false)).toBe(false);
    const epoch = p.beginRun();
    expect(await p.saveRun(epoch, input(16, 3))).toBe(false);
    expect(await p.finishRun(epoch, input(294, 3000), 305)).toBe(false);
    expect(await p.discardRun(epoch)).toBe(false);
    // 저장소의 기존 값은 그대로다 (기본값으로 덮이지 않았다)
    expect(store.writes).toEqual([]);
    expect(parseSave(store.data.get(PROGRESS) ?? null).bestScore).toBe(900);
    expect(store.data.has(RUN)).toBe(true);
  });

  it('run 키만 읽기 실패: progress는 쓰지만 run에는 쓰지도 지우지도 않는다', async () => {
    const store = new MemoryStore();
    store.data.set(RUN, 'old-run');
    store.failGet.add(RUN);
    const p = new Persistence(store);
    await p.load();
    const epoch = p.beginRun();
    expect(await p.saveRun(epoch, input(16, 3))).toBe(false);
    expect(await p.setMuted(true)).toBe(true);
    expect(await p.finishRun(epoch, input(294, 3000), 305)).toBe(false); // 삭제를 못 해서 false
    expect(store.data.get(RUN)).toBe('old-run');
    expect(storedBest(store)).toBe(305); // 최고 점수는 저장됐다
  });

  it('progress 키만 읽기 실패: 쓰지 않고 run은 정상 저장한다', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, progressJson(900));
    store.failGet.add(PROGRESS);
    const p = new Persistence(store);
    await p.load();
    expect(await p.setMuted(true)).toBe(false);
    const epoch = p.beginRun();
    expect(await p.saveRun(epoch, input(16, 3))).toBe(true);
    expect(storedBest(store)).toBe(900);
  });

  it('쓰기 실패·용량 초과·삭제 실패는 예외 없이 false이고 경고는 한 번만 남긴다', async () => {
    const store = new MemoryStore();
    store.failSet.add(RUN);
    store.failRemove.add(RUN);
    const p = new Persistence(store);
    await p.load();
    const epoch = p.beginRun();
    expect(await p.saveRun(epoch, input(16, 3))).toBe(false);
    expect(await p.saveRun(epoch, input(16, 4))).toBe(false);
    expect(await p.discardRun(epoch)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('쓰기·삭제는 한 줄로 선다', () => {
  it('앞의 느린 쓰기가 끝나기 전에 다음 작업이 시작되지 않고, 끝난 순서대로 반영된다 (삭제 뒤 되살아나지 않는다)', async () => {
    const store = new MemoryStore();
    const p = new Persistence(store);
    await p.load();
    const epoch = p.beginRun();
    store.holdWrites = true;
    const saving = p.saveRun(epoch, input(16, 5));
    const discarding = p.discardRun(epoch);
    await flush();
    expect(store.started).toBe(3); // load의 읽기 2번 + 첫 쓰기 1번. 삭제는 아직 시작하지 않았다
    expect(store.pendingCount).toBe(1);

    store.releaseNext(); // 느린 쓰기가 뒤늦게 끝난다
    await flush();
    expect(store.pendingCount).toBe(1); // 이제 삭제가 시작되어 멈춰 있다
    store.releaseNext();
    await Promise.all([saving, discarding]);
    expect(store.writes).toEqual([`set ${RUN}`, `remove ${RUN}`]);
    expect(store.data.has(RUN)).toBe(false);
  });

  it('요청한 순서가 곧 최종 값: 여러 저장 중 마지막 요청이 남는다', async () => {
    const store = new MemoryStore();
    const p = new Persistence(store);
    await p.load();
    const epoch = p.beginRun();
    store.holdWrites = true;
    const a = p.saveRun(epoch, input(16, 3));
    const b = p.saveRun(epoch, input(16, 6));
    const c = p.saveRun(epoch, input(16, 9));
    for (let i = 0; i < 3; i++) {
      await flush();
      store.releaseNext();
    }
    await Promise.all([a, b, c]);
    expect(parseRun(store.data.get(RUN) ?? null)?.placements).toHaveLength(9);
  });

  it('저장 문자열은 요청 시점에 만들어진다 (기다리는 동안 로그 배열이 늘어나도 그 저장은 그대로)', async () => {
    const store = new MemoryStore();
    const p = new Persistence(store);
    await p.load();
    const epoch = p.beginRun();
    const played = playGreedy(16, 6);
    const log = [...played.placements];
    store.holdWrites = true;
    const saving = p.saveRun(epoch, {
      seed: 16,
      runId: null,
      placements: log,
      elapsedMs: 5000,
      state: played.state,
    });
    log.push({ trayIndex: 0, row: 0, col: 0, t: 99999 });
    await flush();
    store.releaseNext();
    await saving;
    expect(parseRun(store.data.get(RUN) ?? null)?.placements).toHaveLength(6);
  });

  it('쓰기가 한 번 실패해도 큐는 이어지고 다음 저장이 반영된다', async () => {
    const store = new MemoryStore();
    const p = new Persistence(store);
    await p.load();
    const epoch = p.beginRun();
    store.failSet.add(RUN);
    expect(await p.saveRun(epoch, input(16, 3))).toBe(false);
    store.failSet.clear();
    expect(await p.saveRun(epoch, input(16, 7))).toBe(true);
    expect(parseRun(store.data.get(RUN) ?? null)?.placements).toHaveLength(7);
  });

  it('새 판이 시작된 뒤 이전 판이 요청한 저장·삭제·종료는 버려진다 (새 판을 덮지 않는다)', async () => {
    const store = new MemoryStore();
    const p = new Persistence(store);
    await p.load();
    const oldEpoch = p.beginRun();
    expect(await p.saveRun(oldEpoch, input(16, 3))).toBe(true);
    const newEpoch = p.beginRun();
    expect(await p.saveRun(newEpoch, input(5, 4))).toBe(true);

    // 이전 판의 늦은 콜백들 (hidden 저장, 느린 종료, 삭제)
    expect(await p.saveRun(oldEpoch, input(16, 8))).toBe(false);
    expect(await p.finishRun(oldEpoch, input(294, 3000), 99999)).toBe(false);
    expect(await p.discardRun(oldEpoch)).toBe(false);
    const stored = parseRun(store.data.get(RUN) ?? null);
    expect(stored?.seed).toBe(5);
    expect(stored?.placements).toHaveLength(4);
    expect(storedBest(store)).toBe(0); // 버려진 종료가 최고 점수를 올리지 않았다
  });

  it('느린 쓰기 도중 새 판이 시작돼도 이전 판 저장이 새 판 저장 뒤에 도착하지 않는다', async () => {
    const store = new MemoryStore();
    const p = new Persistence(store);
    await p.load();
    const oldEpoch = p.beginRun();
    store.holdWrites = true;
    const oldSave = p.saveRun(oldEpoch, input(16, 3));
    const newEpoch = p.beginRun();
    const newSave = p.saveRun(newEpoch, input(5, 4));
    for (let i = 0; i < 2; i++) {
      await flush();
      store.releaseNext();
    }
    await Promise.all([oldSave, newSave]);
    expect(parseRun(store.data.get(RUN) ?? null)?.seed).toBe(5);
  });
});

describe('최고 점수와 음소거', () => {
  it('최고 점수 쓰기와 음소거 쓰기가 겹쳐도 한쪽이 다른 쪽을 옛 값으로 덮지 않는다 (두 순서 모두)', async () => {
    for (const bestFirst of [true, false]) {
      const store = new MemoryStore();
      store.data.set(PROGRESS, progressJson(100));
      const p = new Persistence(store);
      await p.load();
      const epoch = p.beginRun();
      store.holdWrites = true;
      const jobs = bestFirst
        ? [p.finishRun(epoch, null, 500), p.setMuted(true)]
        : [p.setMuted(true), p.finishRun(epoch, null, 500)];
      for (let i = 0; i < 4; i++) {
        await flush();
        store.releaseNext();
      }
      await Promise.all(jobs);
      const saved = parseSave(store.data.get(PROGRESS) ?? null);
      expect(saved.bestScore, `bestFirst=${String(bestFirst)}`).toBe(500);
      expect(saved.settings.muted).toBe(true);
    }
  });

  it('쓰기 직전에 저장소를 다시 읽어 더 큰 값을 남긴다 (다른 탭이 올려 둔 최고 점수를 낮추지 않는다)', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, progressJson(100));
    const p = new Persistence(store);
    await p.load();
    store.data.set(PROGRESS, progressJson(900)); // 다른 탭이 저장
    const epoch = p.beginRun();
    await p.finishRun(epoch, null, 300);
    expect(storedBest(store)).toBe(900);
    expect(p.bestScore()).toBe(900);
  });

  it('최고 점수는 줄지 않는다: 낮은 점수로 끝나도 그대로', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, progressJson(800));
    const p = new Persistence(store);
    await p.load();
    await p.finishRun(p.beginRun(), null, 50);
    expect(storedBest(store)).toBe(800);
  });

  it('읽기가 끝나기 전에 바꾼 음소거는 읽은 값에 덮이지 않고, 기존 최고 점수도 0으로 덮이지 않는다', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, progressJson(700, false));
    store.holdReads = true;
    const p = new Persistence(store);
    const loading = p.load();
    const saving = p.setMuted(true); // 읽는 중에 사용자가 음소거
    await flush();
    store.holdReads = false;
    store.releaseNext(); // progress 읽기
    await flush();
    store.releaseNext(); // run 읽기
    const result = await loading;
    await saving;
    expect(result.bestScore).toBe(700);
    expect(result.settings.muted).toBe(true);
    const saved = parseSave(store.data.get(PROGRESS) ?? null);
    expect(saved).toEqual({
      version: 1,
      bestScore: 700,
      settings: { muted: true, music: true, theme: 'soda' },
    });
  });

  it('음소거 저장 실패는 false로 알리되 메모리 값은 바뀐다 (게임은 계속된다)', async () => {
    const store = new MemoryStore();
    store.failSet.add(PROGRESS);
    const p = new Persistence(store);
    await p.load();
    expect(await p.setMuted(true)).toBe(false);
    expect(p.settings().muted).toBe(true);
  });
});

describe('게임 오버 순서와 장애 복구', () => {
  it('끝난 기록(마지막 배치 포함) 저장 → 최고 점수 저장 → run 삭제 순서', async () => {
    const store = new MemoryStore();
    const p = new Persistence(store);
    await p.load();
    const epoch = p.beginRun();
    const over = input(294, 3000);
    const result = await p.finishRun(epoch, over, 305);
    expect(result).toBe(true);
    expect(store.writes).toEqual([`set ${RUN}`, `set ${PROGRESS}`, `remove ${RUN}`]);
    expect(store.data.has(RUN)).toBe(false);
    expect(storedBest(store)).toBe(305);
    expect(p.resumable()).toBeNull();
  });

  it('최고 점수 저장이 실패하면 run을 지우지 않고(끝난 기록이 남아), 다음 부팅이 최고 점수를 되살린다', async () => {
    const store = new MemoryStore();
    const p = new Persistence(store);
    await p.load();
    store.failSet.add(PROGRESS);
    expect(await p.finishRun(p.beginRun(), input(294, 3000), 305)).toBe(false);
    expect(store.data.has(RUN)).toBe(true);
    expect(parseRun(store.data.get(RUN) ?? null)).not.toBeNull();

    store.failSet.clear();
    const next = new Persistence(store);
    const result = await next.load();
    expect(result.resume).toBeNull(); // 끝난 판은 이어하기로 보이지 않는다
    expect(result.bestScore).toBe(305);
    expect(store.data.has(RUN)).toBe(false);
  });

  it('끝난 기록 저장 직후 앱이 꺼진 경우(run은 있고 progress는 아직): 다음 부팅이 복구한다', async () => {
    const store = new MemoryStore();
    store.data.set(RUN, serializeRun(input(294, 3000)));
    const result = await new Persistence(store).load();
    expect(result.bestScore).toBe(305);
    expect(result.resume).toBeNull();
    expect(storedBest(store)).toBe(305);
  });

  it('최고 점수 저장 직후·삭제 직전에 꺼진 경우(둘 다 남음): 최고 점수는 유지, 끝난 run은 정리된다', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, progressJson(305));
    store.data.set(RUN, serializeRun(input(294, 3000)));
    const result = await new Persistence(store).load();
    expect(result.bestScore).toBe(305);
    expect(result.resume).toBeNull();
    expect(store.data.has(RUN)).toBe(false);
  });

  it('run 삭제가 실패해도 다음 부팅에서 끝난 판은 이어하기로 나타나지 않는다', async () => {
    const store = new MemoryStore();
    const p = new Persistence(store);
    await p.load();
    store.failRemove.add(RUN);
    expect(await p.finishRun(p.beginRun(), input(294, 3000), 305)).toBe(false);
    store.failRemove.clear();
    const next = await new Persistence(store).load();
    expect(next.resume).toBeNull();
    expect(store.data.has(RUN)).toBe(false);
  });

  it('기록이 한도를 넘어 저장을 멈춘 판(input null)도 최고 점수를 저장하고 run을 지운다', async () => {
    const store = new MemoryStore();
    store.data.set(RUN, 'stale');
    const p = new Persistence(store);
    await p.load();
    expect(await p.finishRun(p.beginRun(), null, 777)).toBe(true);
    expect(storedBest(store)).toBe(777);
    expect(store.data.has(RUN)).toBe(false);
  });
});

describe('이어할 판 (resumable)', () => {
  it('저장할 때마다 가장 최근 저장으로 바뀌고, 끝나거나 지우면 null', async () => {
    const store = new MemoryStore();
    const p = new Persistence(store);
    await p.load();
    expect(p.resumable()).toBeNull();
    const epoch = p.beginRun();
    await p.saveRun(epoch, input(16, 3));
    expect(p.resumable()?.saved.placements).toHaveLength(3);
    await p.saveRun(epoch, input(16, 6));
    expect(p.resumable()?.saved.placements).toHaveLength(6);
    expect(p.resumable()?.state.score).toBe(playGreedy(16, 6).state.score);
    await p.discardRun(epoch);
    expect(p.resumable()).toBeNull();
  });

  it('끝난 판을 저장하면(over) 이어하기 대상이 아니다', async () => {
    const store = new MemoryStore();
    const p = new Persistence(store);
    await p.load();
    await p.saveRun(p.beginRun(), input(294, 3000));
    expect(p.resumable()).toBeNull();
  });
});

describe('부팅 읽기가 늦을 때 (리뷰 지적 1)', () => {
  /** seed 16의 3수 run이 디스크에 있고, load의 첫 읽기가 멈춰 있다 */
  async function slowBoot() {
    const store = new MemoryStore();
    store.data.set(RUN, serializeRun(input(16, 3, 3000)));
    store.holdReads = true;
    const p = new Persistence(store);
    const loading = p.load();
    await flush();
    return { store, p, loading };
  }
  async function release(store: MemoryStore) {
    store.holdReads = false;
    store.releaseNext();
    await flush(200);
  }

  it('load 지연 중 새 판이 저장되면 디스크도 resumable도 새 판이다', async () => {
    const { store, p, loading } = await slowBoot();
    const saving = p.saveRun(p.beginRun(), input(5, 4));
    await release(store);
    await Promise.all([loading, saving]);
    expect(parseRun(store.data.get(RUN) ?? null)?.seed).toBe(5);
    expect(p.resumable()?.saved.seed).toBe(5);
    expect(p.resumable()?.saved.placements).toHaveLength(4);
  });

  it('load 지연 중 run을 지우면 디스크도 resumable도 없다', async () => {
    const { store, p, loading } = await slowBoot();
    const discarding = p.discardRun(p.beginRun());
    await release(store);
    await Promise.all([loading, discarding]);
    expect(store.data.has(RUN)).toBe(false);
    expect(p.resumable()).toBeNull();
  });

  it('load 지연 중 판이 끝나면 디스크도 resumable도 없고 최고 점수가 저장된다', async () => {
    const { store, p, loading } = await slowBoot();
    const finishing = p.finishRun(p.beginRun(), input(294, 3000), 305);
    await release(store);
    await Promise.all([loading, finishing]);
    expect(store.data.has(RUN)).toBe(false);
    expect(p.resumable()).toBeNull();
    expect(storedBest(store)).toBe(305);
  });

  it('beginRun만 했고 한 수도 안 뒀다면 기존 run이 resumable로 남는다 (디스크도 그대로)', async () => {
    const { store, p, loading } = await slowBoot();
    p.beginRun();
    await release(store);
    await loading;
    expect(p.resumable()?.saved.seed).toBe(16);
    expect(p.resumable()?.saved.placements).toHaveLength(3);
    expect(parseRun(store.data.get(RUN) ?? null)?.seed).toBe(16);
  });

  it('끝난 옛 run 복구(over 분기)가 방금 저장한 새 판을 지우지 않는다', async () => {
    const store = new MemoryStore();
    store.data.set(RUN, serializeRun(input(294, 3000))); // 끝난 판, 302점
    store.holdReads = true;
    const p = new Persistence(store);
    const loading = p.load();
    await flush();
    const saving = p.saveRun(p.beginRun(), input(5, 4));
    await release(store);
    await Promise.all([loading, saving]);
    expect(parseRun(store.data.get(RUN) ?? null)?.seed).toBe(5);
    expect(p.resumable()?.saved.seed).toBe(5);
    expect(storedBest(store)).toBe(305); // 최고 점수 복구는 그대로
  });
});

describe('첫 progress 읽기가 일시 실패했다가 복구될 때 (리뷰 지적 2)', () => {
  const SAVED = JSON.stringify({
    version: 1,
    bestScore: 900,
    settings: { muted: true, music: false, theme: 'soda' },
  });
  async function flaky() {
    const store = new MemoryStore();
    store.data.set(PROGRESS, SAVED);
    store.failGetOnce.add(PROGRESS);
    const p = new Persistence(store);
    const result = await p.load();
    expect(result.readable).toBe(false);
    return { store, p };
  }

  it('finishRun은 최고 점수만 올리고 건드리지 않은 설정(muted·music)을 보존한다', async () => {
    const { store, p } = await flaky();
    expect(await p.finishRun(p.beginRun(), null, 1000)).toBe(true);
    expect(parseSave(store.data.get(PROGRESS) ?? null)).toEqual({
      version: 1,
      bestScore: 1000,
      settings: { muted: true, music: false, theme: 'soda' },
    });
  });

  it('setMuted로 바꾼 값은 저장하고 나머지(최고 점수·music)는 저장값을 유지한다', async () => {
    const { store, p } = await flaky();
    expect(await p.setMuted(false)).toBe(true);
    expect(parseSave(store.data.get(PROGRESS) ?? null)).toEqual({
      version: 1,
      bestScore: 900,
      settings: { muted: false, music: false, theme: 'soda' },
    });
  });

  it('다른 탭이 바꾼 설정도 덮지 않고, 최고 점수는 max', async () => {
    const { store, p } = await flaky();
    store.data.set(PROGRESS, progressJson(2000, false)); // 다른 탭: best 2000, muted false
    await p.finishRun(p.beginRun(), null, 1000);
    const saved = parseSave(store.data.get(PROGRESS) ?? null);
    expect(saved.bestScore).toBe(2000);
    expect(saved.settings).toEqual({ muted: false, music: true, theme: 'soda' });
  });

  it('읽기가 계속 실패하면 지금처럼 쓰지 않는다', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, SAVED);
    store.failGet.add(PROGRESS);
    const p = new Persistence(store);
    await p.load();
    expect(await p.finishRun(p.beginRun(), null, 1000)).toBe(false);
    expect(await p.setMuted(false)).toBe(false);
    expect(store.data.get(PROGRESS)).toBe(SAVED);
  });
});

describe('LoadResult.storedBest: 부팅 시점에 저장소에 확정돼 있던 최고 점수', () => {
  /** 첫 읽기가 멈춘 채 load를 시작하고, 이번 실행의 판이 `score`점으로 끝난 뒤 읽기를 푼다 */
  async function finishedDuringRead(stored: number, score: number) {
    const store = new MemoryStore();
    store.data.set(PROGRESS, progressJson(stored));
    store.holdReads = true;
    const p = new Persistence(store);
    const loading = p.load();
    await flush();
    void p.finishRun(p.beginRun(), null, score); // 읽기가 끝나기 전에 게임 오버
    store.holdReads = false;
    store.releaseNext();
    await flush(200);
    return loading;
  }

  it('읽기 지연 중 300점으로 끝나도 storedBest는 저장돼 있던 900, bestScore도 900', async () => {
    const result = await finishedDuringRead(900, 300);
    expect(result.storedBest).toBe(900);
    expect(result.bestScore).toBe(900);
  });

  it('읽기 지연 중 저장 100·종료 300: storedBest 100, bestScore 300 (이번 판 점수는 bestScore에만)', async () => {
    const result = await finishedDuringRead(100, 300);
    expect(result.storedBest).toBe(100);
    expect(result.bestScore).toBe(300);
  });

  it('보통 부팅: 저장된 값 그대로', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, progressJson(700));
    expect((await new Persistence(store).load()).storedBest).toBe(700);
  });

  it('저장된 것이 없으면 0', async () => {
    expect((await new Persistence(new MemoryStore()).load()).storedBest).toBe(0);
  });

  it('progress 읽기 실패면 0 (run 복구도 없다)', async () => {
    const store = new MemoryStore();
    store.failGet.add(PROGRESS);
    store.data.set(PROGRESS, progressJson(900));
    expect((await new Persistence(store).load()).storedBest).toBe(0);
  });

  it('끝난 run 복구로 되살린 점수는 포함한다 (이 판 이전의 기록이다): 저장 100 + 끝난 run 305 → 305', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, progressJson(100));
    store.data.set(RUN, serializeRun(input(294, 3000))); // seed 294: 302점에서 게임 오버
    const result = await new Persistence(store).load();
    expect(result.storedBest).toBe(305);
    expect(result.bestScore).toBe(305);
  });

  it('끝난 run의 점수가 더 낮으면 저장된 값: 저장 900 + 끝난 run 305 → 900', async () => {
    const store = new MemoryStore();
    store.data.set(PROGRESS, progressJson(900));
    store.data.set(RUN, serializeRun(input(294, 3000)));
    expect((await new Persistence(store).load()).storedBest).toBe(900);
  });
});
