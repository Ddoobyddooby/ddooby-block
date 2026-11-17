import { describe, expect, it } from 'vitest';
import type { RankingResult, RankingRow } from '../../src/online';
import {
  footerText,
  formatTagText,
  mergeRows,
  messageFor,
  refreshLabel,
  selectView,
  weekRangeText,
  type RankingItem,
  type RankingView,
} from '../../src/view/rankingRows';

const row = (seq: number, over: Partial<RankingRow> = {}): RankingRow => ({
  seq,
  rank: seq,
  nickname: `u${seq}`,
  tag: seq,
  score: 100000 - seq,
  isMe: false,
  ...over,
});
const rowsOf = (from: number, to: number, mark?: number): RankingRow[] =>
  Array.from({ length: to - from + 1 }, (_, i) => row(from + i, { isMe: from + i === mark }));

/** 합친 줄을 "seq 번호(닉네임 u<seq>)와 gap"으로 읽는다. 기대값은 호출하는 쪽이 리터럴로 적는다 */
const shape = (items: RankingItem[]): (number | 'gap')[] =>
  items.map((i) => (i.kind === 'gap' ? 'gap' : Number(i.nickname.slice(1))));
const seqs = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('mergeRows: TOP 50 + 내 ±5를 seq로 합친다', () => {
  it('TOP만 (내 around 없음): 1~50이 이어진다, gap 없음', () => {
    expect(shape(mergeRows(rowsOf(1, 50), []))).toEqual(seqs(1, 50));
  });

  it('내 seq 7: around 2~12가 top과 겹쳐도 한 번씩, gap 없음', () => {
    expect(shape(mergeRows(rowsOf(1, 50, 7), rowsOf(2, 12, 7)))).toEqual(seqs(1, 50));
  });

  it('내 seq 50: around 45~55 → 1~55, gap 없음', () => {
    expect(shape(mergeRows(rowsOf(1, 50, 50), rowsOf(45, 55, 50)))).toEqual(seqs(1, 55));
  });

  it('내 seq 51: around 46~56 → 1~56이 이어진다 (50→51은 연속이라 ⋯ 없음)', () => {
    const items = mergeRows(rowsOf(1, 50), rowsOf(46, 56, 51));
    expect(shape(items)).toEqual(seqs(1, 56));
    expect(items.some((i) => i.kind === 'gap')).toBe(false);
  });

  it('내 seq 56: around 51~61 → 1~61이 이어진다', () => {
    expect(shape(mergeRows(rowsOf(1, 50), rowsOf(51, 61, 56)))).toEqual(seqs(1, 61));
  });

  it('내 seq 57: around 52~62 → 1~50, ⋯, 52~62 (51만 빠져 gap)', () => {
    expect(shape(mergeRows(rowsOf(1, 50), rowsOf(52, 62, 57)))).toEqual([
      ...seqs(1, 50),
      'gap',
      ...seqs(52, 62),
    ]);
  });

  it('내 seq 200: 1~50, ⋯, 195~205', () => {
    expect(shape(mergeRows(rowsOf(1, 50), rowsOf(195, 205, 200)))).toEqual([
      ...seqs(1, 50),
      'gap',
      ...seqs(195, 205),
    ]);
  });

  it('꼴찌(전체 210명 중 210): 실제 있는 범위까지만 (205~210)', () => {
    expect(shape(mergeRows(rowsOf(1, 50), rowsOf(205, 210, 210)))).toEqual([
      ...seqs(1, 50),
      'gap',
      ...seqs(205, 210),
    ]);
  });

  it('입력 순서가 뒤집히고 중복돼도 seq 오름차순으로 한 번씩', () => {
    const top = [...rowsOf(1, 5)].reverse();
    const around = [...rowsOf(3, 9, 6)].reverse();
    expect(shape(mergeRows(top, around))).toEqual(seqs(1, 9));
  });

  it('입력 배열·행을 바꾸지 않는다 (얼린 입력)', () => {
    const top = Object.freeze(rowsOf(1, 3).map((r) => Object.freeze(r)));
    const around = Object.freeze(rowsOf(8, 10, 9).map((r) => Object.freeze(r)));
    expect(() => mergeRows(top, around)).not.toThrow();
    expect(top.map((r) => r.seq)).toEqual([1, 2, 3]);
  });

  it('내 줄은 isMe가 그대로 전해진다', () => {
    const items = mergeRows(rowsOf(1, 3), rowsOf(2, 4, 4));
    expect(items.flatMap((i) => (i.kind === 'row' && i.isMe ? [i.nickname] : []))).toEqual(['u4']);
  });
});

