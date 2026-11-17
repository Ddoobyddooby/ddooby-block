// 요약 통계·텍스트 표·히스토그램 (W4-02). 순수 함수만 둔다.

export interface Summary {
  n: number;
  mean: number;
  median: number;
  stddev: number;
  min: number;
  max: number;
  /** 하위 10% 경계 (선형 보간) */
  p10: number;
  /** 상위 10% 경계 (= 90번째 백분위, 선형 보간) */
  p90: number;
}

/** 정렬된 배열의 q(0~1) 백분위, 선형 보간 */
export function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] ?? NaN;
  const b = sorted[hi] ?? NaN;
  return a + (b - a) * (pos - lo);
}

export function summarize(values: readonly number[]): Summary {
  const n = values.length;
  if (n === 0)
    return { n, mean: NaN, median: NaN, stddev: NaN, min: NaN, max: NaN, p10: NaN, p90: NaN };
  const sorted = [...values].sort((x, y) => x - y);
  const mean = values.reduce((s, v) => s + v, 0) / n;
  // 모집단 표준편차 (전체 seed를 다 돌리므로 표본이 아니라 그 집합 자체)
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return {
    n,
    mean,
    median: percentile(sorted, 0.5),
    stddev: Math.sqrt(variance),
    min: sorted[0] ?? NaN,
    max: sorted[n - 1] ?? NaN,
    p10: percentile(sorted, 0.1),
    p90: percentile(sorted, 0.9),
  };
}

/** 정수 값 로그 스케일이 아닌 균등 구간 히스토그램. 구간 수 `bins`, 마지막 구간은 max를 포함한다 */
export function histogram(
  values: readonly number[],
  bins: number,
): { lo: number; hi: number; count: number }[] {
  if (values.length === 0 || bins < 1) return [];
  const sorted = [...values].sort((x, y) => x - y);
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const width = Math.max((max - min) / bins, Number.EPSILON);
  const out = Array.from({ length: bins }, (_, i) => ({
    lo: min + i * width,
    hi: min + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    const i = Math.min(Math.floor((v - min) / width), bins - 1);
    const bin = out[i];
    if (bin !== undefined) bin.count++;
  }
  return out;
}

export function histogramText(values: readonly number[], bins: number, barWidth = 40): string {
  const h = histogram(values, bins);
  const top = Math.max(1, ...h.map((b) => b.count));
  const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');
  const labels = h.map((b) => `${fmt(b.lo)}~${fmt(b.hi)}`);
  const w = Math.max(0, ...labels.map((l) => l.length));
  return h
    .map(
      (b, i) =>
        `${(labels[i] ?? '').padStart(w)} | ${'#'.repeat(Math.round((b.count / top) * barWidth))} ${b.count}`,
    )
    .join('\n');
}

/** 열 폭을 맞춘 텍스트 표. 첫 열은 왼쪽, 나머지는 오른쪽 정렬 */
export function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const all = [header, ...rows];
  const widths = header.map((_, c) => Math.max(...all.map((r) => displayWidth(r[c] ?? ''))));
  const line = (r: readonly string[]): string =>
    r
      .map((cell, c) => (c === 0 ? padEnd(cell, widths[c] ?? 0) : padStart(cell, widths[c] ?? 0)))
      .join('  ');
  return [line(header), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(line)].join('\n');
}

/** 한글 등 전각 문자는 터미널에서 2칸 */
function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += /[ᄀ-ᇿ぀-ヿ㐀-鿿가-힣＀-￯]/.test(ch) ? 2 : 1;
  return w;
}
const padEnd = (s: string, w: number): string => s + ' '.repeat(Math.max(0, w - displayWidth(s)));
const padStart = (s: string, w: number): string => ' '.repeat(Math.max(0, w - displayWidth(s))) + s;

export const f0 = (n: number): string =>
  Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '-';
export const f1 = (n: number): string => (Number.isFinite(n) ? n.toFixed(1) : '-');
export const f2 = (n: number): string => (Number.isFinite(n) ? n.toFixed(2) : '-');
export const pct = (n: number, digits = 2): string =>
  Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : '-';
