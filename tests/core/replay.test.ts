import { describe, expect, it } from 'vitest';
import { canPlace, cellsAt } from '../../src/core/board';
import { createGame, place } from '../../src/core/engine';
import { getPiece } from '../../src/core/pieces';
import { checkIntervals, replay } from '../../src/core/replay';
import { createRng, nextInt } from '../../src/core/rng';
import type { GameState, PlaceAction, Placement } from '../../src/core/types';

// 무작위 봇: 놓을 수 있는 (슬롯, 위치) 후보 중 무작위로 고른다.
// 봇의 무작위는 core/rng.ts를 게임 seed와 다른 seed(BOT_SEED_OFFSET + seed)로 써서 매번 같게 돈다.

const SEEDS = 200;
const BOT_SEED_OFFSET = 1_000_000;
/** 무작위 봇이 이 안에 게임 오버가 안 나면 테스트 실패 (seed를 메시지에 담는다) */
const MAX_PLACEMENTS = 3000;

interface Game {
  seed: number;
  log: PlaceAction[];
  state: GameState;
  scoreSum: number;
  clears: number;
  trays: number;
}

function candidates(state: GameState): PlaceAction[] {
  const out: PlaceAction[] = [];
  state.tray.forEach((id, trayIndex) => {
    const piece = id === null ? undefined : getPiece(id);
    if (piece === undefined) return;
    for (let row = 0; row < state.board.size; row++) {
      for (let col = 0; col < state.board.size; col++) {
        if (canPlace(state.board, piece, { r: row, c: col })) out.push({ trayIndex, row, col });
      }
    }
  });
  return out;
}

function playBot(seed: number): Game {
  let state = createGame(seed);
  let rng = createRng(BOT_SEED_OFFSET + seed);
  const log: PlaceAction[] = [];
  let scoreSum = 0;
  let clears = 0;
  let trays = 0;
  while (!state.over) {
    if (log.length >= MAX_PLACEMENTS) {
      throw new Error(`seed ${seed}: ${MAX_PLACEMENTS}번 안에 게임 오버가 나지 않음`);
    }
    const cands = candidates(state);
    if (cands.length === 0) throw new Error(`seed ${seed}: over가 아닌데 놓을 곳이 없음`);
    const [i, nextRng] = nextInt(rng, cands.length);
    rng = nextRng;
    const action = pick(cands, i);
    const result = place(state, action);
    if (!result.ok) throw new Error(`seed ${seed}: 후보 ${JSON.stringify(action)}가 거부됨`);
    log.push(action);
    state = result.state;
    for (const e of result.events) {
      if (e.type === 'score') scoreSum += e.delta;
      else if (e.type === 'clear') clears++;
      else if (e.type === 'tray') trays++;
    }
  }
  return { seed, log, state, scoreSum, clears, trays };
}

let cache: Game[] | undefined;
function games(): Game[] {
  cache ??= Array.from({ length: SEEDS }, (_, i) => playBot(i + 1));
  return cache;
}
function pick<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`index ${i} 없음`);
  return v;
}
function gameOf(seed: number): Game {
  const g = games()[seed - 1];
  if (g === undefined) throw new Error(`seed ${seed} 없음`);
  return g;
}

