import { describe, expect, it } from 'vitest';
import type { FnRes } from '../../scripts/supabase-check/nicknameJudge';
import {
  judgeAnon,
  judgeBadBearer,
  judgeNamed,
  judgeNoRecord,
  judgeUnnamed,
  RANKING_MAX_ROWS,
  type Expected,
  type WeekWindow,
} from '../../scripts/supabase-check/rankingJudge';

const WK = '2026-W47';
const weeks: WeekWindow = { before: WK, after: WK };
const res = (status: number, body: unknown): FnRes => ({ status, body, header: () => null });
const week = (over: Record<string, unknown> = {}) => ({
  week_key: WK,
  section: 'week',
  seq: null,
  rank: null,
  nickname: null,
  tag: null,
  best_score: null,
  is_me: false,
  ...over,
});
const line = (section: 'top' | 'around', seq: number, over: Record<string, unknown> = {}) => ({
  week_key: WK,
  section,
  seq,
  rank: seq,
  nickname: `n${seq}`,
  tag: seq,
  best_score: 1000 - seq,
  is_me: false,
  ...over,
});
const me = (over: Record<string, unknown> = {}) => ({
  week_key: WK,
  section: 'me',
  seq: 2,
  rank: 2,
  nickname: 'n2',
  tag: 2,
  best_score: 998,
  is_me: true,
  ...over,
});
const expected: Expected = { nickname: 'n2', tag: 2, score: 998 };

describe('공통: 200 + 검증된 데이터만 PASS', () => {
  const body = [week(), line('top', 1), line('top', 2)];
  it('정상 anon은 PASS', () => {
    expect(judgeAnon(res(200, body), weeks, expected).pass).toBe(true);
  });
  it.each([0, 500, 502, 503])('status %s는 시험 불가 (FAIL도 PASS도 아님)', (status) => {
    const out = judgeAnon(res(status, null), weeks, expected);
    expect(out).toMatchObject({ pass: false, unverified: true });
  });
  it('401은 인증 설정 확인 필요(시험 불가)이고 정상 조회 PASS가 아니다', () => {
    const out = judgeAnon(res(401, { message: 'x' }), weeks, expected);
    expect(out).toMatchObject({ pass: false, unverified: true });
    expect(out.detail).toContain('401');
  });
  it.each([400, 403, 404, 422])('예상 밖 4xx(%s)는 FAIL', (status) => {
    const out = judgeAnon(res(status, {}), weeks, expected);
    expect(out.pass).toBe(false);
    expect(out.unverified).toBeUndefined();
  });
  it('손상 본문(배열 아님·행이 객체 아님)은 FAIL', () => {
    expect(judgeAnon(res(200, { a: 1 }), weeks, expected).pass).toBe(false);
    expect(judgeAnon(res(200, [week(), 5]), weeks, expected).pass).toBe(false);
    expect(judgeAnon(res(200, null), weeks, expected).pass).toBe(false);
  });
  it('개인정보·내부 열(user_id·run_id 등)이 하나라도 있으면 FAIL', () => {
    const leaky = [week(), { ...line('top', 1), user_id: '00000000-0000-4000-8000-000000000001' }];
    const out = judgeAnon(res(200, leaky), weeks, expected);
    expect(out.pass).toBe(false);
    expect(out.detail).toContain('user_id');
  });
  it('열이 빠지면 FAIL', () => {
    const row: Record<string, unknown> = line('top', 1);
    delete row.is_me;
    expect(judgeAnon(res(200, [week(), row]), weeks, expected).pass).toBe(false);
  });
  it('week 메타 행이 없거나 둘이거나 개인정보 칸이 있으면 FAIL', () => {
    expect(judgeAnon(res(200, [line('top', 2)]), weeks, expected).pass).toBe(false);
    expect(judgeAnon(res(200, [week(), week(), line('top', 2)]), weeks, expected).pass).toBe(false);
    expect(
      judgeAnon(res(200, [week({ nickname: 'x' }), line('top', 2)]), weeks, expected).pass,
    ).toBe(false);
  });
  it('서버 주가 기대 KST 주와 다르면 FAIL, 요청 중 주가 바뀌면 시험 불가(재시도)', () => {
    const wrong = [week({ week_key: '2026-W46' }), line('top', 2, { week_key: '2026-W46' })];
    expect(judgeAnon(res(200, wrong), weeks, expected).pass).toBe(false);
    const crossing = judgeAnon(res(200, body), { before: '2026-W46', after: WK }, expected);
    expect(crossing).toMatchObject({ pass: false, unverified: true });
    expect(crossing.detail).toContain('재시도');
  });
  it(`행이 상한(${RANKING_MAX_ROWS})을 넘으면 FAIL`, () => {
    const many = [
      week(),
      ...Array.from({ length: RANKING_MAX_ROWS }, (_, i) => line('top', i + 1)),
    ];
    expect(judgeAnon(res(200, many), weeks, expected).pass).toBe(false);
  });
});

