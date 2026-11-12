import { beforeEach, describe, expect, it, vi } from 'vitest';
import { place } from '../../src/core/engine';
import { generateTray } from '../../src/core/generator';
import { createRng } from '../../src/core/rng';
import type { GameState, PieceId } from '../../src/core/types';
import { boardFrom } from '../helpers/board';

// 🔎 새 트레이 직후 게임 오버 (PLAN 9절 5번, 4.5의 7단계).
//
// 실제 생성기는 놓을 수 있는 조각을 최소 1개 보장하므로(W1-04) 이 상황은 실제 생성기로는 만들 수 없다.
// 그래서 이 파일에서만 generateTray를 대역으로 바꿔 "tray → gameOver" 순서와 분기를 고정한다.
// 이 대역은 엔진의 분기 확인용이며 실제 생성기의 보장과는 무관하다 (그 보장은 generator.test.ts가 본다).
// 엔진 시그니처는 바꾸지 않는다.
vi.mock('../../src/core/generator', () => ({ generateTray: vi.fn() }));
const fakeGenerateTray = vi.mocked(generateTray);

/** 빈 칸이 두 대각선에만 있다. dot·o2 등은 놓이고 o3·i5h·i5v는 놓이지 않는다 */
const X_TEXT = `
  .######.
  #.####.#
  ##.##.##
  ###..###
  ###..###
  ##.##.##
  #.####.#
  .######.
`;
const X_AFTER_TEXT = `
  #######.
  #.####.#
  ##.##.##
  ###..###
  ###..###
  ##.##.##
  #.####.#
  .######.
`;

/** (0,0)에 dot을 놓으면 0번 줄만 차서 지워진다 */
const CHECKER_TEXT = `
  .#######
  #.#.#.#.
  .#.#.#.#
  #.#.#.#.
  .#.#.#.#
  #.#.#.#.
  .#.#.#.#
  #.#.#.#.
`;
const CHECKER_AFTER_TEXT = `
  ........
  #.#.#.#.
  .#.#.#.#
  #.#.#.#.
  .#.#.#.#
  #.#.#.#.
  .#.#.#.#
  #.#.#.#.
`;

const PREV_RNG = createRng(4242);
const NEXT_RNG = 13579;

function lastPiece(boardText: string): GameState {
  return {
    board: boardFrom(boardText),
    tray: [null, 'dot', null],
    rngState: PREV_RNG,
    score: 0,
    combo: 0,
    missStreak: 0,
    over: false,
  };
}

function run(boardText: string, nextTray: PieceId[]) {
  fakeGenerateTray.mockReturnValue([nextTray, NEXT_RNG]);
  const result = place(lastPiece(boardText), { trayIndex: 1, row: 0, col: 0 });
  if (!result.ok) throw new Error(`배치 실패: ${result.reason}`);
  return result;
}

describe('새 트레이 직후 게임 오버 (generateTray 대역)', () => {
  beforeEach(() => {
    fakeGenerateTray.mockReset();
  });

  it('새 트레이의 조각을 하나도 놓을 수 없으면 그 배치에서 tray 다음 gameOver', () => {
    const { state, events } = run(X_TEXT, ['o3', 'i5h', 'i5v']);
    expect(events.map((event) => event.type)).toEqual(['place', 'tray', 'gameOver']);
    expect(events[1]).toEqual({ type: 'tray', tray: ['o3', 'i5h', 'i5v'] });
    expect(events[2]).toEqual({ type: 'gameOver', score: 0 });
    expect(state.over).toBe(true);
    expect(state.tray).toEqual(['o3', 'i5h', 'i5v']);
    expect(state.rngState).toBe(NEXT_RNG);
  });

  it('새 트레이에 놓을 수 있는 조각이 있으면 tray만 있고 gameOver는 없다', () => {
    const { state, events } = run(X_TEXT, ['o3', 'i5h', 'dot']);
    expect(events.map((event) => event.type)).toEqual(['place', 'tray']);
    expect(state.over).toBe(false);
    expect(state.tray).toEqual(['o3', 'i5h', 'dot']);
    expect(state.rngState).toBe(NEXT_RNG);
  });

  it('생성기는 한 번, "놓은 뒤 보드"와 이전 rngState로 불린다', () => {
    run(X_TEXT, ['dot', 'dot', 'dot']);
    expect(fakeGenerateTray).toHaveBeenCalledTimes(1);
    expect(fakeGenerateTray).toHaveBeenCalledWith(boardFrom(X_AFTER_TEXT), PREV_RNG);
  });

  it('줄이 지워지면 생성기는 "줄을 지운 뒤 보드"를 받고, 판정도 그 보드로 한다', () => {
    // 지운 뒤 0번 줄이 비지만 1번 줄이 체크무늬라 2줄짜리 조각은 놓이지 않는다
    const blocked = run(CHECKER_TEXT, ['o2', 'o3', 'r2x3']);
    expect(fakeGenerateTray).toHaveBeenCalledTimes(1);
    expect(fakeGenerateTray).toHaveBeenCalledWith(boardFrom(CHECKER_AFTER_TEXT), PREV_RNG);
    expect(blocked.events.map((event) => event.type)).toEqual([
      'place',
      'clear',
      'tray',
      'gameOver',
    ]);
    expect(blocked.state.over).toBe(true);
    expect(blocked.state.board).toEqual(boardFrom(CHECKER_AFTER_TEXT));

    // 지우기 전에는 못 놓던 i5h가 지운 뒤 0번 줄에 놓인다 → 게임 오버가 아니다
    const open = run(CHECKER_TEXT, ['o2', 'o3', 'i5h']);
    expect(open.events.map((event) => event.type)).toEqual(['place', 'clear', 'tray']);
    expect(open.state.over).toBe(false);
  });

  it('마지막 조각이 아니면 생성기를 부르지 않는다', () => {
    fakeGenerateTray.mockReturnValue([['dot', 'dot', 'dot'], NEXT_RNG]);
    const state: GameState = { ...lastPiece(X_TEXT), tray: ['o2', 'dot', null] };
    const result = place(state, { trayIndex: 1, row: 0, col: 0 });
    if (!result.ok) throw new Error(`배치 실패: ${result.reason}`);
    expect(fakeGenerateTray).not.toHaveBeenCalled();
    expect(result.state.tray).toEqual(['o2', null, null]);
    expect(result.state.rngState).toBe(PREV_RNG);
  });
});
