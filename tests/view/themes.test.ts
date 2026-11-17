import { describe, expect, it } from 'vitest';
import { PIECES } from '../../src/core/pieces';
import { DEFAULT_THEME, isThemeId, parseThemeId, THEME_IDS } from '../../src/themeIds';
import { colorDistance, contrastRatio } from '../../src/view/theme/colorMath';
import { devTheme, getTheme, THEME_LIST, THEMES } from '../../src/view/theme/themes';

/** 객체의 모양(키 구조)만 뽑는다: 값은 버리고 키와 배열 길이·값의 종류만 남긴다 */
function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape);
  // 없을 수도 있는 값(stroke·shadow)은 있는 쪽과 같은 칸으로 본다
  if (value === null) return 'nullable';
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, shape(v)]),
    );
  }
  return typeof value;
}

describe('테마 ID', () => {
  it('세 테마(버터·오비트·소다)만 있고 기본은 소다 가든이다', () => {
    expect([...THEME_IDS]).toEqual(['butter', 'orbit', 'soda']);
    expect(DEFAULT_THEME).toBe('soda');
    expect(Object.keys(THEMES).sort()).toEqual([...THEME_IDS].sort());
    expect(THEME_LIST.map((t) => t.id)).toEqual([...THEME_IDS]);
  });

  it('isThemeId·parseThemeId: 모르는 값은 기본 테마', () => {
    expect(isThemeId('orbit')).toBe(true);
    expect(isThemeId('navy')).toBe(false);
    expect(isThemeId(null)).toBe(false);
    expect(parseThemeId('butter')).toBe('butter');
    expect(parseThemeId('navy')).toBe('soda');
    expect(parseThemeId(undefined)).toBe('soda');
    expect(parseThemeId(3)).toBe('soda');
  });
});

describe('개발 주소 ?theme=<id>', () => {
  it('DEV에서만 읽고, 모르는 값·없는 값은 null이다', () => {
    expect(devTheme('?theme=orbit', true)).toBe('orbit');
    expect(devTheme('?seed=3&theme=butter', true)).toBe('butter');
    expect(devTheme('?theme=navy', true)).toBeNull();
    expect(devTheme('?theme=', true)).toBeNull();
    expect(devTheme('?seed=3', true)).toBeNull();
    expect(devTheme('', true)).toBeNull();
    // 프로덕션 빌드에서는 항상 무시한다
    expect(devTheme('?theme=orbit', false)).toBeNull();
  });
});

describe('테마 정의 완전성', () => {
  it('세 테마가 같은 키를 모두 가진다 (색 토큰·블록 수치·글꼴·로고…)', () => {
    const drop = (o: object, keys: string[]): object =>
      Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
    const [first, ...rest] = THEME_LIST;
    for (const theme of rest) {
      // deco는 종류마다 키가 달라서, buttonRadius는 숫자 또는 'pill'이라서 따로 본다
      expect(shape(drop(theme, ['deco', 'buttonRadius', 'block', 'logo']))).toEqual(
        shape(drop(first!, ['deco', 'buttonRadius', 'block', 'logo'])),
      );
      // block.stroke·logo.shadow는 테마에 따라 값이 없다(null). 나머지 키는 같아야 한다
      expect(shape(drop(theme.block, ['stroke']))).toEqual(shape(drop(first!.block, ['stroke'])));
      expect(shape(drop(theme.logo, ['shadow']))).toEqual(shape(drop(first!.logo, ['shadow'])));
    }
    for (const theme of THEME_LIST) {
      expect(theme.buttonRadius === 'pill' || theme.buttonRadius > 0).toBe(true);
      expect(['butter', 'orbit', 'soda']).toContain(theme.deco.kind);
      // 배경 장식 종류는 테마 ID와 같다 (butter는 butter 장식…)
      expect(theme.deco.kind).toBe(theme.id);
    }
  });

  it('테마마다 id가 키와 같고 이름·색 토큰이 비어 있지 않다', () => {
    for (const id of THEME_IDS) {
      const theme = getTheme(id);
      expect(theme.id).toBe(id);
      expect(theme.name.length).toBeGreaterThan(0);
      expect(theme.colors.lineAlpha).toBeGreaterThan(0);
      expect(theme.colors.lineAlpha).toBeLessThan(1);
      for (const [key, value] of Object.entries(theme.colors)) {
        if (key === 'lineAlpha') continue;
        if (Array.isArray(value)) {
          for (const c of value) expect(Number.isInteger(c) && c >= 0 && c <= 0xffffff).toBe(true);
        } else {
          expect(Number.isInteger(value), `${id}.colors.${key}`).toBe(true);
          expect(value as number).toBeGreaterThanOrEqual(0);
          expect(value as number).toBeLessThanOrEqual(0xffffff);
        }
      }
    }
    expect(new Set(THEME_LIST.map((t) => t.name)).size).toBe(3);
  });

  it('블록 색은 조각의 색 그룹 수(7)만큼 있고 테마 안에서 서로 다르다', () => {
    const groups = new Set(PIECES.map((p) => p.color));
    for (const theme of THEME_LIST) {
      expect(theme.colors.blocks).toHaveLength(groups.size);
      expect(new Set(theme.colors.blocks).size).toBe(groups.size);
    }
  });

  it('글꼴·블록 수치가 쓸 수 있는 범위에 있다', () => {
    for (const { block, fonts, ghost } of THEME_LIST) {
      expect(block.radius).toBeGreaterThan(0);
      expect(block.radius).toBeLessThanOrEqual(0.29); // README: 소다 기준 0.29칸 이내
      expect(block.depth).toBeGreaterThan(0);
      expect(block.depth).toBeLessThan(0.2);
      expect(block.bottomMul).toBeLessThan(1);
      expect(ghost.fillAlpha).toBeGreaterThan(0);
      expect(ghost.fillAlpha).toBeLessThanOrEqual(1);
      expect(ghost.alpha).toBeGreaterThan(0);
      expect(ghost.alpha).toBeLessThanOrEqual(1);
      for (const w of [fonts.titleWeight, fonts.uiWeight, fonts.uiBoldWeight, fonts.numberWeight]) {
        expect(w).toBeGreaterThanOrEqual(100);
        expect(w).toBeLessThanOrEqual(900);
      }
      expect(fonts.uiBoldWeight).toBeGreaterThanOrEqual(fonts.uiWeight);
    }
  });
});

