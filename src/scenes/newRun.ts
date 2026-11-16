// 새 판을 시작하는 공통 경로 (W3-03): Menu [새 게임], GameOver [다시 하기], Pause [다시 하기]가 모두 이 함수를 쓴다.
// 서버에서 seed·run을 받으려고 최대 2.5초(START_RUN_TIMEOUT_MS) 기다린 뒤 시작한다. 실패·초과·키 없음·계정 없음·오프라인이면
// run 없는 오프라인 판으로 바로 시작한다 (게임을 막지 않는다). Phaser 없는 순수 로직이라 시험할 수 있다 (tests/scenes/newRun.test.ts).
//
// 준비 중인 요청은 앱 전체에서 하나이고 **명시적 토큰**을 가진다 (요청마다 새 번호). 결과는 그 토큰이 아직 유효할 때만 쓴다:
// - 요청한 화면을 (다시 그리기가 아닌 이유로) 떠나면 그 화면이 `cancelNewGame(owner)`를 불러 토큰을 무효로 한다.
//   같은 씬 객체가 다시 열려도 옛 요청의 응답은 번호가 달라 무시된다 (활성 여부 불리언으로 수명을 보지 않는다).
// - 화면을 다시 그리는 것(resize)은 취소가 아니다: 같은 요청이 그대로 이어진다 (시작은 최대 1회).
// - 준비 중에는 호출한 화면들이 모든 버튼을 무시한다 (`isPreparing`). 다시 그려진 화면의 새 버튼도 마찬가지라
//   준비 중에 [계속]·[메뉴]로 빠지거나 두 번째 요청이 나가지 않는다.
import type { StartedRun } from '../online';
import { newGameData, type GameStartData } from './gameStart';

export interface NewGameDeps {
  /** 요청한 화면의 이름. `cancelNewGame`이 이 이름으로 자기 요청만 취소한다 */
  owner: string;
  /** 서버에서 seed·run을 받는다 (최대 2.5초, 실패하면 null). throw해도 오프라인 판으로 시작한다 */
  startRun(): Promise<StartedRun | null>;
  /** `?seed=N`·DEV `?fill=`이면 true: 서버 run을 받지 않고 바로 시작한다 */
  skipOnline(): boolean;
  /** 기다림이 길어질 때 "준비 중…"을 보인다. 돌려주는 함수가 그 표시를 지운다 (생략 가능) */
  showWait?(): () => void;
  /**
   * 새 판으로 **실제로 넘어가는 순간**에 한 번 부른다 (`scene.start('Game', data)`). 기존 판을 버리는 일(저장된 run 삭제 등)은
   * 전환 전에 여기서 한다: 준비하는 동안에는 기존 판을 건드리지 않는다
   */
  begin(data: GameStartData): void;
}

interface Active {
  token: number;
  owner: string;
  hideWait: (() => void) | undefined;
}

let nextToken = 0;
let active: Active | null = null;

/** 준비 중인 요청이 있다 */
export function isPreparing(): boolean {
  return active !== null;
}

/** 시험용: 준비 상태를 되돌린다 */
export function resetNewGameFlow(): void {
  active = null;
  nextToken = 0;
}

/** owner의 요청이 준비 중이면 취소한다 (결과는 무시된다). 다른 화면의 요청은 건드리지 않는다 */
export function cancelNewGame(owner: string): void {
  if (active === null || active.owner !== owner) return;
  const { hideWait } = active;
  active = null;
  hideWait?.();
}

/** 새 판 요청. 받아들였으면 'started', 이미 준비 중이라 무시했으면 'busy' (호출한 쪽이 버튼 잠금을 풀어야 한다) */
export function requestNewGame(deps: NewGameDeps): 'started' | 'busy' {
  if (active !== null) return 'busy';
  if (deps.skipOnline()) {
    deps.begin(newGameData());
    return 'started';
  }
  const token = (nextToken += 1);
  const mine: Active = { token, owner: deps.owner, hideWait: deps.showWait?.() };
  active = mine;

  let started: Promise<StartedRun | null>;
  try {
    started = deps.startRun();
  } catch {
    started = Promise.resolve(null);
  }
  void started
    .catch(() => null)
    .then((run) => {
      // 취소됐거나(화면을 떠남) 다른 요청으로 바뀌었으면 이 응답은 쓰지 않는다
      if (active === null || active.token !== token) return;
      active = null;
      mine.hideWait?.();
      deps.begin(run === null ? newGameData() : { online: run });
    });
  return 'started';
}
