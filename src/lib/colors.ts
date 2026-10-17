/**
 * Colour roles. Score = magnitude → single-hue blue sequential ramp (number always printed on it,
 * so colour never carries the value alone). Verdict = reserved status colours + icon + label.
 * Model lines = fixed-order categorical slots. Validated with the dataviz palette validator.
 */
/**
 * Score bands: one-hue (teal) ordinal ramp, validated with the dataviz palette validator
 * (--ordinal, light and dark surfaces). Each band also carries a word, so colour never
 * carries the meaning alone.
 */
export const BANDS = [
  { min: 0, label: 'Ruim' },
  { min: 2, label: 'Fraco' },
  { min: 4, label: 'Regular' },
  { min: 6, label: 'Bom' },
  { min: 8, label: 'Excelente' },
] as const;
const TEAL_LIGHT = ['#74bfb0', '#45a696', '#25897c', '#156a60', '#0b4c45'];
const TEAL_DARK = ['#2a6a61', '#2f8a7d', '#45a999', '#74c6b6', '#b2e3d8'];

export function isDark(): boolean {
  if (typeof window === 'undefined') return false;
  const t = document.documentElement.dataset.theme;
  if (t) return t === 'dark';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function bandIndex(score: number): number {
  let i = 0;
  BANDS.forEach((b, k) => {
    if (score >= b.min) i = k;
  });
  return i;
}

export const bandLabel = (score: number | null | undefined) => (score == null || score < 0 ? '' : BANDS[bandIndex(score)].label);

/** Score 0–10 → band colour (darker = better on light, brighter = better on dark). */
export function scoreColor(score: number | null | undefined, dark = isDark()): string {
  if (score == null || score < 0) return dark ? '#262624' : '#ecebe6';
  return (dark ? TEAL_DARK : TEAL_LIGHT)[bandIndex(Math.max(0, Math.min(10, score)))];
}

export function inkOn(bg: string): string {
  const h = bg.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.3 ? '#0b0b0b' : '#ffffff';
}

export const STATUS = { good: '#0ca30c', warning: '#fab219', critical: '#d03b3b' };

export const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
export const series = (i: number, dark = isDark()) => (dark ? SERIES_DARK : SERIES_LIGHT)[i % 8];

/**
 * Map fields (wave height, period, water temperature, rain): blue-cyan sequential ramp, validated
 * with the dataviz validator for both surfaces. Light: pale → deep; dark: deep → bright.
 */
export const FIELD_LIGHT = ['#9fdcec', '#62c3dc', '#2aa5c6', '#1683a6', '#0d6283', '#07425c'];
export const FIELD_DARK = ['#135d7d', '#17789c', '#1f93b8', '#3fb0d3', '#7fcfe6', '#c1ebf6'];
export const fieldRamp = (dark = isDark()) => (dark ? FIELD_DARK : FIELD_LIGHT);
export function fieldColor(t: number, dark = isDark()): [number, number, number] {
  const ramp = fieldRamp(dark);
  const x = Math.max(0, Math.min(1, t)) * (ramp.length - 1);
  const i = Math.floor(x), f = x - i;
  const a = hex(ramp[i]), b = hex(ramp[Math.min(i + 1, ramp.length - 1)]);
  return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f)) as [number, number, number];
}
function hex(h: string) {
  return [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
}
