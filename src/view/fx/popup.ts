// 줄 제거 팝업 문구 (PLAN 6.4). Phaser 없는 순수 함수.

export interface PopupKind {
  readonly text: string;
  /** 줄 수 문구(line)와 콤보 문구(combo)는 크기·색이 다르다 */
  readonly kind: 'line' | 'combo';
}

/**
 * 한 배치의 팝업. 줄 수 2 "더블!", 3 "트리플!", 4 이상 "대단해!", 콤보 2 이상 "콤보 x{n}!".
 * 둘 다 해당하면 줄 수 문구가 먼저, 콤보 문구가 그다음이다 (화면에는 위에서 아래로 쌓인다).
 * 줄을 지우지 않았으면(lines < 1) 콤보가 유지되고 있어도 아무것도 없다.
 */
export function popupTexts({ lines, combo }: { lines: number; combo: number }): PopupKind[] {
  const out: PopupKind[] = [];
  if (!Number.isFinite(lines) || lines < 1) return out;
  const count = Math.floor(lines);
  if (count === 2) out.push({ text: '더블!', kind: 'line' });
  else if (count === 3) out.push({ text: '트리플!', kind: 'line' });
  else if (count >= 4) out.push({ text: '대단해!', kind: 'line' });
  if (Number.isFinite(combo) && combo >= 2) {
    out.push({ text: `콤보 x${Math.floor(combo)}!`, kind: 'combo' });
  }
  return out;
}
