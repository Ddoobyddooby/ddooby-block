// start-run의 실제 연결 (runs 저장). Deno 전역을 쓰지 않아 Vitest에서 가짜 클라이언트로 시험한다.
// index.ts가 service 권한 클라이언트를 만들어 넘긴다.
import type { SupabaseClient } from '@supabase/supabase-js';
import { userIdFromToken } from '../_lib/token.ts';
import type { StartRunDeps } from './handler.ts';

export function createDeps(
  admin: SupabaseClient,
  options: {
    allowHeaders: string;
    rulesVersion: number;
    now(): number;
    randomUint32(): number;
    reportError?(e: unknown): void;
  },
): StartRunDeps {
  return {
    allowHeaders: options.allowHeaders,
    rulesVersion: options.rulesVersion,
    now: options.now,
    getUserId: (token) => userIdFromToken(admin, token),
    randomSeed: options.randomUint32,

    async insertRun(run) {
      const { data, error } = await admin
        .from('runs')
        .insert({
          user_id: run.userId,
          seed: run.seed,
          rules_version: run.rulesVersion,
          week_key: run.weekKey,
          created_at: new Date(run.createdAtMs).toISOString(),
        })
        .select('id')
        .single<{ id: string }>();
      if (error) throw error;
      return data.id;
    },

    ...(options.reportError ? { reportError: options.reportError } : {}),
  };
}
