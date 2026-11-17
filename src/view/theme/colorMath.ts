// 색 계산 순수 함수 (테마 색 대비 검사·블록 그리기에 쓴다). Phaser·DOM 없음.

/** 색(0xRRGGBB)에 다른 색을 amount(0~1)만큼 섞는다. 채널마다 반올림한다. amount는 0~1로 자른다 */
export function mixColor(color: number, target: number, amount: number): number {
  const t = Math.min(Math.max(amount, 0), 1);
  const channel = (shift: number): number => {
    const from = (color >> shift) & 0xff;
    const to = (target >> shift) & 0xff;
    return Math.round(from + (to - from) * t);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** 색의 각 채널에 factor를 곱한다 (0~255로 자른다). 시안의 shade와 같다 */
export function shadeColor(color: number, factor: number): number {
  const channel = (shift: number): number =>
    Math.min(255, Math.max(0, Math.round(((color >> shift) & 0xff) * factor)));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

const linear = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG 상대 휘도 (0~1) */
export function luminance(color: number): number {
  return (
    0.2126 * linear((color >> 16) & 0xff) +
    0.7152 * linear((color >> 8) & 0xff) +
    0.0722 * linear(color & 0xff)
  );
}

/** WCAG 대비 비율 (1~21) */
export function contrastRatio(a: number, b: number): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** sRGB → CIE Lab (D65) */
function lab(color: number): [number, number, number] {
  const r = linear((color >> 16) & 0xff);
  const g = linear((color >> 8) & 0xff);
  const b = linear(color & 0xff);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** 두 색의 CIE76 색 차이. 값이 클수록 구분이 잘 된다 (대략 10 이하면 비슷하게 보인다) */
export function colorDistance(a: number, b: number): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
