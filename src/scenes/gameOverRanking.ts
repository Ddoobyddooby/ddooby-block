// 게임 오버 화면의 랭킹 결과 연결 (W3-04). GameOverScene.create가 하던 "제출 결과 → 닉네임 묻기·순위 조회 → 결과 줄" 배선을 Phaser 없이 둬서
// 실제 연결을 시험한다 (tests/scenes/gameOverRanking.test.ts: 제출이 create 전/후 완료, 이름 저장 뒤 refresh, resize, 종료 뒤 늦은 응답).
//
// 한 게임 오버에 하나다: 처음 뜰 때 만들고, resize로 다시 그려도 **같은 객체**를 쓰며(화면은 `subscribe`만 다시 한다), 진짜 종료에서만 `end`한다.
// 순위 조회는 제출이 끝난 뒤에만 시작한다 (병렬 금지, pang R19). 이번 주 판인지는 기기 시계가 아니라 서버가 말한 주로 가른다 (rankLookup.ts).
import type { SubmitOutcome } from '../online';
import { RankLookup, type RankLookupDeps } from './rankLookup';
import { onSubmitDone, rankingLine, type RankingTracker } from './rankingResult';

export class GameOverRanking {
  private readonly lookup: RankLookup;
  private unsubscribeSubmit: (() => void) | null = null;
  private ended = false;

  constructor(
    private readonly tracker: RankingTracker,
    deps: RankLookupDeps,
  ) {
    this.lookup = new RankLookup(deps);
  }

  /** 지금 결과 줄 글자 */
  line(): string {
    return rankingLine(this.tracker.state, this.lookup.state);
  }

  /** 결과 줄이 바뀔 때(제출 완료·순위 조회 완료) 새 글자를 알린다. 구독을 끊는 함수를 돌려준다 (화면을 다시 그릴 때마다 끊고 다시 건다) */
  subscribe(onLine: (text: string) => void): () => void {
    const notify = () => onLine(this.line());
    const offTracker = this.tracker.subscribe(notify);
    const offLookup = this.lookup.subscribe(notify);
    return () => {
      offTracker();
      offLookup();
    };
  }

  /**
   * 제출이 끝나면(이미 끝났다면 바로) afterSubmit(닉네임 묻기)을 부르고, 성공이면 서버 이번 주 순위를 조회한다. 한 번만 부른다
   */
  begin(afterSubmit: (outcome: SubmitOutcome) => void): void {
    if (this.ended || this.unsubscribeSubmit !== null) return;
    this.unsubscribeSubmit = onSubmitDone(this.tracker, (outcome) => {
      if (this.ended) return;
      afterSubmit(outcome);
      this.lookup.start(outcome);
    });
  }

  /** 이름이 저장됐다: 순위를 다시 조회한다 */
  refreshRank(): void {
    this.lookup.refresh();
  }

  /** 진짜 종료: 제출 구독을 끊고 기다리던 조회 응답을 버린다 */
  end(): void {
    this.ended = true;
    this.unsubscribeSubmit?.();
    this.unsubscribeSubmit = null;
    this.lookup.end();
  }
}
