// 진행 중인 판의 저장 형식과 복원 (PLAN 6.2). 순수 함수만 있다 (저장소·Phaser·DOM 없음).
// 배치 로그가 기준이다: 복원은 항상 `replay` 결과를 쓰고, snapshot은 보조 데이터라 다르면 경고만 남긴다.
// 저장된 JSON은 손상될 수 있으므로 타입을 믿지 않고, 어떤 입력에도 예외를 던지지 않는다.

import { REPLAY, RULES_VERSION, SAVE } from '../config';
import { checkIntervals, replay } from '../core/replay';
import type { GameState, Placement } from '../core/types';

export interface SavedRun {
  version: 1;
  rulesVersion: number;
  /** 0~4294967295 정수 */
  seed: number;
  /** 서버가 발급한 run 식별자. 오프라인 판은 null (3주차) */
  runId: string | null;
  placements: Placement[];
  /** 누적 플레이 시간 ms. 마지막 배치의 `t` 이상 */
  elapsedMs: number;
  /** 보조 데이터. 구조가 깨져 있으면 null (그것만으로 run을 버리지 않는다) */
  snapshot: GameState | null;
}

/** 저장할 때 필요한 것. 로그·상태·시계는 같은 시점의 값이어야 한다 */
export interface RunInput {
  readonly seed: number;
  readonly runId: string | null;
  readonly placements: readonly Placement[];
  readonly elapsedMs: number;
  readonly state: GameState;
}

const SEED_MAX = 0xffffffff;
const RUN_ID_MAX_LENGTH = 128;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isNonNegativeInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/** 저장할 값을 만든다. 입력과 별칭이 없게 복사한다 (이후 배열이 늘어나도 이미 만든 값은 그대로) */
export function buildSavedRun(input: RunInput): SavedRun {
  return {
    version: 1,
    rulesVersion: RULES_VERSION,
    seed: input.seed,
    runId: input.runId,
    placements: input.placements.map(copyPlacement),
    elapsedMs: input.elapsedMs,
    snapshot: input.state,
  };
}

/** 저장할 문자열 (순수) */
export function serializeRun(input: RunInput): string {
  return JSON.stringify(buildSavedRun(input));
}

function copyPlacement(p: Placement): Placement {
  return { trayIndex: p.trayIndex, row: p.row, col: p.col, t: p.t };
}

/**
 * 저장된 문자열을 읽는다. 아래는 모두 `null` (예외 없음):
 * 없음, 너무 긴 문자열, 깨짐·잘림, 객체가 아님, `version`·`rulesVersion`이 지금 값과 정확히 같지 않음,
 * seed가 0~4294967295 정수가 아님, runId가 null도 128자 이하 문자열도 아님, placements가 배열이 아니거나 한도 초과,
 * 항목이 객체가 아니거나 `t`가 0 이상 정수가 아님, `elapsedMs`가 유한한 0 이상 수가 아니거나 마지막 `t`보다 작음.
 * 좌표(`trayIndex`·`row`·`col`)가 합법인지는 여기서 보지 않는다. 복원(`restoreRun`)에서 엔진이 판정한다.
 * 모르는 필드는 버린다 (알려진 필드만 복사해 다시 만든다).
 */
export function parseRun(json: string | null): SavedRun | null {
  if (typeof json !== 'string' || json.length > SAVE.maxRunJsonChars) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  if (raw.version !== 1 || raw.rulesVersion !== RULES_VERSION) return null;

  const { seed, runId, placements, elapsedMs } = raw;
  if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > SEED_MAX) {
    return null;
  }
  if (
    runId !== null &&
    !(typeof runId === 'string' && runId.length >= 1 && runId.length <= RUN_ID_MAX_LENGTH)
  ) {
    return null;
  }
  if (!Array.isArray(placements) || placements.length > SAVE.maxRunPlacements) return null;

  const log: Placement[] = [];
  for (const item of placements as unknown[]) {
    if (!isRecord(item) || !isNonNegativeInt(item.t)) return null;
    // 좌표는 타입을 믿지 않고 그대로 옮긴다 (엔진이 emptySlot·blocked로 거른다)
    log.push({
      trayIndex: item.trayIndex as number,
      row: item.row as number,
      col: item.col as number,
      t: item.t,
    });
  }

  const lastT = log.length > 0 ? (log[log.length - 1] as Placement).t : 0;
  if (
    typeof elapsedMs !== 'number' ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs < 0 ||
    elapsedMs > Number.MAX_SAFE_INTEGER ||
    elapsedMs < lastT
  ) {
    return null;
  }

  return {
    version: 1,
    rulesVersion: RULES_VERSION,
    seed,
    runId,
    placements: log,
    elapsedMs,
    snapshot: parseSnapshot(raw.snapshot),
  };
}

