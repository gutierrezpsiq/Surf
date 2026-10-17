/**
 * Colour roles. Score = magnitude → single-hue blue sequential ramp (number always printed on it,
 * so colour never carries the value alone). Verdict = reserved status colours + icon + label.
 * Model lines = fixed-order categorical slots. Validated with the dataviz palette validator.
 */
const BLUE = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];

export function isDark(): boolean {
  if (typeof window === 'undefined') return false;
  const t = document.documentElement.dataset.theme;
  if (t) return t === 'dark';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/** Score 0–10 → ramp colour (light: pale→deep; dark: deep→pale, low end recedes into the surface). */
export function scoreColor(score: number | null | undefined, dark = isDark()): string {
  if (score == null || score < 0) return dark ? '#262624' : '#ecebe6';
  const i = Math.round((Math.max(0, Math.min(10, score)) / 10) * (BLUE.length - 1));
  return dark ? BLUE[BLUE.length - 1 - i] : BLUE[i];
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

/** Second sequential context (map fields) uses an orange single-hue ramp. */
export const ORANGE = ['#fde7dc', '#fbcdb6', '#f8b190', '#f2936a', '#eb6834', '#cf5124', '#a93f1b', '#823015', '#5c210e'];
export function fieldColor(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t)) * (ORANGE.length - 1);
  const i = Math.floor(x), f = x - i;
  const a = hex(ORANGE[i]), b = hex(ORANGE[Math.min(i + 1, ORANGE.length - 1)]);
  return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f)) as [number, number, number];
}
function hex(h: string) {
  return [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
}
