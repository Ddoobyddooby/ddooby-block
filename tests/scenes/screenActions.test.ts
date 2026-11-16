import { afterEach, describe, expect, it } from 'vitest';
import { REPLAY, SAVE } from '../../src/config';
import { createGame } from '../../src/core/engine';
import type { StartedRun } from '../../src/online';
import type { GameStartData } from '../../src/scenes/gameStart';
import { cancelNewGame, isPreparing, resetNewGameFlow } from '../../src/scenes/newRun';
import { PlayClock } from '../../src/scenes/playClock';
import { RestartGate } from '../../src/scenes/restartGate';
import { RunSession, type RunStore } from '../../src/scenes/runSession';
import {
  handleGameOverButton,
  handleMenuButton,
  handlePauseButton,
  type NewGameHost,
} from '../../src/scenes/screenActions';
import { beginPress, type PressLock } from '../../src/view/ui/pressLock';
import { anyMove, playGreedy } from '../helpers/bot';
import { deferred } from '../online/fakeBackend';

// 실제 씬(Phaser)을 띄우지 않고, 씬이 하는 일을 그대로 흉내 낸 가짜 화면으로 "준비 중 resize" 같은 순서를 검증한다:
// resize = 화면 재생성(새 PressLock, 떠나는 것이 아니므로 취소 아님), 버튼 = 실제 beginPress + screenActions의 핸들러,
// 기존 판 = 실제 RunSession(실제 core·PlayClock)과 호출을 적는 가짜 저장소.
const RUN: StartedRun = { runId: '123e4567-e89b-42d3-a456-426614174000', seed: 4000000000 };
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

afterEach(() => resetNewGameFlow());

interface World {
  transitions: string[];
  startData: GameStartData[];
  startRunCalls: number;
  startRunGate: ReturnType<typeof deferred<StartedRun | null>> | null;
  session: RunSession;
  store: { saves: number; finishes: number; discards: number };
  clock: PlayClock;
  time: { now: number };
}

function world(): World {
  const time = { now: 777 };
  const clock = new PlayClock(() => time.now, 0);
  const store = { saves: 0, finishes: 0, discards: 0 };
  const runStore: RunStore = {
    beginRun: () => 1,
    saveRun: () => {
      store.saves += 1;
    },
    finishRun: () => {
      store.finishes += 1;
    },
    discardRun: () => {
      store.discards += 1;
    },
  };
  const session = new RunSession({
    seed: 4,
    state: createGame(4),
    runId: RUN.runId,
    clock,
    store: runStore,
    replayable: true,
    minIntervalMs: REPLAY.minIntervalMs,
    maxPlacements: SAVE.maxRunPlacements,
  });
  // 몇 수 둔 판. 일시정지는 시계를 멈춘다 (GameScene.pause와 같다)
  const moves = playGreedy(4, 3).placements;
  for (const m of moves) {
    time.now += 300;
    session.tryPlace({ trayIndex: m.trayIndex, row: m.row, col: m.col });
  }
  clock.block('paused');
  session.checkpoint();
  store.saves = 0; // 이후 저장만 센다
  return {
    transitions: [],
    startData: [],
    startRunCalls: 0,
    startRunGate: null,
    session,
    store,
    clock,
    time,
  };
}

function host(w: World, lock: () => PressLock) {
  const base: NewGameHost = {
    get lock() {
      return lock();
    },
    startRun: () => {
      w.startRunCalls += 1;
      return w.startRunGate ? w.startRunGate.promise : Promise.resolve(null);
    },
    skipOnline: () => false,
    showWait: () => () => undefined,
    startGame: (data) => {
      w.transitions.push('start Game');
      w.startData.push(data);
    },
  };
  return base;
}

/** Pause 화면: create마다 새 잠금, resize는 취소가 아닌 재생성 */
class PauseScreen {
  lock: PressLock = { pressed: false };
  constructor(private readonly w: World) {
    this.create();
  }
  create(): void {
    this.lock = { pressed: false };
  }
  resize(): void {
    this.create(); // restarting이므로 cancelNewGame을 부르지 않는다
  }
  leave(): void {
    cancelNewGame('Pause'); // 다시 그리기가 아닌 종료
  }
  press(button: 'resume' | 'retry' | 'menu'): void {
    if (!beginPress(this.lock)) return;
    const w = this.w;
    handlePauseButton(button, {
      ...host(w, () => this.lock),
      resumeGame: () => w.transitions.push('resume Game'),
      abandonGame: () => {
        w.transitions.push('abandon');
        w.session.abandon();
      },
      stopGame: () => w.transitions.push('stop Game'),
      goMenu: () => w.transitions.push('start Menu'),
    });
  }
}

