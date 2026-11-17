// `npm run sim` 본체 (W4-02). cli.ts가 이 파일을 묶어 실행한다 (core가 확장자 없는 import를 쓰므로 Node가 바로 읽지 못한다).
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { SAVE } from '../../src/config';
import { aggregate } from './aggregate';
import { parseArgs } from './args';
import { playGame, type GameRecord } from './play';
import { reportBot } from './report';

export interface BotRun {
  records: GameRecord[];
  longest: {
    seed: number;
    placements: number;
    log: { trayIndex: number; row: number; col: number }[];
  }[];
  seconds: number;
}

export function main(argv: readonly string[]): void {
  const opts = parseArgs(argv);
  const limit = opts.maxPlacements ?? SAVE.maxRunPlacements;
  const json: Record<string, unknown> = {
    seeds: [opts.seedFrom, opts.seedTo],
    maxPlacements: limit,
    bots: {},
  };
  const logs: Record<string, unknown> = {};

  for (const bot of opts.bots) {
    const started = performance.now();
    const records: GameRecord[] = [];
    const longest: BotRun['longest'] = [];
    for (let seed = opts.seedFrom; seed <= opts.seedTo; seed++) {
      const { record, log } = playGame(seed, bot, limit);
      records.push(record);
      if (opts.logs !== null) {
        longest.push({ seed, placements: log.length, log });
        longest.sort((a, b) => b.placements - a.placements);
        longest.length = Math.min(longest.length, 5);
      }
      if (seed % 100 === 0) process.stderr.write(`  ${bot}: seed ${seed}/${opts.seedTo}\r`);
    }
    const seconds = (performance.now() - started) / 1000;
    const summary = aggregate(bot, records);
    process.stdout.write(`${reportBot(summary, records)}\n(걸린 시간 ${seconds.toFixed(1)}초)\n\n`);
    (json.bots as Record<string, unknown>)[bot] = { seconds, summary, games: records };
    logs[bot] = longest;
  }

  if (opts.json !== null) writeFileSync(opts.json, `${JSON.stringify(json)}\n`);
  if (opts.logs !== null) writeFileSync(opts.logs, `${JSON.stringify(logs)}\n`);
}
