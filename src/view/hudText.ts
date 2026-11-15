// HUD에 쓰는 글자 (PLAN 6.1). Phaser 없는 순수 함수라 테스트할 수 있다.

/** 점수 표기: 세 자리마다 쉼표 (12345 → "12,345"). 정수가 아니거나 음수면 0으로 본다 */
export function formatScore(score: number): string {
  const n = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 콤보 문구. 콤보가 1 이상일 때만 보이고, 0(끊김)이면 null이라 감춘다 */
export function comboLabel(combo: number): string | null {
  if (!Number.isFinite(combo) || combo < 1) return null;
  return `콤보 ${Math.floor(combo)}`;
}
