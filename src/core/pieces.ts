// 조각 세트 (PLAN 4.2, SPEC 3.2). 회전이 없어서 방향마다 별도 조각이다.

import type { PieceDef, PieceId, Pos } from './types';

/** 모양 문자열(`#` = 칸, `.` = 빈칸, 줄은 `/`)을 칸 좌표로 바꾼다. 순서는 위→아래, 왼→오 */
function parseShape(shape: string): readonly Pos[] {
  const cells: Pos[] = [];
  shape.split('/').forEach((line, r) => {
    [...line].forEach((ch, c) => {
      if (ch === '#') cells.push(Object.freeze({ r, c }));
    });
  });
  return Object.freeze(cells);
}

function def(id: PieceId, color: number, shape: string): PieceDef {
  return Object.freeze({ id, cells: parseShape(shape), color });
}

/**
 * 29종. 모든 모양은 bounding box가 (0,0)에서 시작하고, 색 그룹은 그룹마다 고정이다 (SPEC 3.1).
 * 배열 순서는 PLAN 4.2 표 순서로 고정한다. 순서는 가중치 추첨 결과에 영향을 주므로
 * 순서를 바꾸거나 조각을 넣고 빼면 RULES_VERSION을 올린다.
 * 실행 중에 바뀌지 않도록 배열·조각·cells·칸을 모두 얼린다.
 */
export const PIECES: readonly PieceDef[] = Object.freeze([
  // 점 (0)
  def('dot', 0, '#'),
  // 직선 (1): h = 가로 한 줄, v = 세로 한 줄
  def('i2h', 1, '##'),
  def('i2v', 1, '#/#'),
  def('i3h', 1, '###'),
  def('i3v', 1, '#/#/#'),
  def('i4h', 1, '####'),
  def('i4v', 1, '#/#/#/#'),
  def('i5h', 1, '#####'),
  def('i5v', 1, '#/#/#/#/#'),
  // 사각형 (2): r2x3 = 2행 3열, r3x2 = 3행 2열
  def('o2', 2, '##/##'),
  def('r2x3', 2, '###/###'),
  def('r3x2', 2, '##/##/##'),
  def('o3', 2, '###/###/###'),
  // L 소형 (3)
  def('l3a', 3, '#./##'),
  def('l3b', 3, '.#/##'),
  def('l3c', 3, '##/#.'),
  def('l3d', 3, '##/.#'),
  // L 대형 (4)
  def('l5a', 4, '#../#../###'),
  def('l5b', 4, '..#/..#/###'),
  def('l5c', 4, '###/#../#..'),
  def('l5d', 4, '###/..#/..#'),
  // T (5)
  def('tu', 5, '.#./###'),
  def('td', 5, '###/.#.'),
  def('tl', 5, '.#/##/.#'),
  def('tr', 5, '#./##/#.'),
  // S/Z (6)
  def('sh', 6, '.##/##.'),
  def('sv', 6, '#./##/.#'),
  def('zh', 6, '##./.##'),
  def('zv', 6, '.#/##/#.'),
]);

const BY_ID: ReadonlyMap<PieceId, PieceDef> = new Map(PIECES.map((piece) => [piece.id, piece]));

/** ID로 조각을 찾는다. 없는 ID면 예외 없이 undefined (저장 데이터·로그가 깨졌을 수 있다) */
export function getPiece(id: PieceId): PieceDef | undefined {
  return BY_ID.get(id);
}
