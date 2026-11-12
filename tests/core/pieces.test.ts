import { describe, expect, it } from 'vitest';
import { PIECE_WEIGHTS } from '../../src/config';
import { getPiece, PIECES } from '../../src/core/pieces';
import type { PieceDef, Pos } from '../../src/core/types';

/**
 * 기대값 표. PLAN 4.2 표와 SPEC 3.2 표를 보고 손으로 적었다 (pieces.ts의 정의 문자열을 가져오지 않는다).
 * 순서 = PIECES 순서. shape: `#` = 칸, `.` = 빈칸, 줄은 `/`.
 */
const EXPECTED: readonly {
  id: string;
  shape: string;
  count: number;
  color: number;
  weight: number;
}[] = [
  // 점 (0)
  { id: 'dot', shape: '#', count: 1, color: 0, weight: 4 },
  // 직선 (1)
  { id: 'i2h', shape: '##', count: 2, color: 1, weight: 6 },
  { id: 'i2v', shape: '#/#', count: 2, color: 1, weight: 6 },
  { id: 'i3h', shape: '###', count: 3, color: 1, weight: 6 },
  { id: 'i3v', shape: '#/#/#', count: 3, color: 1, weight: 6 },
  { id: 'i4h', shape: '####', count: 4, color: 1, weight: 4 },
  { id: 'i4v', shape: '#/#/#/#', count: 4, color: 1, weight: 4 },
  { id: 'i5h', shape: '#####', count: 5, color: 1, weight: 2 },
  { id: 'i5v', shape: '#/#/#/#/#', count: 5, color: 1, weight: 2 },
  // 사각형 (2)
  { id: 'o2', shape: '##/##', count: 4, color: 2, weight: 6 },
  { id: 'r2x3', shape: '###/###', count: 6, color: 2, weight: 3 },
  { id: 'r3x2', shape: '##/##/##', count: 6, color: 2, weight: 3 },
  { id: 'o3', shape: '###/###/###', count: 9, color: 2, weight: 1 },
  // L 소형 (3)
  { id: 'l3a', shape: '#./##', count: 3, color: 3, weight: 5 },
  { id: 'l3b', shape: '.#/##', count: 3, color: 3, weight: 5 },
  { id: 'l3c', shape: '##/#.', count: 3, color: 3, weight: 5 },
  { id: 'l3d', shape: '##/.#', count: 3, color: 3, weight: 5 },
  // L 대형 (4)
  { id: 'l5a', shape: '#../#../###', count: 5, color: 4, weight: 2 },
  { id: 'l5b', shape: '..#/..#/###', count: 5, color: 4, weight: 2 },
  { id: 'l5c', shape: '###/#../#..', count: 5, color: 4, weight: 2 },
  { id: 'l5d', shape: '###/..#/..#', count: 5, color: 4, weight: 2 },
  // T (5)
  { id: 'tu', shape: '.#./###', count: 4, color: 5, weight: 4 },
  { id: 'td', shape: '###/.#.', count: 4, color: 5, weight: 4 },
  { id: 'tl', shape: '.#/##/.#', count: 4, color: 5, weight: 4 },
  { id: 'tr', shape: '#./##/#.', count: 4, color: 5, weight: 4 },
  // S/Z (6)
  { id: 'sh', shape: '.##/##.', count: 4, color: 6, weight: 3 },
  { id: 'sv', shape: '#./##/.#', count: 4, color: 6, weight: 3 },
  { id: 'zh', shape: '##./.##', count: 4, color: 6, weight: 3 },
  { id: 'zv', shape: '.#/##/#.', count: 4, color: 6, weight: 3 },
];

/** cells를 그림 문자열로 다시 그린다. r = 줄, c = 줄 안의 위치 */
function draw(cells: readonly Pos[]): string {
  const height = Math.max(...cells.map((p) => p.r)) + 1;
  const width = Math.max(...cells.map((p) => p.c)) + 1;
  const rows: string[] = [];
  for (let r = 0; r < height; r++) {
    let line = '';
    for (let c = 0; c < width; c++) {
      line += cells.some((p) => p.r === r && p.c === c) ? '#' : '.';
    }
    rows.push(line);
  }
  return rows.join('/');
}

