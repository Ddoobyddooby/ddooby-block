// 목록 드래그 스크롤의 순수 로직 (W3-04, Phaser 없음, tests/view/scrollGesture.test.ts). pang의 StageMapScene·mapLayout 방식을 복사해
// 다음을 더했다: **처음 누른 손가락 하나만** 따른다 (두 번째 손가락이 시작점·잠금을 가로채지 않는다), 취소(포인터가 화면 밖에서 떼어짐·blur·hidden) 지원.
// 스크롤 양 scroll은 0 = 맨 위가 보임, maxScroll = 맨 아래가 보임.

/** 스크롤할 수 있는 최대 양 (내용이 목록 칸보다 짧으면 0 = 스크롤 없음) */
export function maxScroll(contentHeight: number, viewHeight: number): number {
  return Math.max(0, contentHeight - viewHeight);
}

/** 위·아래 끝에서 더 못 넘어가게 (음수·끝 초과·NaN도 안전) */
export function clampScroll(scroll: number, contentHeight: number, viewHeight: number): number {
  const value = Number.isFinite(scroll) ? scroll : 0;
  return Math.min(Math.max(0, value), maxScroll(contentHeight, viewHeight));
}

/** 누른 곳에서 문턱보다 멀리 움직였으면 끌기 (아니면 누르기로 본다) */
export function isDrag(dx: number, dy: number, threshold: number): boolean {
  return Math.hypot(dx, dy) > threshold;
}

/** 누른 손가락 하나의 끌기 추적. 목록 안에서 시작한 첫 손가락만 따르고, 그 손가락이 끝날 때까지 다른 손가락은 무시한다 */
export class ScrollGesture {
  private id: number | null = null;
  private startX = 0;
  private startY = 0;
  private startScroll = 0;
  private dragging = false;

  constructor(private readonly threshold: number) {}

  /** 끌고 있는 중(문턱을 넘음)인가 */
  get dragged(): boolean {
    return this.dragging;
  }

  /** 손가락이 닿았다. 이미 다른 손가락을 따르는 중이거나 목록 밖에서 시작했으면 무시한다 (잠금도 가로채지 않는다) */
  down(id: number, x: number, y: number, scroll: number, inList: boolean): void {
    if (this.id !== null || !inList) return;
    this.id = id;
    this.startX = x;
    this.startY = y;
    this.startScroll = scroll;
    this.dragging = false;
  }

  /** 손가락이 움직였다. 새 스크롤 양을 돌려준다 (문턱 전이거나 따르는 손가락이 아니면 null). 범위는 호출한 쪽이 clamp한다 */
  move(id: number, x: number, y: number): number | null {
    if (this.id !== id) return null;
    if (!this.dragging && !isDrag(x - this.startX, y - this.startY, this.threshold)) return null;
    this.dragging = true;
    return this.startScroll - (y - this.startY); // 손가락을 올리면 아래 줄이 올라온다
  }

  /** 손가락이 떨어졌다 (따르던 손가락만 끝낸다) */
  up(id: number): void {
    if (this.id === id) this.cancel();
  }

  /** 모든 추적을 끝낸다 (화면 밖에서 떼어짐·blur·hidden·씬 종료). 다음 끌기가 정상으로 시작된다 */
  cancel(): void {
    this.id = null;
    this.dragging = false;
  }
}
