// 원격 weekly_ranking 시험(`npm run supabase:check -- --ranking`)의 순수 판정 로직. 네트워크를 쓰지 않아 Vitest로 시험한다 (tests/supabase/rankingJudge.test.ts).
// 판정 공통 (W3-04 테스트 전략 7절): HTTP 200 + 검증된 데이터만 PASS.
// - status 0(연결 실패·시간 초과)·5xx는 "시험 불가", 401은 "인증 설정 확인 필요"(시험 불가), 그 밖의 예상 밖 4xx·손상 본문·개인정보 열 노출은 FAIL
// - 빈 목록 every()만으로 PASS하지 않는다: 기대한 사용자 행이 실제로 있어야 한다
// - 서버 주는 요청 시작·끝 시각의 KST 주와 대조한다. 둘이 다르면(경계 통과) 판정하지 않고 "재시도 필요"로 남긴다 (기기 Date.now 한 번만으로 단정하지 않는다)
import type { FnRes } from './nicknameJudge.ts';
import type { Outcome } from './report.ts';

/** 응답 행이 가질 수 있는 열의 전부. user_id·run_id·seed·토큰·이메일 같은 열이 있으면 FAIL */
export const RANKING_KEYS = [
  'week_key',
  'section',
  'seq',
  'rank',
  'nickname',
  'tag',
  'best_score',
  'is_me',
] as const;

/** 응답 상한: week 1 + top 50 + around 11 + me 1 */
export const RANKING_MAX_ROWS = 63;

type Row = Record<string, unknown>;

export interface WeekWindow {
  /** 요청 시작 직전의 KST 주 (weekKey(Date.now())) */
  before: string;
  /** 응답을 받은 직후의 KST 주 */
  after: string;
}

export interface Expected {
  nickname: string;
  tag: number;
  score: number;
}

const unverified = (detail: string): Outcome => ({ pass: false, unverified: true, detail });
const fail = (detail: string): Outcome => ({ pass: false, detail });

function describe(res: FnRes): string {
  return `status ${res.status}`;
}

/** 상태·본문 모양까지의 공통 검사. 통과하면 행들, 아니면 그 자리에서 끝낼 판정 */
function readRows(res: FnRes, weeks: WeekWindow): { rows: Row[] } | { outcome: Outcome } {
  if (res.status === 0)
    return { outcome: unverified('시험 불가: 응답 없음 (연결 실패·시간 초과)') };
  if (res.status >= 500) return { outcome: unverified(`시험 불가: ${describe(res)}`) };
  if (res.status === 401) {
    return { outcome: unverified('시험 불가: 401 (인증 설정 확인 필요. 정상 조회 PASS가 아니다)') };
  }
  if (res.status !== 200) return { outcome: fail(`기대 200, 실제 ${describe(res)}`) };
  if (!Array.isArray(res.body)) return { outcome: fail('200이지만 본문이 배열이 아님') };
  if (res.body.length > RANKING_MAX_ROWS) {
    return { outcome: fail(`행 ${res.body.length}개 > 상한 ${RANKING_MAX_ROWS}`) };
  }
  const rows: Row[] = [];
  for (const raw of res.body as unknown[]) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return { outcome: fail('행이 객체가 아님') };
    }
    const keys = Object.keys(raw);
    const extra = keys.filter((k) => !(RANKING_KEYS as readonly string[]).includes(k));
    const missing = RANKING_KEYS.filter((k) => !keys.includes(k));
    if (extra.length > 0) {
      return {
        outcome: fail(`허용 외 열 노출: ${extra.join(', ')} (개인정보·내부 값 비노출 위반)`),
      };
    }
    if (missing.length > 0) return { outcome: fail(`열 누락: ${missing.join(', ')}`) };
    rows.push(raw as Row);
  }
  const weekRows = rows.filter((r) => r.section === 'week');
  if (weekRows.length !== 1)
    return { outcome: fail(`week 메타 행이 ${weekRows.length}개 (기대 1)`) };
  const week = weekRows[0] as Row;
  if (
    week.seq !== null ||
    week.rank !== null ||
    week.nickname !== null ||
    week.tag !== null ||
    week.best_score !== null ||
    week.is_me !== false
  ) {
    return { outcome: fail('week 행에 개인정보 칸이 있거나 is_me가 true') };
  }
  if (rows.some((r) => r.week_key !== week.week_key))
    return { outcome: fail('다른 주의 행이 섞임') };
  if (weeks.before !== weeks.after) {
    return { outcome: unverified('시험 불가: 요청 중에 KST 주가 바뀜 (재시도 필요)') };
  }
  if (week.week_key !== weeks.before) {
    return { outcome: fail(`서버 주 ${String(week.week_key)} ≠ 기대 KST 주 ${weeks.before}`) };
  }
  return { rows };
}

