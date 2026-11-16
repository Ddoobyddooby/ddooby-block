// Edge Function submit-score (PLAN 7절): 서버 리플레이로 점수를 검증해 주간 최고 점수에 반영한다 (SPEC 8.1).
// 키는 Supabase가 주입하는 환경 변수만 읽는다. 처리 로직은 handler.ts, DB 연결은 adapter.ts.
// 이 파일은 Deno 진입점이라 시험하지 않고 `npm run functions:check`(deno check)로만 본다
import { corsHeaders } from '@supabase/supabase-js/cors';
import { createAdmin, reportError } from '../_lib/admin.ts';
import { RULES_VERSION } from '../_shared/replay.js';
import { createDeps } from './adapter.ts';
import { handleSubmitScore } from './handler.ts';

const deps = createDeps(createAdmin(), {
  allowHeaders: corsHeaders['Access-Control-Allow-Headers'],
  rulesVersion: RULES_VERSION,
  now: () => Date.now(),
  reportError: (e) => reportError('submit-score', e),
});

Deno.serve((req) => handleSubmitScore(deps, req));
