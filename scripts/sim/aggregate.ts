// 판 기록들을 봇별 요약으로 묶는다 (W4-02). 표시(report.ts)와 JSON·시험이 같은 값을 쓴다.
import { PIECE_WEIGHTS } from '../../src/config';
import { PIECES } from '../../src/core/pieces';
import { COMBO_BUCKETS, type GameRecord } from './play';
import { summarize, type Summary } from './stats';

export interface PieceRow {
  id: string;
  weight: number;
  /** PIECE_WEIGHTS 기대 비율 (가중치 / 합계) */
  expected: number;
  /** 트레이에 나온 비율 (보정·다시 뽑기 뒤) */
  observed: number;
  /** 게임 오버 때 트레이에 남아 있던 횟수 / 게임 오버 판 수 */
  stuckPerGame: number;
  /** 게임 오버 때 남은 조각 중 이 조각의 비율 */
  stuckShare: number;
}

export interface BotSummary {
  bot: string;
  games: number;
  capped: number;
  score: Summary;
  placements: Summary;
  /** 판당 평균 */
  perGame: {
    lines1: number;
    lines2: number;
    lines3: number;
    lines4: number;
    linesTotal: number;
    boardClears: number;
    trays: number;
    finalEmpty: number;
  };
  maxCombo: Summary;
  /** 배치 직후 콤보 값별 비율 (인덱스 = 콤보, 마지막 = COMBO_BUCKETS-1 이상) */
  comboShare: number[];
  /** 보드를 한 번이라도 비운 판의 비율 */
  boardClearGames: number;
  generator: {
    trays: number;
    /** 다시 뽑은 트레이 비율 (한 번이라도) */
    rerolledRate: number;
    /** 평균 시도 횟수 (1 = 다시 뽑기 없음) */
    meanAttempts: number;
    /** 보정이 일어난 트레이 비율 */
    correctedRate: number;
    /** 보정이 한 번이라도 있었던 판의 비율 */
    correctedGames: number;
  };
  pieces: PieceRow[];
}

const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? NaN : xs.reduce((s, v) => s + v, 0) / xs.length;
const sum = (xs: readonly number[]): number => xs.reduce((s, v) => s + v, 0);

export function aggregate(bot: string, games: readonly GameRecord[]): BotSummary {
  const n = games.length;
  const totalTrays = sum(games.map((g) => g.trays));
  const comboTotal = new Array<number>(COMBO_BUCKETS).fill(0);
  for (const g of games)
    g.comboCounts.forEach((c, i) => (comboTotal[i] = (comboTotal[i] ?? 0) + c));
  const comboSum = sum(comboTotal);

  const totalWeight = sum(PIECES.map((p) => PIECE_WEIGHTS[p.id] ?? 0));
  const observedTotal = sum(games.map((g) => sum(Object.values(g.pieceCounts))));
  const finished = games.filter((g) => !g.capped);
  const stuckTotal = sum(finished.map((g) => g.finalTray.length));
  const pieces: PieceRow[] = PIECES.map((p) => {
    const weight = PIECE_WEIGHTS[p.id] ?? 0;
    const seen = sum(games.map((g) => g.pieceCounts[p.id] ?? 0));
    const stuck = sum(finished.map((g) => g.finalTray.filter((id) => id === p.id).length));
    return {
      id: p.id,
      weight,
      expected: weight / totalWeight,
      observed: observedTotal === 0 ? NaN : seen / observedTotal,
      stuckPerGame: finished.length === 0 ? NaN : stuck / finished.length,
      stuckShare: stuckTotal === 0 ? NaN : stuck / stuckTotal,
    };
  });

  return {
    bot,
    games: n,
    capped: games.filter((g) => g.capped).length,
    score: summarize(games.map((g) => g.score)),
    placements: summarize(games.map((g) => g.placements)),
    perGame: {
      lines1: mean(games.map((g) => g.lines1)),
      lines2: mean(games.map((g) => g.lines2)),
      lines3: mean(games.map((g) => g.lines3)),
      lines4: mean(games.map((g) => g.lines4)),
      linesTotal: mean(games.map((g) => g.linesTotal)),
      boardClears: mean(games.map((g) => g.boardClears)),
      trays: mean(games.map((g) => g.trays)),
      finalEmpty: mean(finished.map((g) => g.finalEmpty)),
    },
    maxCombo: summarize(games.map((g) => g.maxCombo)),
    comboShare: comboTotal.map((c) => (comboSum === 0 ? NaN : c / comboSum)),
    boardClearGames: n === 0 ? NaN : games.filter((g) => g.boardClears > 0).length / n,
    generator: {
      trays: totalTrays,
      rerolledRate: totalTrays === 0 ? NaN : sum(games.map((g) => g.traysRerolled)) / totalTrays,
      meanAttempts: totalTrays === 0 ? NaN : 1 + sum(games.map((g) => g.rerolls)) / totalTrays,
      correctedRate: totalTrays === 0 ? NaN : sum(games.map((g) => g.traysCorrected)) / totalTrays,
      correctedGames: n === 0 ? NaN : games.filter((g) => g.traysCorrected > 0).length / n,
    },
    pieces,
  };
}
