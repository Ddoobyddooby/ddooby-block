// 주간 랭킹 화면의 순수한 부분 (W3-04, PLAN 6.3). Phaser 없음, 시험한다 (tests/view/rankingRows.test.ts).
// 서버 응답(top 1~50번째 + 내 위아래 5명 + 내 상태) → 화면 줄·하단 고정 줄·상태, 주 기간 문자열.
// ddooby-pang src/view/rankingRows.ts에서 주간 점수 부분만 복사했다 (스토리 별 탭 제외). 바꾼 점:
// - 계정이 없으면(userId null) 하단 내 줄을 숨긴다: "기록 없음"을 인증 실패 뜻으로 쓰지 않는다
// - 빈 주여도 내 줄(기록 없음)을 보인다
// - 주 기간은 ISO 주 규칙으로 계산하고 없는 주는 빈 문자열이다 (src/replay/weekRange.ts)
import type { RankingMe, RankingResult, RankingRow } from '../online';
import { formatTag } from '../online/nicknameRules';
import { weekRange } from '../replay/weekRange';
import { formatScore } from './hudText';
import { RANKING_TEXT } from './rankingText';

/** 화면에 그릴 줄 하나. 글자는 모두 만들어 둔다 */
export interface RankingLine {
  kind: 'row';
  /** "12" (공동 순위는 같은 숫자가 두 번 나온다) */
  rank: string;
  nickname: string;
  /** "#0427" */
  tag: string;
  /** "15,320" */
  score: string;
  isMe: boolean;
  /** 1~3위(공동 포함)면 그 숫자(금·은·동 색), 아니면 null */
  medal: 1 | 2 | 3 | null;
}

/** 순번이 끊기는 곳 */
export interface RankingGap {
  kind: 'gap';
}

export type RankingItem = RankingLine | RankingGap;

/** 하단 고정 줄 */
export type RankingFooter =
  | { kind: 'me'; rank: number; score: string }
  | { kind: 'noRecord' }
  /** 기록은 있는데 이름이 없다: [이름 정하기]를 같이 보인다 */
  | { kind: 'noNickname'; score: string };

/** footer null = 하단 줄을 그리지 않는다 (계정이 없어 내 상태를 알 수 없다) */
export type RankingView =
  | { state: 'offline' }
  | { state: 'error' }
  | { state: 'empty'; footer: RankingFooter | null }
  | { state: 'list'; items: RankingItem[]; footer: RankingFooter | null };

/** 4 → "#0004" */
export function formatTagText(tag: number): string {
  return formatTag(tag);
}

function toLine(row: RankingRow): RankingLine {
  return {
    kind: 'row',
    rank: String(row.rank),
    nickname: row.nickname,
    tag: formatTagText(row.tag),
    score: formatScore(row.score),
    isMe: row.isMe,
    medal: row.rank >= 1 && row.rank <= 3 ? (row.rank as 1 | 2 | 3) : null,
  };
}

/**
 * top과 around를 seq(나열 순번)로 합쳐 중복을 없애고, 순번이 이어지지 않는 곳(앞 줄 seq + 1이 아닌 곳)에 gap을 끼운다.
 * 표시 순위(rank)는 공동 순위라 gap 판단에 쓰지 않는다. 입력은 바꾸지 않는다
 */
export function mergeRows(
  top: readonly RankingRow[],
  around: readonly RankingRow[],
): RankingItem[] {
  const bySeq = new Map<number, RankingRow>();
  for (const row of [...top, ...around]) bySeq.set(row.seq, row);
  const rows = [...bySeq.values()].sort((a, b) => a.seq - b.seq);
  const items: RankingItem[] = [];
  let prev: number | null = null;
  for (const row of rows) {
    if (prev !== null && row.seq !== prev + 1) items.push({ kind: 'gap' });
    items.push(toLine(row));
    prev = row.seq;
  }
  return items;
}

/** 내 상태 → 하단 줄. me null은 "기록 없음" (계정이 있을 때만 이 함수를 부른다) */
function footerFor(me: RankingMe | null): RankingFooter {
  if (!me) return { kind: 'noRecord' };
  if (me.rank === null) return { kind: 'noNickname', score: formatScore(me.score) };
  return { kind: 'me', rank: me.rank, score: formatScore(me.score) };
}

/** 응답 → 화면 상태 */
export function selectView(result: RankingResult): RankingView {
  if (result.kind !== 'ok') return { state: result.kind };
  // 계정 없이 본 공개 목록: 내 상태를 알 수 없으므로 하단 줄을 그리지 않는다
  const footer = result.userId === null ? null : footerFor(result.me);
  if (result.top.length === 0) return { state: 'empty', footer };
  return { state: 'list', items: mergeRows(result.top, result.around), footer };
}

/** 하단 고정 줄 글자 */
export function footerText(footer: RankingFooter): { left: string; right: string } {
  const t = RANKING_TEXT;
  switch (footer.kind) {
    case 'me':
      return { left: t.myRank(footer.rank), right: footer.score };
    case 'noRecord':
      return { left: t.noRecord, right: '' };
    case 'noNickname':
      return { left: t.noNickname(footer.score), right: '' };
  }
}

/** 아래쪽 왼쪽 버튼 글자: 연결 불가·오류에서는 [다시 시도], 나머지는 [새로고침] */
export function refreshLabel(view: RankingView | null): string {
  return view && (view.state === 'offline' || view.state === 'error')
    ? RANKING_TEXT.retry
    : RANKING_TEXT.refresh;
}

/** 안내 문구가 가운데에 보이는 상태의 글자 (목록 상태는 null) */
export function messageFor(view: RankingView): string | null {
  switch (view.state) {
    case 'offline':
      return RANKING_TEXT.offline;
    case 'error':
      return RANKING_TEXT.error;
    case 'empty':
      return RANKING_TEXT.empty;
    case 'list':
      return null;
  }
}

/** "2026-W47" → "11월 16일(월) ~ 11월 22일(일)". 형식이 틀리거나 없는 주면 빈 문자열 */
export function weekRangeText(key: string): string {
  const range = weekRange(key);
  if (!range) return '';
  const [m1, d1] = range.start;
  const [m2, d2] = range.end;
  return `${m1}월 ${d1}일(월) ~ ${m2}월 ${d2}일(일)`;
}
