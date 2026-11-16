// 새 판을 시작하는 공통 경로 (W3-03): Menu [새 게임], GameOver [다시 하기], Pause [다시 하기]가 모두 이 함수를 쓴다.
// 서버에서 seed·run을 받으려고 최대 2.5초(START_RUN_TIMEOUT_MS) 기다린 뒤 시작한다. 실패·초과·키 없음·계정 없음·오프라인이면
// run 없는 오프라인 판으로 바로 시작한다 (게임을 막지 않는다). Phaser 없는 순수 로직이라 시험할 수 있다 (tests/scenes/newRun.test.ts).
import type { StartedRun } from '../online';
import { newGameData, type GameStartData } from './gameStart';

export interface NewGameDeps {
  /** 서버에서 seed·run을 받는다 (최대 2.5초, 실패하면 null). throw해도 오프라인 판으로 시작한다 */
  startRun(): Promise<StartedRun | null>;
  /** `?seed=N`·DEV `?fill=`이면 true: 서버 run을 받지 않고 바로 시작한다 */
  skipOnline(): boolean;
  /** 이 요청을 낸 화면이 아직 떠 있는가. 아니면 시작하지 않는다 (끝난 화면의 늦은 응답이 새 판을 시작하지 않게) */
  isAlive(): boolean;
  /** 기다림이 길어질 때 "준비 중…"을 보인다. 돌려주는 함수가 그 표시를 지운다 (생략 가능) */
  showWait?(): () => void;
  /** 새 판을 시작한다 (`scene.start('Game', data)`). 한 요청에 최대 한 번 부른다 */
  begin(data: GameStartData): void;
}

/**
 * 준비 중인 요청이 있다 (앱 전체에서 하나). 준비가 끝나기 전에 같은 버튼을 다시 눌러도(연타, 화면 다시 그리기로 새로 생긴 버튼) 두 번째 요청은
 * 무시한다: 새 판이 두 번 시작되거나 서버 run이 두 번 발급되지 않는다
 */
let preparing = false;

/** 시험용: 준비 중 표시를 되돌린다 */
export function resetNewGameFlow(): void {
  preparing = false;
}

/** 새 판 요청. 받아들였으면 true, 이미 준비 중이라 무시했으면 false */
export function requestNewGame(deps: NewGameDeps): boolean {
  if (preparing) return false;
  preparing = true;

  if (deps.skipOnline()) {
    preparing = false;
    deps.begin(newGameData());
    return true;
  }
  const hideWait = deps.showWait?.();
  let started: Promise<StartedRun | null>;
  try {
    started = deps.startRun();
  } catch {
    started = Promise.resolve(null);
  }
  void started
    .catch(() => null)
    .then((run) => {
      preparing = false;
      hideWait?.();
      if (!deps.isAlive()) return;
      deps.begin(run === null ? newGameData() : { online: run });
    });
  return true;
}