/** 첫 칸에서 상하좌우로 이어서 닿는 칸 수 */
function reachableCount(cells: readonly Pos[]): number {
  const key = (p: Pos) => `${p.r},${p.c}`;
  const all = new Set(cells.map(key));
  const first = cells[0];
  if (first === undefined) return 0;
  const seen = new Set<string>([key(first)]);
  const queue: Pos[] = [first];
  while (queue.length > 0) {
    const p = queue.pop() as Pos;
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const n = { r: p.r + dr, c: p.c + dc };
      if (all.has(key(n)) && !seen.has(key(n))) {
        seen.add(key(n));
        queue.push(n);
      }
    }
  }
  return seen.size;
}

function piece(id: string): PieceDef {
  const found = PIECES.find((p) => p.id === id);
  if (found === undefined) throw new Error(`테스트: 조각 ${id} 없음`);
  return found;
}

describe('core/pieces PIECES', () => {
  it('29개', () => {
    expect(PIECES).toHaveLength(29);
    expect(EXPECTED).toHaveLength(29);
  });

  it('ID 중복 없음', () => {
    expect(new Set(PIECES.map((p) => p.id)).size).toBe(29);
  });

  it('ID 순서가 PLAN 4.2 표 순서와 같다 (가중치 추첨 결과에 영향)', () => {
    expect(PIECES.map((p) => p.id)).toEqual([
      'dot',
      'i2h',
      'i2v',
      'i3h',
      'i3v',
      'i4h',
      'i4v',
      'i5h',
      'i5v',
      'o2',
      'r2x3',
      'r3x2',
      'o3',
      'l3a',
      'l3b',
      'l3c',
      'l3d',
      'l5a',
      'l5b',
      'l5c',
      'l5d',
      'tu',
      'td',
      'tl',
      'tr',
      'sh',
      'sv',
      'zh',
      'zv',
    ]);
  });

  it.each(EXPECTED)('$id: 칸 수 $count', ({ id, count }) => {
    expect(piece(id).cells).toHaveLength(count);
  });

  it('그룹별 칸 수가 SPEC 3.2 표와 같다', () => {
    const counts = (color: number) =>
      PIECES.filter((p) => p.color === color).map((p) => p.cells.length);
    expect(counts(0)).toEqual([1]); // 점
    expect(counts(1)).toEqual([2, 2, 3, 3, 4, 4, 5, 5]); // 직선 2~5, 가로·세로
    expect(counts(2)).toEqual([4, 6, 6, 9]); // 2x2, 2x3, 3x2, 3x3
    expect(counts(3)).toEqual([3, 3, 3, 3]); // L 소형 4방향
    expect(counts(4)).toEqual([5, 5, 5, 5]); // L 대형 4방향
    expect(counts(5)).toEqual([4, 4, 4, 4]); // T 4방향
    expect(counts(6)).toEqual([4, 4, 4, 4]); // S/Z
  });

  it.each(EXPECTED)('$id: 모양 $shape', ({ id, shape }) => {
    expect(draw(piece(id).cells)).toBe(shape);
  });

  it('cells 좌표를 직접 대조 (r = 줄, c = 칸. 순서는 위→아래, 왼→오)', () => {
    expect(piece('i3h').cells).toEqual([
      { r: 0, c: 0 },
      { r: 0, c: 1 },
      { r: 0, c: 2 },
    ]);
    expect(piece('i3v').cells).toEqual([
      { r: 0, c: 0 },
      { r: 1, c: 0 },
      { r: 2, c: 0 },
    ]);
    // #./##
    expect(piece('l3a').cells).toEqual([
      { r: 0, c: 0 },
      { r: 1, c: 0 },
      { r: 1, c: 1 },
    ]);
    // ###/###  (2행 3열)
    expect(piece('r2x3').cells).toEqual([
      { r: 0, c: 0 },
      { r: 0, c: 1 },
      { r: 0, c: 2 },
      { r: 1, c: 0 },
      { r: 1, c: 1 },
      { r: 1, c: 2 },
    ]);
    // ..#/..#/###
    expect(piece('l5b').cells).toEqual([
      { r: 0, c: 2 },
      { r: 1, c: 2 },
      { r: 2, c: 0 },
      { r: 2, c: 1 },
      { r: 2, c: 2 },
    ]);
    // .#/##/.#
    expect(piece('tl').cells).toEqual([
      { r: 0, c: 1 },
      { r: 1, c: 0 },
      { r: 1, c: 1 },
      { r: 2, c: 1 },
    ]);
    // .##/##.
    expect(piece('sh').cells).toEqual([
      { r: 0, c: 1 },
      { r: 0, c: 2 },
      { r: 1, c: 0 },
      { r: 1, c: 1 },
    ]);
  });

  it('모든 모양의 최소 r = 0, 최소 c = 0', () => {
    for (const p of PIECES) {
      expect(Math.min(...p.cells.map((cell) => cell.r)), p.id).toBe(0);
      expect(Math.min(...p.cells.map((cell) => cell.c)), p.id).toBe(0);
    }
  });

  it('좌표는 0 이상의 정수이고 한 조각 안에 같은 칸이 없다', () => {
    for (const p of PIECES) {
      for (const cell of p.cells) {
        expect(Number.isInteger(cell.r) && cell.r >= 0, p.id).toBe(true);
        expect(Number.isInteger(cell.c) && cell.c >= 0, p.id).toBe(true);
      }
      expect(new Set(p.cells.map((cell) => `${cell.r},${cell.c}`)).size, p.id).toBe(p.cells.length);
    }
  });

  it('칸들이 상하좌우로 이어져 있다', () => {
    for (const p of PIECES) {
      expect(reachableCount(p.cells), p.id).toBe(p.cells.length);
    }
  });

  it.each(EXPECTED)('$id: 색 그룹 $color', ({ id, color }) => {
    expect(piece(id).color).toBe(color);
  });

  it('색 그룹은 0~6 정수이고 7개 그룹이 모두 쓰인다', () => {
    for (const p of PIECES) {
      expect(Number.isInteger(p.color) && p.color >= 0 && p.color <= 6, p.id).toBe(true);
    }
    expect([...new Set(PIECES.map((p) => p.color))]).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('PIECES, 각 조각, cells, 칸이 모두 얼려 있다', () => {
    expect(Object.isFrozen(PIECES)).toBe(true);
    for (const p of PIECES) {
      expect(Object.isFrozen(p), p.id).toBe(true);
      expect(Object.isFrozen(p.cells), p.id).toBe(true);
      expect(
        p.cells.every((cell) => Object.isFrozen(cell)),
        p.id,
      ).toBe(true);
    }
  });
});

describe('core/pieces getPiece', () => {
  it('ID로 PIECES의 그 객체를 돌려준다', () => {
    expect(getPiece('dot')).toBe(PIECES[0]);
    expect(getPiece('zv')).toBe(PIECES[28]);
    for (const p of PIECES) {
      expect(getPiece(p.id)).toBe(p);
    }
  });

  it('없는 ID → undefined (예외 없음)', () => {
    expect(getPiece('nope')).toBeUndefined();
    expect(getPiece('')).toBeUndefined();
    expect(getPiece('DOT')).toBeUndefined();
  });

  it('Object 기본 속성 이름도 조각이 아니다', () => {
    expect(getPiece('constructor')).toBeUndefined();
    expect(getPiece('toString')).toBeUndefined();
    expect(getPiece('__proto__')).toBeUndefined();
  });
});

describe('config PIECE_WEIGHTS', () => {
  it('키가 PIECES ID와 정확히 같다 (순서 포함)', () => {
    expect(Object.keys(PIECE_WEIGHTS)).toEqual(PIECES.map((p) => p.id));
  });

  it('모두 양의 정수', () => {
    for (const [id, weight] of Object.entries(PIECE_WEIGHTS)) {
      expect(Number.isInteger(weight) && weight > 0, id).toBe(true);
    }
  });

  it.each(EXPECTED)('$id: 가중치 $weight', ({ id, weight }) => {
    expect(PIECE_WEIGHTS[id]).toBe(weight);
  });

  it('합계 109', () => {
    // 4 + (6+6)*2 + 4*2 + 2*2 + (6+3+3+1) + 5*4 + 2*4 + 4*4 + 3*4
    expect(Object.values(PIECE_WEIGHTS).reduce((sum, w) => sum + w, 0)).toBe(109);
  });
});
