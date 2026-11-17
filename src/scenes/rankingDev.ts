// DEV 전용 `?rankingFake=<이름>`: 서버 없이 랭킹 화면의 모양(TOP 50 + ⋯ + 내 ±5, 빈 주, 이름 없음 등)을 본다 (W3-04 확인용).
// 호출부(RankingScene)의 `import.meta.env.DEV` 분기와 함께 프로덕션 빌드에서 지워진다 (nicknameDev.ts와 같은 방식).
import type { RankingResult, RankingRow } from '../online';
import { weekKey } from '../replay/weekKey';

const NAMES = [
  '뚜비',
  '나나',
  'Block',
  '하늘별',
  '퍼즐왕',
  '달리기',
  'ddooby',
  '구름빵',
  '초록이',
  '바람',
];

/** 가짜 응답 이름. 없거나 모르는 값, 프로덕션(dev=false)이면 null */
export function parseFakeRankingList(search: string, dev: boolean): string | null {
  if (!dev) return null;
  return new URLSearchParams(search).get('rankingFake');
}

/** seq 1..n 줄. 점수는 두 명씩 같다(공동 순위): 표시 순위는 점수만 본다 */
function rowAt(seq: number, meSeq: number | null, longName: boolean): RankingRow {
  const score = 153_200 - Math.floor((seq - 1) / 2) * 700;
  const firstOfTie = seq % 2 === 1 ? seq : seq - 1;
  const base = NAMES[seq % NAMES.length] ?? '뚜비';
  return {
    seq,
    rank: firstOfTie,
    nickname: longName && seq === meSeq ? '가나다라마바사아자차' : `${base}${seq}`.slice(0, 10),
    tag: (seq * 37) % 10_000,
    score: longName && seq === meSeq ? 999_999 : score,
    isMe: seq === meSeq,
  };
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

export function fakeRankingResult(name: string): RankingResult {
  const wk = weekKey(Date.now());
  const list = (
    total: number,
    meSeq: number | null,
    opts: { signedIn?: boolean; unnamed?: boolean; long?: boolean } = {},
  ): RankingResult => {
    const top = range(1, Math.min(total, 50)).map((s) => rowAt(s, meSeq, opts.long === true));
    const around =
      meSeq === null || opts.unnamed
        ? []
        : range(Math.max(1, meSeq - 5), Math.min(total, meSeq + 5)).map((s) =>
            rowAt(s, meSeq, opts.long === true),
          );
    const signedIn = opts.signedIn !== false;
    const me =
      !signedIn || meSeq === null
        ? null
        : opts.unnamed
          ? { rank: null, score: 4_200 }
          : {
              rank: rowAt(meSeq, meSeq, opts.long === true).rank,
              score: rowAt(meSeq, meSeq, opts.long === true).score,
            };
    return { kind: 'ok', weekKey: wk, top, around, me, userId: signedIn ? 'dev-user' : null };
  };
  switch (name) {
    case 'top': // TOP에 내가 있다
      return list(80, 7);
    case 'far': // 내 seq 51: 1~56이 이어진다 (⋯ 없음)
      return list(80, 51);
    case 'around': // TOP 50 + ⋯ + 내 ±5
      return list(200, 120);
    case 'long': // 10자 닉네임·#0000대 태그·6자리 점수
      return list(60, 3, { long: true });
    case 'empty': // 빈 주, 내 기록 없음
      return { kind: 'ok', weekKey: wk, top: [], around: [], me: null, userId: 'dev-user' };
    case 'noname': // 이름 없는 내 기록
      return list(60, 10, { unnamed: true });
    case 'norecord': // 목록은 있고 내 기록은 없다
      return list(60, null);
    case 'anon': // 계정 없음: 공개 TOP만
      return list(60, null, { signedIn: false });
    case 'offline':
      return { kind: 'offline' };
    default:
      return { kind: 'error' };
  }
}
