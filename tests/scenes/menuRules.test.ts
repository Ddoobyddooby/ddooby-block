import { describe, expect, it } from 'vitest';
import { GAME, VIEW } from '../../src/config';
import { menuButtons, menuButtonYs, logoBottomY } from '../../src/scenes/menuRules';
import { THEME_IDS } from '../../src/themeIds';
import { THEMES as themes } from '../../src/view/theme/themes';

describe('menuButtons', () => {
  it('저장된 판이 없으면 [새 게임] 아래에 [주간 랭킹]', () => {
    expect(menuButtons(false)).toEqual(['new', 'ranking']);
  });
  it('저장된 판이 있으면 [이어하기]가 [새 게임] 위에, [주간 랭킹]은 아래에', () => {
    expect(menuButtons(true)).toEqual(['resume', 'new', 'ranking']);
  });
});

describe('메뉴 버튼 위치 (이어하기가 로고와 겹치지 않는다)', () => {
  const H = GAME.height; // 1280 (더 긴 화면은 height가 커져 비율 위치도 내려간다)
  const { menu } = VIEW;

  it('버튼 3개(이어하기 없음): 맨 위가 buttonY, 148px씩 내려간다', () => {
    const ys = menuButtonYs(3, H, menu);
    expect(ys[0]).toBeCloseTo(H * menu.buttonY);
    expect(ys[1]! - ys[0]!).toBe(menu.buttonStep);
    expect(ys).toHaveLength(3);
  });

  it('버튼 4개(이어하기 있음): [이어하기]가 3개일 때 [새 게임] 자리에서 시작하고 [새 게임]은 한 칸 아래', () => {
    const three = menuButtonYs(3, H, menu);
    const four = menuButtonYs(4, H, menu);
    expect(four[0]).toBe(three[0]);
    expect(four[1]).toBe(three[1]);
    expect(four).toHaveLength(4);
  });

  it.each(THEME_IDS)(
    '%s: 4개일 때 맨 위 버튼 윗변이 로고 아래, 맨 아래 버튼 아랫변이 화면 안',
    (id) => {
      const four = menuButtonYs(4, H, menu);
      const logoBottom = logoBottomY(H * menu.titleY, themes[id].logo.size);
      expect(four[0]! - menu.buttonH / 2).toBeGreaterThan(logoBottom);
      expect(four[3]! + menu.buttonH / 2).toBeLessThan(H);
    },
  );
});