const isInt = (v: unknown, min: number): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min;

/** top·around 한 구역의 모양: seq 오름차순 중복 없음, 점수 내림차순, rank = (앞과 같은 점수면 같은 rank, 아니면 seq) */
function checkSection(rows: Row[], section: 'top' | 'around'): string | null {
  const part = rows.filter((r) => r.section === section);
  let prev: Row | null = null;
  for (const r of part) {
    if (
      !isInt(r.seq, 1) ||
      !isInt(r.rank, 1) ||
      typeof r.nickname !== 'string' ||
      r.nickname === '' ||
      !isInt(r.tag, 0) ||
      r.tag > 9999 ||
      !isInt(r.best_score, 0) ||
      typeof r.is_me !== 'boolean'
    ) {
      return `${section} 행의 값 형식이 어긋남`;
    }
    if (r.rank > r.seq) return `${section}: rank > seq`;
    if (prev !== null) {
      if ((r.seq as number) <= (prev.seq as number)) return `${section}: seq가 오름차순이 아님`;
      if ((r.best_score as number) > (prev.best_score as number)) {
        return `${section}: 점수가 내림차순이 아님`;
      }
      if (section === 'top' && r.seq !== (prev.seq as number) + 1)
        return 'top: seq가 이어지지 않음';
      if (section === 'around' && r.seq !== (prev.seq as number) + 1) {
        return 'around: seq가 이어지지 않음';
      }
      const tie = r.best_score === prev.best_score;
      if (tie && r.rank !== prev.rank) return `${section}: 동점인데 rank가 다름`;
      if (!tie && (r.rank as number) <= (prev.rank as number)) {
        return `${section}: 점수가 낮아졌는데 rank가 안 늘어남`;
      }
    }
    prev = r;
  }
  if (section === 'top') {
    if (part.length > 50) return 'top이 50행 초과';
    if (part.length > 0 && part[0]?.seq !== 1) return 'top이 seq 1에서 시작하지 않음';
  }
  if (section === 'around' && part.length > 11) return 'around가 11행 초과';
  return null;
}

/** 모든 구역 공통 모양 + 구역별 개수. 문제가 있으면 FAIL 판정 */
function checkShape(rows: Row[]): Outcome | null {
  for (const section of ['top', 'around'] as const) {
    const problem = checkSection(rows, section);
    if (problem !== null) return fail(problem);
  }
  const me = rows.filter((r) => r.section === 'me');
  if (me.length > 1) return fail(`me 행이 ${me.length}개`);
  for (const r of me) {
    if (r.is_me !== true || !isInt(r.best_score, 0)) return fail('me 행의 값 형식이 어긋남');
    if (!((r.rank === null && r.seq === null) || (isInt(r.rank, 1) && isInt(r.seq, 1)))) {
      return fail('me 행의 rank·seq가 함께 null이거나 함께 정수여야 함');
    }
  }
  const knownSections = new Set(['week', 'top', 'around', 'me']);
  if (rows.some((r) => !knownSections.has(r.section as string))) return fail('알 수 없는 section');
  // top과 around가 겹치면 같은 seq의 내용이 같아야 한다
  const top = new Map(rows.filter((r) => r.section === 'top').map((r) => [r.seq, r]));
  for (const r of rows.filter((x) => x.section === 'around')) {
    const t = top.get(r.seq);
    if (t !== undefined && JSON.stringify(t) !== JSON.stringify({ ...r, section: 'top' })) {
      return fail('top·around의 같은 seq 내용이 다름');
    }
  }
  return null;
}

const same = (r: Row, e: Expected): boolean =>
  r.nickname === e.nickname && r.tag === e.tag && r.best_score === e.score;

/** ① 비로그인 anon: 200, week 1개, top만(실제 기대 사용자 행 포함), 모든 is_me false, me·around 없음, UUID 열 없음 */
export function judgeAnon(res: FnRes, weeks: WeekWindow, expected: Expected): Outcome {
  const read = readRows(res, weeks);
  if ('outcome' in read) return read.outcome;
  const shape = checkShape(read.rows);
  if (shape) return shape;
  const { rows } = read;
  if (rows.some((r) => r.section === 'me' || r.section === 'around')) {
    return fail('anon 응답에 me·around가 있음');
  }
  if (rows.some((r) => r.is_me !== false)) return fail('anon 응답에 is_me true가 있음');
  const top = rows.filter((r) => r.section === 'top');
  if (!top.some((r) => same(r, expected))) {
    return fail('top에 방금 올린 시험 기록(이름·태그·점수)이 없음 (빈 목록 PASS 금지)');
  }
  return {
    pass: true,
    detail: `status 200, ${weeks.before}, top ${top.length}행, 개인정보 열 없음`,
  };
}