describe('① anon: 빈 목록 every() PASS 금지', () => {
  it('top에 방금 올린 시험 기록이 없으면 FAIL (빈 목록 포함)', () => {
    expect(judgeAnon(res(200, [week()]), weeks, expected).pass).toBe(false);
    expect(judgeAnon(res(200, [week(), line('top', 1)]), weeks, expected).pass).toBe(false);
  });
  it('이름·태그·점수가 하나라도 다르면 기대 행이 아니다', () => {
    for (const bad of [{ nickname: 'zz' }, { tag: 9 }, { best_score: 1 }]) {
      const body = [week(), line('top', 1), line('top', 2, bad)];
      expect(judgeAnon(res(200, body), weeks, expected).pass).toBe(false);
    }
  });
  it('anon 응답에 me·around·is_me true가 있으면 FAIL', () => {
    const base = [week(), line('top', 1), line('top', 2)];
    expect(judgeAnon(res(200, [...base, me()]), weeks, expected).pass).toBe(false);
    expect(judgeAnon(res(200, [...base, line('around', 2)]), weeks, expected).pass).toBe(false);
    expect(
      judgeAnon(
        res(200, [week(), line('top', 1), line('top', 2, { is_me: true })]),
        weeks,
        expected,
      ).pass,
    ).toBe(false);
  });
  it('정렬·공동 순위 규칙 위반은 FAIL (seq 간격·점수 오름차순·동점 rank 불일치)', () => {
    const e: Expected = { nickname: 'n1', tag: 1, score: 999 };
    const ok = [week(), line('top', 1), line('top', 2, { best_score: 500, rank: 2 })];
    expect(judgeAnon(res(200, ok), weeks, e).pass).toBe(true);
    expect(judgeAnon(res(200, [week(), line('top', 1), line('top', 3)]), weeks, e).pass).toBe(
      false,
    );
    expect(
      judgeAnon(res(200, [week(), line('top', 1), line('top', 2, { best_score: 2000 })]), weeks, e)
        .pass,
    ).toBe(false);
    expect(
      judgeAnon(
        res(200, [
          week(),
          line('top', 1, { best_score: 5, rank: 1 }),
          line('top', 2, { best_score: 5, rank: 2 }),
        ]),
        weeks,
        { nickname: 'n1', tag: 1, score: 5 },
      ).pass,
    ).toBe(false);
  });
  it('공동 순위(같은 점수 → 같은 rank)는 PASS', () => {
    const e: Expected = { nickname: 'n1', tag: 1, score: 90 };
    const body = [
      week(),
      line('top', 1, { best_score: 90, rank: 1 }),
      line('top', 2, { best_score: 90, rank: 1 }),
      line('top', 3, { best_score: 80, rank: 3 }),
    ];
    expect(judgeAnon(res(200, body), weeks, e).pass).toBe(true);
  });
});