describe('지적 1: Pause [다시 하기] 준비 중 resize·버튼', () => {
  for (const [label, resolve] of [
    ['서버 run 성공', (g: World) => g.startRunGate?.resolve(RUN)],
    ['null(실패·키 없음)', (g: World) => g.startRunGate?.resolve(null)],
    ['시간 초과(null)', (g: World) => g.startRunGate?.resolve(null)],
  ] as const) {
    for (const press of ['resume', 'menu', 'retry'] as const) {
      it(`retry 대기 → resize 여러 번 → [${press}] 눌러도 무시 → ${label}: 그때 한 번만 abandon하고 새 판으로 넘어간다`, async () => {
        const w = world();
        w.startRunGate = deferred<StartedRun | null>();
        const pause = new PauseScreen(w);
        pause.press('retry');
        pause.resize();
        pause.resize();
        pause.resize();
        expect(pause.lock.pressed).toBe(false); // 새 화면의 새 잠금
        pause.press(press);
        // 눌러도 아무 전환도 없다: 기존 판은 그대로, 잠금은 풀려 있다
        expect(w.transitions).toEqual([]);
        expect(pause.lock.pressed).toBe(false);
        expect(w.store.discards).toBe(0);
        expect(w.startRunCalls).toBe(1);

        resolve(w);
        await tick();
        // 새 판으로 넘어가는 순간에만: 버림 → Game 정지 → 새 Game 시작 (순서)
        expect(w.transitions).toEqual(['abandon', 'stop Game', 'start Game']);
        expect(w.store.discards).toBe(1);
        expect(w.startData).toEqual([label === '서버 run 성공' ? { online: RUN } : {}]);
        expect(isPreparing()).toBe(false);
      });
    }
  }

  it('준비 중에는 기존 판을 건드리지 않는다: 저장 삭제 없음, 입력·제출은 전환 때까지 정상', async () => {
    const w = world();
    w.startRunGate = deferred<StartedRun | null>();
    const pause = new PauseScreen(w);
    pause.press('retry');
    pause.resize();
    expect(w.store.discards).toBe(0);
    expect(w.session.rankedSubmission()).toBeNull(); // 아직 안 끝난 판
    // 일시정지가 풀려 있었다면 그대로 둘 수 있다 (abandon되지 않았다)
    w.clock.unblock('paused');
    w.time.now += 300;
    const move = anyMove(w.session.state);
    expect(w.session.tryPlace(move).ok).toBe(true);
    expect(w.store.saves).toBe(1); // 저장도 계속된다
    w.startRunGate.resolve(null);
    await tick();
    expect(w.store.discards).toBe(1);
  });

  it('버린 판은 입력을 받지 않고 제출용 값을 주지 않는다 (재개돼도 저장 없이 이어지지 않는다)', async () => {
    const w = world();
    w.startRunGate = deferred<StartedRun | null>();
    const pause = new PauseScreen(w);
    pause.press('retry');
    w.startRunGate.resolve(null);
    await tick();
    w.clock.unblock('paused'); // 어떤 경로로든 포기한 판이 다시 풀렸다고 가정
    w.time.now += 500;
    expect(w.session.tryPlace(anyMove(w.session.state))).toEqual({
      ok: false,
      reason: 'abandoned',
    });
    // 끝까지 둘 수도 없고 제출도 없다
    expect(w.session.rankedSubmission()).toBeNull();
    expect(w.store.saves).toBe(0);
  });

  it('준비 중 Pause를 떠나면(다시 그리기가 아닌 종료) 늦은 응답은 무시되고 기존 판은 그대로다', async () => {
    const w = world();
    w.startRunGate = deferred<StartedRun | null>();
    const pause = new PauseScreen(w);
    pause.press('retry');
    pause.leave();
    w.startRunGate.resolve(RUN);
    await tick();
    expect(w.transitions).toEqual([]);
    expect(w.store.discards).toBe(0);
    expect(isPreparing()).toBe(false);
  });

  it('?seed·?fill이면 기다림 없이 바로 넘어가며 그때 abandon한다 (startRun 호출 없음)', () => {
    const w = world();
    const pauseLock: PressLock = { pressed: true };
    const h = { ...host(w, () => pauseLock), skipOnline: () => true };
    handlePauseButton('retry', {
      ...h,
      resumeGame: () => undefined,
      abandonGame: () => w.session.abandon(),
      stopGame: () => w.transitions.push('stop Game'),
      goMenu: () => undefined,
    });
    expect(w.startRunCalls).toBe(0);
    expect(w.store.discards).toBe(1);
    expect(w.transitions).toEqual(['stop Game', 'start Game']);
  });

  it('정상 [계속]·[메뉴]는 준비 중이 아닐 때 그대로 동작한다', () => {
    const w = world();
    const pause = new PauseScreen(w);
    pause.press('resume');
    expect(w.transitions).toEqual(['resume Game']);
    const w2 = world();
    new PauseScreen(w2).press('menu');
    expect(w2.transitions).toEqual(['stop Game', 'start Menu']);
    expect(w2.store.discards).toBe(0); // [메뉴]는 저장된 판을 남긴다 (이어하기)
  });
});

