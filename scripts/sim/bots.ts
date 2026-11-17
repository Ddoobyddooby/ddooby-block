// 시뮬레이션 봇 (W4-02). 모두 결정적이다: 같은 (봇, seed, 상태) = 같은 수.
// 봇은 상태만 보고 (조각, 자리)를 고른다. 규칙 판정은 core의 place가 한다.
//
// - greedy: 이번 수의 점수 증가(delta)가 가장 큰 수. 같으면 후보 순서(슬롯 → 행 → 열)가 앞선 수.
//   tests/helpers/bot.ts의 playGreedy는 "지운 줄 수"가 기준이라 다르다 (그쪽은 줄이 같으면 앞선 수, 이쪽은 칸 수까지 본 점수).
//   공유하지 않는다: tests가 scripts를 가져오거나 그 반대가 되면 의존 방향이 꼬이고, 그쪽은 서버 시험 로그가 기대는 고정 동작이다.
// - random: 합법 수 중 무작위. 무작위는 core/rng.ts를 게임 seed와 다른 seed(BOT_SEED_OFFSET + seed)로 쓴다.
// - smart: greedy에 "다음에 놓을 곳이 남는지"와 "고립된 빈 칸"을 더한 휴리스틱. 사람 실력 범위를 가늠하는 용도다.

import { canPlace, canPlaceAnywhere } from '../../src/core/board';
import { place } from '../../src/core/engine';
import { getPiece } from '../../src/core/pieces';
import { createRng, nextInt, type RngState } from '../../src/core/rng';
import type { GameEvent, GameState, PlaceAction } from '../../src/core/types';

export const BOT_NAMES = ['greedy', 'random', 'smart', 'survivor'] as const;
export type BotName = (typeof BOT_NAMES)[number];

export const BOT_SEED_OFFSET = 1_000_000;

export interface Move {
  action: PlaceAction;
  state: GameState;
  events: GameEvent[];
}

export interface Bot {
  readonly name: BotName;
  choose(state: GameState): Move;
}

/** 놓을 수 있는 (슬롯, 위치) 전부. 순서: 슬롯 → 행 → 열 */
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

function apply(state: GameState, action: PlaceAction): Move {
  const result = place(state, action);
  if (!result.ok) {
    throw new Error(`봇이 고른 수가 거부됨: ${JSON.stringify(action)} (${result.reason})`);
  }
  return { action, state: result.state, events: result.events };
}

function scoreDelta(events: readonly GameEvent[]): number {
  for (const e of events) if (e.type === 'score') return e.delta;
  return 0;
}

/** 후보를 모두 적용해 보고 평가 값이 가장 큰 수(같으면 앞선 수)를 고른다 */
function best(state: GameState, evaluate: (move: Move, before: GameState) => number): Move {
  const cands = candidates(state);
  if (cands.length === 0) throw new Error('놓을 곳이 없음 (over가 아닌데)');
  let chosen: Move | null = null;
  let chosenValue = -Infinity;
  for (const action of cands) {
    const move = apply(state, action);
    const value = evaluate(move, state);
    if (value > chosenValue) {
      chosen = move;
      chosenValue = value;
    }
  }
  if (chosen === null) throw new Error('평가 값이 모두 유효하지 않음');
  return chosen;
}

function greedy(): Bot {
  return { name: 'greedy', choose: (state) => best(state, (move) => scoreDelta(move.events)) };
}

function random(seed: number): Bot {
  let rng: RngState = createRng(BOT_SEED_OFFSET + seed);
  return {
    name: 'random',
    choose(state) {
      const cands = candidates(state);
      if (cands.length === 0) throw new Error('놓을 곳이 없음 (over가 아닌데)');
      const [i, next] = nextInt(rng, cands.length);
      rng = next;
      const action = cands[i];
      if (action === undefined) throw new Error(`후보 index ${i} 없음`);
      return apply(state, action);
    },
  };
}

/** smart 평가 가중치. 손으로 한 번 맞춘 값이고 정확한 최적화가 아니다 */
export const SMART = {
  /** 아직 트레이에 남은 조각마다 놓을 수 있는 자리 수(상한 `mobilityCap`)에 곱한다 */
  mobility: 2,
  mobilityCap: 10,
  /** 남은 조각 중 놓을 곳이 없는 것 하나당 감점 */
  stuck: 60,
  /** 사방이 막힌 빈 칸(고립) 하나당 감점 */
  isolated: 8,
  /** 줄이 가득 찬 정도 (채운 비율의 세제곱 합)에 곱한다: 줄 완성에 가까운 자리를 선호 */
  fill: 12,
} as const;

