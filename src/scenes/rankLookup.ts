// 게임 오버 화면의 "이번 주 순위" 조회 (W3-04). Phaser 없는 순수 로직이라 시험한다 (tests/scenes/rankLookup.test.ts).
//
// 점수 제출이 **성공한 뒤에만** 조회한다 (병렬로 먼저 부르면 방금 제출한 기록이 목록에 빠진다: pang R19). 점수·순위는 서버 조회값을 그대로 쓴다
// (클라이언트가 점수로 순위를 세지 않는다). 조회가 실패해도 제출 성공은 그대로다: 순위만 못 읽은 상태(failed)로 남는다.
// 서버 응답의 주가 제출한 주와 다르면(pastWeek) 순위를 붙이지 않고, 다른 계정의 응답이면 버린다 (지난주 판에 이번 주 순위를 붙이지 않는다).
import type { RankingResult, SubmitOutcome } from '../online';

/**
 * - idle·loading: 아직 모른다 (결과 줄은 제출 응답의 최고 점수를 보인다)
 * - ranked: 서버가 말한 이번 주 최고 점수와 순위
 * - unnamed: 이름이 없는 계정이라 순위가 없다 (이름을 정하면 다시 조회한다)
 * - pastWeek: 서버의 이번 주가 제출한 주와 다르다 (며칠 이어서 한 지난주 판). 이번 주 순위를 붙이지 않는다
 * - failed: 순위를 못 읽었다 (오프라인·오류·시간 초과·다른 계정)
 */
export type RankLookupState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ranked'; score: number; rank: number }
  | { phase: 'unnamed'; score: number }
  | { phase: 'pastWeek' }
  | { phase: 'failed' };

export interface RankLookupDeps {
  fetchRanking(): Promise<RankingResult>;
  currentUserId(): string | null;
}

export class RankLookup {
  private current: RankLookupState = { phase: 'idle' };
  private readonly listeners = new Set<(state: RankLookupState) => void>();
  /** 조회 번호. 올리기만 한다: 늦은 옛 응답·끝난 뒤의 응답은 버린다 */
  private latest = 0;
  private ended = false;
  /** 제출 성공 때의 계정과 주. 이 판의 결과로만 순위를 붙인다 */
  private context: { userId: string; weekKey: string } | null = null;

  constructor(private readonly deps: RankLookupDeps) {}

  get state(): RankLookupState {
    return this.current;
  }

  subscribe(listener: (state: RankLookupState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 제출이 끝났을 때 한 번 부른다. 성공이고 같은 계정일 때만 조회한다 (그 밖에는 아무것도 하지 않는다) */
  start(outcome: SubmitOutcome): void {
    if (this.ended || this.context !== null || outcome.kind !== 'ok') return;
    if (this.deps.currentUserId() !== outcome.userId) return;
    this.context = { userId: outcome.userId, weekKey: outcome.weekKey };
    this.query();
  }

  /** 이름을 정한 뒤 다시 조회한다. start가 시작되지 않았으면(제출 실패 등) 아무것도 하지 않는다 */
  refresh(): void {
    if (this.ended || this.context === null) return;
    this.query();
  }

  /** 화면을 떠난다: 기다리던 응답을 버린다 */
  end(): void {
    this.ended = true;
    this.latest += 1;
    this.listeners.clear();
  }

  private query(): void {
    const context = this.context;
    if (context === null) return;
    const token = (this.latest += 1);
    if (this.current.phase === 'idle') this.set({ phase: 'loading' });
    let request: Promise<RankingResult>;
    try {
      request = this.deps.fetchRanking();
    } catch {
      request = Promise.resolve({ kind: 'error' });
    }
    void request
      .catch((): RankingResult => ({ kind: 'error' }))
      .then((result) => {
        if (this.ended || token !== this.latest) return;
        this.set(this.classify(result, context));
      });
  }

  private classify(
    result: RankingResult,
    context: { userId: string; weekKey: string },
  ): RankLookupState {
    const failed: RankLookupState = { phase: 'failed' };
    if (result.kind !== 'ok') return failed;
    // 다른 계정의 응답이거나(기다리는 사이 계정이 바뀜) 다른 주의 순위면 이 판의 것이 아니다
    if (result.userId !== context.userId || this.deps.currentUserId() !== context.userId) {
      return failed;
    }
    // 기기 시계가 아니라 **서버가 말한 이번 주**와 제출한 주를 비교한다 (기기 시계가 틀려도, 주 경계에서도 서버가 기준)
    if (result.weekKey !== context.weekKey) return { phase: 'pastWeek' };
    // 제출은 성공했는데 내 기록이 없다: 일시적 불일치라 순위를 지어내지 않는다
    if (result.me === null) return failed;
    if (result.me.rank === null) return { phase: 'unnamed', score: result.me.score };
    return { phase: 'ranked', score: result.me.score, rank: result.me.rank };
  }

  private set(state: RankLookupState): void {
    this.current = state;
    for (const listener of [...this.listeners]) listener(state);
  }
}
