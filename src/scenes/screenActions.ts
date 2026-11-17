// 버튼이 눌렸을 때 화면(Pause·GameOver·Menu)이 하는 일의 순수 로직 (Phaser 없음, tests/scenes/screenActions.test.ts).
// 씬은 얇은 host(전환 함수들)만 넘긴다. 공통 규칙:
// - 새 판을 준비하는 동안에는 모든 버튼을 무시한다 (다시 그려져 새로 생긴 버튼 포함). 아무 일도 하지 않으므로 누름 잠금을 풀어 준다.
// - 새 판 요청이 거부되면('busy') 잠금을 풀어 영구히 잠기지 않게 한다.
// - 기존 판을 버리는 일(RETRY)은 새 판으로 실제로 넘어가는 순간에만 한다 (준비 중에는 기존 판을 건드리지 않는다).
import type { StartedRun } from '../online';
import type { PressLock } from '../view/ui/pressLock';
import type { GameStartData } from './gameStart';
import { isPreparing, requestNewGame } from './newRun';
import type { GameOverButton } from './gameOverRules';
import type { MenuButton } from './menuRules';
import type { PauseButton } from './pauseRules';

/** 새 판 시작에 필요한 것 (세 화면 공통) */
export interface NewGameHost {
  lock: PressLock;
  startRun(): Promise<StartedRun | null>;
  skipOnline(): boolean;
  showWait(): () => void;
  /** 새 판으로 넘어간다 (scene.start('Game', data)) */
  startGame(data: GameStartData): void;
}

/** 준비 중이면 true (이 누름은 무시해야 한다). 잠금을 풀어 준비가 끝난 뒤 다시 눌릴 수 있게 한다 */
function ignoredWhilePreparing(lock: PressLock): boolean {
  if (!isPreparing()) return false;
  lock.pressed = false;
  return true;
}

function startNew(owner: string, host: NewGameHost, beforeStart: () => void): void {
  const result = requestNewGame({
    owner,
    startRun: host.startRun,
    skipOnline: host.skipOnline,
    showWait: host.showWait,
    begin: (data) => {
      beforeStart();
      host.startGame(data);
    },
  });
  if (result === 'busy') host.lock.pressed = false;
}

export interface PauseHost extends NewGameHost {
  /** [계속]: Game을 이어서 하고 이 창을 닫는다 */
  resumeGame(): void;
  /** [다시 하기]로 새 판으로 넘어가는 순간: 기존 판을 버린다 (저장된 run 삭제) */
  abandonGame(): void;
  stopGame(): void;
  goMenu(): void;
}

export function handlePauseButton(button: PauseButton, host: PauseHost): void {
  if (ignoredWhilePreparing(host.lock)) return;
  switch (button) {
    case 'resume':
      host.resumeGame();
      break;
    case 'retry':
      startNew('Pause', host, () => {
        host.abandonGame();
        host.stopGame();
      });
      break;
    case 'menu':
      host.stopGame();
      host.goMenu();
      break;
  }
}

export interface GameOverHost extends NewGameHost {
  stopGame(): void;
  goMenu(): void;
}

export function handleGameOverButton(button: GameOverButton, host: GameOverHost): void {
  if (ignoredWhilePreparing(host.lock)) return;
  if (button === 'retry') {
    startNew('GameOver', host, () => host.stopGame());
    return;
  }
  host.stopGame();
  host.goMenu();
}

export interface MenuHost extends NewGameHost {
  /** 누르는 순간의 저장 상태. 이어할 판이 없으면 null */
  resumeData(): GameStartData | null;
  startResume(data: GameStartData): void;
  /** 이어하기가 없어졌다: 메뉴를 다시 그린다 */
  redraw(): void;
  /** [주간 랭킹]: 랭킹 화면으로 간다 (저장된 판·최고 점수는 건드리지 않는다) */
  openRanking(): void;
}

export function handleMenuButton(button: MenuButton, host: MenuHost): void {
  if (ignoredWhilePreparing(host.lock)) return;
  if (button === 'new') {
    startNew('Menu', host, () => undefined);
    return;
  }
  if (button === 'ranking') {
    host.openRanking();
    return;
  }
  const data = host.resumeData();
  if (data === null) {
    // 이어하기가 없어졌다: 전환하지 않고 다시 그린다. 다시 누를 수 있게 잠금을 푼다
    host.lock.pressed = false;
    host.redraw();
    return;
  }
  host.startResume(data);
}
