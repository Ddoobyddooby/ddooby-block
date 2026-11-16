// Deno 진입점(index.ts)이 쓰는 service 권한 클라이언트. 키는 Supabase가 주입하는 환경 변수만 읽는다
// (SUPABASE_URL, SUPABASE_SECRET_KEYS 또는 구형 SUPABASE_SERVICE_ROLE_KEY). 이 파일은 Deno 전역을 쓰므로 시험하지 않는다
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

export function createAdmin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', serverKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** 로그에는 종류만 남긴다 (토큰·SQL이 섞일 수 있는 message는 쓰지 않는다) */
export function reportError(name: string, e: unknown): void {
  const code = (e as { code?: unknown } | null)?.code;
  console.error(`${name} 오류`, e instanceof Error ? e.name : typeof e, String(code ?? ''));
}
