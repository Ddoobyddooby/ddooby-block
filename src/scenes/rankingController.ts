// 주간 랭킹 화면의 조회 수명 (W3-04). Phaser 없는 순수 로직이라 가짜 host로 시험한다 (tests/scenes/rankingController.test.ts).
// 화면(RankingScene)은 이 객체가 알려 주는 상태를 그리기만 한다.
//
// 규칙:
// - 조회는 요청마다 **새 번호**를 받는다. 늦게 온 옛 응답, 그 응답의 타이머·정리는 지금 상태를 건드리지 않는다.
//   화면을 다시 열면 새 컨트롤러가 만들어지므로 같은 씬 객체가 재진입해도 옛 응답이 번호 우연으로 통과하지 않는다.
// - "불러오는 중…"은 0.3초를 넘길 때만 보인다 (빠르면 깜빡이지 않는다).
// - 열 때 진행 중인 점수 제출이 있으면 그것이 끝난 뒤 한 번 더 조회한다 (R19). 돌아가기는 막지 않는다.
import type { RankingResult } from '../online';
import { selectView, type RankingView } from '../view/rankingRows';

/** 화면이 그릴 상태. loading의 visible은 "불러오는 중…" 문구를 보일 때만 true */
export type RankingScreen =
  | { phase: 'loading'; visible: boolean }
  | { phase: 'view'; view: RankingView; weekKey: string | null };

export interface RankingControllerHost {
  fetchRanking(): Promise<RankingResult>;
  /** 진행 중인 제출이 모두 끝나면 풀리는 약속. 없으면 null */
  waitSubmission(): Promise<void> | null;
  /** ms 뒤에 fn을 부른다. 돌려주는 함수가 예약을 취소한다 */
  after(ms: number, fn: () => void): () => void;
  /** "불러오는 중…"을 보이기까지 (ms) */
  loadingMs: number;
  onScreen(screen: RankingScreen): void;
}

export class RankingController {
  /** 요청 번호. 이 인스턴스 안에서 올리기만 한다 (되돌리지 않는다) */
  private latest = 0;
  private closed = false;
  private cancelLoading: (() => void) | null = null;
  private current: RankingScreen = { phase: 'loading', visible: false };

  constructor(private readonly host: RankingControllerHost) {}

  get screen(): RankingScreen {
    return this.current;
  }

  /** 화면이 열렸다: 조회하고, 진행 중인 제출이 있으면 끝난 뒤 한 번 더 조회한다 */
  open(): void {
    this.reload();
    const wait = this.host.waitSubmission();
    if (wait === null) return;
    void wait.then(() => {
      if (!this.closed) this.reload();
    });
  }

  /** 지금 조회를 버리고 새로 조회한다 ([새로고침]·[다시 시도]·이름을 정한 뒤) */
  reload(): void {
    if (this.closed) return;
    const token = (this.latest += 1);
    this.cancelLoading?.();
    this.cancelLoading = null;
    this.emit({ phase: 'loading', visible: false });
    this.cancelLoading = this.host.after(this.host.loadingMs, () => {
      if (!this.closed && token === this.latest) this.emit({ phase: 'loading', visible: true });
    });

    let request: Promise<RankingResult>;
    try {
      request = this.host.fetchRanking();
    } catch {
      request = Promise.resolve({ kind: 'error' });
    }
    void request
      .catch((): RankingResult => ({ kind: 'error' }))
      .then((result) => {
        // 늦게 온 옛 응답이거나 화면이 닫혔으면 아무것도 건드리지 않는다 (지금 조회의 타이머·상태 포함)
        if (this.closed || token !== this.latest) return;
        this.cancelLoading?.();
        this.cancelLoading = null;
        this.emit({
          phase: 'view',
          view: selectView(result),
          weekKey: result.kind === 'ok' ? result.weekKey : null,
        });
      });
  }

  /** 화면을 떠난다: 기다리던 응답과 타이머를 모두 버린다. 이후 어떤 호출도 아무 일도 하지 않는다 */
  close(): void {
    this.closed = true;
    this.latest += 1;
    this.cancelLoading?.();
    this.cancelLoading = null;
  }

  private emit(screen: RankingScreen): void {
    this.current = screen;
    this.host.onScreen(screen);
  }
}
