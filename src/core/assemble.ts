/**
 * Raw per-model hourly series → calibrated consensus HourPoints for one spot.
 * Variable names follow Open-Meteo; other sources are mapped to the same names upstream.
 */
import { Calibration, modelCalib } from './calibration';
import { consensusCircular, consensusLinear, ModelValue } from './consensus';
import type { CalibRegion, Cv, HourPoint } from './types';

type Arr = (number | null | undefined)[];
export type ModelVars = Record<string, Record<string, Arr>>;

export interface RawSpot {
  time: string[]; // local hours
  wave: ModelVars;
  ocean?: Record<string, Arr>;
  wind: ModelVars;
}

const at = (a: Arr | undefined, i: number) => {
  const v = a?.[i];
  return v == null || !Number.isFinite(v) ? null : v;
};

/** Dominant period per model: peak if available, else swell period when swell dominates, else mean. */
export function dominantPeriod(v: Record<string, Arr>, i: number): number | null {
  const peak = at(v.wave_peak_period, i);
  if (peak != null) return peak;
  const swH = at(v.swell_wave_height, i) ?? 0, wwH = at(v.wind_wave_height, i) ?? 0;
  const swT = at(v.swell_wave_peak_period, i) ?? at(v.swell_wave_period, i);
  if (swT != null && swH >= wwH) return swT;
  return at(v.wave_period, i);
}

const mean = (xs: (number | null)[]) => {
  const ok = xs.filter((x): x is number => x != null);
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : undefined;
};

export function assemble(raw: RawSpot, region: CalibRegion, calib?: Calibration): HourPoint[] {
  const waveModels = Object.keys(raw.wave);
  const windModels = Object.keys(raw.wind);
  const wW: Record<string, number> = {};
  for (const m of waveModels) wW[m] = modelCalib(calib, region, m).weight;

  return raw.time.map((t, i) => {
    const hsV: ModelValue[] = [], tpV: ModelValue[] = [], dirV: ModelValue[] = [];
    const swHV: ModelValue[] = [], swTV: ModelValue[] = [], swDV: ModelValue[] = [];
    const mags: Record<string, number> = {}, swMags: Record<string, number> = {};
    const m: Record<string, number[]> = {};
    const sec: { h: number; t: number; d: number }[] = [];
    const ww: (number | null)[] = [];
    for (const model of waveModels) {
      const v = raw.wave[model];
      const c = modelCalib(calib, region, model);
      const hsRaw = at(v.wave_height, i);
      const hs = hsRaw != null ? hsRaw * c.hsA : null;
      const tpRaw = dominantPeriod(v, i);
      const tp = tpRaw != null ? tpRaw + c.tpB : null;
      const dir = at(v.wave_direction, i);
      hsV.push({ model, v: hs });
      tpV.push({ model, v: tp });
      dirV.push({ model, v: dir });
      if (hs != null) mags[model] = hs;
      const swH = at(v.swell_wave_height, i);
      if (swH != null) {
        swHV.push({ model, v: swH * c.hsA });
        const swT = at(v.swell_wave_peak_period, i) ?? at(v.swell_wave_period, i);
        swTV.push({ model, v: swT != null ? swT + c.tpB : null });
        swDV.push({ model, v: at(v.swell_wave_direction, i) });
        swMags[model] = swH;
      }
      const h2 = at(v.secondary_swell_wave_height, i), t2 = at(v.secondary_swell_wave_period, i), d2 = at(v.secondary_swell_wave_direction, i);
      if (h2 != null && t2 != null && d2 != null) sec.push({ h: h2 * c.hsA, t: t2, d: d2 });
      ww.push(at(v.wind_wave_height, i));
      if (hs != null) m[model] = [round(hs, 2), round(tp ?? NaN, 1), round(dir ?? NaN, 0)];
    }

    const wsV: ModelValue[] = [], wdV: ModelValue[] = [], gV: ModelValue[] = [];
    const wMags: Record<string, number> = {};
    for (const model of windModels) {
      const v = raw.wind[model];
      const s = at(v.wind_speed_10m, i);
      wsV.push({ model, v: s });
      wdV.push({ model, v: at(v.wind_direction_10m, i) });
      gV.push({ model, v: at(v.wind_gusts_10m, i) });
      if (s != null) {
        wMags[model] = s;
        m[`w:${model}`] = [round(s, 0), round(at(v.wind_direction_10m, i) ?? NaN, 0)];
      }
    }
    const firstWind = (k: string) => mean(windModels.map((mm) => at(raw.wind[mm][k], i)));

    const hs = consensusLinear(hsV, wW) ?? nan();
    const swH = consensusLinear(swHV, wW);
    const sec2 = sec.length ? sec.reduce((a, b) => ({ h: a.h + b.h / sec.length, t: a.t + b.t / sec.length, d: b.d }), { h: 0, t: 0, d: 0 }) : undefined;
    const dayV = firstWind('is_day');
    const hp: HourPoint = {
      t,
      hs,
      tp: consensusLinear(tpV, wW) ?? nan(),
      dir: consensusCircular(dirV, wW, mags) ?? nan(),
      swH,
      swT: swH ? consensusLinear(swTV, wW) : undefined,
      swD: swH ? consensusCircular(swDV, wW, swMags) : undefined,
      sw2H: sec2 && round(sec2.h, 2),
      sw2T: sec2 && round(sec2.t, 1),
      sw2D: sec2 && round(sec2.d, 0),
      wwH: round(mean(ww) ?? NaN, 2),
      wind: consensusLinear(wsV) ?? nan(),
      windDir: consensusCircular(wdV, {}, wMags) ?? nan(),
      gust: consensusLinear(gV) ?? nan(),
      rain: round(firstWind('precipitation') ?? NaN, 1),
      cape: round(Math.max(...windModels.map((mm) => at(raw.wind[mm].cape, i) ?? 0)), 0),
      cloud: round(firstWind('cloud_cover') ?? NaN, 0),
      temp: round(firstWind('temperature_2m') ?? NaN, 1),
      uv: round(firstWind('uv_index') ?? NaN, 1),
      sst: round(at(raw.ocean?.sea_surface_temperature, i) ?? NaN, 1),
      tide: round(at(raw.ocean?.sea_level_height_msl, i) ?? NaN, 2),
      day: dayV == null ? isDaylightGuess(t) : dayV >= 0.5,
      m,
    };
    return clean(hp);
  });
}

