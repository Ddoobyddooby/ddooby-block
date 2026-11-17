// 저장 조정자 (PLAN 6.2). 최고 점수·설정(progress)과 진행 중인 판(run)을 한 곳에서 읽고 쓴다.
// Phaser·window·Capacitor에 기대지 않고 KeyValueStore만 받는다 (tests/storage/persistence.test.ts).
//
// 규칙:
// - 모든 읽기·쓰기·삭제는 한 줄(큐)로 서서 요청한 순서대로 끝난다. 느린 쓰기가 뒤늦게 끝나 새 값을 덮거나 지운 run이 되살아나지 않는다.
//   부팅 읽기(`load`)도 같은 줄의 첫 작업이라, 읽기가 끝나기 전의 쓰기는 기다린다 (기존 기록을 기본값으로 덮지 않는다).
// - 읽기에 실패한 키에는 쓰지 않는다. 실패는 예외로 새지 않고 `false`로 알린다 (게임은 계속된다).
// - run 쓰기는 판(epoch)으로 구분한다. 새 판이 시작된 뒤 이전 판이 요청한 저장은 요청 시점에 버려진다.
// - progress는 메모리의 한 객체가 주인이고, 쓰기 직전에 저장소를 다시 읽어 최고 점수는 더 큰 값을 남긴다
//   (두 탭을 지원하지 않는다: 나중에 저장한 쪽이 남되 최고 점수만 줄지 않는다).
import { SAVE } from '../config';
import type { KeyValueStore } from './adapters';
import { defaultSave, parseSave, type SaveData, type Settings } from './progress';
import { buildSavedRun, inspectRun, type RunInput, type SavedRun } from './run';
import type { GameState } from '../core/types';
import type { ThemeId } from '../themeIds';

/** 이어할 수 있는 판. `saved`는 저장된 값, `state`는 로그를 replay한 결과 */
export interface ResumableRun {
  readonly saved: SavedRun;
  readonly state: GameState;
}

export interface LoadResult {
  bestScore: number;
  /**
   * 부팅 시점에 저장소에 확정돼 있던 최고 점수: 읽은 progress의 값과, 끝난 run 복구로 되살린 점수 중 큰 값. 읽기 실패면 0.
   * 이번 실행의 판들(`finishRun`이 올린 값)과 메모리 값은 섞이지 않는다. 읽기가 늦게 끝난 판이 "이 판 이전의 기록"을
   * 알아내는 데 쓴다 (`bestScore`는 이번 판 점수가 섞일 수 있다).
   */
  storedBest: number;
  settings: Settings;
  /** 이어할 수 있는 판. 없거나 끝난 판·깨진 판이면 null */
  resume: ResumableRun | null;
  /** progress·run 읽기가 모두 성공했다 */
  readable: boolean;
}

export class Persistence {
  /** 가장 마지막 작업. 새 작업은 이것이 끝난 뒤(성공·실패 상관없이) 시작한다. 절대 거부되지 않는다 */
  private tail: Promise<unknown> = Promise.resolve();
  private progress: SaveData = defaultSave();
  /** `setMuted`가 한 번이라도 불렸다 (읽기가 끝나기 전의 변경을 읽은 값으로 덮지 않게) */
  private mutedTouched = false;
  /** `setTheme`가 한 번이라도 불렸다 (`mutedTouched`와 같은 뜻) */
  private themeTouched = false;
  /** run 키를 읽는 데 성공했다. 실패했으면 run 키에는 쓰지도 지우지도 않는다 */
  private runReadable = false;
  private epoch = 0;
  private resume: ResumableRun | null = null;
  /** run을 바꾸는 요청(save·finish·discard)이 들어올 때마다 오른다. 늦은 load가 그 뒤의 `resume`을 옛 디스크 값으로 덮지 않게 한다 */
  private runRevision = 0;
  private loading: Promise<LoadResult> | null = null;
  private warned = false;

  constructor(
    private readonly store: KeyValueStore,
    private readonly keys: { progress: string; run: string } = {
      progress: SAVE.key,
      run: SAVE.runKey,
    },
  ) {}

