/**
 * Local stand-in for the Open-Meteo marine + forecast endpoints, returning SYNTHETIC data in the
 * real response shape (multi-location arrays, `_<model>` suffixes). Used to exercise the full
 * pipeline offline and to produce demo data for UI development — never real forecasts.
 *
 *   tsx pipeline/tools/mock-open-meteo.ts &           # listens on :8787
 *   OPEN_METEO_MARINE_URL=http://localhost:8787/v1/marine \
 *   OPEN_METEO_FORECAST_URL=http://localhost:8787/v1/forecast DEMO=1 npm run pipeline
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 8787);

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

function hoursFrom(start: Date, n: number) {
  return Array.from({ length: n }, (_, i) => new Date(start.getTime() + i * 3600e3 - 3 * 3600e3).toISOString().slice(0, 16));
}

/** Smooth synthetic weather story: SE groundswell days 2–4, cold front with S wind day 5. */
function series(model: string, lat: number, lon: number, i: number) {
  const bias = (hash(model) - 0.5) * 0.3; // model personality
  const lead = i / 168;
  const noise = Math.sin(i * 0.37 + hash(model) * 9) * (0.05 + 0.25 * lead);
  const day = i / 24;
  const swell = 0.6 + 1.5 * Math.exp(-(((day - 3.2) / 1.1) ** 2)) + 0.9 * Math.exp(-(((day - 5.6) / 0.7) ** 2));
  const swT = 8 + 5 * Math.exp(-(((day - 2.8) / 1.3) ** 2)) + noise * 2;
  const swD = 140 + 25 * Math.sin(day / 2) + (day > 5 ? 30 : 0) + noise * 20;
  const hour = i % 24;
  const front = Math.exp(-(((day - 5.4) / 0.4) ** 2));
  const seaBreeze = Math.max(0, Math.sin(((hour - 10) / 10) * Math.PI));
  const windS = 6 + 14 * seaBreeze + 30 * front + 4 * Math.sin(day) + noise * 15;
  const windD = front > 0.3 ? 200 : seaBreeze > 0.3 ? 80 + 20 * Math.sin(day) : 300 + 15 * Math.sin(day * 2);
  const ww = 0.15 + windS / 60;
  const hs = Math.sqrt((swell * (1 + bias + noise)) ** 2 + ww ** 2);
  return {
    wave_height: hs, wave_direction: swD, wave_period: swT * 0.8, wave_peak_period: swT,
    swell_wave_height: swell * (1 + bias + noise), swell_wave_direction: swD, swell_wave_period: swT * 0.92, swell_wave_peak_period: swT,
    secondary_swell_wave_height: 0.3 + 0.2 * Math.sin(day), secondary_swell_wave_period: 7, secondary_swell_wave_direction: 80,
    wind_wave_height: ww,
    sea_surface_temperature: 21 + (lat + 25) * 0.9 + 0.3 * Math.sin(day),
    sea_level_height_msl: 0.3 * Math.sin((2 * Math.PI * i) / 12.42) + 0.1 * Math.sin((2 * Math.PI * i) / 24.84),
    ocean_current_velocity: 0.3, ocean_current_direction: 30,
    wind_speed_10m: Math.max(0, windS * (1 + bias)), wind_direction_10m: windD + noise * 40, wind_gusts_10m: Math.max(0, windS * 1.5),
    precipitation: front > 0.2 ? 3 * front : 0, cape: front > 0.2 ? 1500 * front : 50, cloud_cover: 30 + 60 * front, temperature_2m: 20 - 6 * front + 4 * seaBreeze,
    uv_index: hour >= 7 && hour <= 17 ? 8 * Math.sin(((hour - 6) / 12) * Math.PI) : 0, is_day: hour >= 6 && hour <= 18 ? 1 : 0,
  } as Record<string, number>;
}

createServer((req, res) => {
  const u = new URL(req.url ?? '/', 'http://x');
  const lats = (u.searchParams.get('latitude') ?? '0').split(',').map(Number);
  const lons = (u.searchParams.get('longitude') ?? '0').split(',').map(Number);
  const vars = (u.searchParams.get('hourly') ?? '').split(',').filter(Boolean);
  const models = (u.searchParams.get('models') ?? '').split(',').filter(Boolean);
  const start = new Date();
  start.setUTCHours(3, 0, 0, 0); // local midnight (UTC−3)
  const n = 24 * Number(u.searchParams.get('forecast_days') ?? 7);
  const time = hoursFrom(start, n);
  const out = lats.map((lat, k) => {
    const lon = lons[k];
    const hourly: Record<string, unknown> = { time };
    const ms = models.length ? models : ['best_match'];
    for (const m of ms) {
      for (const v of vars) {
        const key = models.length > 1 ? `${v}_${m}` : v;
        // ECMWF WAM has no swell partitions; currents model has only ocean vars
        const unsupported = (m.startsWith('ecmwf_wam') && /swell|wind_wave/.test(v)) || (m === 'meteofrance_currents' && !/sea_|ocean_/.test(v)) || (m !== 'meteofrance_currents' && m !== 'best_match' && /sea_|ocean_/.test(v));
        hourly[key] = time.map((_, i) => (unsupported ? null : +series(m, lat, lon, i)[v].toFixed(2)));
      }
    }
    const daily = u.searchParams.get('daily')
      ? { time: time.filter((t) => t.endsWith('00:00')).map((t) => t.slice(0, 10)), sunrise: time.filter((t) => t.endsWith('00:00')).map((t) => `${t.slice(0, 10)}T05:${String(40 - Math.round((lat + 25) * 2)).padStart(2, '0')}`), sunset: time.filter((t) => t.endsWith('00:00')).map((t) => `${t.slice(0, 10)}T18:${String(45 + Math.round((lat + 25) * 1)).padStart(2, '0')}`) }
      : undefined;
    return { latitude: lat, longitude: lon, hourly, daily };
  });
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(out.length === 1 ? out[0] : out));
}).listen(PORT, () => console.log(`[mock-open-meteo] synthetic data on :${PORT}`));
