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

/** seed 상한 (서버 JUDGE.maxSeed와 같은 uint32) */
export const MAX_SEED = 0xffffffff;

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
        // 안전한 정수가 아니면 seed++가 멈추거나(2^53) Infinity가 되어 끝나지 않는다. core는 seed를 uint32로 다룬다
        for (const seed of [opts.seedFrom, opts.seedTo]) {
          if (!Number.isSafeInteger(seed) || seed < 0 || seed > MAX_SEED) {
            throw new Error(`--seeds는 0~${MAX_SEED} 범위의 정수여야 한다`);
          }
        }
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
