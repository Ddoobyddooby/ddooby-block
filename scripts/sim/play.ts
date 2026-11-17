// 한 판을 봇으로 게임 오버(또는 저장 한도)까지 돌려 기록을 모은다 (W4-02).
import { SAVE } from '../../src/config';
import { createGame } from '../../src/core/engine';
import { createRng } from '../../src/core/rng';
import type { PlaceAction } from '../../src/core/types';
import { createBot, type BotName } from './bots';
import { probeTray } from './probe';

/** 콤보 분포는 이 값 이상을 한 칸으로 묶는다 */
export const COMBO_BUCKETS = 8;

export interface GameRecord {
  seed: number;
  bot: BotName;
  score: number;
  placements: number;
  /** SAVE.maxRunPlacements에 닿아 게임 오버 전에 멈췄는가 */
  capped: boolean;
  /** 배치마다 지운 줄 수(가로+세로)별 배치 횟수. lines4 = 4줄 이상 */
  lines0: number;
  lines1: number;
  lines2: number;
  lines3: number;
  lines4: number;
  /** 지운 줄 합계 */
  linesTotal: number;
  maxCombo: number;
  /** 배치 직후 콤보 값별 횟수. 인덱스 = 콤보 (COMBO_BUCKETS-1 이상은 마지막 칸) */
  comboCounts: number[];
  boardClears: number;
  /** 트레이 수 (첫 트레이 포함) */
  trays: number;
  /** 다시 뽑은 횟수 합계 (시도 - 1) */
  rerolls: number;
  traysRerolled: number;
  traysCorrected: number;
  /** 트레이에 나온 조각별 횟수 (첫 트레이 포함, 보정 뒤 최종 트레이 기준) */
  pieceCounts: Record<string, number>;
  /** 게임 오버 때 트레이에 남은 조각 (놓을 수 없었던 것들) */
  finalTray: string[];
  /** 게임 오버 때 빈 칸 수 */
  finalEmpty: number;
}

export interface PlayResult {
  record: GameRecord;
  /** 배치 로그 (t 없음). 서버 판정 시간 측정과 결정성 시험이 쓴다 */
  log: PlaceAction[];
}

export function playGame(
  seed: number,
  botName: BotName,
  maxPlacements: number = SAVE.maxRunPlacements,
): PlayResult {
  const bot = createBot(botName, seed);
  let state = createGame(seed);
  const log: PlaceAction[] = [];
  const comboCounts = new Array<number>(COMBO_BUCKETS).fill(0);
  const pieceCounts: Record<string, number> = {};
  const rec: GameRecord = {
    seed,
    bot: botName,
    score: 0,
    placements: 0,
    capped: false,
    lines0: 0,
    lines1: 0,
    lines2: 0,
    lines3: 0,
    lines4: 0,
    linesTotal: 0,
    maxCombo: 0,
    comboCounts,
    boardClears: 0,
    trays: 0,
    rerolls: 0,
    traysRerolled: 0,
    traysCorrected: 0,
    pieceCounts,
    finalTray: [],
    finalEmpty: 0,
  };

  const countTray = (
    board: typeof state.board,
    rngBefore: number,
    tray: readonly string[],
  ): void => {
    const probe = probeTray(board, rngBefore, tray);
    rec.trays++;
    rec.rerolls += probe.attempts - 1;
    if (probe.attempts > 1) rec.traysRerolled++;
    if (probe.corrected) rec.traysCorrected++;
    for (const id of tray) pieceCounts[id] = (pieceCounts[id] ?? 0) + 1;
  };
  countTray(state.board, createRng(seed), state.tray as string[]);

  while (!state.over) {
    if (log.length >= maxPlacements) {
      rec.capped = true;
      break;
    }
    const before = state;
    const move = bot.choose(state);
    log.push(move.action);
    state = move.state;
    for (const e of move.events) {
      if (e.type === 'score') {
        const n = e.lines;
        if (n >= 4) rec.lines4++;
        else if (n === 3) rec.lines3++;
        else if (n === 2) rec.lines2++;
        else if (n === 1) rec.lines1++;
        else rec.lines0++;
        rec.linesTotal += n;
      } else if (e.type === 'boardClear') {
        rec.boardClears++;
      } else if (e.type === 'tray') {
        countTray(state.board, before.rngState, e.tray);
      }
    }
    const bucket = Math.min(state.combo, COMBO_BUCKETS - 1);
    comboCounts[bucket] = (comboCounts[bucket] ?? 0) + 1;
    if (state.combo > rec.maxCombo) rec.maxCombo = state.combo;
  }

  rec.score = state.score;
  rec.placements = log.length;
  rec.finalTray = state.tray.filter((id): id is string => id !== null);
  rec.finalEmpty = state.board.cells.filter((c) => c === null).length;
  return { record: rec, log };
}
