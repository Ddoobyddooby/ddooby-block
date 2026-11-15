// 점수·콤보 (PLAN 4.6). 순수 함수이고 수치는 전부 config의 SCORE·COMBO에서 읽는다.

import { COMBO, SCORE } from '../config';

/** 콤보 상태. missStreak는 줄을 못 지운 배치가 연달아 몇 번인지 */
export interface ComboState {
  readonly combo: number;
  readonly missStreak: number;
}

/** 지운 줄 수(가로 + 세로)에 대한 기본 점수. 4줄 이상은 line4에서 한 줄마다 lineExtra를 더한다 */
export function lineScore(lines: number): number {
  if (lines <= 0) return 0;
  if (lines < SCORE.lines.length) return SCORE.lines[lines] ?? 0;
  return SCORE.line4 + (lines - SCORE.lines.length) * SCORE.lineExtra;
}

/** 콤보 배율. combo ≥ 1일 때 쓴다 (1 → 1, 2 → 1.5, …) */
export function comboMultiplier(combo: number): number {
  return 1 + COMBO.step * (combo - 1);
}

/**
 * 배치 뒤의 콤보. 줄을 지우면 combo + 1, missStreak 0.
 * 못 지우면 missStreak + 1이고, 그 값이 graceMisses를 넘으면 combo 0, missStreak 0 (그래서 missStreak는 늘 graceMisses 이하다)
 */
export function nextCombo(prev: ComboState, cleared: boolean): ComboState {
  if (cleared) return { combo: prev.combo + 1, missStreak: 0 };
  const missStreak = prev.missStreak + 1;
  if (missStreak > COMBO.graceMisses) return { combo: 0, missStreak: 0 };
  return { combo: prev.combo, missStreak };
}

export interface PlacementScoreInput {
  /** 놓은 칸 수 */
  readonly cells: number;
  /** 지운 줄 수 (가로 + 세로) */
  readonly lines: number;
  /** 이 배치로 갱신된 뒤의 콤보 */
  readonly combo: number;
  readonly boardCleared: boolean;
}

/** 배치 하나의 점수 (정수). 보드 전체 비움 보너스에는 배율이 없다 */
export function placementScore({ cells, lines, combo, boardCleared }: PlacementScoreInput): number {
  const lineBonus = lines > 0 ? Math.floor(lineScore(lines) * comboMultiplier(combo)) : 0;
  return cells * SCORE.perCell + lineBonus + (boardCleared ? SCORE.boardClear : 0);
}
