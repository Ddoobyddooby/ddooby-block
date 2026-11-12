import type { Board } from '../../src/core/types';

/** `boardFrom`이 `#` 칸에 넣는 색 그룹. 0이라서 "0은 빈 칸이 아니다"도 같이 검증된다 */
export const FILLED = 0;

/**
 * 문자열로 보드를 만든다 (PLAN 8절). `#` = 채운 칸(색 `FILLED`), `.` = 빈 칸, 줄은 `\n`.
 * 여러 줄 템플릿 문자열로 쓸 수 있게 각 줄의 앞뒤 공백과 빈 줄은 무시한다.
 * 정사각형이 아니거나 `#`·`.` 외의 글자가 있으면 테스트 작성 실수이므로 예외를 던진다.
 */
export function boardFrom(text: string): Board {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const size = lines.length;
  if (size === 0) throw new Error('boardFrom: 빈 문자열');

  const cells: (number | null)[] = [];
  lines.forEach((line, r) => {
    if (line.length !== size) {
      throw new Error(`boardFrom: ${r}번 줄 길이 ${line.length}, 줄 수 ${size} (정사각형이 아님)`);
    }
    for (const ch of line) {
      if (ch === '#') cells.push(FILLED);
      else if (ch === '.') cells.push(null);
      else throw new Error(`boardFrom: ${r}번 줄에 알 수 없는 글자 '${ch}'`);
    }
  });
  return { size, cells };
}