describe('공동 순위: 표시는 점수만 본다 (rank), 나열·gap은 seq', () => {
  it('점수 100·90·90·80 → 표시 순위 1·2·2·4, 1~3위(공동 포함) 메달', () => {
    const top = [
      row(1, { rank: 1, score: 100 }),
      row(2, { rank: 2, score: 90 }),
      row(3, { rank: 2, score: 90 }),
      row(4, { rank: 4, score: 80 }),
    ];
    const lines = mergeRows(top, []).flatMap((i) => (i.kind === 'row' ? [i] : []));
    expect(lines.map((l) => l.rank)).toEqual(['1', '2', '2', '4']);
    expect(lines.map((l) => l.medal)).toEqual([1, 2, 2, null]);
  });

  it('51명이 모두 같은 점수: 내 seq가 51이어도 표시 순위는 1, 줄은 1~51 연속 (rank로 gap을 판단하지 않는다)', () => {
    const top = rowsOf(1, 50).map((r) => ({ ...r, rank: 1, score: 777 }));
    const around = rowsOf(46, 51, 51).map((r) => ({ ...r, rank: 1, score: 777 }));
    const items = mergeRows(top, around);
    expect(shape(items)).toEqual(seqs(1, 51));
    const last = items.at(-1);
    expect(last && last.kind === 'row' && last.rank).toBe('1');
  });
});

describe('줄 글자', () => {
  it('태그 0·4·9999 → #0000·#0004·#9999', () => {
    expect(formatTagText(0)).toBe('#0000');
    expect(formatTagText(4)).toBe('#0004');
    expect(formatTagText(9999)).toBe('#9999');
  });

  it('점수 0·15320·최대 int·10자 닉네임이 그대로 글자가 된다 (6자리만 가정하지 않는다)', () => {
    const items = mergeRows(
      [
        row(1, { score: 0, nickname: '가나다라마바사아자차', tag: 0 }),
        row(2, { score: 15320 }),
        row(3, { score: 2147483647 }),
      ],
      [],
    );
    const lines = items.flatMap((i) => (i.kind === 'row' ? [i] : []));
    expect(lines.map((l) => l.score)).toEqual(['0', '15,320', '2,147,483,647']);
    expect(lines[0]).toMatchObject({ nickname: '가나다라마바사아자차', tag: '#0000' });
  });
});

const ok = (over: Partial<Extract<RankingResult, { kind: 'ok' }>> = {}): RankingResult => ({
  kind: 'ok',
  weekKey: '2026-W47',
  top: rowsOf(1, 3),
  around: [],
  me: null,
  userId: 'a',
  ...over,
});

