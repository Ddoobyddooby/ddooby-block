// Edge Function start-run (PLAN 7절): 서버가 seed와 run을 발급한다. 키는 Supabase가 주입하는 환경 변수만 읽는다.
// 처리 로직은 handler.ts, DB 연결은 adapter.ts. 이 파일은 Deno 진입점이라 시험하지 않고 `npm run functions:check`(deno check)로만 본다
import { corsHeaders } from '@supabase/supabase-js/cors';
import { createAdmin, reportError } from '../_lib/admin.ts';
import { RULES_VERSION } from '../_shared/replay.js';
import { createDeps } from './adapter.ts';
import { handleStartRun } from './handler.ts';

const deps = createDeps(createAdmin(), {
  allowHeaders: corsHeaders['Access-Control-Allow-Headers'],
  rulesVersion: RULES_VERSION,
  now: () => Date.now(),
  randomUint32() {
    const [n = 0] = crypto.getRandomValues(new Uint32Array(1));
    return n;
  },
  reportError: (e) => reportError('start-run', e),
});

Deno.serve((req) => handleStartRun(deps, req));
