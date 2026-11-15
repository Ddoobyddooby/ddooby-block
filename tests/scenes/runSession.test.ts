import { describe, expect, it } from 'vitest';
import { REPLAY, SAVE } from '../../src/config';
import { createGame } from '../../src/core/engine';
import { checkIntervals, replay } from '../../src/core/replay';
import type { GameState, PlaceAction, Placement } from '../../src/core/types';
import { PlayClock } from '../../src/scenes/playClock';
import { RunSession, type RunSnapshot, type RunStore } from '../../src/scenes/runSession';
import { Persistence } from '../../src/storage/persistence';
import {
  inspectRun,
  parseRun,
  restoreRun,
  serializeRun,
  type SavedRun,
} from '../../src/storage/run';
import { anyMove, playGreedy } from '../helpers/bot';
import { flush, MemoryStore } from '../helpers/memoryStore';

function fakeTime(start = 777) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

interface Call {
  kind: 'save' | 'finish' | 'discard';
  snapshot?: RunSnapshot | null;
  score?: number;
}

/** 호출을 적어 두는 가짜 저장소. 저장 시점의 로그 길이도 따로 적는다 (배열이 나중에 늘어나도 시점 값을 보려고) */
function recorder() {
  const calls: Call[] = [];
  const lengths: number[] = [];
  let begun = 0;
  const store: RunStore = {
    beginRun: () => {
      begun += 1;
      return begun;
    },
    saveRun: (_epoch, snapshot) => {
      calls.push({ kind: 'save', snapshot });
      lengths.push(snapshot.placements.length);
    },
    finishRun: (_epoch, snapshot, score) => {
      calls.push({ kind: 'finish', snapshot, score });
      lengths.push(snapshot?.placements.length ?? -1);
    },
    discardRun: () => {
      calls.push({ kind: 'discard' });
    },
  };
  return { store, calls, lengths, begunCount: () => begun };
}

interface Setup {
  seed?: number;
  state?: GameState;
  placements?: readonly Placement[];
  startMs?: number;
  replayable?: boolean;
  maxPlacements?: number;
  store?: RunStore | null;
}

function setup(options: Setup = {}) {
  const time = fakeTime();
  const seed = options.seed ?? 4;
  const clock = new PlayClock(time.now, options.startMs ?? 0);
  const rec = recorder();
  const session = new RunSession({
    seed,
    state: options.state ?? createGame(seed),
    placements: options.placements,
    clock,
    store: options.store === undefined ? rec.store : options.store,
    replayable: options.replayable ?? true,
    minIntervalMs: REPLAY.minIntervalMs,
    maxPlacements: options.maxPlacements ?? SAVE.maxRunPlacements,
  });
  return { time, clock, rec, session };
}

/** 그리디 봇이 두는 수(좌표만). 판마다 결정적이다 */
function moves(seed: number, count: number): PlaceAction[] {
  return playGreedy(seed, count).placements.map(({ trayIndex, row, col }) => ({
    trayIndex,
    row,
    col,
  }));
}

describe('배치 수락과 로그 (t = 수락 순간의 시계 값)', () => {
  it('수락하면 정수 t로 로그에 쌓고, 상태가 바로 바뀐다 (연출을 기다리지 않는다)', () => {
    const { time, session } = setup();
    time.advance(1000);
    const first = moves(4, 3);
    const outcome = session.tryPlace(first[0] as PlaceAction);
    expect(outcome.ok).toBe(true);
    expect(session.placements).toEqual([{ ...(first[0] as PlaceAction), t: 1000 }]);
    expect(session.state).not.toEqual(createGame(4));
    time.advance(333);
    session.tryPlace(first[1] as PlaceAction);
    expect(session.placements.map((p) => p.t)).toEqual([1000, 1333]);
    expect(session.placements.every((p) => Number.isInteger(p.t))).toBe(true);
  });

  it('정상 흐름(간격 250ms)으로 쌓은 로그는 replay·checkIntervals를 통과하고 시계가 거꾸로 가지 않는다', () => {
    const { time, session } = setup();
    for (const move of moves(4, 10)) {
      time.advance(250);
      expect(session.tryPlace(move).ok).toBe(true);
    }
    expect(session.placements).toHaveLength(10);
    expect(checkIntervals(session.placements, REPLAY.minIntervalMs)).toBe(true);
    const replayed = replay(4, session.placements);
    expect(replayed.ok).toBe(true);
    if (replayed.ok) expect(replayed.state).toEqual(session.state);
  });
});

