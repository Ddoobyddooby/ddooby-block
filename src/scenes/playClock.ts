// 누적 플레이 시계 (PLAN 2절 `t`). 배치 로그의 `t`와 저장하는 `elapsedMs`가 이 시계 값이다.
// 시간 원천(`now`)을 주입받는다: 게임은 `performance.now`(단조 증가), 테스트는 가짜 시간. `Date.now` 같은 벽시계는 쓰지 않는다.
// 막는 이유(`block`)가 하나라도 있으면 시간이 흐르지 않는다: 일시정지, 화면이 숨겨짐, 게임 오버. 연출 중에는 흐른다.

export type ClockBlock = 'paused' | 'hidden' | 'over';

export class PlayClock {
  private accumulated: number;
  private last: number;
  private readonly blocks = new Set<ClockBlock>();

  /** `startMs`: 이어한 판은 저장된 `elapsedMs`에서 시작한다 */
  constructor(
    private readonly now: () => number,
    startMs = 0,
  ) {
    this.accumulated = startMs;
    this.last = now();
  }

  /** 흐르는 중인가 (막는 이유가 없다) */
  get running(): boolean {
    return this.blocks.size === 0;
  }

  isBlocked(reason: ClockBlock): boolean {
    return this.blocks.has(reason);
  }

  /** 막는다. 같은 이유로 여러 번 막아도 한 번으로 친다 (숨김 이벤트가 겹쳐도 이중으로 빼지 않는다) */
  block(reason: ClockBlock): void {
    this.advance();
    this.blocks.add(reason);
  }

  unblock(reason: ClockBlock): void {
    this.advance();
    this.blocks.delete(reason);
  }

  /** 누적 플레이 시간 ms. 정수로 내린다 (줄어들지 않는다) */
  elapsed(): number {
    this.advance();
    return Math.floor(this.accumulated);
  }

  private advance(): void {
    const current = this.now();
    // 시간 원천이 거꾸로 가면 그 구간은 세지 않는다
    if (current < this.last) {
      this.last = current;
      return;
    }
    if (this.blocks.size === 0) this.accumulated += current - this.last;
    this.last = current;
  }
}
