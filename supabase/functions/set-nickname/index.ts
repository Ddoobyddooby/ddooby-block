// Edge Function set-nickname (PLAN 7절): 사용자 토큰 확인 → checkNickname → 태그 발급 → profiles 저장.
// 키는 Supabase가 주입하는 환경 변수만 읽는다 (SUPABASE_URL, SUPABASE_SECRET_KEYS 또는 구형 SUPABASE_SERVICE_ROLE_KEY).
// 처리 로직은 handler.ts, DB 연결은 adapter.ts. 이 파일은 Deno 진입점이라 시험하지 않고 `npm run functions:check`(deno check)로만 본다
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '@supabase/supabase-js/cors';
import { createDeps } from './adapter.ts';
import { handleSetNickname } from './handler.ts';

/** 새 secret key(JSON 사전의 default)를 먼저 쓰고, 없으면 구형 service_role key */
function serverKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const key = (JSON.parse(keys) as Record<string, unknown>).default;
      if (typeof key === 'string' && key) return key;
    } catch {
      // 형식이 다르면 구형 키로 넘어간다
    }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  throw new Error('서버 키 환경 변수가 없다');
}

// 이 클라이언트는 DB 쓰기와 토큰 검증(auth.getUser(token))에만 쓴다. 사용자 세션으로 덮어쓰지 않는다
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serverKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const deps = createDeps(admin, {
  allowHeaders: corsHeaders['Access-Control-Allow-Headers'],
  randomUint32() {
    const [n = 0] = crypto.getRandomValues(new Uint32Array(1));
    return n;
  },
  reportError(e) {
    // 로그에는 종류만 남긴다 (토큰·SQL이 섞일 수 있는 message는 쓰지 않는다)
    const code = (e as { code?: unknown } | null)?.code;
    console.error('set-nickname 오류', e instanceof Error ? e.name : typeof e, String(code ?? ''));
  },
});

Deno.serve((req) => handleSetNickname(deps, req));