describe('RunSession: 게임 오버 종료와 사용자 포기 구분', () => {
  it('정상 게임 오버 뒤 abandon(Pause 재시도가 연출 중에 눌려도)은 버린 판이 아니다: 제출은 그대로', () => {
    const w = world();
    w.clock.unblock('paused');
    while (!w.session.state.over) {
      w.time.now += 300;
      w.session.tryPlace(anyMove(w.session.state));
    }
    expect(w.store.finishes).toBe(1);
    w.session.abandon();
    expect(w.session.rankedSubmission()).not.toBeNull();
    // 이미 끝난 판이라 저장은 다시 지우지 않는다
    expect(w.store.discards).toBe(0);
  });

  it('abandon은 저장소가 없어도 판을 버린 판으로 만든다', () => {
    const time = { now: 0 };
    const session = new RunSession({
      seed: 4,
      state: createGame(4),
      runId: RUN.runId,
      clock: new PlayClock(() => time.now, 0),
      store: null,
      replayable: true,
      minIntervalMs: REPLAY.minIntervalMs,
      maxPlacements: SAVE.maxRunPlacements,
    });
    session.abandon();
    time.now += 300;
    expect(session.tryPlace(anyMove(session.state))).toEqual({ ok: false, reason: 'abandoned' });
  });
});

