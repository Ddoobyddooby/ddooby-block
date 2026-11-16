// set-nickname의 실제 연결 (사용자 확인·profiles 저장·난수). Deno 전역을 쓰지 않아 Vitest에서 가짜 클라이언트로 시험한다.
// index.ts가 service 권한 클라이언트를 만들어 넘긴다.
import type { SupabaseClient } from '@supabase/supabase-js';
import { TAG_MAX } from '../_shared/nicknameRules.js';
import type { SetNicknameDeps } from './handler.ts';

/** 인증 서버가 "토큰이 무효"가 아니라 "지금 판정 못 함"을 뜻하는 4xx (요청 한도 초과) */
const NOT_A_VERDICT = new Set([408, 429]);

export function createDeps(
  admin: SupabaseClient,
  options: { allowHeaders: string; randomUint32(): number; reportError?(e: unknown): void },
): SetNicknameDeps {
  return {
    allowHeaders: options.allowHeaders,

    async getUserId(token) {
      const { data, error } = await admin.auth.getUser(token);
      if (error) {
        // 토큰이 잘못됐거나 만료된 4xx는 401. 그 밖(5xx·네트워크·요청 한도)은 서버 오류(500)로 올린다
        const status = error.status;
        if (status !== undefined && status >= 400 && status < 500 && !NOT_A_VERDICT.has(status)) {
          return null;
        }
        throw error;
      }
      return data.user?.id ?? null;
    },

    async getNickname(userId) {
      const { data, error } = await admin
        .from('profiles')
        .select('nickname')
        .eq('id', userId)
        .maybeSingle<{ nickname: string | null }>();
      if (error) throw error;
      return data?.nickname ?? null;
    },

    async saveNickname(userId, nickname, tag) {
      // 행이 없으면 빈 행을 만들고 (이미 있으면 그대로 둔다), 닉네임이 아직 없을 때만 채운다.
      // `id = 검증된 사용자 AND nickname IS NULL` 조건이 동시 요청에도 "한 번만 정해진다"를 보장한다
      const created = await admin
        .from('profiles')
        .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });
      if (created.error) throw created.error; // 빈 행 단계의 오류는 태그 충돌이 아니다
      const { data, error } = await admin
        .from('profiles')
        .update({ nickname, tag })
        .eq('id', userId)
        .is('nickname', null)
        .select('id');
      if (error) {
        if (error.code === '23505') return 'tag-taken'; // unique (nickname, tag)
        throw error;
      }
      return data.length === 0 ? 'already-set' : 'ok';
    },

    randomTag() {
      return options.randomUint32() % (TAG_MAX + 1);
    },

    ...(options.reportError ? { reportError: options.reportError } : {}),
  };
}