function parseSnapshot(raw: unknown): GameState | null {
  if (!isRecord(raw) || !isRecord(raw.board)) return null;
  const { board, tray, rngState, score, combo, missStreak, over } = raw;
  const cells = board.cells;
  if (typeof board.size !== 'number' || !Array.isArray(cells)) return null;
  if (!(cells as unknown[]).every((c) => c === null || typeof c === 'number')) return null;
  if (
    !Array.isArray(tray) ||
    !(tray as unknown[]).every((p) => p === null || typeof p === 'string')
  ) {
    return null;
  }
  if (
    typeof rngState !== 'number' ||
    typeof score !== 'number' ||
    typeof combo !== 'number' ||
    typeof missStreak !== 'number' ||
    typeof over !== 'boolean'
  ) {
    return null;
  }
  return {
    board: { size: board.size, cells: cells as (number | null)[] },
    tray: tray as (string | null)[],
    rngState,
    score,
    combo,
    missStreak,
    over,
  };
}

/** 두 상태가 모든 필드에서 같은가 (키 순서와 무관) */
export function sameState(a: GameState, b: GameState): boolean {
  return (
    a.board.size === b.board.size &&
    a.board.cells.length === b.board.cells.length &&
    a.board.cells.every((cell, i) => cell === b.board.cells[i]) &&
    a.tray.length === b.tray.length &&
    a.tray.every((piece, i) => piece === b.tray[i]) &&
    a.rngState === b.rngState &&
    a.score === b.score &&
    a.combo === b.combo &&
    a.missStreak === b.missStreak &&
    a.over === b.over
  );
}

/**
 * 배치 로그를 처음부터 다시 돌린 상태를 돌려준다. 어떤 이유로든(`'invalid'` 포함) 실패하면 `null`.
 * 끝난 판(`over`)도 돌려준다: 이어하기에 쓸지는 `inspectRun`이 정한다.
 * `snapshot`과 다르거나 없으면 경고만 남기고 replay 결과를 쓴다.
 */
export function restoreRun(saved: SavedRun): GameState | null {
  const result = replay(saved.seed, saved.placements);
  if (!result.ok) return null;
  if (saved.snapshot === null) {
    console.warn('[run] snapshot이 없거나 깨져 있음, 배치 로그로 복원');
  } else if (!sameState(saved.snapshot, result.state)) {
    console.warn('[run] snapshot이 배치 로그 복원 결과와 다름, 복원 결과를 씀');
  }
  return result.state;
}

/** 저장된 run을 어떻게 다룰지 */
export type RunInspection =
  /** 이어할 수 있다 */
  | { kind: 'resume'; saved: SavedRun; state: GameState }
  /** 끝난 판이다. 이어하기 대상이 아니고, 최고 점수를 되살리는 데 쓴다 */
  | { kind: 'over'; state: GameState }
  /** 깨짐·버전 불일치·복원 실패·배치 간격 위반. 이어하지 않는다 */
  | { kind: 'rejected' };

/**
 * 부팅 때 저장된 문자열을 판정한다. `parseRun` → `restoreRun` → 끝난 판인지 → 배치 간격.
 * 간격(`REPLAY.minIntervalMs`)을 어긴 로그는 이어 붙여도 3주차 제출에서 거부되므로 이어하기로 받지 않는다.
 */
export function inspectRun(json: string | null): RunInspection {
  const saved = parseRun(json);
  if (saved === null) return { kind: 'rejected' };
  const state = restoreRun(saved);
  if (state === null) return { kind: 'rejected' };
  if (state.over) return { kind: 'over', state };
  if (!checkIntervals(saved.placements, REPLAY.minIntervalMs)) return { kind: 'rejected' };
  return { kind: 'resume', saved, state };
}
