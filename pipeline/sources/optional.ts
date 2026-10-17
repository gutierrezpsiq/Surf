/**
 * Optional paid / keyed sources. Each runs only when its key is present in env and is limited to
 * the top-N seed spots to respect free quotas. Output uses the Open-Meteo variable names so the
 * consensus treats them like any other model.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fetchJson } from '../http';
import type { Point } from './openMeteo';

type Series = Record<string, (number | null)[]>;

/** Stormglass v2 point forecast (https://docs.stormglass.io). Values in SI (m/s → km/h). */
export async function fetchStormglass(p: Point, localHours: string[], key: string): Promise<Series> {
  const params = 'waveHeight,wavePeriod,waveDirection,swellHeight,swellPeriod,swellDirection,windSpeed,windDirection,gust';
  const start = Math.floor(new Date(`${localHours[0]}:00-03:00`).getTime() / 1000);
  const end = Math.floor(new Date(`${localHours[localHours.length - 1]}:00-03:00`).getTime() / 1000);
  const js = await fetchJson<any>(
    `https://api.stormglass.io/v2/weather/point?lat=${p.lat}&lng=${p.lon}&params=${params}&source=sg&start=${start}&end=${end}`,
    { headers: { Authorization: key }, retries: 0 },
  );
  const byHour = new Map<string, any>();
  for (const h of js.hours ?? []) byHour.set(new Date(h.time).toISOString().slice(0, 13), h);
  const get = (lt: string, k: string) => {
    const h = byHour.get(new Date(`${lt}:00-03:00`).toISOString().slice(0, 13));
    const v = h?.[k]?.sg;
    return typeof v === 'number' ? v : null;
  };
  return {
    wave_height: localHours.map((t) => get(t, 'waveHeight')),
    wave_period: localHours.map((t) => get(t, 'wavePeriod')),
    wave_direction: localHours.map((t) => get(t, 'waveDirection')),
    swell_wave_height: localHours.map((t) => get(t, 'swellHeight')),
    swell_wave_period: localHours.map((t) => get(t, 'swellPeriod')),
    swell_wave_direction: localHours.map((t) => get(t, 'swellDirection')),
  };
}

/** Windy Point Forecast API v2 (https://api.windy.com/point-forecast/docs), GFS-Wave model. */
export async function fetchWindy(p: Point, localHours: string[], key: string): Promise<Series> {
  const js = await fetchJson<any>('https://api.windy.com/api/point-forecast/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: p.lat, lon: p.lon, model: 'gfsWave', parameters: ['waves', 'swell1', 'windWaves'], levels: ['surface'], key }),
    retries: 0,
  });
  const idx = new Map<string, number>((js.ts as number[]).map((ms, i) => [new Date(ms).toISOString().slice(0, 13), i]));
  const col = (k: string) => localHours.map((t) => {
    const i = idx.get(new Date(`${t}:00-03:00`).toISOString().slice(0, 13));
    const v = i !== undefined ? js[k]?.[i] : null;
    return typeof v === 'number' ? v : null;
  });
  return {
    wave_height: col('waves_height-surface'),
    wave_period: col('waves_period-surface'),
    wave_direction: col('waves_direction-surface'),
    swell_wave_height: col('swell1_height-surface'),
    swell_wave_period: col('swell1_period-surface'),
    swell_wave_direction: col('swell1_direction-surface'),
    wind_wave_height: col('wwaves_height-surface'),
  };
}

/**
 * Copernicus Marine: fetched by the Python helper pipeline/copernicus.py (official
 * `copernicusmarine` toolbox, needs COPERNICUSMARINE_SERVICE_USERNAME/PASSWORD), which writes
 * out/copernicus.json = { spots: { [id]: { time: string[] (local), wave_height, wave_peak_period, wave_direction, sea_surface_temperature } } }.
 */
export function loadCopernicus(path = 'out/copernicus.json'): Record<string, Series & { time: string[] }> | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')).spots;
}
