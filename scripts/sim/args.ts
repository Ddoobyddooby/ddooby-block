// `npm run sim` 옵션 해석 (W4-02). 순수 함수.
import { BOT_NAMES, isBotName, type BotName } from './bots';

export interface Options {
  seedFrom: number;
  seedTo: number;
  bots: BotName[];
  json: string | null;
  /** 서버 판정 시간 측정용: 가장 긴 판들의 로그를 이 경로에 쓴다 */
  logs: string | null;
  /** 한 판의 배치 수 상한 (기본 SAVE.maxRunPlacements) */
  maxPlacements: number | null;
}

export const DEFAULT_BOTS: readonly BotName[] = ['greedy', 'random'];

export function parseArgs(argv: readonly string[]): Options {
  const opts: Options = {
    seedFrom: 1,
    seedTo: 1000,
    bots: [...DEFAULT_BOTS],
    json: null,
    logs: null,
    maxPlacements: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} 뒤에 값이 필요하다`);
      return v;
    };
    switch (arg) {
      case '--seeds': {
        const m = /^(\d+)(?:-(\d+))?$/.exec(value());
        if (m === null) throw new Error('--seeds는 N 또는 A-B 형식이다 (예: 1-1000)');
        opts.seedFrom = Number(m[1]);
        opts.seedTo = m[2] === undefined ? opts.seedFrom : Number(m[2]);
        if (opts.seedTo < opts.seedFrom) throw new Error('--seeds의 끝이 시작보다 작다');
        break;
      }
      case '--bot': {
        const raw = value();
        const names = raw === 'all' ? [...BOT_NAMES] : raw.split(',');
        for (const n of names)
          if (!isBotName(n)) throw new Error(`모르는 봇 '${n}' (${BOT_NAMES.join('|')}|all)`);
        opts.bots = names as BotName[];
        break;
      }
      case '--json':
        opts.json = value();
        break;
      case '--logs':
        opts.logs = value();
        break;
      case '--max-placements': {
        const n = Number(value());
        if (!Number.isInteger(n) || n < 1) throw new Error('--max-placements는 1 이상의 정수다');
        opts.maxPlacements = n;
        break;
      }
      default:
        throw new Error(`모르는 옵션 '${arg}'`);
    }
  }
  return opts;
}
