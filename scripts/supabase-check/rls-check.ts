// W3-01 권한(RLS·GRANT) 시험: 원격 개발 프로젝트에 익명 사용자 A·B와 비로그인 anon으로 접속해
// weekly_scores·profiles·runs의 클라이언트 쓰기 차단과 읽기 범위를 확인한다.
// publishable key만 쓴다 (npm test에 넣지 않음).
//
//   npm run supabase:check [-- <env 파일 경로>]     (기본값 .env.local)
//
// 종료 코드: 0 모두 PASS / 1 FAIL 있음 / 2 설정·로그인 오류 (시험을 시작하지 못함)
//
// 시험이 원격에 남기는 것: 실행마다 익명 계정 2개(A·B)가 새로 생긴다. 시험은 어떤 행도 만들지 못하게
// 막혀 있는지만 보므로 표에는 아무 행도 남지 않는다 (supabase/README.md "권한 시험").
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  type CheckEnv,
  type Outcome,
  type Res,
  type Row,
  denied,
  emptyRead,
  exitCodeOf,
  failed,
  formatTable,
  parseCheckEnv,
  readable,
  setupGuide,
} from './report.ts';

/** 시험 행에 쓰는 주 키. 실제 주와 겹치지 않는 먼 미래 값 */
const TEST_WEEK_KEY = '2099-W01';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

class SetupError extends Error {}

function loadEnv(path: string): CheckEnv {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new SetupError(setupGuide(path, 'no-file', []));
  }
  const parsed = parseCheckEnv(parseEnv(text));
  if (!parsed.ok) throw new SetupError(setupGuide(path, 'missing', parsed.missing));
  return parsed.env;
}

function newClient({ url, key }: CheckEnv): SupabaseClient {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signIn(client: SupabaseClient, name: string): Promise<string> {
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) {
    throw new SetupError(
      `${name} 익명 로그인 실패 (${error?.message ?? 'user 없음'}). 대시보드에서 Anonymous Sign-ins를 켰는지 확인`,
    );
  }
  return data.user.id;
}

async function main(): Promise<number> {
  const envPath = process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? '.env.local';
  const env = loadEnv(envPath);

  const anon = newClient(env);
  const a = newClient(env);
  const b = newClient(env);
  const idA = await signIn(a, 'A');
  await signIn(b, 'B');

  const rows: Row[] = [];
  const check = async (id: string, label: string, expect: string, run: () => Promise<Outcome>) => {
    let outcome: Outcome;
    try {
      outcome = await run();
    } catch (e) {
      outcome = failed(e);
    }
    rows.push({ id, label, expect, outcome });
  };

  // 한 판을 만든 것처럼 보이는 run 행. 클라이언트는 이걸 넣을 수 없어야 한다
  const runRow = { user_id: idA, seed: 1, rules_version: 1, week_key: TEST_WEEK_KEY };
  const weeklyRow = { user_id: idA, week_key: TEST_WEEK_KEY, best_score: 1, run_id: NIL_UUID };

  // ① weekly_scores: 클라이언트 쓰기 불가, 읽기 가능
  await check('①', 'A weekly_scores INSERT', '실패', async () =>
    denied(await a.from('weekly_scores').insert(weeklyRow).select()),
  );
  await check('①', 'A weekly_scores UPDATE', '실패', async () =>
    denied(
      await a.from('weekly_scores').update({ best_score: 999999 }).eq('user_id', idA).select(),
    ),
  );
  await check('①', 'A weekly_scores DELETE', '실패', async () =>
    denied(await a.from('weekly_scores').delete().eq('user_id', idA).select()),
  );
  await check('①', 'A weekly_scores SELECT', '성공', async () =>
    readable(await a.from('weekly_scores').select('*').limit(5)),
  );

  // ② profiles: 클라이언트 쓰기 불가(set-nickname만, W3-02), 읽기 가능
  await check('②', 'A profiles INSERT', '실패', async () =>
    denied(await a.from('profiles').insert({ id: idA, nickname: '시험', tag: 1 }).select()),
  );
  await check('②', 'A profiles UPDATE', '실패', async () =>
    denied(await a.from('profiles').update({ nickname: '시험' }).eq('id', idA).select()),
  );
  await check('②', 'A profiles DELETE', '실패', async () =>
    denied(await a.from('profiles').delete().eq('id', idA).select()),
  );
  await check('②', 'A profiles SELECT', '성공', async () =>
    readable(await a.from('profiles').select('*').limit(5)),
  );

  // ③ runs: 본인 것만 읽기, 쓰기 불가. 시험용 run을 만들 수단이 없어(start-run은 W3-03)
  // 지금은 "오류 없이 0행"만 보고, 실제 교차 시험(B가 A의 run을 못 읽음)은 W3-03에서 추가한다
  await check('③', 'A 본인 runs SELECT', '오류 없음·0행', async () =>
    emptyRead(await a.from('runs').select('*')),
  );
  await check('③', 'B가 A의 runs SELECT', '오류 없음·0행', async () =>
    emptyRead(await b.from('runs').select('*').eq('user_id', idA)),
  );
  await check('③', 'A runs INSERT', '실패', async () =>
    denied(await a.from('runs').insert(runRow).select()),
  );
  await check('③', 'A runs UPDATE', '실패', async () =>
    denied(await a.from('runs').update({ seed: 2 }).eq('user_id', idA).select()),
  );
  await check('③', 'A runs DELETE', '실패', async () =>
    denied(await a.from('runs').delete().eq('user_id', idA).select()),
  );

  // 비로그인 anon: 쓰기 전부 실패. 공개 표(profiles·weekly_scores)만 읽힌다
  const anonWrites: [string, () => PromiseLike<Res>][] = [
    [
      'profiles INSERT',
      () => anon.from('profiles').insert({ id: idA, nickname: '시험', tag: 1 }).select(),
    ],
    [
      'profiles UPDATE',
      () => anon.from('profiles').update({ nickname: '시험' }).eq('id', idA).select(),
    ],
    ['profiles DELETE', () => anon.from('profiles').delete().eq('id', idA).select()],
    ['runs INSERT', () => anon.from('runs').insert(runRow).select()],
    ['runs UPDATE', () => anon.from('runs').update({ seed: 2 }).eq('user_id', idA).select()],
    ['runs DELETE', () => anon.from('runs').delete().eq('user_id', idA).select()],
    ['weekly_scores INSERT', () => anon.from('weekly_scores').insert(weeklyRow).select()],
    [
      'weekly_scores UPDATE',
      () => anon.from('weekly_scores').update({ best_score: 1 }).eq('user_id', idA).select(),
    ],
    ['weekly_scores DELETE', () => anon.from('weekly_scores').delete().eq('user_id', idA).select()],
  ];
  for (const [label, run] of anonWrites) {
    await check('anon', `anon ${label}`, '실패', async () => denied(await run()));
  }
  await check('anon', 'anon profiles SELECT', '성공', async () =>
    readable(await anon.from('profiles').select('*').limit(5)),
  );
  await check('anon', 'anon weekly_scores SELECT', '성공', async () =>
    readable(await anon.from('weekly_scores').select('*').limit(5)),
  );
  await check('anon', 'anon runs SELECT', '실패', async () =>
    denied(await anon.from('runs').select('*').limit(5)),
  );

  for (const line of formatTable(rows)) console.log(line);
  return exitCodeOf(rows);
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  },
);
