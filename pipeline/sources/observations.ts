/**
 * Buoy / wave observations for calibration.
 * PNBOIA (Marinha/CHM) and SIMCosta do not publish a stable documented API, so feeds are
 * configured via env OBS_FEEDS (JSON array). Two formats are supported:
 *   - "ndbc":  NOAA NDBC realtime2 standard meteorological text (columns WVHT, DPD, MWD)
 *   - "json":  [{ "time": ISO-UTC, "hs": m, "tp": s, "dir": deg }]
 * Example:
 *   OBS_FEEDS='[{"id":"pnboia-rg","name":"PNBOIA Rio Grande","region":"RS-S","lat":-31.57,"lon":-49.86,"format":"json","url":"https://…"}]'
 */
import type { CalibRegion } from '../../src/core/types';
import { fetchJson, fetchText } from '../http';

export interface ObsFeed { id: string; name: string; region: CalibRegion; lat: number; lon: number; format: 'ndbc' | 'json'; url: string }
export interface Obs { feed: string; time: string; hs?: number; tp?: number; dir?: number }

export function feeds(): ObsFeed[] {
  try {
    return JSON.parse(process.env.OBS_FEEDS || '[]');
  } catch {
    console.warn('[obs] OBS_FEEDS is not valid JSON');
    return [];
  }
}

export function parseNdbc(txt: string, feed: string): Obs[] {
  const lines = txt.split('\n').filter(Boolean);
  const head = lines[0].replace(/^#/, '').trim().split(/\s+/);
  const col = (n: string) => head.indexOf(n);
  const out: Obs[] = [];
  for (const l of lines.slice(2)) {
    const c = l.trim().split(/\s+/);
    const v = (n: string) => {
      const x = Number(c[col(n)]);
      return col(n) >= 0 && Number.isFinite(x) && x < 90 ? x : undefined;
    };
    const time = new Date(Date.UTC(+c[col('YY')], +c[col('MM')] - 1, +c[col('DD')], +c[col('hh')], +c[col('mm')])).toISOString();
    const mwd = Number(c[col('MWD')]);
    out.push({ feed, time, hs: v('WVHT'), tp: v('DPD'), dir: Number.isFinite(mwd) && mwd <= 360 ? mwd : undefined });
  }
  return out.filter((o) => o.hs != null || o.tp != null);
}

export async function fetchObservations(f: ObsFeed): Promise<Obs[]> {
  if (f.format === 'ndbc') return parseNdbc(await fetchText(f.url), f.id);
  const rows = await fetchJson<any[]>(f.url);
  return rows.map((r) => ({ feed: f.id, time: new Date(r.time).toISOString(), hs: r.hs ?? undefined, tp: r.tp ?? undefined, dir: r.dir ?? undefined }));
}
