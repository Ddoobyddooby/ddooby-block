import { describe, expect, it } from 'vitest';
import { menuButtons } from '../../src/scenes/menuRules';

describe('menuButtons', () => {
  it('저장된 판이 없으면 [새 게임] 아래에 [주간 랭킹]', () => {
    expect(menuButtons(false)).toEqual(['new', 'ranking']);
  });
  it('저장된 판이 있으면 [이어하기]가 [새 게임] 위에, [주간 랭킹]은 아래에', () => {
    expect(menuButtons(true)).toEqual(['resume', 'new', 'ranking']);
  });
});