describe('200ms 간격 (결정 1)', () => {
  it('마지막 수락 뒤 199ms면 집기·놓기 모두 거부, 200ms면 수락', () => {
    const { time, session } = setup();
    const [a, b] = moves(4, 2) as [PlaceAction, PlaceAction];
    time.advance(1000);
    expect(session.tryPlace(a).ok).toBe(true);
    expect(session.cooling()).toBe(true); // 같은 순간

    time.advance(199);
    expect(session.cooling()).toBe(true); // 집기 거부
    const rejected = session.tryPlace(b); // 놓기 안전장치도 거부
    expect(rejected).toEqual({ ok: false, reason: 'tooSoon' });

    time.advance(1); // 200ms
    expect(session.cooling()).toBe(false);
    const ok = session.tryPlace(b);
    expect(ok.ok).toBe(true);
    // t를 부풀리지 않는다: 실제 시계 값 그대로
    expect(session.placements.map((p) => p.t)).toEqual([1000, 1200]);
  });

  it('거부된 시도는 로그·상태·저장·마지막 t 어느 것도 바꾸지 않는다 (같은 시도를 늦게 다시 하면 수락)', () => {
    const { time, session, rec } = setup();
    const [a, b] = moves(4, 2) as [PlaceAction, PlaceAction];
    time.advance(1000);
    session.tryPlace(a);
    const stateAfterA = session.state;
    const callsAfterA = rec.calls.length;
    time.advance(100);
    expect(session.tryPlace(b).ok).toBe(false);
    expect(session.state).toBe(stateAfterA);
    expect(session.placements).toHaveLength(1);
    expect(rec.calls).toHaveLength(callsAfterA);
    time.advance(100); // 첫 수락 기준 200ms (거부한 시도 시각 기준이 아니다)
    expect(session.tryPlace(b).ok).toBe(true);
    expect(session.placements.map((p) => p.t)).toEqual([1000, 1200]);
  });

  it('첫 배치에는 하한이 없다 (t=0도 수락)', () => {
    const { session } = setup();
    expect(session.cooling()).toBe(false);
    expect((session.tryPlace(moves(4, 1)[0] as PlaceAction) as { t: number }).t).toBe(0);
  });

  it('엔진이 거부하는 배치(막힌 칸·빈 슬롯)는 로그·상태를 바꾸지 않는다', () => {
    const { time, session, rec } = setup();
    time.advance(500);
    const bad = session.tryPlace({ trayIndex: 0, row: 99, col: 0 });
    expect(bad).toEqual({ ok: false, reason: 'blocked' });
    expect(session.tryPlace({ trayIndex: 5, row: 0, col: 0 })).toEqual({
      ok: false,
      reason: 'emptySlot',
    });
    expect(session.placements).toHaveLength(0);
    expect(session.state).toEqual(createGame(4));
    expect(rec.calls).toEqual([]);
  });
});

