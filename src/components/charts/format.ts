/** Number formatting + scale helpers shared by the chart kit. */

const trimNum = (v: number) =>
  v.toLocaleString('ru-RU', { maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 });

/** 138 000 → "138 тыс.", 1 250 000 → "1,3 млн". */
export function fmtCompact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${trimNum(n / 1e9)} млрд`;
  if (a >= 1e6) return `${trimNum(n / 1e6)} млн`;
  if (a >= 1e4) return `${trimNum(n / 1e3)} тыс.`;
  return Math.round(n).toLocaleString('ru-RU');
}

export const fmtMoneyCompact = (n: number) => `${fmtCompact(n)} ₽`;

export const fmtRub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;

export const fmtPercent = (n: number, digits = 0) => `${n.toFixed(digits).replace('.', ',')}%`;

/** Signed percent change for delta chips. */
export function fmtDelta(pct: number | null): string {
  if (pct === null) return 'новое';
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0).replace('.', ',')}%`;
}

/** "Nice" axis: rounds the range to 1/2/2.5/5 × 10ⁿ steps. */
export function niceScale(min: number, max: number, target = 4): { min: number; max: number; ticks: number[] } {
  const lo = Math.min(0, min);
  const hi = Math.max(max, lo + 1);
  const raw = (hi - lo) / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / pow;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * pow;
  const niceMin = Math.floor(lo / step) * step;
  const niceMax = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { min: niceMin, max: niceMax, ticks };
}

/** Monotone cubic path through pixel points (never overshoots the data). */
export function smoothPath(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  if (n === 2) return `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)} L${pts[1][0].toFixed(2)},${pts[1][1].toFixed(2)}`;
  const dx: number[] = [];
  const m: number[] = [];
  const t: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0] || 1e-6);
    m.push((pts[i + 1][1] - pts[i][1]) / dx[i]);
  }
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = dx[i] / 3;
    d += ` C${(x0 + h).toFixed(2)},${(y0 + t[i] * h).toFixed(2)} ${(x1 - h).toFixed(2)},${(y1 - t[i + 1] * h).toFixed(2)} ${x1.toFixed(2)},${y1.toFixed(2)}`;
  }
  return d;
}

export function sum(a: number[]): number {
  return a.reduce((s, v) => s + v, 0);
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
}
