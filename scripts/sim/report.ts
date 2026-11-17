// 요약을 터미널 표로 만든다 (W4-02).
import type { BotSummary } from './aggregate';
import { COMBO_BUCKETS, type GameRecord } from './play';
import { f0, f1, f2, histogramText, pct, table, type Summary } from './stats';

const row = (label: string, s: Summary, fmt: (n: number) => string = f0): string[] => [
  label,
  fmt(s.mean),
  fmt(s.median),
  fmt(s.stddev),
  fmt(s.p10),
  fmt(s.p90),
  fmt(s.min),
  fmt(s.max),
];

export function reportBot(summary: BotSummary, games: readonly GameRecord[]): string {
  const out: string[] = [];
  out.push(
    `## 봇: ${summary.bot} (${summary.games}판${summary.capped > 0 ? `, 한도 도달 ${summary.capped}판` : ''})`,
  );
  out.push('');
  out.push(
    table(
      ['항목', '평균', '중앙값', '표준편차', '하위10%', '상위10%', '최소', '최대'],
      [
        row('점수', summary.score),
        row('배치 수', summary.placements),
        row('최대 콤보', summary.maxCombo, f1),
      ],
    ),
  );
  out.push('');
  const p = summary.perGame;
  out.push(
    table(
      ['판당 평균', '값'],
      [
        ['1줄 제거 배치', f1(p.lines1)],
        ['2줄 제거 배치', f1(p.lines2)],
        ['3줄 제거 배치', f1(p.lines3)],
        ['4줄 이상 제거 배치', f1(p.lines4)],
        ['지운 줄 합계', f1(p.linesTotal)],
        ['보드 비우기', f2(p.boardClears)],
        ['트레이 수', f1(p.trays)],
        ['게임 오버 때 빈 칸', f1(p.finalEmpty)],
        ['보드를 비운 판 비율', pct(summary.boardClearGames, 1)],
      ],
    ),
  );
  out.push('');
  out.push('배치 직후 콤보 분포 (배치 횟수 기준)');
  out.push(
    table(
      Array.from({ length: COMBO_BUCKETS }, (_, i) =>
        i === COMBO_BUCKETS - 1 ? `${i}+` : String(i),
      ),
      [summary.comboShare.map((v) => pct(v, 1))],
    ),
  );
  out.push('');
  const g = summary.generator;
  out.push(
    table(
      ['생성기', '값'],
      [
        ['트레이 수 (전체)', f0(g.trays)],
        ['다시 뽑은 트레이 비율', pct(g.rerolledRate, 3)],
        ['평균 추첨 시도 횟수', g.meanAttempts.toFixed(4)],
        ['보정(슬롯 교체) 트레이 비율', pct(g.correctedRate, 3)],
        ['보정이 있었던 판 비율', pct(g.correctedGames, 1)],
      ],
    ),
  );
  out.push('');
  out.push('점수 히스토그램 (10구간)');
  out.push(
    histogramText(
      games.map((x) => x.score),
      10,
    ),
  );
  out.push('');
  out.push('배치 수 히스토그램 (10구간)');
  out.push(
    histogramText(
      games.map((x) => x.placements),
      10,
    ),
  );
  out.push('');
  out.push(
    '조각 출현 비율 대 PIECE_WEIGHTS 기대 비율 (비 = 관찰/기대), 게임 오버 때 트레이에 남은 횟수',
  );
  out.push(
    table(
      ['조각', '가중치', '기대', '관찰', '비', '막힘/판', '막힘 점유'],
      summary.pieces.map((x) => [
        x.id,
        String(x.weight),
        pct(x.expected, 2),
        pct(x.observed, 2),
        f2(x.observed / x.expected),
        f2(x.stuckPerGame),
        pct(x.stuckShare, 1),
      ]),
    ),
  );
  return out.join('\n');
}
