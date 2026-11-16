// W3-01 권한(RLS·GRANT) 시험: 원격 개발 프로젝트에 익명 사용자 A·B와 비로그인 anon으로 접속해
// weekly_scores·profiles·runs의 클라이언트 쓰기 차단과 읽기 범위를 확인한다.
// publishable key만 쓴다 (npm test에 넣지 않음).
//
//   npm run supabase:check [-- <env 파일 경로>]               (기본값 .env.local)
//   npm run supabase:check -- --nickname [<env 파일 경로>]    set-nickname 함수 시험 (W3-02. 아래 runNickname)
//
// 종료 코드: 0 모두 PASS / 1 FAIL·시험 불가 있음 / 2 설정·로그인 오류 (시험을 시작하지 못함)
//
// 판정: 쓰기·접근 차단은 권한 거부(42501)만 PASS. 그 밖의 오류와 성공 응답은 FAIL, 네트워크·인증 오류는 시험 불가.
//
// 시험이 원격에 남기는 것: 실행마다 익명 계정 2개(A·B)가 새로 생긴다. 권한이 올바르면 어떤 행도 남지 않지만
// 권한이 잘못 열려 있으면 쓰기 시험이 실제 행을 만들거나 바꿀 수 있다 (supabase/README.md "권한 시험").
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  judgeCode,
  judgeCors,
  judgeDifferentTag,
  judgeNoNickname,
  judgePreflightAllowed,
  judgePreflightDenied,
  judgeProfile,
  judgeRace,
  judgeSet,
  judgeSuccessCors,
  judgeUnauthorized,
  type FnRes,
} from './nicknameJudge.ts';
import {
  type CheckEnv,
  type Outcome,
  type Res,
  type Row,
  denied,
  expectNoRowsNow,
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
  if (!parsed.ok) {
    throw new SetupError(setupGuide(path, parsed.badKey ? 'bad-key' : 'missing', parsed.missing));
  }
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

/** 허용 출처 (supabase/functions/set-nickname/handler.ts의 ALLOWED_ORIGINS에 있는 것) */
const ALLOWED_ORIGIN = 'http://localhost:5181';
const OTHER_ALLOWED_ORIGIN = 'https://ddoobyddooby.github.io';
/** 허용 목록에 없는 출처 */
const DENIED_ORIGIN = 'https://evil.example';
const FN_TIMEOUT_MS = 15_000;

async function callFunction(
  env: CheckEnv,
  init: { method: string; origin: string | null; token: string | null; body?: unknown },
): Promise<FnRes> {
  const headers: Record<string, string> = { apikey: env.key, 'Content-Type': 'application/json' };
  if (init.origin !== null) headers.Origin = init.origin;
  if (init.token !== null) headers.Authorization = `Bearer ${init.token}`;
  try {
    const res = await fetch(`${env.url}/functions/v1/set-nickname`, {
      method: init.method,
      headers,
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(FN_TIMEOUT_MS),
    });
    let body: unknown = null;
    try {
      body = JSON.parse(await res.text());
    } catch {
      // JSON이 아닌 본문
    }
    return { status: res.status, body, header: (name) => res.headers.get(name) };
  } catch {
    return { status: 0, body: null, header: () => null }; // 연결 실패·시간 초과 → 시험 불가
  }
}

async function accessToken(client: SupabaseClient): Promise<string> {
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new SetupError('세션 토큰을 얻지 못했다');
  return token;
}

async function readProfile(client: SupabaseClient, id: string): Promise<unknown> {
  const { data } = await client.from('profiles').select('nickname, tag').eq('id', id).maybeSingle();
  return data;
}

/**
 * set-nickname 함수 시험 (W3-02). 새 익명 사용자 A·B·C·D와 비로그인으로 정확한 status·code·헤더를 확인한다.
 * 양성 대조(유효 토큰의 200)가 있어야 "모든 요청을 401로 거부하는 잘못된 배포"가 보안 PASS로 보이지 않는다.
 * 시험은 닉네임이 정해진 profiles 행(A·C·D)을 원격에 남긴다 (supabase/README.md "닉네임 함수 시험")
 */
async function runNickname(env: CheckEnv, rows: Row[]): Promise<void> {
  const check = async (id: string, label: string, expect: string, run: () => Promise<Outcome>) => {
    let outcome: Outcome;
    try {
      outcome = await run();
    } catch (e) {
      outcome = failed(e);
    }
    rows.push({ id, label, expect, outcome });
  };
  const anon = newClient(env);
  const [a, b, c, d] = [newClient(env), newClient(env), newClient(env), newClient(env)];
  const idA = await signIn(a, 'A');
  const idB = await signIn(b, 'B');
  const idC = await signIn(c, 'C');
  await signIn(d, 'D');
  const tokenA = await accessToken(a);
  const tokenB = await accessToken(b);
  const tokenC = await accessToken(c);
  const tokenD = await accessToken(d);
  const post = (token: string | null, nickname: unknown, origin: string | null = ALLOWED_ORIGIN) =>
    callFunction(env, { method: 'POST', origin, token, body: { nickname } });
  const name = `시험${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;

  // ① 정상 설정 (양성 대조) → 같은 이름의 두 번째 사용자는 다른 태그
  const setA = await post(tokenA, name);
  const resultA = judgeSet(setA, name);
  await check('①', 'A 정상 닉네임 설정', '200, 이름·태그(0~9999)', async () => resultA);
  await check('①', 'A profiles 재조회', '함수 응답과 같음', async () =>
    judgeProfile(await readProfile(a, idA), name, resultA.tag),
  );
  const setC = await post(tokenC, name);
  const resultC = judgeSet(setC, name);
  await check('①', 'C 같은 이름 설정', '200, 이름·태그(0~9999)', async () => resultC);
  await check('①', 'C 태그가 A와 다름', '다른 태그', async () =>
    judgeDifferentTag(resultA.tag, resultC.tag),
  );
  await check('①', 'C profiles 재조회', '함수 응답과 같음', async () =>
    judgeProfile(await readProfile(c, idC), name, resultC.tag),
  );

  // ② 규칙 거부 (B는 이름이 없는 새 사용자) + 이름이 생기지 않음
  const rules: [string, string, string][] = [
    ['너무 짧음', '뚜', 'too-short'],
    ['너무 김', '가나다라마바사아자차카', 'too-long'],
    ['허용되지 않는 글자', '뚜 비', 'bad-chars'],
    ['금칙어', '시발', 'banned'],
  ];
  for (const [label, value, code] of rules) {
    await check('②', `B ${label}`, `400 ${code} + Allow-Origin`, async () => {
      const res = await post(tokenB, value);
      const verdict = judgeCors(res, ALLOWED_ORIGIN, 400, code);
      return verdict;
    });
  }
  await check('②', 'B 거부 뒤 profiles', '이름이 생기지 않음', async () =>
    judgeNoNickname(await readProfile(b, idB)),
  );

  // ③ 두 번째 설정은 거부하고 값을 바꾸지 않음
  await check('③', 'A 두 번째 설정', '409 already-set + Allow-Origin', async () =>
    judgeCors(await post(tokenA, `${name}2`), ALLOWED_ORIGIN, 409, 'already-set'),
  );
  await check('③', 'A 두 번째 뒤 profiles', '이름·태그 불변', async () =>
    judgeProfile(await readProfile(a, idA), name, resultA.tag),
  );

  // ④ 인증: 무토큰·위조 토큰은 401 (유효 토큰의 200이 ①에서 확인돼야 의미가 있다)
  await check('④', '토큰 없음', '401', async () => judgeUnauthorized(await post(null, name)));
  await check('④', '위조 토큰', '401', async () =>
    judgeUnauthorized(await post('forged.token.value', name)),
  );

  // ⑤ CORS: 허용 출처 preflight 204, 허용 밖 403, 허용 밖 POST도 403, 성공 응답에도 Allow-Origin
  for (const origin of [ALLOWED_ORIGIN, OTHER_ALLOWED_ORIGIN]) {
    await check('⑤', `허용 출처 OPTIONS (${origin})`, '204 + 허용 헤더', async () =>
      judgePreflightAllowed(
        await callFunction(env, { method: 'OPTIONS', origin, token: null }),
        origin,
      ),
    );
  }
  await check('⑤', '허용 밖 출처 OPTIONS', '403, 허용 헤더 없음', async () =>
    judgePreflightDenied(
      await callFunction(env, { method: 'OPTIONS', origin: DENIED_ORIGIN, token: null }),
    ),
  );
  await check('⑤', '허용 밖 출처 POST (유효 토큰)', '403 origin, 허용 헤더 없음', async () => {
    const res = await post(tokenD, '시험출처', DENIED_ORIGIN);
    const verdict = judgeCode(res, 403, 'origin');
    return verdict.pass && res.header('access-control-allow-origin') !== null
      ? { pass: false, detail: '403이지만 Allow-Origin이 붙음' }
      : verdict;
  });
  await check('⑤', 'A 성공 응답의 Allow-Origin', '요청 출처와 같음', async () =>
    judgeSuccessCors(setA, ALLOWED_ORIGIN),
  );

  // ⑥ 같은 사용자의 동시 두 요청 (순차로 대신하지 않는다)
  await check('⑥', 'D 동시 두 설정', '200 하나, 409 하나', async () => {
    const [r1, r2] = await Promise.all([post(tokenD, `${name}동시`), post(tokenD, `${name}둘`)]);
    return judgeRace(r1, r2);
  });

  // ⑦ profiles 직접 쓰기는 여전히 거부 (함수 응답 시험과 별개. 권한 거부 42501만 PASS)
  const writes: [string, SupabaseClient, string][] = [
    ['A', a, idA],
    ['anon', anon, idA],
  ];
  for (const [who, client, id] of writes) {
    await check('⑦', `${who} profiles INSERT`, '실패', async () =>
      denied(await client.from('profiles').insert({ id, nickname: '직접', tag: 1 }).select()),
    );
    await check('⑦', `${who} profiles UPDATE`, '실패', async () =>
      denied(await client.from('profiles').update({ nickname: '직접' }).eq('id', id).select()),
    );
    await check('⑦', `${who} profiles DELETE`, '실패', async () =>
      denied(await client.from('profiles').delete().eq('id', id).select()),
    );
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const nickname = args.includes('--nickname');
  const envPath = args.find((arg) => !arg.startsWith('--')) ?? '.env.local';
  const env = loadEnv(envPath);

  if (nickname) {
    const rows: Row[] = [];
    await runNickname(env, rows);
    for (const line of formatTable(rows)) console.log(line);
    return exitCodeOf(rows);
  }

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

  // ③ runs: 본인 것만 읽기, 쓰기 불가. 시험용 run을 만들 수단이 없어(start-run은 W3-03) SELECT 두 항목은
  // 지금의 예상 결과(0행)일 뿐 RLS 증명이 아니다. W3-03에서 start-run fixture로 양성(A가 자기 run을 읽음)·
  // 음성(B가 못 읽음) 대조를 더한다
  await check('③', 'A 본인 runs SELECT', '오류 없음·0행 (권한 증명 아님)', async () =>
    expectNoRowsNow(await a.from('runs').select('*')),
  );
  await check('③', 'B가 A의 runs SELECT', '오류 없음·0행 (권한 증명 아님)', async () =>
    expectNoRowsNow(await b.from('runs').select('*').eq('user_id', idA)),
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
