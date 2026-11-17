// run 발급·점수 제출 (PLAN 7절). Edge Function start-run·submit-score를 부른다.
// 게임을 막지 않는다: 어떤 실패도 throw하지 않고 null·{kind:'failed'}로 돌려준다 (SPEC 8절).
// ddooby-pang src/online/runs.ts에서 복사해 다음을 바꿨다:
// - 규칙 버전은 RULES_VERSION(int), 요청·응답 필드는 camelCase, seed는 uint32 숫자
// - startRun의 2.5초는 **계정 준비 + 함수 호출 전체**의 제한이다. 지난 뒤에는 새 호출을 시작하지 않고, 늦게 온 응답은 쓰지 않는다
// - 기다리는 사이 계정이 바뀌었으면(로그아웃·다른 계정) 그 응답은 지금 계정의 것이 아니다 (W3-02 방식)
// - 응답은 모양을 엄격히 확인한다: 어떤 200도 무조건 성공으로 치지 않는다
import type { Placement } from '../core/types';
import { isUuid } from '../replay/judge';
import type { Account } from './account';

/** 새 판을 시작하기 전에 run을 기다리는 최대 시간. 넘으면 오프라인 판으로 바로 시작한다 */
export const START_RUN_TIMEOUT_MS = 2500;
/** 점수 제출을 기다리는 최대 시간. 넘으면 failed (서버가 이미 확정했을 수도 있다: 같은 내용 재제출은 멱등이다) */
export const SUBMIT_TIMEOUT_MS = 10_000;

const SEED_MAX = 0xffffffff;

export interface StartedRun {
  runId: string;
  /** 서버가 발급한 seed (0~4294967295 정수) */
  seed: number;
}

export interface SubmitPayload {
  seed: number;
  version: number;
  clientScore: number;
  placements: readonly Placement[];
}

/**
 * - ok: 등록됨. best는 그 주 최고 점수, weekKey는 run을 발급한 주 (며칠 지난 판이면 지금 주와 다르다). userId는 제출한 계정
 * - rejected: 서버가 내용을 거부했다 (code는 서버의 판정 코드 또는 not-found)
 * - outdated: 규칙 버전이 서버와 다르다 → 새로고침 안내
 * - failed: 키 없음·계정 없음·계정이 바뀜·네트워크·인증·5xx·시간 초과·손상된 응답
 */
export type SubmitOutcome =
  | { kind: 'ok'; score: number; best: number; weekKey: string; isNewBest: boolean; userId: string }
  | { kind: 'rejected'; code: string }
  | { kind: 'outdated' }
  | { kind: 'failed' };

export interface RunsDeps {
  /** 클라이언트의 RULES_VERSION */
  version: number;
  isOnline(): boolean;
  startTimeoutMs?: number;
  submitTimeoutMs?: number;
}

export interface Runs {
  /** 키 없음·오프라인·계정 없음·오류·시간 초과·손상된 응답이면 null (그 판은 랭킹 대상이 아니다) */
  startRun(): Promise<StartedRun | null>;
  submitScore(runId: string, payload: SubmitPayload): Promise<SubmitOutcome>;
}

/**
 * ms 안에 끝나지 않거나 throw하면 fallback. 일은 `live()`가 true인 동안에만 다음 단계를 시작한다
 * (시간이 지난 뒤 계정 준비가 끝나도 새 서버 호출을 하지 않게)
 */
export function within<T>(
  ms: number,
  fallback: T,
  work: (live: () => boolean) => Promise<T>,
): Promise<T> {
  return new Promise((resolve) => {
    let over = false;
    const timer = setTimeout(() => {
      over = true;
      resolve(fallback);
    }, ms);
    work(() => !over).then(
      (value) => {
        clearTimeout(timer);
        resolve(over ? fallback : value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

const objectOf = (body: unknown): Record<string, unknown> =>
  typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};

const isCount = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

export function createRuns(account: Account, deps: RunsDeps): Runs {
  const startTimeoutMs = deps.startTimeoutMs ?? START_RUN_TIMEOUT_MS;
  const submitTimeoutMs = deps.submitTimeoutMs ?? SUBMIT_TIMEOUT_MS;

  return {
    async startRun() {
      if (account.status() === 'disabled' || !deps.isOnline()) return null;
      return within<StartedRun | null>(startTimeoutMs, null, async (live) => {
        // 계정이 아직이면(부팅 직후 등) 익명 로그인까지 이 시간 안에 끝내야 한다
        await account.ensure();
        if (!live()) return null;
        const backend = account.backend();
        const userId = account.userId();
        if (!backend || !userId) return null;
        const res = await backend.callFunction('start-run', { version: deps.version });
        // 기다리는 사이 계정이 바뀌었으면 이 run은 지금 계정의 것이 아니다
        if (account.userId() !== userId) return null;
        if (res === 'network' || res.status !== 200) return null;
        const { runId, seed } = objectOf(res.body);
        if (!isUuid(runId)) return null;
        if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > SEED_MAX) {
          return null;
        }
        return { runId, seed };
      });
    },

    async submitScore(runId, payload) {
      const failed: SubmitOutcome = { kind: 'failed' };
      return within<SubmitOutcome>(submitTimeoutMs, failed, async (live) => {
        await account.ensure();
        if (!live()) return failed;
        const backend = account.backend();
        const userId = account.userId();
        if (!backend || !userId) return failed;
        const res = await backend.callFunction('submit-score', {
          runId,
          seed: payload.seed,
          version: payload.version,
          clientScore: payload.clientScore,
          placements: payload.placements,
        });
        if (res === 'network') return failed;
        // 기다리는 사이 계정이 바뀌었으면(로그아웃·다른 계정) 이 응답은 지금 계정의 결과가 아니다
        if (account.userId() !== userId) return failed;
        const body = objectOf(res.body);
        const code = typeof body.code === 'string' ? body.code : null;
        switch (res.status) {
          case 200: {
            const { score, best, weekKey, isNewBest } = body;
            return body.ok === true &&
              isCount(score) &&
              isCount(best) &&
              typeof weekKey === 'string' &&
              /^\d{4}-W\d{2}$/.test(weekKey) &&
              typeof isNewBest === 'boolean'
              ? { kind: 'ok', score, best, weekKey, isNewBest, userId }
              : failed;
          }
          case 409:
            if (code === 'version-mismatch') return { kind: 'outdated' };
            return code ? { kind: 'rejected', code } : failed;
          case 400:
          case 404:
          case 413:
            return { kind: 'rejected', code: code ?? `http-${res.status}` };
          default:
            // 401(세션 문제)·5xx·게이트웨이 오류
            return failed;
        }
      });
    },
  };
}