function evaluateSmart(move: Move, before: GameState): number {
  const board = move.state.board;
  const size = board.size;
  let value = scoreDelta(move.events);

  // 고립된 빈 칸과 줄의 채운 정도
  const filledRow = new Array<number>(size).fill(0);
  const filledCol = new Array<number>(size).fill(0);
  let isolated = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const filled = board.cells[r * size + c] !== null;
      if (filled) {
        filledRow[r] = (filledRow[r] ?? 0) + 1;
        filledCol[c] = (filledCol[c] ?? 0) + 1;
        continue;
      }
      const wall = (rr: number, cc: number): boolean =>
        rr < 0 || cc < 0 || rr >= size || cc >= size || board.cells[rr * size + cc] !== null;
      if (wall(r - 1, c) && wall(r + 1, c) && wall(r, c - 1) && wall(r, c + 1)) isolated++;
    }
  }
  let fill = 0;
  for (const n of [...filledRow, ...filledCol]) fill += (n / size) ** 3;
  value += SMART.fill * fill - SMART.isolated * isolated;

  // 남은 조각의 자리 수. 새 트레이가 뽑혔다면 미리 볼 수 없으므로(다음 추첨은 모른다) 보지 않는다
  const refilled = move.events.some((e) => e.type === 'tray');
  if (!refilled) {
    move.state.tray.forEach((id, i) => {
      if (id === null || i === move.action.trayIndex) return;
      const piece = getPiece(id);
      if (piece === undefined) return;
      let positions = 0;
      for (let r = 0; r < size && positions < SMART.mobilityCap; r++) {
        for (let c = 0; c < size && positions < SMART.mobilityCap; c++) {
          if (canPlace(board, piece, { r, c })) positions++;
        }
      }
      value += SMART.mobility * positions;
      if (!canPlaceAnywhere(board, piece)) value -= SMART.stuck;
    });
  }
  // `before`는 시그니처를 맞추기 위한 인자 (평가에 쓰지 않는다)
  void before;
  return value;
}

/** survivor 평가 가중치: 점수보다 "보드를 비워 두고 매끄럽게" 두는 쪽 */
export const SURVIVOR = {
  /** 한 단계마다 남기는 후보 수 (빔 폭) */
  beam: 24,
  empty: 3,
  isolated: 12,
  /** 채운 칸과 빈 칸이 맞닿은 변(울퉁불퉁함) 하나당 감점 */
  edge: 0.6,
  score: 0.02,
} as const;

function boardValue(state: GameState, scoreGain: number): number {
  const board = state.board;
  const size = board.size;
  let empty = 0;
  let isolated = 0;
  let edges = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const filled = board.cells[r * size + c] !== null;
      if (!filled) empty++;
      const right = c + 1 < size ? board.cells[r * size + c + 1] !== null : filled;
      const down = r + 1 < size ? board.cells[(r + 1) * size + c] !== null : filled;
      if (right !== filled) edges++;
      if (down !== filled) edges++;
      if (filled) continue;
      const wall = (rr: number, cc: number): boolean =>
        rr < 0 || cc < 0 || rr >= size || cc >= size || board.cells[rr * size + cc] !== null;
      if (wall(r - 1, c) && wall(r + 1, c) && wall(r, c - 1) && wall(r, c + 1)) isolated++;
    }
  }
  return (
    SURVIVOR.empty * empty -
    SURVIVOR.isolated * isolated -
    SURVIVOR.edge * edges +
    SURVIVOR.score * scoreGain
  );
}

/**
 * 트레이에 남은 조각을 모두 놓는 순서·자리를 빔 탐색하고 첫 수를 고른다 (사람이 트레이를 보고 계획하는 것과 비슷하다).
 * 새 트레이가 뽑힌 뒤의 조각은 평가에 쓰지 않는다: 평가는 보드만 본다 (다음 추첨을 미리 보지 않는다).
 */
function survivor(): Bot {
  interface Node {
    first: Move;
    state: GameState;
    gain: number;
    value: number;
  }
  return {
    name: 'survivor',
    choose(state) {
      const remaining = state.tray.filter((id) => id !== null).length;
      const roots = candidates(state).map((action) => apply(state, action));
      if (roots.length === 0) throw new Error('놓을 곳이 없음 (over가 아닌데)');
      let level: Node[] = roots.map((m) => {
        const gain = scoreDelta(m.events);
        return { first: m, state: m.state, gain, value: boardValue(m.state, gain) };
      });
      const prune = (nodes: Node[]): Node[] =>
        nodes
          .map((n, i) => ({ n, i }))
          .sort((a, b) => b.n.value - a.n.value || a.i - b.i)
          .slice(0, SURVIVOR.beam)
          .map((x) => x.n);
      level = prune(level);
      for (let depth = 1; depth < remaining; depth++) {
        const next: Node[] = [];
        for (const node of level) {
          if (node.state.over) {
            next.push(node);
            continue;
          }
          const cands = candidates(node.state);
          if (cands.length === 0) continue;
          for (const action of cands) {
            const m = apply(node.state, action);
            const gain = node.gain + scoreDelta(m.events);
            next.push({
              first: node.first,
              state: m.state,
              gain,
              value: boardValue(m.state, gain),
            });
          }
        }
        if (next.length === 0) break;
        level = prune(next);
      }
      let chosen = level[0];
      if (chosen === undefined) throw new Error('survivor: 후보가 없음');
      // 같은 값이면 앞선 수. 게임 오버로 끝나는 길은 피한다
      for (const n of level) if (!n.state.over && chosen.state.over) chosen = n;
      return chosen.first;
    },
  };
}

function smart(): Bot {
  return { name: 'smart', choose: (state) => best(state, evaluateSmart) };
}

export function createBot(name: BotName, seed: number): Bot {
  switch (name) {
    case 'greedy':
      return greedy();
    case 'random':
      return random(seed);
    case 'smart':
      return smart();
    case 'survivor':
      return survivor();
  }
}

export function isBotName(value: string): value is BotName {
  return (BOT_NAMES as readonly string[]).includes(value);
}