describe('이어한 판의 시계', () => {
  function resumed(elapsedMs: number) {
    const played = playGreedy(4, 10);
    const json = serializeRun({
      seed: 4,
      runId: null,
      placements: played.placements,
      elapsedMs,
      state: played.state,
    });
    const saved = parseRun(json) as SavedRun;
    const state = restoreRun(saved) as GameState;
    return {
      played,
      saved,
      ...setup({ state, placements: saved.placements, startMs: saved.elapsedMs }),
    };
  }

  it('시계가 저장된 elapsedMs에서 시작하고, 이어서 둔 로그 전체가 replay·checkIntervals를 통과한다', () => {
    const { time, session, saved, clock } = resumed(3300);
    expect(clock.elapsed()).toBe(3300);
    expect(session.state.score).toBe(483);
    // 마지막 t는 3250. 3300 + 150 = 3450 (= 마지막 t + 200)부터 둘 수 있다
    expect(session.cooling()).toBe(true);
    time.advance(149);
    expect(session.cooling()).toBe(true);
    time.advance(1);
    expect(session.cooling()).toBe(false);
    const move = anyMove(session.state);
    expect(session.tryPlace(move).ok).toBe(true);
    expect(session.placements).toHaveLength(11);
    expect((session.placements[10] as Placement).t).toBe(3450);
    expect((session.placements[10] as Placement).t).toBeGreaterThan(
      (saved.placements[9] as Placement).t,
    );
    expect(checkIntervals(session.placements, 200)).toBe(true);
    expect(replay(4, session.placements).ok).toBe(true);
  });

  it('저장 elapsed = 마지막 t + 150이면 +49는 거부, +50은 수락 (언제나 200ms를 더 기다리게 하지 않는다)', () => {
    const { time, session } = resumed(3250 + 150);
    time.advance(49);
    expect(session.tryPlace(anyMove(session.state))).toEqual({ ok: false, reason: 'tooSoon' });
    time.advance(1);
    expect(session.tryPlace(anyMove(session.state)).ok).toBe(true);
  });

  it('저장 elapsed = 마지막 t이면 200ms 뒤에 수락 (며칠 뒤에 열어도 오프라인 시간은 더해지지 않는다)', () => {
    const { time, session, clock } = resumed(3250);
    time.advance(199);
    expect(session.cooling()).toBe(true);
    expect(clock.elapsed()).toBe(3250 + 199);
    time.advance(1);
    expect(session.tryPlace(anyMove(session.state)).ok).toBe(true);
  });

  it('이어한 판의 첫 저장에도 이전 로그가 그대로 들어 있다 (로그를 잘라 쓰지 않는다)', () => {
    const { time, session, rec } = resumed(3300);
    time.advance(200);
    session.tryPlace(anyMove(session.state));
    const saved = rec.calls[0]?.snapshot;
    expect(saved?.placements).toHaveLength(11);
    expect(saved?.seed).toBe(4);
  });
});

describe('일시정지·숨김 (시계와 입력)', () => {
  it('일시정지 중에는 시계가 멈추고 배치를 받지 않는다 (재개해도 쉰 시간은 간격에 더해지지 않는다)', () => {
    const { time, clock, session } = setup();
    const [a, b] = moves(4, 2) as [PlaceAction, PlaceAction];
    time.advance(1000);
    session.tryPlace(a);
    time.advance(100);
    clock.block('paused');
    time.advance(60000);
    expect(session.tryPlace(b)).toEqual({ ok: false, reason: 'inactive' });
    expect(session.cooling()).toBe(true); // 아직 100ms밖에 안 지났다
    clock.unblock('paused');
    time.advance(99);
    expect(session.cooling()).toBe(true);
    time.advance(1);
    expect(session.tryPlace(b).ok).toBe(true);
    expect((session.placements[1] as Placement).t).toBe(1200);
  });

  it('화면이 숨겨진 동안에는 배치를 받지 않고, 보이면 받는다', () => {
    const { time, clock, session } = setup();
    const a = moves(4, 1)[0] as PlaceAction;
    clock.block('hidden');
    time.advance(500);
    expect(session.tryPlace(a)).toEqual({ ok: false, reason: 'inactive' });
    expect(session.placements).toHaveLength(0);
    clock.unblock('hidden');
    expect(session.tryPlace(a).ok).toBe(true);
  });

  it('checkpoint는 지금까지의 플레이 시간을 저장하고, 쉰 시간은 포함하지 않는다. 마지막 t보다 작아지지 않는다', () => {
    const { time, clock, session, rec } = setup();
    time.advance(1000);
    session.tryPlace(moves(4, 1)[0] as PlaceAction);
    time.advance(300);
    clock.block('paused');
    session.checkpoint();
    time.advance(99999);
    clock.block('hidden');
    session.checkpoint(); // 중복 이벤트
    const saves = rec.calls.filter((c) => c.kind === 'save');
    expect(saves.map((c) => c.snapshot?.elapsedMs)).toEqual([1000, 1300, 1300]);
    for (const call of saves) {
      expect(call.snapshot?.elapsedMs).toBeGreaterThanOrEqual(1000); // 마지막 t 이상
    }
  });
});