function nan(): Cv {
  return { v: NaN, s: NaN, n: 0 };
}
function round(x: number, d: number): number {
  return Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : NaN;
}
function isDaylightGuess(t: string) {
  const h = +t.slice(11, 13);
  return h >= 6 && h <= 18;
}
/** Drop NaN optional fields so JSON stays small and consumers can use `!= null`. */
function clean(h: HourPoint): HourPoint {
  for (const k of Object.keys(h) as (keyof HourPoint)[]) {
    const v = h[k] as unknown;
    if (typeof v === 'number' && !Number.isFinite(v)) delete h[k];
  }
  for (const k of ['swT', 'swD'] as const) if (h[k] && !Number.isFinite(h[k]!.v)) delete h[k];
  for (const k of Object.keys(h.m ?? {})) h.m![k] = h.m![k].map((x) => (Number.isFinite(x) ? x : null)) as number[];
  // round consensus values
  for (const k of ['hs', 'tp', 'dir', 'swH', 'swT', 'swD', 'wind', 'windDir', 'gust'] as const) {
    const c = h[k];
    if (c) h[k] = { v: round(c.v, 2), s: round(c.s, 2), n: c.n };
  }
  return h;
}

/** Hours with usable core data (needed for scoring). */
export function isUsable(h: HourPoint): boolean {
  return Number.isFinite(h.hs.v) && Number.isFinite(h.tp.v) && Number.isFinite(h.dir.v) && Number.isFinite(h.wind.v) && Number.isFinite(h.windDir.v);
}
