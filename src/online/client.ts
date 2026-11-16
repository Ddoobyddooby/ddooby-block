// Supabase 연결 (PLAN 7절). publishable key만 쓴다. 키가 없거나 publishable 형식이 아니면 null → 온라인 기능 꺼짐.
// account·profile은 아래 OnlineBackend만 알고 supabase-js를 직접 모른다 (가짜 백엔드로 시험하기 위해).
// ddooby-pang src/online/client.ts에서 복사해 닉네임에 필요한 부분만 남겼다 (rpc·insertRow 제거, 키 형식 검사 추가)
import type { SupabaseClient } from '@supabase/supabase-js';

/** Edge Function 응답. 연결 자체가 안 되면(오프라인·CORS 차단) 'network' */
export type FunctionResult = { status: number; body: unknown } | 'network';

export interface OnlineBackend {
  /** 저장된 세션의 사용자 ID. 세션이 없으면 null. 실패는 throw */
  getSessionUserId(): Promise<string | null>;
  /** 익명 로그인 → 사용자 ID. 실패는 throw */
  signInAnonymously(): Promise<string>;
  /**
   * SDK 세션의 사용자가 바뀔 때마다 부른다: 로그인·토큰 갱신·사용자 갱신은 사용자 ID, 로그아웃(갱신 실패 포함)은 null.
   * 앱의 계정 ID는 항상 이 SDK 세션을 따라간다 (account.ts)
   */
  onSessionChange(listener: (userId: string | null) => void): void;
  /**
   * 본인 profiles 행 (`nickname`·`tag` 열). 행이 없으면 null. 실패는 throw.
   * 모양은 믿지 않고 profile.ts가 검사한다 (그래서 unknown)
   */
  fetchProfile(userId: string): Promise<unknown>;
  /** Edge Function 호출 (세션 토큰은 클라이언트가 붙인다) */
  callFunction(name: string, body: Record<string, unknown>): Promise<FunctionResult>;
}

/** supabase-js의 오류 클래스 (instanceof 판정용. 동적 import한 모듈에서 넘겨받는다) */
export interface FunctionErrorClasses {
  FunctionsHttpError: abstract new (...args: never[]) => { context: unknown };
  FunctionsFetchError: abstract new (...args: never[]) => object;
}

export function backendFromClient(
  client: SupabaseClient,
  errors: FunctionErrorClasses,
): OnlineBackend {
  return {
    async getSessionUserId() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session?.user.id ?? null;
    },
    async signInAnonymously() {
      const { data, error } = await client.auth.signInAnonymously();
      if (error) throw error;
      if (!data.user) throw new Error('익명 로그인 응답에 user가 없다');
      return data.user.id;
    },
    onSessionChange(listener) {
      client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') listener(null);
        else if (
          (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') &&
          session
        ) {
          listener(session.user.id);
        }
        // INITIAL_SESSION은 getSession()이 같은 값을 주므로 따로 받지 않는다
      });
    },
    async fetchProfile(userId) {
      const { data, error } = await client
        .from('profiles')
        .select('nickname, tag')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async callFunction(name, body) {
      const { data, error } = await client.functions.invoke(name, { body });
      if (!error) return { status: 200, body: data };
      if (error instanceof errors.FunctionsHttpError) {
        const res = error.context as Response;
        let resBody: unknown = null;
        try {
          resBody = await res.json();
        } catch {
          // 본문이 JSON이 아니면 상태 코드만 쓴다
        }
        return { status: res.status, body: resBody };
      }
      if (error instanceof errors.FunctionsFetchError) return 'network';
      // FunctionsRelayError 등: 함수까지 못 간 서버 쪽 오류
      return { status: 502, body: null };
    },
  };
}

/** 새 형식 publishable key 접두어. secret·service_role·JWT는 브라우저에 두지 않으므로 받지 않는다 */
export const PUBLISHABLE_PREFIX = 'sb_publishable_';

export interface PublicEnv {
  url: string;
  key: string;
}

/**
 * `.env.local`·저장소 Variables의 값에서 접속 정보를 꺼낸다.
 * 비어 있거나 publishable 형식이 아니면 null (조용히 온라인 기능을 끈다. secret 키를 클라이언트로 쓰지 않는다)
 */
export function parsePublicEnv(url: unknown, key: unknown): PublicEnv | null {
  if (typeof url !== 'string' || typeof key !== 'string') return null;
  const u = url.trim();
  const k = key.trim();
  if (!u || !k) return null;
  if (!k.startsWith(PUBLISHABLE_PREFIX) || k.length === PUBLISHABLE_PREFIX.length) return null;
  return { url: u, key: k };
}

function readEnv(): PublicEnv | null {
  return parsePublicEnv(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
}

/** 키가 들어 있는 빌드인지 (supabase-js를 불러오지 않고 판단) */
export function hasOnlineKeys(): boolean {
  return readEnv() !== null;
}

/**
 * 백엔드를 만든다. 키가 없으면 null.
 * supabase-js는 처음 쓸 때 동적 import해 게임 첫 로딩 번들에 넣지 않는다
 */
export async function createDefaultBackend(): Promise<OnlineBackend | null> {
  const env = readEnv();
  if (!env) return null;
  const supabase = await import('@supabase/supabase-js');
  const client = supabase.createClient(env.url, env.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return backendFromClient(client, supabase);
}
