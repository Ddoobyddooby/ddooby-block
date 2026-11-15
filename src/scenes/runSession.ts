// 한 판의 "논리 상태": 배치 로그, 저장용 상태, 플레이 시계, 배치 간격 판정을 묶는다 (PLAN 6.2).
// Phaser 없이 돌아가서 테스트할 수 있다 (tests/scenes/runSession.test.ts).
//
// GameScene이 화면에 보여 주는 상태는 연출이 끝나야 바뀌지만, 여기 상태는 배치가 수락된 순간 바뀐다.
// 저장은 항상 이쪽 (수락된 수를 포함한 로그 + 그 수 뒤의 상태 + 수락 시각)을 묶어 쓴다.
import { place } from '../core/engine';
import type { GameState, PlaceAction, PlaceResult, Placement } from '../core/types';
import type { PlayClock } from './playClock';

/** Persistence가 구현한다 (테스트는 가짜). 저장 실패는 여기까지 올라오지 않는다 */
export interface RunStore {
  beginRun(): number;
  saveRun(epoch: number, input: RunSnapshot): unknown;
  finishRun(epoch: number, input: RunSnapshot | null, score: number): unknown;
  discardRun(epoch: number): unknown;
}

export interface RunSnapshot {
  readonly seed: number;
  readonly runId: string | null;
  readonly placements: readonly Placement[];
  readonly elapsedMs: number;
  readonly state: GameState;
}

export type PlaceOutcome =
  | { ok: true; result: Extract<PlaceResult, { ok: true }>; t: number }
  | { ok: false; reason: 'inactive' | 'tooSoon' | 'over' | 'emptySlot' | 'blocked' };

export interface RunSessionOptions {
  seed: number;
  state: GameState;
  /** 이어한 판의 로그 (복사해서 쓴다). 새 판은 빈 배열 */
  placements?: readonly Placement[];
  runId?: string | null;
  clock: PlayClock;
  /** null이면 저장하지 않는다 */
  store: RunStore | null;
  /** false면 저장·삭제·최고 점수 반영을 전부 하지 않는다 (DEV `?fill=` 판) */
  replayable: boolean;
  minIntervalMs: number;
  maxPlacements: number;
}

export class RunSession {
  readonly seed: number;
  private current: GameState;
  private readonly log: Placement[];
  private readonly runId: string | null;
  private readonly clock: PlayClock;
  private readonly store: RunStore | null;
  private readonly minIntervalMs: number;
  private readonly maxPlacements: number;
  private readonly epoch: number;
  /** 저장을 끝냈다 (끝남·다시 하기). 그 뒤의 입력은 저장하지 않는다 */
  private retired = false;
  /** 기록이 한도를 넘어 저장을 멈췄다. 판은 계속되고, 끝나면 최고 점수만 저장한다 */
  private truncated = false;

  constructor(options: RunSessionOptions) {
    this.seed = options.seed;
    this.current = options.state;
    this.log = (options.placements ?? []).map((p) => ({ ...p }));
    this.runId = options.runId ?? null;
    this.clock = options.clock;
    this.store = options.replayable ? options.store : null;
    this.minIntervalMs = options.minIntervalMs;
    this.maxPlacements = options.maxPlacements;
    this.epoch = this.store?.beginRun() ?? 0;
  }

  /** 수락된 수를 모두 반영한 상태 (화면에 보이는 상태보다 앞설 수 있다) */
  get state(): GameState {
    return this.current;
  }

  get placements(): readonly Placement[] {
    return this.log;
  }

  /**
   * 마지막 배치 뒤 `minIntervalMs`가 아직 안 지났다: 다음 조각을 집을 수 없다.
   * 일시정지·숨김 동안은 시계가 멈추므로 그 시간은 세지 않는다.
   */
  cooling(): boolean {
    const last = this.log[this.log.length - 1];
    return last !== undefined && this.clock.elapsed() - last.t < this.minIntervalMs;
  }

  /**
   * 배치를 시도한다. 수락하면 로그에 더하고 상태를 바꾸고 바로 저장한다 (연출을 기다리지 않는다).
   * 거부하면(일시정지·숨김, 간격 부족, 엔진 판정) 로그·상태·저장·시계 어느 것도 바꾸지 않는다.
   * `t`를 늘려서 간격을 맞추지 않는다: 간격이 모자라면 거부한다.
   */
  tryPlace(action: PlaceAction): PlaceOutcome {
    if (!this.current.over && !this.clock.running) return { ok: false, reason: 'inactive' };
    const t = this.clock.elapsed();
    const last = this.log[this.log.length - 1];
    if (last !== undefined && t - last.t < this.minIntervalMs) {
      return { ok: false, reason: 'tooSoon' };
    }
    const result = place(this.current, action);
    if (!result.ok) return { ok: false, reason: result.reason };

    this.log.push({ trayIndex: action.trayIndex, row: action.row, col: action.col, t });
    this.current = result.state;
    if (result.state.over) this.clock.block('over');
    this.persistAccepted(result.state);
    return { ok: true, result, t };
  }

  /** 일시정지·숨김 때: 지금까지의 플레이 시간(`elapsedMs`)을 저장한다. 끝난 판·저장을 멈춘 판·아직 안 둔 판은 하지 않는다 */
  checkpoint(): void {
    // 아직 한 수도 안 둔 판은 저장하지 않는다 (저장돼 있던 이어할 판을 빈 판으로 덮지 않게)
    if (this.store === null || this.retired || this.truncated || this.current.over) return;
    if (this.log.length === 0) return;
    this.store.saveRun(this.epoch, this.snapshot());
  }

  /** [다시 하기]: 저장된 run을 지우고 이 판의 저장을 멈춘다 */
  abandon(): void {
    if (this.store === null || this.retired) return;
    this.retired = true;
    this.store.discardRun(this.epoch);
  }

  private persistAccepted(state: GameState): void {
    if (this.store === null || this.retired) return;
    if (this.truncated || this.log.length > this.maxPlacements) {
      // 기록이 한도를 넘었다: 이 판은 계속하되 저장을 멈춘다. 잘린 기록으로 이어하지 않도록 저장돼 있던 run도 한 번 지운다.
      // 끝나면 기록 없이 최고 점수만 저장한다 (finishRun이 run도 지운다)
      const first = !this.truncated;
      this.truncated = true;
      if (state.over) {
        this.retired = true;
        this.store.finishRun(this.epoch, null, state.score);
      } else if (first) {
        this.store.discardRun(this.epoch);
      }
      return;
    }
    if (state.over) {
      this.retired = true;
      this.store.finishRun(this.epoch, this.snapshot(), state.score);
    } else {
      this.store.saveRun(this.epoch, this.snapshot());
    }
  }

  private snapshot(): RunSnapshot {
    return {
      seed: this.seed,
      runId: this.runId,
      placements: this.log,
      elapsedMs: this.clock.elapsed(),
      state: this.current,
    };
  }
}
