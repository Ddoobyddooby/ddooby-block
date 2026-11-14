/** 0xRRGGBB → Phaser Text가 받는 `#rrggbb` */
export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
