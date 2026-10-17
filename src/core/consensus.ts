/**
 * Multi-model consensus: weighted mean (circular for directions), spread, confidence.
 * Weights come from recent accuracy vs. observations (calibration.ts); default 1.
 */
import { circularMean, circularSpread } from './geo';
import type { Confidence, Cv } from './types';

export interface ModelValue { model: string; v: number | null | undefined }

export function consensusLinear(vals: ModelValue[], weights: Record<string, number> = {}): Cv | undefined {
  const ok = vals.filter((x): x is { model: string; v: number } => x.v != null && Number.isFinite(x.v));
  if (!ok.length) return undefined;
  const w = ok.map((x) => weights[x.model] ?? 1);
  const sw = w.reduce((a, b) => a + b, 0) || 1;
  const mean = ok.reduce((s, x, i) => s + w[i] * x.v, 0) / sw;
  const varc = ok.reduce((s, x, i) => s + w[i] * (x.v - mean) ** 2, 0) / sw;
  return { v: mean, s: Math.sqrt(varc), n: ok.length };
}

export function consensusCircular(vals: ModelValue[], weights: Record<string, number> = {}, magnitudes?: Record<string, number>): Cv | undefined {
  const ok = vals.filter((x): x is { model: string; v: number } => x.v != null && Number.isFinite(x.v));
  if (!ok.length) return undefined;
  // Directions of weak signals matter less: optionally weight by magnitude (e.g. swell height).
  const w = ok.map((x) => (weights[x.model] ?? 1) * (magnitudes ? Math.max(0.05, magnitudes[x.model] ?? 1) : 1));
  const m = circularMean(ok.map((x) => x.v), w);
  if (Number.isNaN(m)) return undefined;
  return { v: m, s: circularSpread(ok.map((x) => x.v), w), n: ok.length };
}

export interface SpreadInput {
  hs?: Cv;
  tp?: Cv;
  dir?: Cv;
  wind?: Cv;
  windDir?: Cv;
  leadHours: number;
}

/**
 * Disagreement index u: each spread normalised so 1 ≈ "models meaningfully disagree".
 * Lead time adds uncertainty even when models agree (they share initial-condition errors).
 */
export function uncertainty(x: SpreadInput): number {
  const parts: number[] = [];
  if (x.hs && x.hs.n > 1) parts.push(x.hs.s / Math.max(x.hs.v, 0.4) / 0.25);
  if (x.tp && x.tp.n > 1) parts.push(x.tp.s / 2.0);
  if (x.dir && x.dir.n > 1) parts.push(x.dir.s / 30);
  if (x.wind && x.wind.n > 1) parts.push(x.wind.s / 8);
  if (x.windDir && x.windDir.n > 1 && x.wind && x.wind.v > 10) parts.push(x.windDir.s / 45);
  const nModels = Math.min(x.hs?.n ?? 0, x.wind?.n ?? 0);
  const single = nModels < 2 ? 0.7 : 0; // can't measure agreement with one model
  return Math.max(0, ...parts) + single + x.leadHours / 240;
}

export function confidenceFrom(u: number): Confidence {
  if (u <= 0.6) return 'alta';
  if (u <= 1.15) return 'média';
  return 'baixa';
}
