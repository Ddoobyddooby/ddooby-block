// 사용자 토큰 확인 (start-run·submit-score 공통). admin 클라이언트는 DB 쓰기와 토큰 검증(auth.getUser(token))에만 쓰고
// 사용자 세션으로 바꾸지 않는다. Deno 전역을 쓰지 않아 Vitest에서 가짜 클라이언트로 시험한다.
import type { SupabaseClient } from '@supabase/supabase-js';

/** 인증 서버가 "토큰이 무효"가 아니라 "지금 판정 못 함"을 뜻하는 4xx (요청 한도 초과) */
const NOT_A_VERDICT = new Set([408, 429]);

/**
 * 토큰이 유효하면 사용자 ID, 무효·만료면 null. 인증 서버 장애(5xx·네트워크·요청 한도)는 판정하지 못한 것이므로
 * 무효로 오판하지 않고 throw한다 (호출한 handler가 500으로 바꾼다)
 */
export async function userIdFromToken(
  admin: SupabaseClient,
  token: string,
): Promise<string | null> {
  const { data, error } = await admin.auth.getUser(token);
  if (error) {
    const status = error.status;
    if (status !== undefined && status >= 400 && status < 500 && !NOT_A_VERDICT.has(status)) {
      return null;
    }
    throw error;
  }
  return data.user?.id ?? null;
}
