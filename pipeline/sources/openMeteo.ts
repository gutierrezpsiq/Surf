/**
 * Open-Meteo Marine + Forecast APIs (no key). Identifiers verified against the
 * open-meteo-website docs source (src/routes/en/docs/{marine-weather-api,}/options.ts):
 *   marine models: ecmwf_wam, ecmwf_wam025, meteofrance_wave, meteofrance_currents, gwam, ewam,
 *                  ncep_gfswave025, ncep_gfswave016
 *   ECMWF WAM only provides total sea (wave_height/direction/period/peak_period);
 *   MeteoFrance wave, GWAM and GFS-Wave provide swell partitions;
 *   meteofrance_currents provides sea_surface_temperature + sea_level_height_msl (tide incl.).
 * Multi-model responses suffix each variable with `_<model>`; multi-location returns an array.
 */
import { fetchJson } from '../http';

export const MARINE_URL = process.env.OPEN_METEO_MARINE_URL ?? 'https://marine-api.open-meteo.com/v1/marine';
export const FORECAST_URL = process.env.OPEN_METEO_FORECAST_URL ?? 'https://api.open-meteo.com/v1/forecast';
const API_KEY = process.env.OPEN_METEO_API_KEY; // optional commercial key (customer-*.open-meteo.com)

export const WAVE_MODELS = ['ecmwf_wam', 'meteofrance_wave', 'gwam', 'ncep_gfswave025'];
export const OCEAN_MODEL = 'meteofrance_currents';
export const WIND_MODELS = ['ecmwf_ifs025', 'ncep_gfs_seamless', 'dwd_icon_seamless', 'meteofrance_seamless', 'ukmo_seamless'];

export const WAVE_VARS = [
  'wave_height', 'wave_direction', 'wave_period', 'wave_peak_period',
  'swell_wave_height', 'swell_wave_direction', 'swell_wave_period', 'swell_wave_peak_period',
  'secondary_swell_wave_height', 'secondary_swell_wave_period', 'secondary_swell_wave_direction',
  'wind_wave_height',
];
export const OCEAN_VARS = ['sea_surface_temperature', 'sea_level_height_msl'];
export const WIND_VARS = ['wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'precipitation', 'cape', 'cloud_cover', 'temperature_2m', 'uv_index', 'is_day'];

export interface Point { lat: number; lon: number }
/** model → variable → hourly values */
export type ModelVars = Record<string, Record<string, (number | null)[]>>;
export interface PointSeries { time: string[]; models: ModelVars; daily?: Record<string, string[]> }

/** Split `hourly` keys into model/variable using the requested model list. */
export function splitModels(hourly: Record<string, any>, models: string[], vars: string[]): ModelVars {
  const out: ModelVars = {};
  for (const [key, arr] of Object.entries(hourly)) {
    if (key === 'time' || !Array.isArray(arr)) continue;
    let model = models.length <= 1 ? (models[0] ?? 'best_match') : undefined;
    let variable = key;
    for (const m of models) {
      if (key.endsWith(`_${m}`)) {
        model = m;
        variable = key.slice(0, -(m.length + 1));
        break;
      }
    }
    if (!model || !vars.includes(variable)) continue;
    if (arr.every((v: unknown) => v == null)) continue; // variable not provided by this model
    (out[model] ??= {})[variable] = arr as (number | null)[];
  }
  return out;
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/**
 * Free tier: 600 calls/min, 5 000/h, 10 000/day, where one location with > 10 variables (per model)
 * counts as several calls. Keep a rolling one-minute budget well under the limit.
 */
const MINUTE_BUDGET = Number(process.env.OPEN_METEO_MINUTE_BUDGET ?? 450);
const spent: { t: number; w: number }[] = [];
export function callWeight(locations: number, variables: number, models: number): number {
  return locations * Math.max(1, (variables * Math.max(1, models)) / 10);
}
async function throttle(weight: number) {
  for (;;) {
    const now = Date.now();
    while (spent.length && now - spent[0].t > 60_000) spent.shift();
    const used = spent.reduce((a, b) => a + b.w, 0);
    if (used + weight <= MINUTE_BUDGET || !spent.length) break;
    await new Promise((r) => setTimeout(r, 60_000 - (now - spent[0].t) + 250));
  }
  spent.push({ t: Date.now(), w: weight });
}
let totalWeight = 0;
export const openMeteoUsage = () => Math.round(totalWeight);

async function multi(base: string, points: Point[], params: Record<string, string>, models: string[], vars: string[], batch = 40): Promise<PointSeries[]> {
  const out: PointSeries[] = [];
  for (const group of chunk(points, batch)) {
    const q = new URLSearchParams({
      latitude: group.map((p) => p.lat.toFixed(4)).join(','),
      longitude: group.map((p) => p.lon.toFixed(4)).join(','),
      timezone: 'America/Sao_Paulo',
      forecast_days: '7',
      ...params,
      ...(API_KEY ? { apikey: API_KEY } : {}),
    });
    if (models.length) q.set('models', models.join(','));
    const hourlyVars = (params.hourly ?? '').split(',').length;
    const w = callWeight(group.length, hourlyVars, models.length);
    await throttle(w);
    totalWeight += w;
    const js = await fetchJson<any>(`${base}?${q}`, { timeoutMs: 90_000, retries: 3 });
    const arr = Array.isArray(js) ? js : [js];
    for (const r of arr) {
      out.push({ time: r.hourly?.time ?? [], models: splitModels(r.hourly ?? {}, models, vars), daily: r.daily });
    }
  }
  return out;
}

export function fetchMarine(points: Point[], models = [...WAVE_MODELS, OCEAN_MODEL]): Promise<PointSeries[]> {
  return multi(MARINE_URL, points, { hourly: [...WAVE_VARS, ...OCEAN_VARS].join(','), cell_selection: 'sea' }, models, [...WAVE_VARS, ...OCEAN_VARS]);
}

export function fetchWind(points: Point[], models = WIND_MODELS): Promise<PointSeries[]> {
  return multi(FORECAST_URL, points, { hourly: WIND_VARS.join(','), daily: 'sunrise,sunset', wind_speed_unit: 'kmh' }, models, WIND_VARS);
}

/** Single "best match" fields for the map grid (one model keeps the payload and quota small). */
export function fetchGridMarine(points: Point[]) {
  return multi(MARINE_URL, points, { hourly: 'wave_height,wave_direction,wave_period,sea_surface_temperature', cell_selection: 'sea' }, [], ['wave_height', 'wave_direction', 'wave_period', 'sea_surface_temperature'], 80);
}
export function fetchGridWind(points: Point[]) {
  return multi(FORECAST_URL, points, { hourly: 'wind_speed_10m,wind_direction_10m,precipitation', wind_speed_unit: 'kmh' }, [], ['wind_speed_10m', 'wind_direction_10m', 'precipitation'], 80);
}
