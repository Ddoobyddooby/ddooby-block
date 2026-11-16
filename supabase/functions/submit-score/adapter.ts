// submit-score의 실제 연결 (run 조회, DB 함수 commit_submission). Deno 전역을 쓰지 않아 Vitest에서 가짜 클라이언트로 시험한다.
// index.ts가 service 권한 클라이언트를 만들어 넘긴다.
import type { SupabaseClient } from '@supabase/supabase-js';
import { userIdFromToken } from '../_lib/token.ts';
import type { RunRow, SubmitScoreDeps } from './handler.ts';

interface RunRecord {
  id: string;
  seed: number;
  rules_version: number;
  week_key: string;
  created_at: string;
  submission_hash: string | null;
  result: unknown;
}

interface CommitRow {
  out_status: string;
  out_hash: string | null;
  out_result: unknown;
}

export function createDeps(
  admin: SupabaseClient,
  options: {
    allowHeaders: string;
    rulesVersion: number;
    now(): number;
    reportError?(e: unknown): void;
  },
): SubmitScoreDeps {
  return {
    allowHeaders: options.allowHeaders,
    rulesVersion: options.rulesVersion,
    now: options.now,
    getUserId: (token) => userIdFromToken(admin, token),

    async getRun(runId, userId): Promise<RunRow | null> {
      // user_id까지 조건에 넣어 남의 run은 없는 run과 같게 0행이 되게 한다
      const { data, error } = await admin
        .from('runs')
        .select('id, seed, rules_version, week_key, created_at, submission_hash, result')
        .eq('id', runId)
        .eq('user_id', userId)
        .maybeSingle<RunRecord>();
      if (error) throw error;
      if (!data) return null;
      // created_at은 start-run이 ms 정밀도로 쓴 값이라 Date.parse로 정확히 ms가 된다
      const createdAtMs = Date.parse(data.created_at);
      if (!Number.isFinite(createdAtMs)) throw new Error('created_at을 읽을 수 없다');
      if (!Number.isInteger(data.seed) || !Number.isInteger(data.rules_version)) {
        throw new Error('runs 행의 seed·rules_version이 정수가 아니다');
      }
      return {
        id: data.id,
        seed: data.seed,
        rulesVersion: data.rules_version,
        weekKey: data.week_key,
        createdAtMs,
        submissionHash: data.submission_hash,
        result: data.result,
      };
    },

    async commit({ runId, userId, hash, verdict, submittedAtMs }) {
      const { data, error } = await admin
        .rpc('commit_submission', {
          p_run: runId,
          p_user: userId,
          p_hash: hash,
          p_result: verdict,
          p_submitted_at: new Date(submittedAtMs).toISOString(),
        })
        .single<CommitRow>();
      if (error) throw error;
      switch (data.out_status) {
        case 'not-found':
          return { status: 'not-found' };
        case 'existing':
        case 'committed':
          if (typeof data.out_hash !== 'string') throw new Error('DB 함수가 해시 없이 응답했다');
          return { status: data.out_status, hash: data.out_hash, result: data.out_result };
        default:
          throw new Error('DB 함수의 알 수 없는 상태');
      }
    },

    ...(options.reportError ? { reportError: options.reportError } : {}),
  };
}