  /** 저장소를 읽는다 (한 번만 실제로 읽고, 이후는 같은 결과). 끝난 run이 있으면 최고 점수를 되살리고 run을 지운다 */
  load(): Promise<LoadResult> {
    if (this.loading === null) {
      const revision = this.runRevision;
      this.loading = this.enqueue(() => this.doLoad(revision), this.snapshot(false));
    }
    return this.loading;
  }

  bestScore(): number {
    return this.progress.bestScore;
  }

  settings(): Settings {
    return { ...this.progress.settings };
  }

  /** 지금 이어할 수 있는 판 (W2-06 메뉴가 읽는다). 저장할 때마다 가장 최근 저장으로 바뀐다 */
  resumable(): ResumableRun | null {
    return this.resume;
  }

  /** 음소거를 바꾸고 저장한다. 메모리는 바로 바뀌고, 저장 성공 여부를 돌려준다 */
  setMuted(muted: boolean): Promise<boolean> {
    this.progress.settings.muted = muted;
    this.mutedTouched = true;
    return this.enqueue(() => this.writeProgress(), false);
  }

  /** 테마를 바꾸고 저장한다 (메뉴의 테마 카드). `setMuted`와 같은 규칙 */
  setTheme(theme: ThemeId): Promise<boolean> {
    this.progress.settings.theme = theme;
    this.themeTouched = true;
    return this.enqueue(() => this.writeProgress(), false);
  }

  /** 새 판을 시작한다. 이전 판 번호로 요청하는 저장은 이제 버려진다 */
  beginRun(): number {
    this.epoch += 1;
    return this.epoch;
  }

  /** 배치 직후·일시정지·숨김 때 판을 저장한다. 문자열은 요청 시점에 만든다 (나중에 배열이 바뀌어도 이 저장은 그대로) */
  saveRun(epoch: number, input: RunInput): Promise<boolean> {
    if (epoch !== this.epoch) return Promise.resolve(false);
    const saved = buildSavedRun(input);
    const json = JSON.stringify(saved);
    this.runRevision += 1;
    this.resume = input.state.over ? null : { saved, state: input.state };
    return this.enqueue(() => this.putRun(json), false);
  }

  /**
   * 판이 끝났다: 끝난 기록(마지막 배치 포함)을 저장 → 최고 점수 저장 → run 삭제 순서로 한다.
   * 최고 점수 저장이 실패하면 run을 지우지 않는다 (다음 부팅에서 끝난 기록으로 최고 점수를 되살린다).
   * `input`이 null이면 기록을 저장하지 않고 최고 점수와 삭제만 한다 (기록이 한도를 넘어 저장을 멈춘 판).
   */
  finishRun(epoch: number, input: RunInput | null, score: number): Promise<boolean> {
    if (epoch !== this.epoch) return Promise.resolve(false);
    this.progress.bestScore = Math.max(this.progress.bestScore, score);
    const json = input === null ? null : JSON.stringify(buildSavedRun(input));
    this.runRevision += 1;
    this.resume = null;
    return this.enqueue(async () => {
      if (json !== null) await this.putRun(json);
      if (!(await this.writeProgress())) return false;
      return this.removeRun();
    }, false);
  }

  /** run을 지운다 ([다시 하기], 기록이 한도를 넘음). 이전 판의 늦은 저장이 되살리지 않는다 */
  discardRun(epoch: number): Promise<boolean> {
    if (epoch !== this.epoch) return Promise.resolve(false);
    this.runRevision += 1;
    this.resume = null;
    return this.enqueue(() => this.removeRun(), false);
  }

  /** 작업을 줄 세운다. 작업이 예외를 던져도 큐는 이어지고 `fallback`을 돌려준다 */
  private enqueue<T>(job: () => Promise<T>, fallback: T): Promise<T> {
    const next = this.tail.then(async () => {
      try {
        return await job();
      } catch (error) {
        this.warn('저장 작업 실패', error);
        return fallback;
      }
    });
    this.tail = next;
    return next;
  }

