// 주간 랭킹 조회 (SPEC 8절, PLAN 6.3·7절). DB 함수 weekly_ranking()을 한 번 부른다 (인자 없음: 서버가 정한 이번 주만).
// 게임을 막지 않는다: 어떤 실패도 throw하지 않고 {kind:'offline'}·{kind:'error'}로 돌려준다.
// ddooby-pang src/online/ranking.ts에서 복사해 다음을 바꿨다:
// - 시간 제한 5초는 **계정 준비 + RPC + 응답 검사 전체**의 제한이다. 지난 뒤에는 새 요청을 시작하지 않고 늦은 응답은 쓰지 않는다
// - **계정이 없어도 공개 TOP은 조회한다** (익명 로그인 실패·오프라인에서 복귀한 직후). 그때 결과의 userId가 null이고 내 기록은 알 수 없다:
//   "기록 없음"(me null)을 인증 실패의 뜻으로 쓰지 않는다
// - 기다리는 사이 계정이 바뀌었으면(로그아웃·다른 계정) 그 응답은 지금 계정의 것이 아니다 → error (W3-02 방식)
// - 응답 검사를 엄격하게: 주 키는 실제 ISO 주(2021-W53 같은 없는 주 거부), seq·rank·tag·점수 범위, 중복 seq의 내용 충돌 거부,
//   top 50·around 11 상한, section별 null 규칙. 어긋나면 error (정상 빈 주로 위장하지 않는다)
import { weekRange } from '../replay/weekRange';
import type { Account } from './account';
import { isValidTag } from './nicknameRules';
import { within } from './runs';

/** 랭킹 조회 전체(계정 준비 + 요청 + 응답 처리)를 기다리는 최대 시간. 넘으면 error */
export const RANKING_TIMEOUT_MS = 5000;
/** 서버 함수가 돌려주는 상한 (supabase/migrations/…w3_04): TOP 50, around는 내 seq ±5 */
export const RANKING_TOP_LIMIT = 50;
export const RANKING_AROUND_MAX = 11;
const SCORE_MAX = 2_147_483_647;

/** top·around 한 줄. seq는 나열 순번(1부터, 중복 제거·⋯ 판단용), rank는 표시 순위(공동 순위) */
export interface RankingRow {
  seq: number;
  rank: number;
  nickname: string;
  tag: number;
  score: number;
  isMe: boolean;
}

/** 내 상태. rank null = 기록은 있으나 이름이 없어 목록에 안 보인다 */
export interface RankingMe {
  rank: number | null;
  score: number;
}

/**
 * - ok: top은 나열 1~50번째, around는 내 나열 순번 ±5(나 포함, top과 겹칠 수 있다). me는 기록 없음이면 null.
 *   userId는 이 조회를 한 계정이다. null이면 계정 없이 공개 목록만 본 것이라 me의 null은 "기록 없음"이 아니라 "알 수 없음"이다
 * - offline: 키 없음·오프라인·연결 실패 (요청하지 않았거나 서버에 닿지 못했다)
 * - error: 시간 초과·서버 오류·응답 형식 오류·계정이 바뀜
 */
export type RankingResult =
  | {
      kind: 'ok';
      weekKey: string;
      top: RankingRow[];
      around: RankingRow[];
      me: RankingMe | null;
      userId: string | null;
    }
  | { kind: 'offline' }
  | { kind: 'error' };

export interface ParsedRanking {
  weekKey: string;
  top: RankingRow[];
  around: RankingRow[];
  me: RankingMe | null;
}

export interface RankingDeps {
  isOnline(): boolean;
  timeoutMs?: number;
}

export interface Ranking {
  /** 이번 주(서버 기준) 랭킹을 한 번 조회한다. 절대 throw하지 않는다 */
  fetchRanking(): Promise<RankingResult>;
}

const isInt = (v: unknown, min: number, max = SCORE_MAX): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;

const same = (a: RankingRow, b: RankingRow): boolean =>
  a.rank === b.rank &&
  a.nickname === b.nickname &&
  a.tag === b.tag &&
  a.score === b.score &&
  a.isMe === b.isMe;

/**
 * 응답 행 → 결과. 형식이 어긋나면 null (호출한 쪽이 error로 처리).
 * 주 키는 항상 'week' 메타 행에서 받는다 (빈 주에도 있다). 기기 시계로 대신하지 않는다
 */