describe('지적 2: 요청 수명과 버튼 잠금', () => {
  const never = (): Promise<StartedRun | null> => new Promise(() => undefined);

  it('화면 A(Pause) 준비 중 → 떠남 → Menu 새 게임: 거부되지 않고 시작한다. A의 늦은 응답은 무시', async () => {
    const w = world();
    w.startRunGate = deferred<StartedRun | null>();
    const pause = new PauseScreen(w);
    pause.press('retry');
    pause.leave(); // Menu로 이동
    const menuLock: PressLock = { pressed: false };
    const gate = deferred<StartedRun | null>();
    const menuTransitions: string[] = [];
    beginPress(menuLock);
    handleMenuButton('new', {
      ...host(w, () => menuLock),
      startRun: () => gate.promise,
      startGame: (d) => menuTransitions.push(JSON.stringify(d)),
      resumeData: () => null,
      startResume: () => undefined,
      redraw: () => undefined,
    });
    w.startRunGate.resolve(RUN); // A의 옛 응답
    await tick();
    expect(menuTransitions).toEqual([]);
    expect(w.transitions).toEqual([]);
    gate.resolve(null);
    await tick();
    expect(menuTransitions).toEqual(['{}']);
  });

  it('다른 요청이 준비 중일 때 Menu [새 게임]은 거부되고 잠금이 풀린다. 준비가 끝난 뒤 다시 누르면 입력된다', async () => {
    const w = world();
    w.startRunGate = deferred<StartedRun | null>();
    const pause = new PauseScreen(w);
    pause.press('retry'); // 준비 중 (owner Pause)
    const menuLock: PressLock = { pressed: false };
    const starts: string[] = [];
    const menu = (): void => {
      if (!beginPress(menuLock)) return;
      handleMenuButton('new', {
        ...host(w, () => menuLock),
        startGame: (d) => starts.push(JSON.stringify(d)),
        resumeData: () => null,
        startResume: () => undefined,
        redraw: () => undefined,
      });
    };
    menu();
    expect(menuLock.pressed).toBe(false); // 영구 잠김 아님
    expect(starts).toEqual([]);
    w.startRunGate.resolve(null);
    await tick(); // Pause 요청 완료
    menu();
    await tick();
    expect(starts).toEqual(['{}']);
    expect(menuLock.pressed).toBe(true); // 정상 시작 뒤에는 화면을 떠나는 중이라 잠금 유지
  });

  it('Menu [이어하기]도 준비 중에는 무시되고 잠금이 풀린다', () => {
    const w = world();
    const pause = new PauseScreen(w);
    w.startRunGate = deferred<StartedRun | null>();
    pause.press('retry');
    const lock: PressLock = { pressed: true };
    let resumed = 0;
    handleMenuButton('resume', {
      ...host(w, () => lock),
      resumeData: () => ({}),
      startResume: () => {
        resumed += 1;
      },
      redraw: () => undefined,
    });
    expect(resumed).toBe(0);
    expect(lock.pressed).toBe(false);
  });

  it('같은 화면 resize 중 같은 요청은 최대 1회: startRun 한 번, 시작 한 번', async () => {
    const w = world();
    w.startRunGate = deferred<StartedRun | null>();
    const pause = new PauseScreen(w);
    pause.press('retry');
    for (let i = 0; i < 5; i += 1) {
      pause.resize();
      pause.press('retry'); // 다시 그려진 새 버튼을 또 누름
    }
    expect(w.startRunCalls).toBe(1);
    w.startRunGate.resolve(RUN);
    await tick();
    expect(w.transitions.filter((t) => t === 'start Game')).toHaveLength(1);
    expect(w.store.discards).toBe(1);
  });

  it('GameOver: [다시 하기] 준비 중 resize 뒤 [메뉴]는 무시, 완료되면 새 판 시작 (끝난 Game 정지)', async () => {
    const w = world();
    const gate = deferred<StartedRun | null>();
    const log: string[] = [];
    let lock: PressLock = { pressed: false };
    const press = (b: 'retry' | 'menu'): void => {
      if (!beginPress(lock)) return;
      handleGameOverButton(b, {
        ...host(w, () => lock),
        startRun: () => gate.promise,
        startGame: (d) => log.push(`start ${JSON.stringify(d)}`),
        stopGame: () => log.push('stop Game'),
        goMenu: () => log.push('menu'),
      });
    };
    press('retry');
    lock = { pressed: false }; // resize로 다시 그려짐
    press('menu');
    expect(log).toEqual([]);
    gate.resolve(RUN);
    await tick();
    expect(log).toEqual(['stop Game', `start ${JSON.stringify({ online: RUN })}`]);
  });

  it('무한 대기(응답 없음)는 startRun 쪽 제한 시간이 끝낸다: 그 전에는 버튼이 계속 무시된다', () => {
    const w = world();
    const lock: PressLock = { pressed: false };
    beginPress(lock);
    handleMenuButton('new', {
      ...host(w, () => lock),
      startRun: never,
      resumeData: () => null,
      startResume: () => undefined,
      redraw: () => undefined,
    });
    expect(isPreparing()).toBe(true);
    const lock2: PressLock = { pressed: true };
    handleMenuButton('new', {
      ...host(w, () => lock2),
      resumeData: () => null,
      startResume: () => undefined,
      redraw: () => undefined,
    });
    expect(lock2.pressed).toBe(false);
  });
});