/*
 * 색 대비 검사. 기준(WCAG 대비 비율 / CIE76 색 차이):
 *   - 기본 글자(ink): 배경·패널·내 줄 바탕 위에서 4.5 이상
 *   - 보조 글자(muted): 배경·패널 위에서 4.5 이상 (시안 값은 4.78~)
 *   - 주 버튼 글자: 주 버튼 위에서 4.5 이상
 *   - 콤보 글자·순위 숫자·오류 글자: 놓이는 바탕 위에서 3 이상 (큰/굵은 글자)
 *   - 블록 7색끼리: 색 차이 20 이상
 *   - 블록 대 빈 칸: 색 차이 20 이상 (밝기 대비가 낮은 버터의 노랑도 색상이 달라 구분된다)
 *   - 빈 칸 대 보드: 색 차이 4 이상 + 대비 1.1 이상. 시안 색이 원래 낮다: 가장 낮은 것은 오비트 (색 차이 4.4, 대비 1.14).
 *     칸 사이 틈과 모서리로 격자가 보이게 한 의도지만 어두운 화면 밝기에서는 실기기 확인이 필요하다. 시안 색은 바꾸지 않았다.
 */
describe('색 대비 (시안 색을 그대로 두고 측정)', () => {
  for (const theme of THEME_LIST) {
    const c = theme.colors;
    describe(theme.id, () => {
      it('기본·보조 글자가 배경·패널 위에서 읽힌다', () => {
        expect(contrastRatio(c.ink, c.background)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(c.ink, c.panel)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(c.ink, c.meFill)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(c.muted, c.background)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(c.muted, c.panel)).toBeGreaterThanOrEqual(4.5);
      });

      it('주 버튼 글자·콤보·순위 숫자·오류 글자가 바탕 위에서 읽힌다', () => {
        expect(contrastRatio(c.accentText, c.accent)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(c.combo, c.background)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(c.combo, c.panel)).toBeGreaterThanOrEqual(3);
        for (const medal of c.medal)
          expect(contrastRatio(medal, c.panel)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(c.error, c.panel)).toBeGreaterThanOrEqual(4.5);
      });

      it('블록 7색이 서로 구분되고 빈 칸과도 구분된다', () => {
        for (let i = 0; i < 7; i++) {
          expect(colorDistance(c.blocks[i]!, c.empty)).toBeGreaterThanOrEqual(20);
          for (let j = i + 1; j < 7; j++) {
            expect(
              colorDistance(c.blocks[i]!, c.blocks[j]!),
              `블록 ${i}-${j}`,
            ).toBeGreaterThanOrEqual(20);
          }
        }
      });

      it('빈 칸이 보드 받침과 구분된다 (낮은 값이 시안 그대로 나옴: 위 주석)', () => {
        expect(colorDistance(c.empty, c.board)).toBeGreaterThanOrEqual(4);
        expect(contrastRatio(c.empty, c.board)).toBeGreaterThanOrEqual(1.1);
      });

      it('보드 받침이 화면 배경과 구분된다', () => {
        expect(colorDistance(c.board, c.background)).toBeGreaterThanOrEqual(8);
      });
    });
  }
});

// 랭킹 1~3위 순위 숫자는 일반 줄(panel)과 내 줄(meFill) 위에 놓인다. 기준 3 이상.
// 측정한 최솟값(WCAG 대비): butter 3.92(1위)·soda 3.64(1위)·orbit 4.11(3위). 낮으면 시안 색은 두고 보고한다.
describe('랭킹 메달 색 대 내 줄 배경 (meFill)', () => {
  const MIN = { butter: 3.9, orbit: 4.1, soda: 3.6 } as const;
  for (const theme of THEME_LIST) {
    it(`${theme.id}: 메달 3색이 panel·meFill 위에서 3 이상이고 기록한 최솟값을 지킨다`, () => {
      const { medal, meFill, panel } = theme.colors;
      const onMe = medal.map((m) => contrastRatio(m, meFill));
      for (const ratio of [...onMe, ...medal.map((m) => contrastRatio(m, panel))]) {
        expect(ratio).toBeGreaterThanOrEqual(3);
      }
      expect(Math.min(...onMe)).toBeGreaterThanOrEqual(MIN[theme.id]);
    });
  }
});