describe('아직 한 수도 안 둔 판', () => {
  it('checkpoint가 저장하지 않는다 (저장돼 있던 판을 빈 판으로 덮지 않는다)', () => {
    const { clock, session, rec } = setup();
    clock.block('hidden');
    session.checkpoint();
    expect(rec.calls).toEqual([]);
  });
});

describe('저장 시점과 내용 (성공 직후, 로그·상태·시각이 한 묶음)', () => {
  it('배치마다 즉시 저장하고, 저장된 로그와 상태가 같은 시점의 것이다', () => {
    const { time, session, rec } = setup();
    const list = moves(4, 10);
    list.forEach((move, i) => {
      time.advance(250);
      session.tryPlace(move);
      const call = rec.calls[i];
      expect(call?.kind).toBe('save');
      const snapshot = call?.snapshot as RunSnapshot;
      expect(rec.lengths[i]).toBe(i + 1);
      // 저장된 상태는 그 로그를 replay한 결과와 같다 (어긋나지 않는다)
      const replayed = replay(4, snapshot.placements.slice(0, i + 1));
      expect(replayed.ok).toBe(true);
      if (replayed.ok) expect(snapshot.state).toEqual(replayed.state);
      expect(snapshot.elapsedMs).toBeGreaterThanOrEqual((snapshot.placements[i] as Placement).t);
    });
    expect(rec.calls).toHaveLength(10);
  });

  it('처음부터 Persistence에 저장하면 저장된 문자열을 새로 읽어 같은 판으로 복원된다 (왕복)', async () => {
    const kv = new MemoryStore();
    const persistence = new Persistence(kv);
    await persistence.load();
    const { time, session } = setup({ store: persistence });
    for (const move of moves(4, 10)) {
      time.advance(250);
      session.tryPlace(move);
    }
    await flush(500); // 큐가 끝까지 가게 한다
    const next = await new Persistence(kv).load();
    expect(next.resume?.state).toEqual(session.state);
    expect(next.resume?.saved.placements).toEqual(session.placements);
  });
});

describe('게임 오버 (결정 2)', () => {
  function playToEnd() {
    const rig = setup({ seed: 10 });
    const list = moves(10, 3000);
    list.forEach((move) => {
      rig.time.advance(250);
      rig.session.tryPlace(move);
    });
    return { ...rig, count: list.length };
  }

  it('마지막 배치로 끝나면 저장 대신 finishRun을 한 번 부르고, 끝난 기록(마지막 배치 포함)과 점수를 넘긴다', () => {
    const { session, rec, count } = playToEnd();
    expect(session.state.over).toBe(true);
    expect(count).toBe(14);
    const finishes = rec.calls.filter((c) => c.kind === 'finish');
    expect(finishes).toHaveLength(1);
    expect(finishes[0]?.score).toBe(302);
    expect(finishes[0]?.snapshot?.placements).toHaveLength(14);
    expect(finishes[0]?.snapshot?.state.over).toBe(true);
    // 마지막 호출이 finish이고 그 뒤에 저장이 더 없다
    expect(rec.calls[rec.calls.length - 1]?.kind).toBe('finish');
    expect(rec.calls.filter((c) => c.kind === 'save')).toHaveLength(13);
  });

  it('끝난 판에서는 시계가 멈추고 checkpoint·abandon이 아무것도 저장하지 않는다', () => {
    const { time, clock, session, rec } = playToEnd();
    const before = rec.calls.length;
    const elapsed = clock.elapsed();
    time.advance(5000);
    expect(clock.elapsed()).toBe(elapsed);
    session.checkpoint();
    session.abandon();
    expect(rec.calls).toHaveLength(before);
  });
});

