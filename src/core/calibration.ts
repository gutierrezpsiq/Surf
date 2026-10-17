/**
 * Self-calibration against buoy observations.
 * For each region × model we fit, with exponential time decay (half-life 30 days):
 *   Hs:  multiplicative factor a  (least squares through the origin: o ≈ a·f)
 *   Tp:  additive offset b         (o ≈ f + b)
 * Both are shrunk towards "no correction" when few pairs exist, and model weights for the
 * consensus are 1 / (RMSE² + ε) after correction, normalised to mean 1 within the region.
 */
import type { CalibRegion } from './types';

export interface Pair {
  region: CalibRegion;
  model: string;
  var: 'hs' | 'tp';
  f: number; // forecast
  o: number; // observation
  ageDays: number; // forecast valid time age relative to now
}

export interface ModelCalib {
  hsA: number;
  tpB: number;
  rmseHs?: number;
  n: number;
  weight: number;
}

export interface Calibration {
  updatedAt: string;
  regions: Partial<Record<CalibRegion, Record<string, ModelCalib>>>;
}

const HALF_LIFE = 30;
const SHRINK_N = 40;

export function fitCalibration(pairs: Pair[], now = new Date()): Calibration {
  const groups = new Map<string, Pair[]>();
  for (const p of pairs) {
    if (!Number.isFinite(p.f) || !Number.isFinite(p.o)) continue;
    const k = `${p.region}|${p.model}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(p);
  }
  const regions: Calibration['regions'] = {};
  for (const [k, ps] of groups) {
    const [region, model] = k.split('|') as [CalibRegion, string];
    const w = (p: Pair) => Math.pow(0.5, p.ageDays / HALF_LIFE);
    const hs = ps.filter((p) => p.var === 'hs' && p.f > 0.05);
    const tp = ps.filter((p) => p.var === 'tp' && p.f > 1);
    let hsA = 1, rmseHs: number | undefined;
    if (hs.length) {
      const sof = hs.reduce((s, p) => s + w(p) * p.o * p.f, 0);
      const sff = hs.reduce((s, p) => s + w(p) * p.f * p.f, 0);
      const raw = sff > 0 ? sof / sff : 1;
      const neff = hs.reduce((s, p) => s + w(p), 0);
      hsA = clamp(1 + ((raw - 1) * neff) / (neff + SHRINK_N), 0.6, 1.5);
      const sw = neff || 1;
      rmseHs = Math.sqrt(hs.reduce((s, p) => s + w(p) * (p.o - hsA * p.f) ** 2, 0) / sw);
    }
    let tpB = 0;
    if (tp.length) {
      const neff = tp.reduce((s, p) => s + w(p), 0);
      const raw = tp.reduce((s, p) => s + w(p) * (p.o - p.f), 0) / (neff || 1);
      tpB = clamp((raw * neff) / (neff + SHRINK_N), -3, 3);
    }
    (regions[region] ??= {})[model] = {
      hsA: round(hsA, 3),
      tpB: round(tpB, 2),
      rmseHs: rmseHs != null ? round(rmseHs, 3) : undefined,
      n: hs.length + tp.length,
      weight: rmseHs != null ? 1 / (rmseHs * rmseHs + 0.02) : 1,
    };
  }
  for (const models of Object.values(regions)) {
    const ws = Object.values(models!);
    const mean = ws.reduce((s, m) => s + m.weight, 0) / ws.length;
    for (const m of ws) m.weight = round(m.weight / mean, 3);
  }
  return { updatedAt: now.toISOString(), regions };
}

export function modelCalib(c: Calibration | undefined, region: CalibRegion, model: string): ModelCalib {
  return c?.regions[region]?.[model] ?? { hsA: 1, tpB: 0, n: 0, weight: 1 };
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
