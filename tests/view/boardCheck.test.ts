import { describe, expect, it } from 'vitest';
import { diffBoard } from '../../src/view/boardCheck';
import { boardFrom } from '../helpers/board';

const BOARD = boardFrom(`
  #..
  .#.
  ...
`);

describe('diffBoard', () => {
  it('같으면 빈 배열', () => {
    expect(diffBoard([0, null, null, null, 0, null, null, null, null], BOARD)).toEqual([]);
  });

  it('화면에만 있는 칸, core에만 있는 칸을 좌표와 함께 돌려준다', () => {
    // (0,0)이 화면에서 비었고 (2,1)이 화면에만 있다
    expect(diffBoard([null, null, null, null, 0, null, null, 3, null], BOARD)).toEqual([
      { r: 0, c: 0, view: null, core: 0 },
      { r: 2, c: 1, view: 3, core: null },
    ]);
  });

  it('색 그룹이 다르면 다른 칸이다 (0과 null도 구분한다)', () => {
    expect(diffBoard([0, null, null, null, 5, null, null, null, null], BOARD)).toEqual([
      { r: 1, c: 1, view: 5, core: 0 },
    ]);
  });

  it('길이가 다르면 넘치는 칸도 다른 칸으로 센다', () => {
    expect(diffBoard([0, null, null, null, 0, null, null, null], BOARD)).toEqual([
      { r: 2, c: 2, view: undefined, core: null },
    ]);
    expect(diffBoard([0, null, null, null, 0, null, null, null, null, 1], BOARD)).toEqual([
      { r: 3, c: 0, view: 1, core: undefined },
    ]);
  });
});
