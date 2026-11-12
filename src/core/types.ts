// core 공용 타입 (PLAN 4.1). 여기에는 타입만 둔다.

export interface Pos {
  readonly r: number;
  readonly c: number;
}

/** 1차원, index = r * size + c. null = 빈 칸, 숫자 = 색 그룹(0~6, 표시용) */
export interface Board {
  readonly size: number;
  readonly cells: readonly (number | null)[];
}

export type PieceId = string; // PLAN 4.2절 표의 ID

/** 조각 정의 (PLAN 4.2). cells는 bounding box가 (0,0)에서 시작하는 상대 좌표, color는 색 그룹(0~6) */
export interface PieceDef {
  readonly id: PieceId;
  readonly cells: readonly Pos[];
  readonly color: number;
}

export interface GameState {
  readonly board: Board;
  /** 길이 3. 놓은 칸은 null. 셋 다 null이 되면 바로 새 트레이로 바뀐다 */
  readonly tray: readonly (PieceId | null)[];
  readonly rngState: number;
  readonly score: number;
  /** 0 = 콤보 없음 */
  readonly combo: number;
  /** 줄을 못 지운 배치 연속 횟수 */
  readonly missStreak: number;
  readonly over: boolean;
}

export interface PlaceAction {
  readonly trayIndex: number;
  readonly row: number;
  readonly col: number;
}

/** 배치 로그 한 줄 (SPEC 8.1). t = 누적 플레이 시간 ms */
export interface Placement extends PlaceAction {
  readonly t: number;
}

/**
 * `place`가 돌려주는 이벤트 (PLAN 4.7). 배열 순서가 곧 연출 순서다.
 * 좌표는 모두 보드 절대 좌표다.
 */
export type GameEvent =
  | { type: 'place'; trayIndex: number; pieceId: PieceId; cells: Pos[]; color: number }
  | { type: 'clear'; rows: number[]; cols: number[]; cells: Pos[] }
  | { type: 'score'; delta: number; lines: number; combo: number }
  /** combo 0 = 끊김 */
  | { type: 'combo'; combo: number }
  | { type: 'boardClear' }
  | { type: 'tray'; tray: PieceId[] }
  | { type: 'gameOver'; score: number };

/** `place`의 결과 (PLAN 4.5). 실패는 상태를 바꾸지 않으므로 이유만 준다 */
export type PlaceResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; reason: 'over' | 'emptySlot' | 'blocked' };