describe('② 이름 있는 R', () => {
  const body = [
    week(),
    line('top', 1),
    line('top', 2, { is_me: true }),
    line('around', 1),
    line('around', 2, { is_me: true }),
    me(),
  ];
  it('me 1행·점수 일치·내 줄·around가 있으면 PASS', () => {
    expect(judgeNamed(res(200, body), weeks, expected).pass).toBe(true);
  });
  it('me가 없거나 둘이거나 점수가 다르면 FAIL', () => {
    expect(judgeNamed(res(200, body.slice(0, -1)), weeks, expected).pass).toBe(false);
    expect(judgeNamed(res(200, [...body, me()]), weeks, expected).pass).toBe(false);
    expect(
      judgeNamed(res(200, [...body.slice(0, -1), me({ best_score: 5 })]), weeks, expected).pass,
    ).toBe(false);
  });
  it('me의 rank·seq가 null이면 FAIL, 내 줄이 목록에 없으면 FAIL', () => {
    expect(
      judgeNamed(res(200, [...body.slice(0, -1), me({ rank: null, seq: null })]), weeks, expected)
        .pass,
    ).toBe(false);
    expect(
      judgeNamed(res(200, [week(), line('top', 1), line('around', 1), me()]), weeks, expected).pass,
    ).toBe(false);
  });
  it('내 줄과 me의 순위가 다르면 FAIL', () => {
    const bad = [
      week(),
      line('top', 1),
      line('top', 2, { is_me: true }),
      line('around', 2, { is_me: true }),
      me({ seq: 3, rank: 3 }),
    ];
    expect(judgeNamed(res(200, bad), weeks, expected).pass).toBe(false);
  });
});

describe('③ 이름 없는 N, ④ 기록 없는 Z', () => {
  const noName = me({ seq: null, rank: null, nickname: null, tag: null, best_score: 700 });
  it('N: me 1행(rank·seq null·점수 일치), 목록·around에 본인 없음이면 PASS', () => {
    expect(judgeUnnamed(res(200, [week(), line('top', 1), noName]), weeks, 700).pass).toBe(true);
  });
  it('N: rank가 있거나 목록에 내 줄이 있거나 around가 있으면 FAIL', () => {
    expect(judgeUnnamed(res(200, [week(), me({ best_score: 700 })]), weeks, 700).pass).toBe(false);
    expect(
      judgeUnnamed(res(200, [week(), line('top', 1, { is_me: true }), noName]), weeks, 700).pass,
    ).toBe(false);
    expect(judgeUnnamed(res(200, [week(), line('around', 1), noName]), weeks, 700).pass).toBe(
      false,
    );
    expect(judgeUnnamed(res(200, [week(), noName]), weeks, 701).pass).toBe(false);
    expect(judgeUnnamed(res(200, [week()]), weeks, 700).pass).toBe(false);
  });
  it('Z: me·around·내 줄이 없어야 PASS', () => {
    expect(judgeNoRecord(res(200, [week(), line('top', 1)]), weeks).pass).toBe(true);
    expect(judgeNoRecord(res(200, [week(), line('top', 1), me()]), weeks).pass).toBe(false);
    expect(judgeNoRecord(res(200, [week(), line('around', 1)]), weeks).pass).toBe(false);
    expect(judgeNoRecord(res(200, [week(), line('top', 1, { is_me: true })]), weeks).pass).toBe(
      false,
    );
  });
});

describe('⑤ 위조·만료 Bearer', () => {
  it('401만 PASS, 200(anon으로 낮아짐)은 FAIL, 연결 실패·5xx는 시험 불가, 그 밖의 4xx는 FAIL', () => {
    expect(judgeBadBearer(res(401, { message: 'JWT' })).pass).toBe(true);
    expect(judgeBadBearer(res(200, [week()])).pass).toBe(false);
    expect(judgeBadBearer(res(0, null))).toMatchObject({ pass: false, unverified: true });
    expect(judgeBadBearer(res(503, null))).toMatchObject({ pass: false, unverified: true });
    expect(judgeBadBearer(res(404, null))).toMatchObject({ pass: false });
    expect(judgeBadBearer(res(404, null)).unverified).toBeUndefined();
  });
});