export function parseRankingRows(data: unknown): ParsedRanking | null {
  if (!Array.isArray(data)) return null;
  const top: RankingRow[] = [];
  const around: RankingRow[] = [];
  let me: RankingMe | null = null;
  let weekKey: string | null = null;
  const weeks = new Set<string>();
  for (const raw of data as unknown[]) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.week_key !== 'string' || weekRange(r.week_key) === null) return null;
    weeks.add(r.week_key);
    if (r.section === 'week') {
      // 메타 행: 개인정보 칸은 모두 비어 있다
      if (weekKey !== null) return null;
      if (
        r.seq !== null ||
        r.rank !== null ||
        r.nickname !== null ||
        r.tag !== null ||
        r.best_score !== null ||
        r.is_me !== false
      ) {
        return null;
      }
      weekKey = r.week_key;
      continue;
    }
    if (r.section === 'me') {
      if (me !== null || !isInt(r.best_score, 0) || r.is_me !== true) return null;
      if (r.rank === null && r.seq === null) me = { rank: null, score: r.best_score };
      else if (isInt(r.rank, 1) && isInt(r.seq, 1) && r.rank <= r.seq) {
        me = { rank: r.rank, score: r.best_score };
      } else return null;
      continue;
    }
    if (r.section !== 'top' && r.section !== 'around') return null;
    if (
      !isInt(r.seq, 1) ||
      !isInt(r.rank, 1) ||
      r.rank > r.seq ||
      typeof r.nickname !== 'string' ||
      r.nickname.length === 0 ||
      !isValidTag(r.tag) ||
      !isInt(r.best_score, 0) ||
      typeof r.is_me !== 'boolean'
    ) {
      return null;
    }
    if (r.section === 'top' && r.seq > RANKING_TOP_LIMIT) return null;
    const row: RankingRow = {
      seq: r.seq,
      rank: r.rank,
      nickname: r.nickname,
      tag: r.tag,
      score: r.best_score,
      isMe: r.is_me,
    };
    (r.section === 'top' ? top : around).push(row);
  }
  // week 행이 없거나 다른 주의 행이 섞였다
  if (weekKey === null || weeks.size !== 1) return null;
  if (top.length > RANKING_TOP_LIMIT || around.length > RANKING_AROUND_MAX) return null;
  // 같은 seq는 한 구역 안에서 한 번만, top과 around에 모두 있으면 내용이 같아야 한다 (조용히 덮어쓰지 않는다)
  const seen = new Map<number, RankingRow>();
  for (const group of [top, around]) {
    const inGroup = new Set<number>();
    for (const row of group) {
      if (inGroup.has(row.seq)) return null;
      inGroup.add(row.seq);
      const prev = seen.get(row.seq);
      if (prev !== undefined && !same(prev, row)) return null;
      seen.set(row.seq, row);
    }
  }
  const bySeq = (a: RankingRow, b: RankingRow) => a.seq - b.seq;
  return { weekKey, top: [...top].sort(bySeq), around: [...around].sort(bySeq), me };
}

export function createRanking(account: Account, deps: RankingDeps): Ranking {
  const timeoutMs = deps.timeoutMs ?? RANKING_TIMEOUT_MS;
  const offline: RankingResult = { kind: 'offline' };
  const error: RankingResult = { kind: 'error' };

  return {
    async fetchRanking() {
      if (account.status() === 'disabled' || !deps.isOnline()) return offline;
      return within<RankingResult>(timeoutMs, error, async (live) => {
        // 계정이 아직이면(부팅 직후 등) 익명 로그인을 한 번 시도한다. 안 돼도 공개 목록은 조회한다
        await account.ensure();
        if (!live()) return error;
        const userId = account.userId();
        const backend = account.backend() ?? account.publicBackend();
        if (!backend) return offline;
        const res = await backend.callRpc('weekly_ranking');
        if (res === 'network') return offline;
        // 기다리는 사이 계정이 바뀌었으면(로그아웃·다른 계정·늦게 끝난 로그인) 이 응답은 지금 계정의 것이 아니다
        if (account.userId() !== userId) return error;
        if (res.status !== 200) return error;
        const parsed = parseRankingRows(res.data);
        if (parsed === null) return error;
        // 계정 없이 불렀는데 내 기록이 섞여 왔다면 응답을 믿지 않는다
        if (
          userId === null &&
          (parsed.me !== null || [...parsed.top, ...parsed.around].some((row) => row.isMe))
        ) {
          return error;
        }
        return { kind: 'ok', ...parsed, userId };
      });
    },
  };
}