describe('replay: 무작위 봇 seed 1~200', () => {
  it('200판 모두 게임 오버로 끝나고 트레이 재생성·점수가 있었고 줄 제거는 상당수 판에 있었다', () => {
    const all = games();
    expect(all).toHaveLength(SEEDS);
    for (const g of all) {
      expect(g.state.over, `seed ${g.seed}`).toBe(true);
      expect(g.trays, `seed ${g.seed} 트레이 재생성`).toBeGreaterThan(0);
      expect(g.state.score, `seed ${g.seed} 점수`).toBeGreaterThan(0);
    }
    // 무작위 봇은 줄을 한 번도 못 지우고 끝나는 판도 있어서(seed 4 등 200판 중 85판) 줄 제거는 판마다가 아니라 전체로 본다
    const withClear = all.filter((g) => g.clears > 0).length;
    expect(withClear).toBeGreaterThan(SEEDS * 0.4);
  });

  it('replay(seed, 로그)의 상태가 원래 상태와 toEqual (SPEC 11절 6번)', () => {
    for (const g of games()) {
      const r = replay(g.seed, g.log);
      expect(r.ok, `seed ${g.seed}`).toBe(true);
      if (r.ok) expect(r.state, `seed ${g.seed}`).toEqual(g.state);
    }
  });

  it('score 이벤트 delta의 합이 replay 상태의 score와 같다', () => {
    for (const g of games()) {
      const r = replay(g.seed, g.log);
      expect(r.ok && r.state.score, `seed ${g.seed}`).toBe(g.scoreSum);
    }
  });

  it('Placement(t 포함) 로그도 같은 결과이고 t는 보지 않는다', () => {
    const g = gameOf(1);
    const withT: Placement[] = g.log.map((a, i) => ({ ...a, t: i * 300 }));
    const scrambled: Placement[] = g.log.map((a, i) => ({ ...a, t: i % 2 === 0 ? 5 : -1 }));
    expect(replay(g.seed, withT)).toEqual(replay(g.seed, g.log));
    expect(replay(g.seed, scrambled)).toEqual(replay(g.seed, g.log));
  });

  it('입력을 바꾸지 않고 같은 입력은 같은 결과다', () => {
    const g = gameOf(2);
    const frozen = Object.freeze(g.log.map((a) => Object.freeze({ ...a })));
    const before = JSON.stringify(frozen);
    const a = replay(g.seed, frozen);
    const b = replay(g.seed, frozen);
    expect(a).toEqual(b);
    expect(JSON.stringify(frozen)).toBe(before);
  });

  it('빈 로그는 createGame(seed)', () => {
    expect(replay(7, [])).toEqual({ ok: true, state: createGame(7) });
  });
});

describe('replay: 로그가 틀렸을 때', () => {
  /** k번째 배치 직전 상태 */
  function stateBefore(g: Game, k: number): GameState {
    const r = replay(g.seed, g.log.slice(0, k));
    if (!r.ok) throw new Error('앞부분이 실패');
    return r.state;
  }

  it('k번째를 이미 찬 칸으로 바꾸면 { ok: false, index: k, reason: blocked }', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const g = gameOf(seed);
      const k = Math.floor(g.log.length / 2);
      const s = stateBefore(g, k);
      const trayIndex = pick(g.log, k).trayIndex;
      const piece = getPiece(s.tray[trayIndex] as string)!;
      // 보드 안에 들어가지만 찬 칸과 겹치는 위치를 찾는다
      let bad: PlaceAction | undefined;
      for (let row = 0; row < 8 && !bad; row++) {
        for (let col = 0; col < 8 && !bad; col++) {
          const cells = cellsAt(piece, { r: row, c: col });
          const inside = cells.every((p) => p.r < 8 && p.c < 8);
          if (inside && cells.some((p) => s.board.cells[p.r * 8 + p.c] !== null)) {
            bad = { trayIndex, row, col };
          }
        }
      }
      expect(bad, `seed ${seed}: 겹치는 위치가 없음`).toBeDefined();
      const log = g.log.map((a, i) => (i === k ? bad! : a));
      expect(replay(seed, log), `seed ${seed}`).toEqual({ ok: false, index: k, reason: 'blocked' });
    }
  });

  it('범위 밖 위치도 blocked', () => {
    const g = gameOf(1);
    const log = g.log.map((a, i) => (i === 2 ? { ...a, row: 99 } : a));
    expect(replay(g.seed, log)).toEqual({ ok: false, index: 2, reason: 'blocked' });
  });

  it('이미 놓은 슬롯을 다시 쓰면 emptySlot', () => {
    const g = gameOf(1);
    const log = [pick(g.log, 0), { ...pick(g.log, 1), trayIndex: pick(g.log, 0).trayIndex }];
    expect(replay(g.seed, log)).toEqual({ ok: false, index: 1, reason: 'emptySlot' });
  });

  it('게임 오버 뒤에 배치를 더하면 그 index에서 over', () => {
    for (const g of games().slice(0, 10)) {
      const log = [...g.log, pick(g.log, 0), pick(g.log, 1)];
      expect(replay(g.seed, log), `seed ${g.seed}`).toEqual({
        ok: false,
        index: g.log.length,
        reason: 'over',
      });
    }
  });

  it('타입을 어긴 배치는 그 index에서 실패한다', () => {
    const g = gameOf(1);
    const nullRow = { ...pick(g.log, 2), row: null } as unknown as PlaceAction;
    const strSlot = { ...pick(g.log, 2), trayIndex: '0' } as unknown as PlaceAction;
    const nanCol = { ...pick(g.log, 2), col: NaN } as PlaceAction;
    expect(replay(g.seed, [pick(g.log, 0), pick(g.log, 1), nullRow])).toEqual({
      ok: false,
      index: 2,
      reason: 'blocked',
    });
    expect(replay(g.seed, [pick(g.log, 0), pick(g.log, 1), strSlot])).toEqual({
      ok: false,
      index: 2,
      reason: 'emptySlot',
    });
    expect(replay(g.seed, [pick(g.log, 0), pick(g.log, 1), nanCol])).toEqual({
      ok: false,
      index: 2,
      reason: 'blocked',
    });
  });

  it('로그를 한 칸이라도 바꾸면 실패하거나 최종 상태가 달라진다', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = gameOf(seed);
      const mid = Math.floor(g.log.length / 2);
      const variants: Record<string, PlaceAction[]> = {
        좌표변경: g.log.map((a, i) => (i === mid ? { ...a, col: (a.col + 1) % 8 } : a)),
        하나빼기: g.log.filter((_, i) => i !== mid),
        마지막빼기: g.log.slice(0, -1),
        순서뒤집기: [...g.log].reverse(),
      };
      for (const [name, log] of Object.entries(variants)) {
        const r = replay(seed, log);
        const same = r.ok && JSON.stringify(r.state) === JSON.stringify(g.state);
        expect(same, `seed ${seed} ${name}`).toBe(false);
      }
    }
  });
});

