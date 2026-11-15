import { canPlace } from '../../src/core/board';
import { createGame, place } from '../../src/core/engine';
import { getPiece } from '../../src/core/pieces';
import type { GameEvent, GameState, PlaceAction, Placement } from '../../src/core/types';

/** 놓을 수 있는 (슬롯, 위치) 전부 */
export function candidates(state: GameState): PlaceAction[] {
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

export interface Played {
  seed: number;
  placements: Placement[];
  state: GameState;
  events: GameEvent[];
}

/**
 * 결정적 그리디 봇: 줄을 가장 많이 지우는 수(같으면 앞선 후보)를 `count`번 둔다. 게임 오버면 멈춘다.
 * `t`는 `startT + i * stepMs` (기본 간격 250ms는 최소 간격 200ms를 넘는다).
 */
export function playGreedy(seed: number, count: number, stepMs = 250, startT = 1000): Played {
  let state = createGame(seed);
  const placements: Placement[] = [];
  const events: GameEvent[] = [];
  for (let i = 0; i < count && !state.over; i++) {
    let best: { action: PlaceAction; lines: number; next: GameState; ev: GameEvent[] } | null =
      null;
    for (const action of candidates(state)) {
      const result = place(state, action);
      if (!result.ok) continue;
      const clear = result.events.find((e) => e.type === 'clear');
      const lines = clear?.type === 'clear' ? clear.rows.length + clear.cols.length : 0;
      if (best === null || lines > best.lines) {
        best = { action, lines, next: result.state, ev: result.events };
      }
    }
    if (best === null) break;
    placements.push({ ...best.action, t: startT + i * stepMs });
    events.push(...best.ev);
    state = best.next;
  }
  return { seed, placements, state, events };
}

/** 합법적으로 놓을 수 있는 수를 하나 고른다 (앞선 후보) */
export function anyMove(state: GameState): PlaceAction {
  const move = candidates(state)[0];
  if (move === undefined) throw new Error('놓을 곳이 없음');
  return move;
}
