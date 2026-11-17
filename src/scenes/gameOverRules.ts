// 게임 오버 화면 규칙·문구·DEV `?over` 해석 (PLAN 6.3). Phaser 없는 순수 함수.
import { formatScore } from '../view/hudText';

/** GameOver 씬에 넘기는 데이터 */
export interface GameOverData {
  /** 이번 판의 점수 */
  score: number;
  /** 화면에 보일 최고 점수 (이번 점수가 더 크면 이번 점수) */
  best: number;
  /** 이 판을 시작하기 전의 최고 점수를 넘었다 */
  newBest: boolean;
}

export type GameOverButton = 'retry' | 'menu';

/** [다시 하기] [메뉴] 순서 */
export function gameOverButtons(): GameOverButton[] {
  return ['retry', 'menu'];
}

/**
 * 게임 오버 화면에 넘길 값.
 * - `startBest`: 이 판을 시작하기 전의 최고 점수. 이어한 판도 저장돼 있던 최고 점수다 (이어하기 전의 판 점수는 아직 최고 점수에 저장되지 않는다).
 * - `currentBest`: 지금 화면용 최고 점수 (판 도중 점수 이벤트마다 올라 있어 이번 점수 이상일 수 있다).
 * - 같은 점수는 갱신이 아니다. `?fill=` 판(replayable false)은 최고 점수에 반영하지 않으므로 갱신도 없고 저장된 값 그대로 보인다.
 */
export function buildGameOverData(input: {
  score: number;
  startBest: number;
  currentBest: number;
  replayable: boolean;
}): GameOverData {
  const { score, startBest, currentBest, replayable } = input;
  if (!replayable) return { score, best: currentBest, newBest: false };
  return { score, best: Math.max(currentBest, score), newBest: score > startBest };
}

export interface GameOverTexts {
  title: string;
  scoreLabel: string;
  score: string;
  best: string;
  /** 최고 기록을 넘었을 때만 */
  newBest: string | null;
}

export function gameOverTexts(data: GameOverData): GameOverTexts {
  return {
    title: '게임 오버',
    scoreLabel: '이번 점수',
    score: formatScore(data.score),
    best: `최고 ${formatScore(data.best)}점`,
    newBest: data.newBest ? '최고 기록 갱신!' : null,
  };
}

/**
 * DEV 전용 `?over`: 게임 없이 게임 오버 화면만 본다. 저장소를 건드리지 않는 예시 값이다.
 * `?over`·`?over=new`는 최고 기록을 넘은 화면, `?over=low`는 못 넘은 화면. 그 밖의 값과 프로덕션(dev=false)은 null (무시).
 * 호출부의 `import.meta.env.DEV`와 함께 빌드에서 지워진다.
 */
export function parseOverParam(search: string, dev: boolean): GameOverData | null {
  if (!dev) return null;
  const value = new URLSearchParams(search).get('over');
  if (value === '' || value === 'new') return { score: 12840, best: 12840, newBest: true };
  if (value === 'low') return { score: 4200, best: 12840, newBest: false };
  return null;
}

/**
 * 화면이 처음 뜬 시점 기준의 입력 잠금이 앞으로 얼마(ms) 남았나. `unlockAt`은 처음 뜬 시각 + 지연이고 resize로 다시 그려도 같은 값을 쓴다.
 * 0이면 눌러도 된다 (이미 지났으면 추가 지연 없음).
 */
export function inputDelayLeft(unlockAt: number, now: number): number {
  return Math.max(0, unlockAt - now);
}

/**
 * 판 시작 전에 저장돼 있던 최고 점수를 부팅 읽기가 늦게 확인했다: 비교 기준을 그만큼 올린다 (낮추지는 않는다).
 * 이 판의 score 이벤트가 올린 값은 넣지 않는다 (넣으면 정상 갱신이 사라진다).
 */
export function raiseStartBest(startBest: number, loadedBest: number): number {
  return Math.max(startBest, loadedBest);
}

/**
 * 게임 오버 화면이 처음 뜰 때 낼 효과음 (W4-01). `gameOverShow`는 화면이 뜰 때마다 한 번, `newBest`는 최고 기록을 새로 세웠을 때만 그 뒤에 낸다.
 * resize로 다시 그릴 때는(fresh = false) 아무것도 내지 않는다. `newBestAfterMs`는 `gameOverShow`와 겹치지 않게 띄우는 간격이다.
 */
export function gameOverSounds(
  data: Pick<GameOverData, 'newBest'>,
  fresh: boolean,
  newBestAfterMs: number,
): { name: 'gameOverShow' | 'newBest'; afterMs: number }[] {
  if (!fresh) return [];
  const list: { name: 'gameOverShow' | 'newBest'; afterMs: number }[] = [
    { name: 'gameOverShow', afterMs: 0 },
  ];
  if (data.newBest) list.push({ name: 'newBest', afterMs: newBestAfterMs });
  return list;
}