// ── resize가 다음 갱신 전에 여러 번 오는 경계 (재리뷰 1) ──────────────────────────────────────
// 실제 Phaser처럼 restart를 즉시 실행하지 않고 큐에 모은다. update(drain)에서 큐를 비우며 SHUTDOWN → create를 차례로 실행한다.
// 예약을 합치지 않으면 첫 create가 플래그를 되돌린 뒤 두 번째 SHUTDOWN이 "화면을 떠남"으로 오판돼 준비 요청이 취소된다.
class QueuedScreen {
  readonly gate = new RestartGate();
  lock: PressLock = { pressed: false };
  queue: (() => void)[] = [];
  creates = 0;
  constructor(
    private readonly w: World,
    private readonly owner: 'Pause' | 'GameOver',
  ) {
    this.create();
  }
  create(): void {
    this.gate.started();
    this.lock = { pressed: false };
    this.creates += 1;
  }
  /** resize: 씬이 실제로 하는 것과 같다 (gate로 합치고, restart는 큐에만 넣는다) */
  resize(): void {
    this.gate.request(() => this.queue.push(() => this.restartNow()));
  }
  private restartNow(): void {
    // SHUTDOWN 이벤트 → create
    if (!this.gate.restarting) cancelNewGame(this.owner);
    this.create();
  }
  /** Phaser의 다음 update: 쌓인 restart를 모두 실행한다 */
  drain(): void {
    while (this.queue.length > 0) this.queue.shift()?.();
  }
  /** 진짜 SHUTDOWN (다시 그리기가 아닌 종료) */
  leave(): void {
    if (!this.gate.restarting) cancelNewGame(this.owner);
  }
  pressRetry(): void {
    if (!beginPress(this.lock)) return;
    const w = this.w;
    const h = host(w, () => this.lock);
    if (this.owner === 'Pause') {
      handlePauseButton('retry', {
        ...h,
        resumeGame: () => undefined,
        abandonGame: () => w.transitions.push('abandon'),
        stopGame: () => w.transitions.push('stop Game'),
        goMenu: () => undefined,
      });
    } else {
      handleGameOverButton('retry', {
        ...h,
        stopGame: () => w.transitions.push('stop Game'),
        goMenu: () => undefined,
      });
    }
  }
}

describe('재리뷰 1: resize가 갱신 전에 겹쳐도 준비 요청이 유지된다 (큐에 모으는 호스트)', () => {
  for (const owner of ['Pause', 'GameOver'] as const) {
    for (const [label, answer] of [
      ['성공', RUN],
      ['null', null],
    ] as const) {
      for (const resizes of [2, 3, 5]) {
        it(`${owner}: [다시 하기] 대기 → update 전에 resize ${resizes}회 → drain → ${label}: 새 판 시작 정확히 1회`, async () => {
          const w = world();
          w.startRunGate = deferred<StartedRun | null>();
          const screen = new QueuedScreen(w, owner);
          screen.pressRetry();
          for (let i = 0; i < resizes; i += 1) screen.resize();
          expect(screen.queue).toHaveLength(1); // 예약은 하나로 합쳐진다
          screen.drain();
          expect(screen.creates).toBe(2); // 한 번만 다시 그렸다
          expect(isPreparing()).toBe(true);
          w.startRunGate.resolve(answer);
          await tick();
          expect(w.transitions.filter((t) => t === 'start Game')).toHaveLength(1);
          expect(w.startData).toEqual([answer === null ? {} : { online: RUN }]);
          expect(w.startRunCalls).toBe(1);
        });
      }
    }

    it(`${owner}: 합친 뒤 마지막 resize 이후 다시 resize해도(새 예약) 요청이 유지되고, 진짜 SHUTDOWN에서는 취소된다`, async () => {
      const w = world();
      w.startRunGate = deferred<StartedRun | null>();
      const screen = new QueuedScreen(w, owner);
      screen.pressRetry();
      screen.resize();
      screen.resize();
      screen.drain();
      screen.resize(); // drain 뒤의 새 resize는 새 예약
      expect(screen.queue).toHaveLength(1);
      screen.drain();
      expect(isPreparing()).toBe(true);
      screen.leave(); // 진짜 종료
      expect(isPreparing()).toBe(false);
      w.startRunGate.resolve(RUN);
      await tick();
      expect(w.transitions).toEqual([]);
    });

    it(`${owner}: 같은 owner 재진입 뒤 옛 응답은 무시된다`, async () => {
      const w = world();
      const oldGate = deferred<StartedRun | null>();
      w.startRunGate = oldGate;
      const first = new QueuedScreen(w, owner);
      first.pressRetry();
      first.leave();
      const newGate = deferred<StartedRun | null>();
      w.startRunGate = newGate;
      const second = new QueuedScreen(w, owner); // 같은 owner의 새 실행
      second.pressRetry();
      oldGate.resolve(RUN);
      await tick();
      expect(w.transitions).toEqual([]);
      newGate.resolve(null);
      await tick();
      expect(w.startData).toEqual([{}]);
    });
  }
});