/** ② 닉네임 있는 사용자 R: me 1행(유효 rank·seq, 점수 = 검증된 best), top·around 어딘가에 is_me 자기 행 */
export function judgeNamed(res: FnRes, weeks: WeekWindow, expected: Expected): Outcome {
  const read = readRows(res, weeks);
  if ('outcome' in read) return read.outcome;
  const shape = checkShape(read.rows);
  if (shape) return shape;
  const me = read.rows.filter((r) => r.section === 'me');
  if (me.length !== 1) return fail(`me 행이 ${me.length}개 (기대 1)`);
  const m = me[0] as Row;
  if (!isInt(m.rank, 1) || !isInt(m.seq, 1)) return fail('me의 rank·seq가 정수가 아님');
  if (m.best_score !== expected.score) {
    return fail(`me 점수 ${String(m.best_score)} ≠ 검증 제출 best ${expected.score}`);
  }
  const mine = read.rows.filter((r) => (r.section === 'top' || r.section === 'around') && r.is_me);
  if (mine.length === 0) return fail('top·around에 내 줄(is_me)이 없음');
  if (!mine.every((r) => same(r, expected) && r.seq === m.seq && r.rank === m.rank)) {
    return fail('내 줄이 me와 이름·태그·점수·순위가 다름');
  }
  if (!read.rows.some((r) => r.section === 'around')) return fail('around가 없음');
  return { pass: true, detail: `status 200, rank ${m.rank}, seq ${m.seq}, 점수 ${expected.score}` };
}

/** ③ 이름 없는 사용자 N: me 1행(rank·seq null, 점수 일치), 목록·around에 본인 없음, 이름이 공개되지 않음 */
export function judgeUnnamed(res: FnRes, weeks: WeekWindow, score: number): Outcome {
  const read = readRows(res, weeks);
  if ('outcome' in read) return read.outcome;
  const shape = checkShape(read.rows);
  if (shape) return shape;
  const me = read.rows.filter((r) => r.section === 'me');
  if (me.length !== 1) return fail(`me 행이 ${me.length}개 (기대 1)`);
  const m = me[0] as Row;
  if (m.rank !== null || m.seq !== null) return fail('이름 없는 me에 rank·seq가 있음');
  if (m.best_score !== score) return fail(`me 점수 ${String(m.best_score)} ≠ ${score}`);
  if (read.rows.some((r) => r.section !== 'me' && r.is_me === true)) {
    return fail('이름 없는데 목록에 내 줄이 있음');
  }
  if (read.rows.some((r) => r.section === 'around'))
    return fail('이름 없는 사용자에 around가 있음');
  return { pass: true, detail: `status 200, 순위 없음, 점수 ${score}` };
}

/** ④ 기록 없는 사용자 Z: me·around 없음, 내 줄 없음 */
export function judgeNoRecord(res: FnRes, weeks: WeekWindow): Outcome {
  const read = readRows(res, weeks);
  if ('outcome' in read) return read.outcome;
  const shape = checkShape(read.rows);
  if (shape) return shape;
  if (read.rows.some((r) => r.section === 'me' || r.section === 'around')) {
    return fail('기록 없는 사용자에 me·around가 있음');
  }
  if (read.rows.some((r) => r.is_me === true)) return fail('기록 없는 사용자에 내 줄이 있음');
  return { pass: true, detail: 'status 200, me·around 없음' };
}

/** ⑤ 위조·만료 토큰: 401만 PASS. 200이면 잘못된 JWT가 조용히 anon으로 낮아진 것이라 FAIL */
export function judgeBadBearer(res: FnRes): Outcome {
  if (res.status === 0) return unverified('시험 불가: 응답 없음');
  if (res.status >= 500) return unverified(`시험 불가: ${describe(res)}`);
  if (res.status === 401) return { pass: true, detail: 'status 401' };
  if (res.status === 200) return fail('위조 토큰인데 200 (anon으로 낮아졌다)');
  return fail(`기대 401, 실제 ${describe(res)}`);
}
