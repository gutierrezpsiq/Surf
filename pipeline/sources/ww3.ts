/**
 * NOAA WaveWatch III global (0.5°) via the PacIOOS ERDDAP griddap service — an independent
 * WW3 run, separate from Open-Meteo's GFS-Wave copy.
 * Dataset ww3_global, variables Thgt (Hs, m), Tper (peak period, s), Tdir (peak direction, °).
 * Dimensions [time][depth][latitude][longitude], longitude in 0–360.
 */
import { fetchJson } from '../http';
import type { Point } from './openMeteo';

/** Same dataset (ww3_global) on PacIOOS and on NOAA's UAF ERDDAP; tried in order. */
const SERVERS = process.env.WW3_ERDDAP_URL
  ? [process.env.WW3_ERDDAP_URL]
  : ['https://pae-paha.pacioos.hawaii.edu/erddap/griddap/ww3_global.json', 'https://upwell.pfeg.noaa.gov/erddap/griddap/ww3_global.json'];

export interface Ww3Grid {
  times: string[]; // UTC ISO
  lats: number[];
  lons: number[]; // -180..180
  /** [time][lat][lon] */
  hs: (number | null)[][][];
  tp: (number | null)[][][];
  dir: (number | null)[][][];
}

export async function fetchWw3(box = { s: -34.5, n: -24.5, w: -54.5, e: -45.5 }): Promise<Ww3Grid> {
  const start = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 13) + ':00:00Z';
  const sel = `[(${start}):1:(last)][(0.0)][(${box.s}):1:(${box.n})][(${box.w + 360}):1:(${box.e + 360})]`;
  let js: any;
  let lastErr: unknown;
  for (const base of SERVERS) {
    try {
      js = await fetchJson<any>(`${base}?Thgt${sel},Tper${sel},Tdir${sel}`, { timeoutMs: 120_000, retries: 1 });
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!js) throw lastErr;
  const cols: string[] = js.table.columnNames;
  const ix = (n: string) => cols.indexOf(n);
  const rows: any[][] = js.table.rows;
  const times = [...new Set(rows.map((r) => r[ix('time')] as string))].sort();
  const lats = [...new Set(rows.map((r) => r[ix('latitude')] as number))].sort((a, b) => a - b);
  const lons360 = [...new Set(rows.map((r) => r[ix('longitude')] as number))].sort((a, b) => a - b);
  const mk = () => times.map(() => lats.map(() => lons360.map(() => null as number | null)));
  const g: Ww3Grid = { times, lats, lons: lons360.map((l) => (l > 180 ? l - 360 : l)), hs: mk(), tp: mk(), dir: mk() };
  const ti = new Map(times.map((t, i) => [t, i]));
  const li = new Map(lats.map((t, i) => [t, i]));
  const oi = new Map(lons360.map((t, i) => [t, i]));
  for (const r of rows) {
    const a = ti.get(r[ix('time')])!, b = li.get(r[ix('latitude')])!, c = oi.get(r[ix('longitude')])!;
    g.hs[a][b][c] = num(r[ix('Thgt')]);
    g.tp[a][b][c] = num(r[ix('Tper')]);
    g.dir[a][b][c] = num(r[ix('Tdir')]);
  }
  return g;
}

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** Nearest non-empty ocean cell → series aligned to `localHours` (America/Sao_Paulo, UTC−3, no DST). */
export function sampleWw3(g: Ww3Grid, p: Point, localHours: string[]) {
  let i = -1, j = -1;
  let bd = Infinity;
  for (let a = 0; a < g.lats.length; a++) {
    for (let b = 0; b < g.lons.length; b++) {
      if (g.hs.every((t) => t[a][b] == null)) continue; // land
      const d = (g.lats[a] - p.lat) ** 2 + ((g.lons[b] - p.lon) * Math.cos((p.lat * Math.PI) / 180)) ** 2;
      if (d < bd) { bd = d; i = a; j = b; }
    }
  }
  if (i < 0 || Math.sqrt(bd) > 0.8) return undefined;
  const byUtc = new Map(g.times.map((t, k) => [t.slice(0, 13), k]));
  const pick = (arr: (number | null)[][][], lt: string) => {
    const utc = new Date(`${lt}:00-03:00`).toISOString().slice(0, 13);
    const k = byUtc.get(utc);
    if (k !== undefined) return arr[k][i][j];
    // WW3 output may be 3-hourly: linear interpolation between neighbours
    const ms = new Date(`${lt}:00-03:00`).getTime();
    let lo = -1;
    for (let q = 0; q < g.times.length; q++) if (new Date(g.times[q]).getTime() <= ms) lo = q;
    if (lo < 0 || lo >= g.times.length - 1) return null;
    const t0 = new Date(g.times[lo]).getTime(), t1 = new Date(g.times[lo + 1]).getTime();
    const a = arr[lo][i][j], b = arr[lo + 1][i][j];
    if (a == null || b == null || t1 - t0 > 6 * 3600e3) return null;
    return a + ((b - a) * (ms - t0)) / (t1 - t0);
  };
  return {
    wave_height: localHours.map((t) => pick(g.hs, t)),
    wave_peak_period: localHours.map((t) => pick(g.tp, t)),
    // direction: nearest neighbour (no interpolation across 360°)
    wave_direction: localHours.map((t) => {
      const utc = new Date(`${t}:00-03:00`).toISOString().slice(0, 13);
      const k = byUtc.get(utc);
      return k !== undefined ? g.dir[k][i][j] : null;
    }),
  };
}
