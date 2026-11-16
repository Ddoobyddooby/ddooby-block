import { describe, expect, it } from 'vitest';
import { cellsAt } from '../../src/core/board';
import { createGame, place } from '../../src/core/engine';
import { getPiece } from '../../src/core/pieces';
import { checkIntervals, replay } from '../../src/core/replay';
import type { Board, GameState, PlaceAction, Placement } from '../../src/core/types';
import { FIXTURES } from '../helpers/replayFixtures';
import { games, pick, SEEDS, type Game } from '../helpers/randomBot';

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

describe('replay: 깨진 로그 항목 (JSON에서 파싱되는 손상 데이터)', () => {
  const bad = (v: unknown): readonly PlaceAction[] => v as readonly PlaceAction[];

  it('[null] → index 0 invalid', () => {
    expect(replay(1, bad([null]))).toEqual({ ok: false, index: 0, reason: 'invalid' });
  });

  it('정상 배치 2개 뒤 null → index 2 invalid (예외 없음)', () => {
    const g = gameOf(1);
    const head = g.log.slice(0, 2);
    expect(replay(g.seed, bad([...head, null]))).toEqual({
      ok: false,
      index: 2,
      reason: 'invalid',
    });
    // 앞 2개는 정상이라 그 부분만 돌리면 성공한다 (null에서 멈춘 것이지 앞이 틀린 게 아니다)
    expect(replay(g.seed, head).ok).toBe(true);
  });

  it('숫자·문자열·배열·불리언·빈 구멍·undefined 항목도 invalid', () => {
    const g = gameOf(1);
    const first = pick(g.log, 0);
    // eslint-disable-next-line no-sparse-arrays
    const holes = [first, , first];
    for (const item of [0, 1, 'x', '', [], [0, 0, 0], true, undefined]) {
      expect(replay(g.seed, bad([first, item])), String(item)).toEqual({
        ok: false,
        index: 1,
        reason: 'invalid',
      });
    }
    expect(replay(g.seed, bad(holes))).toEqual({ ok: false, index: 1, reason: 'invalid' });
  });

  it('placements가 배열이 아니면 index 0 invalid', () => {
    for (const v of [null, undefined, {}, { length: 0 }, 'abc', 5]) {
      expect(replay(1, bad(v)), String(v)).toEqual({ ok: false, index: 0, reason: 'invalid' });
    }
  });

  it('객체이지만 필드가 잘못된 항목은 엔진이 판정한다 (invalid가 아니다)', () => {
    const g = gameOf(1);
    const a0 = pick(g.log, 0);
    expect(replay(g.seed, bad([{ ...a0, row: null }]))).toEqual({
      ok: false,
      index: 0,
      reason: 'blocked',
    });
    expect(replay(g.seed, bad([{ ...a0, trayIndex: '0' }]))).toEqual({
      ok: false,
      index: 0,
      reason: 'emptySlot',
    });
    expect(replay(g.seed, bad([{}]))).toEqual({ ok: false, index: 0, reason: 'emptySlot' });
  });
});

describe('checkIntervals: 깨진 입력', () => {
  const at = (...ts: unknown[]): Placement[] =>
    ts.map((t) => ({ trayIndex: 0, row: 0, col: 0, t }) as Placement);
  const bad = (v: unknown): readonly Placement[] => v as readonly Placement[];

  it('null 항목은 false (맨 앞·중간·마지막·하나뿐)', () => {
    const p = pick(at(0, 300, 600), 1);
    expect(checkIntervals(bad([null]), 200)).toBe(false);
    expect(checkIntervals(bad([null, p]), 200)).toBe(false);
    expect(checkIntervals(bad([pick(at(0), 0), null, pick(at(900), 0)]), 200)).toBe(false);
    expect(checkIntervals(bad([pick(at(0), 0), null]), 200)).toBe(false);
  });

  it('객체가 아닌 항목(숫자·문자열·배열·빈 구멍)은 false', () => {
    for (const item of [0, 'x', [], [1], true, undefined]) {
      expect(checkIntervals(bad([item]), 200), String(item)).toBe(false);
    }
    // eslint-disable-next-line no-sparse-arrays
    expect(checkIntervals(bad([pick(at(0), 0), , pick(at(900), 0)]), 200)).toBe(false);
  });

  it('배열이 아닌 입력은 false', () => {
    for (const v of [null, undefined, {}, { length: 0 }, 'abc', 5]) {
      expect(checkIntervals(bad(v), 200), String(v)).toBe(false);
    }
  });

  it('minMs가 음수·NaN·Infinity·숫자가 아니면 false (0개·1개 로그여도)', () => {
    for (const minMs of [-1, NaN, Infinity, -Infinity, '200' as unknown as number]) {
      expect(checkIntervals(at(0, 1000), minMs), String(minMs)).toBe(false);
      expect(checkIntervals([], minMs), String(minMs)).toBe(false);
      expect(checkIntervals(at(0), minMs), String(minMs)).toBe(false);
    }
    expect(checkIntervals([], 0)).toBe(true);
  });
});

function boardText(board: Board): string {
  const rows: string[] = [];
  for (let r = 0; r < board.size; r++) {
    rows.push(
      board.cells
        .slice(r * board.size, (r + 1) * board.size)
        .map((c) => (c === null ? '.' : String(c)))
        .join(''),
    );
  }
  return rows.join('\n');
}

describe.each(FIXTURES)('고정 로그 fixture: $name', (fx) => {
  const log: PlaceAction[] = fx.log.map(([trayIndex, row, col]) => ({ trayIndex, row, col }));

  it('replay 결과가 리터럴 기대값과 같다', () => {
    const r = replay(fx.seed, log);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.state;
    expect({
      score: s.score,
      combo: s.combo,
      missStreak: s.missStreak,
      over: s.over,
      rngState: s.rngState,
      tray: [...s.tray],
      board: boardText(s.board),
    }).toEqual(fx.final);
  });

  it('배치마다 이벤트가 기대 경로를 지난다 (경로를 지났다고 가정하지 않는다)', () => {
    let state = createGame(fx.seed);
    const deltas: number[] = [];
    const lines: number[] = [];
    const combos: number[] = [];
    const trayAt: number[] = [];
    const boardClearAt: number[] = [];
    const gameOverAt: number[] = [];
    for (const [i, action] of log.entries()) {
      const res = place(state, action);
      if (!res.ok) throw new Error(`index ${i}: ${res.reason}`);
      for (const e of res.events) {
        if (e.type === 'score') {
          deltas.push(e.delta);
          lines.push(e.lines);
          combos.push(e.combo);
        } else if (e.type === 'tray') trayAt.push(i);
        else if (e.type === 'boardClear') boardClearAt.push(i);
        else if (e.type === 'gameOver') gameOverAt.push(i);
      }
      state = res.state;
    }
    expect({ deltas, lines, combos, trayAt, boardClearAt, gameOverAt }).toEqual({
      deltas: fx.deltas,
      lines: fx.lines,
      combos: fx.combos,
      trayAt: fx.trayAt,
      boardClearAt: fx.boardClearAt,
      gameOverAt: fx.gameOverAt,
    });
    expect(deltas.reduce((a, b) => a + b, 0)).toBe(fx.final.score);
  });
});