describe('selectView: 응답 → 화면 상태·하단 줄', () => {
  it('목록 + 내 기록 없음(계정 있음) → 하단 "기록 없음"', () => {
    const v = selectView(ok());
    expect(v.state).toBe('list');
    expect(v.state === 'list' && v.footer).toEqual({ kind: 'noRecord' });
  });

  it('내 순위 3, 점수 → 하단 "내 순위"', () => {
    const v = selectView(ok({ me: { rank: 3, score: 15320 } }));
    expect(v.state === 'list' && v.footer).toEqual({ kind: 'me', rank: 3, score: '15,320' });
  });

  it('이름 없음: rank null → "N점 · 이름을 정하면…" + 이름 버튼 (점수 0도 기록 있음)', () => {
    const v = selectView(ok({ me: { rank: null, score: 0 } }));
    expect(v.state === 'list' && v.footer).toEqual({ kind: 'noNickname', score: '0' });
    const footer = v.state === 'list' ? v.footer : null;
    expect(footer && footerText(footer)).toEqual({
      left: '0점 · 이름을 정하면 랭킹에 보여요',
      right: '',
    });
  });

  it('빈 주 + 계정 있음 + 기록 없음: 안내 문구와 함께 하단 "이번 주 기록이 없어요"가 보인다', () => {
    const v = selectView(ok({ top: [] }));
    expect(v).toEqual({ state: 'empty', footer: { kind: 'noRecord' } });
    expect(messageFor(v)).toBe('이번 주 첫 기록을 남겨 보세요!');
    expect(v.state === 'empty' && v.footer && footerText(v.footer).left).toBe(
      '이번 주 기록이 없어요',
    );
  });

  it('빈 주여도 이름 없는 내 기록이 있으면 하단에 이름 안내가 보인다', () => {
    expect(selectView(ok({ top: [], me: { rank: null, score: 4200 } }))).toEqual({
      state: 'empty',
      footer: { kind: 'noNickname', score: '4,200' },
    });
  });

  it('계정 없음(userId null): 공개 TOP은 보이고 하단 내 줄은 없다 ("기록 없음"으로 위장하지 않는다)', () => {
    const list = selectView(ok({ userId: null }));
    expect(list.state === 'list' && list.footer).toBeNull();
    expect(selectView(ok({ userId: null, top: [] }))).toEqual({ state: 'empty', footer: null });
  });

  it('offline·error는 그대로 상태가 되고 목록·하단은 없다', () => {
    expect(selectView({ kind: 'offline' })).toEqual({ state: 'offline' });
    expect(selectView({ kind: 'error' })).toEqual({ state: 'error' });
  });
});

describe('문구·버튼', () => {
  const list: RankingView = { state: 'list', items: [], footer: null };
  it('안내 문구', () => {
    expect(messageFor({ state: 'offline' })).toBe('인터넷에 연결되면 랭킹을 볼 수 있어요');
    expect(messageFor({ state: 'error' })).toBe('랭킹을 불러오지 못했어요');
    expect(messageFor({ state: 'empty', footer: null })).toBe('이번 주 첫 기록을 남겨 보세요!');
    expect(messageFor(list)).toBeNull();
  });
  it('연결 불가·오류에서는 [다시 시도], 나머지는 [새로고침]', () => {
    expect(refreshLabel({ state: 'offline' })).toBe('다시 시도');
    expect(refreshLabel({ state: 'error' })).toBe('다시 시도');
    expect(refreshLabel(list)).toBe('새로고침');
    expect(refreshLabel({ state: 'empty', footer: null })).toBe('새로고침');
    expect(refreshLabel(null)).toBe('새로고침');
  });
  it('내 순위 줄', () => {
    expect(footerText({ kind: 'me', rank: 12, score: '15,320' })).toEqual({
      left: '내 순위 12위',
      right: '15,320',
    });
  });
});

describe('weekRangeText: 서버 주 → 기간 문구 (월·일은 리터럴)', () => {
  it.each([
    ['2026-W45', '11월 2일(월) ~ 11월 8일(일)'],
    ['2026-W47', '11월 16일(월) ~ 11월 22일(일)'],
    ['2020-W53', '12월 28일(월) ~ 1월 3일(일)'],
    ['2021-W01', '1월 4일(월) ~ 1월 10일(일)'],
    ['2019-W01', '12월 31일(월) ~ 1월 6일(일)'],
  ])('%s → %s', (key, text) => {
    expect(weekRangeText(key)).toBe(text);
  });
  it.each(['2021-W53', '2026-W00', '2026-W54', 'nope', ''])(
    '%j → 빈 문자열 (NaN 문구 없음)',
    (key) => {
      expect(weekRangeText(key)).toBe('');
    },
  );
});
