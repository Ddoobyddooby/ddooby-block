import { describe, expect, it } from 'vitest';
import { canPlaceAnywhere, fullLines } from '../../src/core/board';
import { place } from '../../src/core/engine';
import { getPiece } from '../../src/core/pieces';
import type { GameEvent } from '../../src/core/types';
import { FILL_GUIDE, FILL_NAMES, fillState, parseFillParam } from '../../src/scenes/devFill';
import { unplaceableSlots } from '../../src/view/fx/trayDim';

describe('parseFillParam', () => {
  it('이름 다섯 개를 DEV에서 받는다', () => {
    for (const name of ['line1', 'line2', 'line3', 'combo3', 'clear']) {
      expect(parseFillParam(`?fill=${name}`, true)).toBe(name);
    }
    expect(FILL_NAMES).toHaveLength(5);
  });

  it('seed와 같이 써도 읽는다', () => {
    expect(parseFillParam('?seed=7&fill=line2', true)).toBe('line2');
  });

  it('그 밖의 값·빈 값·없는 옵션은 없는 것으로 본다', () => {
    for (const search of [
      '',
      '?fill=',
      '?fill=line4',
      '?fill=LINE1',
      '?fill=line1x',
      '?fill',
      '?fil=line1',
    ]) {
      expect(parseFillParam(search, true), search).toBeNull();
    }
  });

  it('프로덕션(dev=false)에서는 올바른 이름도 무시한다', () => {
    for (const name of FILL_NAMES) expect(parseFillParam(`?fill=${name}`, false)).toBeNull();
  });
});

type Of<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>;
const find = <T extends GameEvent['type']>(events: GameEvent[], type: T): Of<T> | undefined =>
  events.find((e): e is Of<T> => e.type === type);

describe('fillState + 안내한 배치', () => {
  const placeGuided = (name: (typeof FILL_NAMES)[number], seed = 1) => {
    const state = fillState(name, seed);
    const result = place(state, FILL_GUIDE[name].action);
    if (!result.ok) throw new Error(`${name}: 안내한 배치가 실패 (${result.reason})`);
    return { state, result };
  };

  it.each(FILL_NAMES)('%s: 시작 상태는 완성된 줄이 없고 게임 오버가 아니다', (name) => {
    const state = fillState(name, 1);
    expect(fullLines(state.board)).toEqual({ rows: [], cols: [] });
    expect(state.over).toBe(false);
    expect(state.score).toBe(0);
    expect(state.tray).toHaveLength(3);
    expect(state.board.cells).toHaveLength(64);
  });

  it('line1: 한 줄 (아래 줄)', () => {
    const { result } = placeGuided('line1');
    expect(find(result.events, 'clear')).toMatchObject({ rows: [7], cols: [] });
    expect(find(result.events, 'score')).toMatchObject({ lines: 1, combo: 1 });
    expect(find(result.events, 'boardClear')).toBeUndefined();
  });

  it('line2: 두 줄 (아래 두 줄, 가로)', () => {
    const { result } = placeGuided('line2');
    expect(find(result.events, 'clear')).toMatchObject({ rows: [6, 7], cols: [] });
    expect(find(result.events, 'score')).toMatchObject({ lines: 2, combo: 1 });
  });

  it('line3: 세 줄 (아래 세 줄, 가로)', () => {
    const { result } = placeGuided('line3');
    expect(find(result.events, 'clear')).toMatchObject({ rows: [5, 6, 7], cols: [] });
    expect(find(result.events, 'score')).toMatchObject({ lines: 3, combo: 1 });
  });

  it('combo3: 콤보 2에서 시작해 한 줄을 지우면 콤보 3', () => {
    const { state, result } = placeGuided('combo3');
    expect(state.combo).toBe(2);
    expect(find(result.events, 'clear')).toMatchObject({ rows: [7], cols: [] });
    expect(find(result.events, 'score')).toMatchObject({ lines: 1, combo: 3 });
    expect(find(result.events, 'combo')).toEqual({ type: 'combo', combo: 3 });
    expect(result.state.combo).toBe(3);
  });

  it('clear: 보드가 전부 비고 boardClear 이벤트가 나온다', () => {
    const { result } = placeGuided('clear');
    expect(find(result.events, 'clear')).toMatchObject({ rows: [7], cols: [] });
    expect(find(result.events, 'boardClear')).toBeDefined();
    expect(result.state.board.cells.every((c) => c === null)).toBe(true);
  });

  it('줄 제거가 일어나는 이름은 clear → score 순서이고 나머지 이벤트도 순서대로다', () => {
    const { result } = placeGuided('line2');
    expect(result.events.map((e) => e.type)).toEqual(['place', 'clear', 'score', 'combo']);
  });

  it('트레이는 seed와 상관없고, 다음 트레이는 seed로 정해진다', () => {
    expect(fillState('line1', 1).tray).toEqual(fillState('line1', 999).tray);
    expect(fillState('line1', 5)).toEqual(fillState('line1', 5));
    expect(fillState('line1', 1).rngState).not.toBe(fillState('line1', 2).rngState);
  });

  it('남은 조각 o3은 놓을 자리가 없어 흐려진다 (clear는 빈 보드라 아니다)', () => {
    for (const name of ['line1', 'line2', 'line3', 'combo3'] as const) {
      const state = fillState(name, 1);
      expect(unplaceableSlots(state.board, state.tray), name).toEqual([false, false, true]);
    }
    const clear = fillState('clear', 1);
    expect(unplaceableSlots(clear.board, clear.tray)).toEqual([false, false, false]);
  });

  it('o3은 line1·line2·combo3에서 안내한 배치 뒤에도 놓을 수 없다 (line3은 세 줄이 비어 놓을 수 있다)', () => {
    const o3 = getPiece('o3')!;
    for (const name of ['line1', 'line2', 'combo3'] as const) {
      const { result } = placeGuided(name);
      expect(canPlaceAnywhere(result.state.board, o3), name).toBe(false);
    }
  });

  it('line1에서 안내 배치 뒤 점 하나를 놓으면 게임 오버다', () => {
    const { result } = placeGuided('line1');
    const board = result.state.board;
    const free = board.cells.findIndex((c) => c === null);
    const next = place(result.state, { trayIndex: 1, row: Math.floor(free / 8), col: free % 8 });
    expect(next.ok).toBe(true);
    if (next.ok) expect(next.state.over).toBe(true);
  });
});
