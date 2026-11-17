// 긴 판의 서버 판정 시간 측정 (W4-02). Node와 Deno가 같은 파일을 실행한다 (`node:` 모듈만 쓴다).
// 서버가 실제로 쓰는 생성 번들(supabase/functions/_shared/replay.js)만 가져온다.
//
//   node --disable-warning=ExperimentalWarning scripts/sim/judgeTiming.ts <logs.json> [반복 횟수=7]
//   deno run --allow-read scripts/sim/judgeTiming.ts <logs.json> [반복 횟수=7]
//
// logs.json = npm run sim -- --logs 경로 가 쓴 파일 ({봇: [{seed, placements, log}]}).
// 판정 전체 = JSON.parse → parseSubmission → submissionHash → verifyContent (서버 handler가 본문을 받은 뒤 하는 일).
// 그 앞뒤의 DB·네트워크 시간은 재지 않는다. 배치 수에 비례하는지 보려고 가장 긴 로그는 앞부분(prefix)도 잰다.
import { readFileSync } from 'node:fs';
import process from 'node:process';
import * as server from '../../supabase/functions/_shared/replay.js';

interface LogEntry {
  seed: number;
  placements: number;
  log: { trayIndex: number; row: number; col: number }[];
}

const [path, repeatArg] = process.argv.slice(2);
if (!path) throw new Error('logs.json 경로가 없다');
const repeats = repeatArg === undefined ? 7 : Number(repeatArg);
const logs = JSON.parse(readFileSync(path, 'utf8')) as Record<string, LogEntry[]>;
const entries = Object.values(logs)
  .flat()
  .sort((a, b) => b.placements - a.placements);

const withTimes = (log: LogEntry['log']) =>
  log.map((a, i) => ({ trayIndex: a.trayIndex, row: a.row, col: a.col, t: 1000 + i * 250 }));

function median(xs: number[]): number {
  const s = [...xs].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)] ?? NaN;
}

async function time(
  seed: number,
  log: LogEntry['log'],
): Promise<{ replay: number; judge: number; verdict: string; score: number }> {
  const placements = withTimes(log);
  const replays: number[] = [];
  const judges: number[] = [];
  let verdict = '';
  let score = 0;
  for (let i = 0; i < repeats; i++) {
    let t0 = performance.now();
    const r = server.replay(seed, placements);
    replays.push(performance.now() - t0);
    if (!r.ok) throw new Error(`replay 실패: index ${r.index} ${r.reason}`);
    score = r.state.score;

    const body = JSON.stringify({
      seed,
      version: server.RULES_VERSION,
      clientScore: score,
      placements,
    });
    t0 = performance.now();
    const parsed = server.parseSubmission(JSON.parse(body));
    if (!parsed.ok) throw new Error(`parse 실패: ${parsed.code}`);
    await server.submissionHash(parsed.submission);
    const v = server.verifyContent(parsed.submission, { seed });
    judges.push(performance.now() - t0);
    verdict = v.ok ? 'ok' : v.code;
  }
  return { replay: median(replays), judge: median(judges), verdict, score };
}

const runtime =
  typeof (globalThis as { Deno?: unknown }).Deno === 'undefined'
    ? `node ${process.version}`
    : 'deno';
console.log(`런타임: ${runtime}, 반복 ${repeats}회의 중앙값, 단위 ms`);
console.log('seed   배치수  replay  판정전체  ms/1000배치  판정결과');
const top = entries.slice(0, 3);
for (const e of top) {
  const r = await time(e.seed, e.log);
  console.log(
    `${String(e.seed).padStart(5)} ${String(e.placements).padStart(7)} ${r.replay.toFixed(1).padStart(7)} ${r.judge.toFixed(1).padStart(9)} ${((r.judge / e.placements) * 1000).toFixed(2).padStart(11)}  ${r.verdict}`,
  );
}
const longest = top[0];
if (longest !== undefined) {
  console.log(`\nseed ${longest.seed}의 앞부분(prefix)별: 배치 수에 비례하는지`);
  console.log('배치수  replay  판정전체  (게임 오버 전이라 판정결과는 not-over)');
  for (const n of [500, 1000, 2000, 4000, 8000, 16000, 20000]) {
    if (n > longest.placements) break;
    const r = await time(longest.seed, longest.log.slice(0, n));
    console.log(
      `${String(n).padStart(6)} ${r.replay.toFixed(1).padStart(7)} ${r.judge.toFixed(1).padStart(9)}  ${r.verdict}`,
    );
  }
}
