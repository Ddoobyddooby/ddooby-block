// 무작위 봇 (W2-02): replay 테스트와 서버 판정 테스트(W3-03)가 같은 로그를 쓴다.
// 놓을 수 있는 (슬롯, 위치) 후보 중 무작위로 고른다.
// 봇의 무작위는 core/rng.ts를 게임 seed와 다른 seed(BOT_SEED_OFFSET + seed)로 써서 매번 같게 돈다.
import { canPlace } from '../../src/core/board';
import { createGame, place } from '../../src/core/engine';
import { getPiece } from '../../src/core/pieces';
import { createRng, nextInt } from '../../src/core/rng';
import type { GameState, PlaceAction, Placement } from '../../src/core/types';

export const SEEDS = 200;
export const BOT_SEED_OFFSET = 1_000_000;
/** 무작위 봇이 이 안에 게임 오버가 안 나면 테스트 실패 (seed를 메시지에 담는다) */
export const MAX_PLACEMENTS = 3000;

export interface Game {
  seed: number;
  log: PlaceAction[];
  state: GameState;
  scoreSum: number;
  clears: number;
  trays: number;
}

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

export function playBot(seed: number): Game {
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
export function games(): Game[] {
  cache ??= Array.from({ length: SEEDS }, (_, i) => playBot(i + 1));
  return cache;
}
export function pick<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`index ${i} 없음`);
  return v;
}

/** 서버 판정용: 배치마다 `t = startT + i * stepMs`를 붙인다 (기본 250ms는 최소 간격 200ms를 넘는다). core 상태는 t와 무관하다 */
export function withTimes(log: readonly PlaceAction[], stepMs = 250, startT = 1000): Placement[] {
  return log.map((a, i) => ({
    trayIndex: a.trayIndex,
    row: a.row,
    col: a.col,
    t: startT + i * stepMs,
  }));
}