describe('저장하지 않는 판 (?fill= → replayable false)', () => {
  it('배치·checkpoint·abandon·게임 오버 어디서도 저장소를 건드리지 않는다 (beginRun도 안 한다)', () => {
    const { time, session, rec, clock } = setup({ replayable: false });
    for (const move of moves(4, 6)) {
      time.advance(250);
      expect(session.tryPlace(move).ok).toBe(true);
    }
    clock.block('paused');
    session.checkpoint();
    session.abandon();
    expect(rec.calls).toEqual([]);
    expect(rec.begunCount()).toBe(0);
  });

  it('끝까지 가도 최고 점수·run에 반영하지 않는다 (finishRun 없음)', () => {
    const { time, session, rec } = setup({ seed: 10, replayable: false });
    for (const move of moves(10, 3000)) {
      time.advance(250);
      session.tryPlace(move);
    }
    expect(session.state.over).toBe(true);
    expect(rec.calls).toEqual([]);
  });

  it('실제 Persistence로도: 기존 정상 run과 최고 점수가 그대로 남는다', async () => {
    const kv = new MemoryStore();
    kv.data.set(SAVE.key, JSON.stringify({ version: 1, bestScore: 900, settings: {} }));
    const run = serializeRun({
      seed: 4,
      runId: null,
      placements: playGreedy(4, 10).placements,
      elapsedMs: 3300,
      state: playGreedy(4, 10).state,
    });
    kv.data.set(SAVE.runKey, run);
    const persistence = new Persistence(kv);
    await persistence.load();
    const { time, session, clock } = setup({ seed: 10, replayable: false, store: persistence });
    for (const move of moves(10, 3000)) {
      time.advance(250);
      session.tryPlace(move);
    }
    clock.block('hidden');
    session.checkpoint();
    session.abandon();
    await flush(500);
    expect(kv.writes).toEqual([]);
    expect(kv.data.get(SAVE.runKey)).toBe(run);
    expect(JSON.parse(kv.data.get(SAVE.key) as string).bestScore).toBe(900);
  });
});

describe('다시 하기·기록 한도', () => {
  it('abandon은 run을 한 번 지우고 이 판의 저장을 멈춘다', () => {
    const { time, session, rec } = setup();
    time.advance(250);
    session.tryPlace(moves(4, 1)[0] as PlaceAction);
    session.abandon();
    session.abandon();
    session.checkpoint();
    expect(rec.calls.map((c) => c.kind)).toEqual(['save', 'discard']);
    time.advance(250);
    session.tryPlace(moves(4, 2)[1] as PlaceAction); // 늦게 온 입력도 저장하지 않는다
    expect(rec.calls.map((c) => c.kind)).toEqual(['save', 'discard']);
  });

  it('기록이 한도를 넘으면 그 판은 계속되지만 저장을 멈추고 저장돼 있던 run을 지운다', () => {
    const { time, session, rec } = setup({ maxPlacements: 3 });
    const list = moves(4, 6);
    list.forEach((move) => {
      time.advance(250);
      expect(session.tryPlace(move).ok).toBe(true); // 판은 계속된다
    });
    expect(session.placements).toHaveLength(6);
    // 3개까지는 저장, 4번째에서 한 번 지우고, 그 뒤는 저장하지 않는다
    expect(rec.calls.map((c) => c.kind)).toEqual(['save', 'save', 'save', 'discard']);
    expect(rec.lengths).toEqual([1, 2, 3, ...(rec.lengths.slice(3) as number[])]);
  });

  it('한도에서 정확히 N개까지는 저장된다 (N은 통과, N+1에서 멈춤)', () => {
    const { time, session, rec } = setup({ maxPlacements: 4 });
    for (const move of moves(4, 5)) {
      time.advance(250);
      session.tryPlace(move);
    }
    expect(rec.calls.map((c) => c.kind)).toEqual(['save', 'save', 'save', 'save', 'discard']);
  });

  it('한도를 넘은 판이 끝나면 기록 없이 최고 점수·삭제만 요청한다', () => {
    const { time, session, rec } = setup({ seed: 10, maxPlacements: 3 });
    for (const move of moves(10, 3000)) {
      time.advance(250);
      session.tryPlace(move);
    }
    expect(session.state.over).toBe(true);
    const finish = rec.calls.find((c) => c.kind === 'finish');
    expect(finish).toEqual({ kind: 'finish', snapshot: null, score: 302 });
  });
});

describe('저장소 없음', () => {
  it('store가 null이어도 판은 정상 진행된다', () => {
    const { time, session } = setup({ store: null });
    for (const move of moves(4, 5)) {
      time.advance(250);
      expect(session.tryPlace(move).ok).toBe(true);
    }
    session.checkpoint();
    session.abandon();
    expect(session.placements).toHaveLength(5);
    expect(inspectRun(null).kind).toBe('rejected');
  });
});
