import { describe, expect, it, vi } from 'vitest';
import { JUDGE, verifyContent, type Submission } from '../../src/replay/judge';

// 실제 플레이로는 int(2,147,483,647) 점수에 닿기 어려워 리플레이 결과만 바꿔 경계를 본다.
// 상한을 넘는 판은 점수를 자르거나 되감지 않고 거부한다 (DB best_score가 int라서 서버 오류(500)가 나지 않게 미리 막는다).
const state = (score: number) => ({
  ok: true as const,
  state: {
    board: { size: 8, cells: [] },
    tray: [],
    rngState: 0,
    score,
    combo: 0,
    missStreak: 0,
    over: true,
  },
});
const sub = (clientScore: number): Submission => ({
  seed: 1,
  version: 1,
  clientScore,
  placements: [{ trayIndex: 0, row: 0, col: 0, t: 1000 }],
});

describe('verifyContent: 점수 상한', () => {
  it('정확히 int 상한은 통과, +1은 score-overflow (clientScore가 같아도)', async () => {
    for (const [score, expected] of [
      [JUDGE.maxScore, { ok: true, score: JUDGE.maxScore }],
      [JUDGE.maxScore + 1, { ok: false, code: 'score-overflow' }],
    ] as const) {
      vi.resetModules();
      vi.doMock('../../src/core/replay', () => ({
        replay: () => state(score),
        checkIntervals: () => true,
      }));
      const mod = await import('../../src/replay/judge');
      expect(mod.verifyContent(sub(score), { seed: 1 }), String(score)).toEqual(expected);
    }
    vi.doUnmock('../../src/core/replay');
    // 가져온 원본 함수도 같은 상수를 쓴다
    expect(typeof verifyContent).toBe('function');
  });
});
