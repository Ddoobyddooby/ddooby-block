import { describe, expect, it } from 'vitest';
import { FX } from '../../src/config';
import { createGame } from '../../src/core/engine';
import { popupTexts } from '../../src/view/fx/popup';
import { pickShake, shakeFor, type ShakeState } from '../../src/view/fx/shake';
import { unplaceableSlots } from '../../src/view/fx/trayDim';
import { boardFrom } from '../helpers/board';

describe('popupTexts', () => {
  it('줄 1개 + 콤보 1은 아무것도 없다', () => {
    expect(popupTexts({ lines: 1, combo: 1 })).toEqual([]);
  });

  it.each([
    [2, '더블!'],
    [3, '트리플!'],
    [4, '대단해!'],
    [5, '대단해!'],
    [6, '대단해!'],
  ])('줄 %i개 → %s', (lines, text) => {
    expect(popupTexts({ lines, combo: 1 })).toEqual([{ text, kind: 'line' }]);
  });

  it('콤보 2 이상이면 "콤보 x{n}!"', () => {
    expect(popupTexts({ lines: 1, combo: 2 })).toEqual([{ text: '콤보 x2!', kind: 'combo' }]);
    expect(popupTexts({ lines: 1, combo: 12 })).toEqual([{ text: '콤보 x12!', kind: 'combo' }]);
  });

  it('둘 다 해당하면 줄 수 문구가 먼저, 콤보 문구가 나중이다', () => {
    expect(popupTexts({ lines: 3, combo: 4 })).toEqual([
      { text: '트리플!', kind: 'line' },
      { text: '콤보 x4!', kind: 'combo' },
    ]);
  });

  it('줄을 지우지 않았으면 콤보가 있어도 없다', () => {
    expect(popupTexts({ lines: 0, combo: 5 })).toEqual([]);
  });
});

describe('shakeFor', () => {
  const levels = FX.shake.levels;

  it('한 줄이고 콤보 1이면 흔들지 않는다', () => {
    expect(shakeFor(1, 1)).toBeNull();
    expect(shakeFor(1, 0)).toBeNull();
  });

  it('줄이 없으면 흔들지 않는다', () => {
    expect(shakeFor(0, 9)).toBeNull();
  });

  it('단계 = (줄 수 - 1) + (콤보 - 1), 표의 그 번째 값', () => {
    expect(shakeFor(2, 1)).toBe(levels[0]); // 단계 1
    expect(shakeFor(1, 2)).toBe(levels[0]); // 단계 1
    expect(shakeFor(3, 1)).toBe(levels[1]); // 단계 2
    expect(shakeFor(2, 2)).toBe(levels[1]); // 단계 2
    expect(shakeFor(4, 1)).toBe(levels[2]); // 단계 3
    expect(shakeFor(3, 2)).toBe(levels[2]); // 단계 3
    expect(shakeFor(4, 2)).toBe(levels[3]); // 단계 4
  });

  it('표보다 단계가 크면 마지막 값에서 멈춘다', () => {
    expect(shakeFor(8, 9)).toBe(levels[levels.length - 1]);
  });

  it('단계가 오를수록 세기가 커진다', () => {
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]!.intensity).toBeGreaterThan(levels[i - 1]!.intensity);
    }
  });
});

describe('pickShake (ddooby-pang 테스트에서 가져옴)', () => {
  const weak = { duration: 120, intensity: 0.004 };
  const strong = { duration: 200, intensity: 0.008 };

  it.each<
    [string, ShakeState | null, { duration: number; intensity: number }, number, ShakeState | null]
  >([
    ['흔들림 없음 → 새 것', null, weak, 1000, { intensity: 0.004, endAt: 1120 }],
    [
      '약한 것 중 센 것 → 센 것(force)',
      { intensity: 0.004, endAt: 1120 },
      strong,
      1050,
      { intensity: 0.008, endAt: 1250 },
    ],
    ['센 것 중 약한 것 → 무시', { intensity: 0.008, endAt: 1200 }, weak, 1050, null],
    ['같은 세기 중 → 무시', { intensity: 0.004, endAt: 1120 }, weak, 1050, null],
    [
      '센 것이 끝난 뒤 약한 것 → 새 것',
      { intensity: 0.008, endAt: 1200 },
      weak,
      1200,
      { intensity: 0.004, endAt: 1320 },
    ],
    [
      '끝난 지 오래 → 새 것',
      { intensity: 0.01, endAt: 500 },
      weak,
      5000,
      { intensity: 0.004, endAt: 5120 },
    ],
  ])('%s', (_name, current, next, now, expected) => {
    expect(pickShake(current, next, now)).toEqual(expected);
  });
});

describe('unplaceableSlots', () => {
  it('빈 보드에서는 어떤 조각도 흐리지 않는다', () => {
    expect(unplaceableSlots(createGame(1).board, ['o3', 'dot', 'i5h'])).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('빈 칸이 한 줄뿐이면 한 줄짜리 조각만 놓을 수 있다', () => {
    const board = boardFrom(`
      ########
      ########
      ########
      ########
      ########
      ########
      ########
      ###.....
    `);
    // dot, i2h는 놓을 수 있고 o2(2×2), i2v(세로)는 놓을 수 없다
    expect(unplaceableSlots(board, ['dot', 'o2', 'i2v'])).toEqual([false, true, true]);
    expect(unplaceableSlots(board, ['i5h', 'i2h', 'i3h'])).toEqual([false, false, false]);
  });

  it('빈 슬롯은 흐리지 않고 모르는 조각 ID는 놓을 수 없는 것으로 본다', () => {
    const board = boardFrom(`
      ........
      ........
      ........
      ........
      ........
      ........
      ........
      ........
    `);
    expect(unplaceableSlots(board, [null, 'dot', 'nope'])).toEqual([false, false, true]);
  });
});