  private async doLoad(revision: number): Promise<LoadResult> {
    const progressRead = await this.tryGet(this.keys.progress);
    const runRead = await this.tryGet(this.keys.run);

    const loaded = progressRead.ok ? parseSave(progressRead.value) : defaultSave();
    let storedBest = loaded.bestScore;
    // 읽는 동안 바뀐 값은 읽은 값보다 우선한다
    if (this.mutedTouched) loaded.settings.muted = this.progress.settings.muted;
    if (this.themeTouched) loaded.settings.theme = this.progress.settings.theme;
    loaded.bestScore = Math.max(loaded.bestScore, this.progress.bestScore);
    this.progress = loaded;
    this.runReadable = runRead.ok;

    if (runRead.ok && runRead.value !== null) {
      const inspected = inspectRun(runRead.value);
      if (inspected.kind === 'over') {
        // 게임 오버 도중 앱이 꺼진 판: 최고 점수를 되살린 뒤 지운다 (저장에 실패하면 지우지 않고 다음 부팅에 다시 시도)
        storedBest = Math.max(storedBest, inspected.state.score);
        this.progress.bestScore = Math.max(this.progress.bestScore, inspected.state.score);
        if (await this.writeProgress()) await this.removeRun();
      } else if (inspected.kind === 'resume' && this.runRevision === revision) {
        // load를 요청한 뒤 run을 바꾼 요청이 있었다면 그쪽이 더 새롭다 (디스크는 큐 순서로 이미 맞다)
        this.resume = { saved: inspected.saved, state: inspected.state };
      }
    }
    return this.snapshot(progressRead.ok && runRead.ok, storedBest);
  }

  private snapshot(readable: boolean, storedBest = 0): LoadResult {
    return {
      bestScore: this.progress.bestScore,
      storedBest,
      settings: { ...this.progress.settings },
      resume: this.resume,
      readable,
    };
  }

  /**
   * (큐 안에서) progress를 쓴다. 먼저 읽어 보고 읽을 수 없으면 쓰지 않는다.
   * 쓸 값은 방금 읽은 저장값을 바탕으로 하고, 이번 실행에서 바꾼 것만 덮는다:
   * 최고 점수는 max, `muted`·`theme`은 `setMuted`·`setTheme`를 불렀을 때만 메모리 값, `music`은 항상 저장값.
   * (부팅 읽기가 일시 실패해 메모리가 기본값이어도, 다른 탭이 바꾼 설정도 덮지 않는다.)
   * 읽은 저장값을 메모리에도 맞춘다 (화면·소리 출력은 바꾸지 않는다: 실행 도중 소리가 바뀌지 않게).
   */
  private async writeProgress(): Promise<boolean> {
    const read = await this.tryGet(this.keys.progress);
    if (!read.ok) return false;
    const stored = parseSave(read.value);
    const merged: SaveData = {
      version: 1,
      bestScore: Math.max(this.progress.bestScore, stored.bestScore),
      settings: {
        muted: this.mutedTouched ? this.progress.settings.muted : stored.settings.muted,
        music: stored.settings.music,
        theme: this.themeTouched ? this.progress.settings.theme : stored.settings.theme,
      },
    };
    this.progress = merged;
    return this.trySet(this.keys.progress, JSON.stringify(merged));
  }

  private async putRun(json: string): Promise<boolean> {
    return this.runReadable && (await this.trySet(this.keys.run, json));
  }

  private async removeRun(): Promise<boolean> {
    if (!this.runReadable) return false;
    try {
      await this.store.remove(this.keys.run);
      return true;
    } catch (error) {
      this.warn('run 삭제 실패', error);
      return false;
    }
  }

  private async tryGet(key: string): Promise<{ ok: boolean; value: string | null }> {
    try {
      const value = await this.store.get(key);
      return { ok: true, value: typeof value === 'string' ? value : null };
    } catch (error) {
      this.warn('읽기 실패, 이 키에는 쓰지 않음', error);
      return { ok: false, value: null };
    }
  }

  private async trySet(key: string, value: string): Promise<boolean> {
    try {
      await this.store.set(key, value);
      return true;
    } catch (error) {
      this.warn('쓰기 실패 (용량·사생활 보호 모드), 계속 진행', error);
      return false;
    }
  }

  /** 실패가 매 배치마다 반복되므로 처음 한 번만 경고한다 */
  private warn(message: string, error: unknown): void {
    if (this.warned) return;
    this.warned = true;
    console.warn(`[save] ${message}`, error);
  }
}