describe('checkIntervals', () => {
  const at = (...ts: unknown[]): Placement[] =>
    ts.map((t) => ({ trayIndex: 0, row: 0, col: 0, t }) as Placement);

  it('간격 199 → false, 200 → true', () => {
    expect(checkIntervals(at(0, 199), 200)).toBe(false);
    expect(checkIntervals(at(0, 200), 200)).toBe(true);
    expect(checkIntervals(at(1000, 1199), 200)).toBe(false);
    expect(checkIntervals(at(1000, 1200), 200)).toBe(true);
  });

  it('t가 줄어들거나 같으면 false', () => {
    expect(checkIntervals(at(500, 300), 200)).toBe(false);
    expect(checkIntervals(at(500, 500), 200)).toBe(false);
    expect(checkIntervals(at(500, 500), 0)).toBe(false); // minMs 0이어도 늘어나야 한다
    expect(checkIntervals(at(0, 300, 250), 0)).toBe(false);
  });

  it('0개·1개는 true (첫 t에 하한 없음)', () => {
    expect(checkIntervals([], 200)).toBe(true);
    expect(checkIntervals(at(0), 200)).toBe(true);
    expect(checkIntervals(at(5), 200)).toBe(true);
  });

  it('긴 로그에서 간격이 한 곳만 짧으면 false', () => {
    const ok = Array.from({ length: 50 }, (_, i) => i * 200);
    expect(checkIntervals(at(...ok), 200)).toBe(true);
    const bad = ok.map((t, i) => (i >= 30 ? t - 1 : t)); // 29→30 간격만 199
    expect(checkIntervals(at(...bad), 200)).toBe(false);
  });

  it('NaN·Infinity·음수·null·숫자가 아닌 t는 false', () => {
    for (const bad of [NaN, Infinity, -Infinity, -1, null, undefined, '300', {}, true]) {
      expect(checkIntervals(at(bad), 200), String(bad)).toBe(false);
      expect(checkIntervals(at(0, bad), 200), String(bad)).toBe(false);
      expect(checkIntervals(at(bad, 1000), 200), String(bad)).toBe(false);
    }
  });

  it('minMs 0이면 t가 늘기만 하면 true', () => {
    expect(checkIntervals(at(0, 1, 2), 0)).toBe(true);
    expect(checkIntervals(at(0.5, 0.6), 0)).toBe(true);
  });
});
