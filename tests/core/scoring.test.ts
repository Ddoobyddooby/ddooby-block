import { describe, expect, it, vi } from 'vitest';
import { comboMultiplier, lineScore, nextCombo, placementScore } from '../../src/core/scoring';

// 기대값은 PLAN 4.6의 수치(100·300·600, 1000 + 500씩, 배율 0.5씩, 보드 비움 3000)로 손으로 계산한다.

describe('lineScore', () => {
  it('0~6줄 = 0, 100, 300, 600, 1000, 1500, 2000 (TASKS)', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(lineScore)).toEqual([0, 100, 300, 600, 1000, 1500, 2000]);
  });

  it('8줄 = 3000, 음수는 0', () => {
    expect(lineScore(8)).toBe(3000);
    expect(lineScore(-1)).toBe(0);
  });
});

describe('comboMultiplier', () => {
  it('1 → 1, 2 → 1.5, 3 → 2, 4 → 2.5', () => {
    expect([1, 2, 3, 4].map(comboMultiplier)).toEqual([1, 1.5, 2, 2.5]);
  });
});

describe('placementScore', () => {
  it('3칸으로 1줄, 콤보 1 = 103 (TASKS)', () => {
    expect(placementScore({ cells: 3, lines: 1, combo: 1, boardCleared: false })).toBe(103);
  });

  it('콤보 2에서 2줄 = 칸 수 + 450 (TASKS)', () => {
    expect(placementScore({ cells: 4, lines: 2, combo: 2, boardCleared: false })).toBe(454);
  });

  it('콤보 2에서 1줄 = 칸 수 + 150, 콤보 4에서 1줄 = 칸 수 + 250', () => {
    expect(placementScore({ cells: 3, lines: 1, combo: 2, boardCleared: false })).toBe(153);
    expect(placementScore({ cells: 3, lines: 1, combo: 4, boardCleared: false })).toBe(253);
  });

  it('줄을 지우지 않으면 칸 수만 (콤보가 높아도)', () => {
    expect(placementScore({ cells: 3, lines: 0, combo: 0, boardCleared: false })).toBe(3);
    expect(placementScore({ cells: 5, lines: 0, combo: 6, boardCleared: false })).toBe(5);
  });

  it('보드 전체 비움 = +3000이고 배율이 없다 (TASKS)', () => {
    expect(placementScore({ cells: 1, lines: 1, combo: 1, boardCleared: true })).toBe(3101);
    // 콤보 4: 줄 점수만 ×2.5(250)이고 보너스는 3000 그대로
    expect(placementScore({ cells: 1, lines: 1, combo: 4, boardCleared: true })).toBe(3251);
  });

  it('결과는 항상 정수 (배율 곱이 소수가 되는 값에서도 버림)', async () => {
    // 실제 수치로는 100 × 1.5처럼 늘 정수라서 floor가 필요한 경우가 없다. 배율 단계를 0.15로 바꾼 설정으로 확인한다
    // (1 + 0.15 = 1.15, 100 × 1.15 = 114.99999999999999 → 114)
    vi.resetModules();
    vi.doMock('../../src/config', async (importOriginal) => {
      const original = await importOriginal<typeof import('../../src/config')>();
      return { ...original, COMBO: { graceMisses: 2, step: 0.15 } };
    });
    try {
      const mod = await import('../../src/core/scoring');
      const result = mod.placementScore({ cells: 3, lines: 1, combo: 2, boardCleared: false });
      expect(result).toBe(117);
      expect(Number.isInteger(result)).toBe(true);
    } finally {
      vi.doUnmock('../../src/config');
      vi.resetModules();
    }
  });
});

describe('nextCombo', () => {
  const start = { combo: 0, missStreak: 0 };

  it('줄을 지울 때마다 콤보가 1씩 늘고 missStreak는 0', () => {
    const first = nextCombo(start, true);
    expect(first).toEqual({ combo: 1, missStreak: 0 });
    expect(nextCombo(first, true)).toEqual({ combo: 2, missStreak: 0 });
  });

  it('지움 → 못 지움 ×2 → 지움 = 콤보 2 (TASKS)', () => {
    let s = nextCombo(start, true);
    s = nextCombo(s, false);
    expect(s).toEqual({ combo: 1, missStreak: 1 });
    s = nextCombo(s, false);
    expect(s).toEqual({ combo: 1, missStreak: 2 });
    s = nextCombo(s, true);
    expect(s).toEqual({ combo: 2, missStreak: 0 });
  });

  it('지움 → 못 지움 ×3 → 콤보 0, 다음 지움은 콤보 1 (TASKS, SPEC 11절 5번)', () => {
    let s = nextCombo(start, true);
    s = nextCombo(s, false);
    s = nextCombo(s, false);
    s = nextCombo(s, false);
    expect(s).toEqual({ combo: 0, missStreak: 0 });
    expect(nextCombo(s, true)).toEqual({ combo: 1, missStreak: 0 });
  });

  it('콤보 0에서 못 지움이 이어져도 콤보는 0이고 missStreak는 2를 넘지 않는다', () => {
    let s = start;
    const seen: number[] = [];
    for (let i = 0; i < 9; i++) {
      s = nextCombo(s, false);
      expect(s.combo).toBe(0);
      seen.push(s.missStreak);
    }
    // 1, 2, 0(넘어서 초기화)을 되풀이한다
    expect(seen).toEqual([1, 2, 0, 1, 2, 0, 1, 2, 0]);
  });

  it('못 지움 2번 뒤 지우면 missStreak 0', () => {
    let s = nextCombo(start, false);
    s = nextCombo(s, false);
    expect(s.missStreak).toBe(2);
    expect(nextCombo(s, true)).toEqual({ combo: 1, missStreak: 0 });
  });

  it('입력을 바꾸지 않는다', () => {
    const input = Object.freeze({ combo: 3, missStreak: 2 });
    expect(nextCombo(input, false)).toEqual({ combo: 0, missStreak: 0 });
    expect(input).toEqual({ combo: 3, missStreak: 2 });
  });
});
