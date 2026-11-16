// Node와 Deno가 같은 파일을 실행한다 (`node:` 모듈만 써서 양쪽에서 돈다). 생성 번들(supabase/functions/_shared/replay.js)만 가져온다.
//   core:    {입력 JSON} → compute() 결과를 JSON으로 출력
//   handler: {입력 JSON} → 실제 submit-score handler + 번들 + 가짜 DB로 각 판을 제출한 응답을 JSON으로 출력
// 네트워크·환경 변수·원격 DB를 쓰지 않는다 (읽기는 입력 파일 하나).
import { readFileSync } from 'node:fs';
import process from 'node:process';
import * as bundle from '../../../supabase/functions/_shared/replay.js';
import { handleSubmitScore } from '../../../supabase/functions/submit-score/handler.ts';
import { FakeRunsDb, post } from '../../functions/fakeRunsDb.ts';
import { compute, type ParityInput } from '../parityCompute.ts';

const [mode, inputPath] = process.argv.slice(2);
if (!inputPath) throw new Error('입력 파일 경로가 없다');
const input = JSON.parse(readFileSync(inputPath, 'utf8')) as ParityInput;

const RUN = '10000000-0000-4000-8000-00000000000a';

async function handlerRun(): Promise<unknown> {
  const out = [];
  for (const g of input.games) {
    const db = new FakeRunsDb();
    const last = (g.placements.at(-1) as { t: number } | undefined)?.t ?? 0;
    db.addRun(RUN, 'user-a', g.seed, { createdAtMs: db.clock - last - 5000 });
    const body = (over: Record<string, unknown> = {}) => ({
      runId: RUN,
      seed: g.seed,
      version: 1,
      clientScore: g.clientScore,
      placements: g.placements,
      ...over,
    });
    const send = async (b: unknown) => {
      const res = await handleSubmitScore(db.deps(), post('https://f.example/submit-score', b));
      return { status: res.status, body: await res.json() };
    };
    const ok = await send(body());
    // 같은 내용 재제출은 최초 응답 그대로
    const again = await send(body());
    // 다른 내용은 충돌
    const conflict = await send(body({ clientScore: g.clientScore + 1 }));
    // 점수가 틀린 새 run
    const db2 = new FakeRunsDb();
    db2.addRun(RUN, 'user-a', g.seed, { createdAtMs: db2.clock - last - 5000 });
    const wrong = await (async () => {
      const res = await handleSubmitScore(
        db2.deps(),
        post('https://f.example/submit-score', body({ clientScore: g.clientScore + 1 })),
      );
      return { status: res.status, body: await res.json() };
    })();
    out.push({ seed: g.seed, ok, again, conflict, wrong });
  }
  return out;
}

const result = mode === 'handler' ? await handlerRun() : await compute(bundle, input);
process.stdout.write(JSON.stringify(result));
