// 게임 오버 때의 점수 제출과 결과 문구 (W3-03). Phaser 없는 순수 로직이라 시험할 수 있다 (tests/scenes/rankingResult.test.ts).
//
// 제출은 판이 끝나는 순간(마지막 배치가 수락돼 논리 상태가 over가 된 순간)의 로그로 시작하고, 게임 오버 화면은 응답을 기다리지 않는다.
// 응답은 RankingTracker가 받아 두었다가 화면에 알린다 (화면이 다시 그려지거나 늦게 떠도 같은 결과를 본다).
import type { GameState, Placement } from '../core/types';
import type { SubmitOutcome, SubmitPayload } from '../online';
import { isUuid } from '../replay/judge';
import { weekKey } from '../replay/weekKey';
import { formatScore } from '../view/hudText';
import { RANKING_TEXT } from '../view/rankingText';
import { trackSubmission } from './pendingSubmission';
import type { RankLookupState } from './rankLookup';

/** 제출할 것: 랭킹 대상 판의 run과 요청 본문 */
export interface RankedSubmission {
  runId: string;
  payload: SubmitPayload;
}

/**
 * 끝난 판에서 제출할 것을 만든다. 랭킹 대상이 아니면 null:
 * - run이 없다 (오프라인 판), UUID 모양이 아니다 (옛 저장·손상)
 * - 리플레이할 수 없는 판이다 (DEV `?fill=`)
 * - 끝나지 않았다, 배치가 없다, 기록 한도(20,000)를 넘어 잘렸다 (잘린 기록을 정상 점수로 제출하지 않는다)
 * 로그는 복사해서 만든다 (이후 원본이 바뀌어도 제출 내용은 그대로).
 */
export function buildSubmission(input: {
  runId: string | null;
  replayable: boolean;
  seed: number;
  version: number;
  state: GameState;
  placements: readonly Placement[];
  /** 기록 한도 (SAVE.maxRunPlacements). 넘으면 저장도 멈춘 판이라 제출하지 않는다 */
  maxPlacements: number;
}): RankedSubmission | null {
  const { runId, replayable, seed, version, state, placements, maxPlacements } = input;
  if (runId === null || !isUuid(runId) || !replayable) return null;
  if (!state.over || placements.length === 0 || placements.length > maxPlacements) {
    return null;
  }
  return {
    runId,
    payload: {
      seed,
      version,
      clientScore: state.score,
      placements: placements.map((p) => ({
        trayIndex: p.trayIndex,
        row: p.row,
        col: p.col,
        t: p.t,
      })),
    },
  };
}

export type RankingState = { phase: 'pending' } | { phase: 'done'; outcome: SubmitOutcome };

/** 제출 하나의 진행 상태. 응답은 한 번만 반영하고, 구독자에게 알린다 */
export class RankingTracker {
  private current: RankingState = { phase: 'pending' };
  private readonly listeners = new Set<(state: RankingState) => void>();

  constructor(submission: Promise<SubmitOutcome>) {
    // 제출이 끝나기 전에 랭킹 화면을 열어도 끝난 뒤 목록을 갱신할 수 있게 앱 전체에 알린다 (pendingSubmission.ts)
    trackSubmission(submission);
    // submitScore는 throw하지 않지만 어긋나도 처리되지 않은 거부로 남기지 않는다
    void submission
      .catch((): SubmitOutcome => ({ kind: 'failed' }))
      .then((outcome) => {
        this.current = { phase: 'done', outcome };
        for (const listener of [...this.listeners]) listener(this.current);
      });
  }

  get state(): RankingState {
    return this.current;
  }

  /** 상태가 바뀔 때(끝났을 때) 부른다. 이미 끝났다면 바로 부르지 않는다 (지금 상태는 `state`로 본다). 구독을 끊는 함수를 돌려준다 */
  subscribe(listener: (state: RankingState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/**
 * 제출이 끝나면(이미 끝났다면 바로) cb를 **한 번** 부른다. 게임 오버 화면은 이것으로 닉네임 묻기와 순위 조회를 제출 성공 뒤에만 시작한다
 * (둘 다 제출과 병렬로 먼저 시작하지 않는다). 구독을 끊는 함수를 돌려준다
 */
export function onSubmitDone(
  tracker: Pick<RankingTracker, 'state' | 'subscribe'>,
  cb: (outcome: SubmitOutcome) => void,
): () => void {
  const state = tracker.state;
  if (state.phase === 'done') {
    cb(state.outcome);
    return () => undefined;
  }
  let called = false;
  return tracker.subscribe((next) => {
    if (next.phase !== 'done' || called) return;
    called = true;
    cb(next.outcome);
  });
}

/**
 * 결과 줄 문구. **기기 시계로 이번 주·지난주를 단정하지 않는다**: 주는 서버가 정한다.
 * 순위 조회(`lookup`, rankLookup.ts)가 끝나기 전·실패했을 때는 주를 모르므로 "랭킹에 올렸어요 · 최고 N점"(제출 응답 기준)이다.
 * 서버 이번 주 조회가 끝나면: 순위가 있으면 "이번 주 최고 N점 · N위"(점수·순위는 조회값), 이름이 없으면 "… · 이름을 정하면 순위가 보여요",
 * 제출한 주가 서버 이번 주와 다르면(며칠 이어서 한 판) "지난주 기록으로 올렸어요 · 최고 N점" (이번 주 순위는 붙이지 않는다).
 */
export function rankingLine(
  state: RankingState,
  lookup: RankLookupState = { phase: 'idle' },
): string {
  if (state.phase === 'pending') return '랭킹에 올리는 중…';
  const outcome = state.outcome;
  switch (outcome.kind) {
    case 'ok': {
      switch (lookup.phase) {
        case 'ranked':
          return RANKING_TEXT.weekBestRank(formatScore(lookup.score), lookup.rank);
        case 'unnamed':
          return RANKING_TEXT.weekBestNoName(formatScore(lookup.score));
        case 'pastWeek':
          return `지난주 기록으로 올렸어요 · 최고 ${formatScore(outcome.best)}점`;
        default:
          return RANKING_TEXT.submittedBest(formatScore(outcome.best));
      }
    }
    case 'outdated':
      return '새 버전이 있어요. 새로고침해 주세요';
    case 'rejected':
    case 'failed':
      return '랭킹에 올리지 못했어요';
  }
}

/** 지금 시각의 주 (결과 문구가 "이번 주"인지 가리는 데 쓴다) */
export function currentWeek(nowMs: number): string {
  return weekKey(nowMs);
}
