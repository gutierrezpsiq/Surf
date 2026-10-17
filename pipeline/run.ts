/**
 * Scheduled pipeline (every 6 h, after the 00/06/12/18 UTC model runs are published):
 * fetch every source → calibrated consensus → scores → precomputed JSON for the app.
 * A failing source is logged and skipped; the run continues with the rest.
 */
import { readFileSync } from 'node:fs';
import { assemble, ModelVars, RawSpot } from '../src/core/assemble';
import type { Calibration } from '../src/core/calibration';
import { buildCoastIndex, isSea } from '../src/core/coast';
import { LonLat } from '../src/core/geo';
import type { Skill } from '../src/core/scoring';
import { nowIndex, PROFILES, scoreSeries, summarise, summaryFile } from '../src/core/spotScore';
import type { GridData, OfficialWarning, SourceStatus, Spot, SpotDetail, SpotSummary, Summary } from '../src/core/types';
import { fetchGridMarine, fetchGridWind, fetchMarine, fetchWind, OCEAN_MODEL, Point, PointSeries, WAVE_MODELS, WIND_MODELS } from './sources/openMeteo';
import { feeds, fetchObservations } from './sources/observations';
import { fetchStormglass, fetchWindy, loadCopernicus } from './sources/optional';
import { fetchInmet, fetchMarinha } from './sources/warnings';
import { fetchWw3, sampleWw3, Ww3Grid } from './sources/ww3';
import { flush, insertRows, readLocal, supabase, writeOut } from './store';

const sources: SourceStatus[] = [];

async function track<T>(id: string, label: string, fn: () => Promise<T | undefined>, models?: string[]): Promise<T | undefined> {
  const t0 = Date.now();
  try {
    const r = await fn();
    if (r === undefined) sources.push({ id, label, ok: false, skipped: 'não configurado' });
    else sources.push({ id, label, ok: true, ms: Date.now() - t0, models });
    return r;
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    console.warn(`[pipeline] ${id} failed: ${msg}`);
    sources.push({ id, label, ok: false, error: msg.slice(0, 300), ms: Date.now() - t0 });
    return undefined;
  }
}

async function loadCalibration(): Promise<Calibration | undefined> {
  const s = supabase();
  if (s) {
    const { data } = await s.from('calibration').select('data').eq('id', 1).maybeSingle();
    if (data?.data) return data.data as Calibration;
  }
  return readLocal<Calibration>('calibration.json');
}

async function main() {
  const { spots } = JSON.parse(readFileSync(process.env.SPOTS_FILE ?? 'public/data/spots.json', 'utf8')) as { spots: Spot[] };
  const calib = await loadCalibration();
  const obsFeeds = feeds();
  const pts: Point[] = [...spots.map((s) => ({ lat: s.lat, lon: s.lon })), ...obsFeeds.map((f) => ({ lat: f.lat, lon: f.lon }))];

  const [marine, wind, ww3, inmet, marinha] = await Promise.all([
    track('open-meteo-marine', 'Open-Meteo Marine (ECMWF WAM, MF-WAM, DWD GWAM, NOAA GFS-Wave, MF correntes/maré/TSM)', () => fetchMarine(pts), [...WAVE_MODELS, OCEAN_MODEL]),
    track('open-meteo-forecast', 'Open-Meteo Forecast (ECMWF IFS, GFS, ICON, ARPEGE, UKMO)', () => fetchWind(pts), WIND_MODELS),
    track<Ww3Grid>('noaa-ww3', 'NOAA WaveWatch III (ERDDAP PacIOOS)', () => fetchWw3(), ['ww3']),
    track<OfficialWarning[]>('inmet', 'INMET avisos', () => fetchInmet()),
    track<OfficialWarning[]>('marinha', 'Marinha avisos de mau tempo', () => fetchMarinha()),
  ]);
  if (!marine || !wind) throw new Error('Open-Meteo marine/forecast unavailable — keeping previous data');
  const warnings = [...(inmet ?? []), ...(marinha ?? [])];
  const time = marine[0].time;
  const nowIdx = nowIndex(time);

  // Optional keyed sources (top seed spots only, to respect quotas)
  const sgKey = process.env.STORMGLASS_API_KEY, windyKey = process.env.WINDY_API_KEY;
  const maxOpt = Number(process.env.OPTIONAL_MAX_SPOTS ?? 8);
  const optTargets = spots.filter((s) => s.kind === 'seed').slice(0, maxOpt);
  const extra: Record<string, ModelVars> = {};
  await track('stormglass', 'Stormglass', async () => {
    if (!sgKey) return undefined;
    for (const s of optTargets) (extra[s.id] ??= {}).stormglass = await fetchStormglass(s, time, sgKey);
    return true;
  }, ['stormglass']);
  await track('windy', 'Windy Point Forecast', async () => {
    if (!windyKey) return undefined;
    for (const s of optTargets) (extra[s.id] ??= {}).windy = await fetchWindy(s, time, windyKey);
    return true;
  }, ['windy']);
  const cop = await track('copernicus', 'Copernicus Marine (GLO wave/phy)', async () => loadCopernicus(), ['copernicus']);

  const generatedAt = new Date().toISOString();
  const summaries: Partial<Record<Skill, SpotSummary[]>> = {};
  spots.forEach((spot, si) => {
    const mr = marine[si], wr = wind[si];
    const wave: ModelVars = {};
    for (const m of WAVE_MODELS) if (mr.models[m]) wave[m] = mr.models[m];
    if (ww3) {
      const s = sampleWw3(ww3, spot, time);
      if (s) wave.ww3 = s;
    }
    Object.assign(wave, extra[spot.id] ?? {});
    const c = cop?.[spot.id];
    if (c) wave.copernicus = alignTo(c, time);
    const raw: RawSpot = { time, wave, ocean: mr.models[OCEAN_MODEL], wind: wr.models };
    const hours = assemble(raw, spot.region, calib);
    if (c?.sea_surface_temperature) hours.forEach((h, i) => (h.sst ??= c.sea_surface_temperature[i] ?? undefined));
    const scores = scoreSeries(spot, hours, nowIdx, PROFILES['intermediário'], warnings);
    for (const skill of Object.keys(PROFILES) as Skill[]) {
      const sc = skill === 'intermediário' ? scores : scoreSeries(spot, hours, nowIdx, PROFILES[skill], warnings);
      (summaries[skill] ??= []).push(summarise(spot.id, hours, sc, nowIdx));
    }
    const daily = (k: string) => (wr.daily?.[k] ?? Object.entries(wr.daily ?? {}).find(([key]) => key.startsWith(k))?.[1] ?? []) as string[];
    const detail: SpotDetail = { id: spot.id, generatedAt, nowIdx, hours, scores, sunrise: daily('sunrise'), sunset: daily('sunset') };
    writeOut(`spot/${spot.id}.json`, detail);
  });

  // Map grid (best-match single model, 3-hourly)
  await track('grid', 'Grade do mapa (Open-Meteo best match)', async () => {
    const grid = await buildGrid(time);
    writeOut('grid.json', grid);
    return true;
  });

  // Model values at observation sites → history for calibration
  if (obsFeeds.length) {
    await track('obs', 'Boias / observações', async () => {
      const runAt = generatedAt;
      const rows: object[] = [];
      obsFeeds.forEach((f, k) => {
        const mr = marine[spots.length + k];
        for (const [model, v] of Object.entries(mr.models)) {
          if (model === OCEAN_MODEL) continue;
          for (let i = nowIdx; i < Math.min(time.length, nowIdx + 72); i++) {
            const hs = v.wave_height?.[i];
            if (hs == null) continue;
            rows.push({ run_at: runAt, feed_id: f.id, model, valid_time: new Date(`${time[i]}:00-03:00`).toISOString(), hs, tp: v.wave_peak_period?.[i] ?? v.swell_wave_peak_period?.[i] ?? v.wave_period?.[i] ?? null });
          }
        }
      });
      await insertRows('model_forecasts', rows);
      const obs = (await Promise.all(obsFeeds.map((f) => fetchObservations(f).catch(() => [])))).flat();
      await insertRows('observations', obs.map((o) => ({ feed_id: o.feed, time: o.time, hs: o.hs ?? null, tp: o.tp ?? null, dir: o.dir ?? null })));
      return true;
    });
  }

  for (const skill of Object.keys(PROFILES) as Skill[]) {
    const summary: Summary = { generatedAt, start: time[0], hours: time.length, nowIdx, skill, demo: process.env.DEMO === '1' || undefined, sources, warnings, spots: summaries[skill]! };
    writeOut(summaryFile(skill), summary);
  }
  await insertRows('runs', [{ generated_at: generatedAt, sources }]);
  await flush();
  const ok = sources.filter((s) => s.ok).map((s) => s.id);
  console.log(`[pipeline] ${spots.length} spots, ${time.length} h; sources ok: ${ok.join(', ')}`);
}

function alignTo(c: { time: string[] } & Record<string, any>, time: string[]) {
  const idx = new Map(c.time.map((t: string, i: number) => [t.slice(0, 16), i]));
  const out: Record<string, (number | null)[]> = {};
  for (const k of ['wave_height', 'wave_peak_period', 'wave_direction', 'swell_wave_height', 'swell_wave_period', 'swell_wave_direction']) {
    if (!c[k]) continue;
    out[k] = time.map((t) => {
      const i = idx.get(t);
      return i === undefined ? null : c[k][i];
    });
  }
  return out;
}

async function buildGrid(time: string[]): Promise<GridData> {
  const coast = buildCoastIndex(JSON.parse(readFileSync('data/coastline.json', 'utf8')).lines as LonLat[][]);
  const lats: number[] = [], lons: number[] = [];
  for (let la = -34.5; la <= -24.5 + 1e-9; la += 0.5) lats.push(+la.toFixed(2));
  for (let lo = -54.5; lo <= -44.5 + 1e-9; lo += 0.5) lons.push(+lo.toFixed(2));
  const cells = lats.flatMap((la) => lons.map((lo) => ({ lat: la, lon: lo })));
  const seaMask = cells.map((c) => isSea(coast, [c.lon, c.lat]));
  const seaCells = cells.filter((_, i) => seaMask[i]);
  const [mar, win] = await Promise.all([fetchGridMarine(seaCells), fetchGridWind(cells)]);
  const step = 3;
  const tIdx = time.map((_, i) => i).filter((i) => i % step === 0);
  const NA = -9999;
  const enc = (v: number | null | undefined, scale: number) => (v == null || !Number.isFinite(v) ? NA : Math.round(v * scale));
  const fields: GridData['fields'] = {
    u: { scale: 10, data: [] }, v: { scale: 10, data: [] }, hs: { scale: 100, data: [] }, dir: { scale: 1, data: [] },
    tp: { scale: 10, data: [] }, sst: { scale: 10, data: [] }, rain: { scale: 10, data: [] },
  };
  const seaIndex = new Map<number, number>();
  let k = 0;
  seaMask.forEach((s, i) => s && seaIndex.set(i, k++));
  for (const ti of tIdx) {
    const row = (f: (ci: number) => number) => cells.map((_, ci) => f(ci));
    const m = (ci: number, key: string) => {
      const si = seaIndex.get(ci);
      return si === undefined ? null : mar[si].models.best_match?.[key]?.[ti];
    };
    const w = (ci: number, key: string) => win[ci].models.best_match?.[key]?.[ti];
    const uv = (ci: number, comp: 'u' | 'v') => {
      const s = w(ci, 'wind_speed_10m'), d = w(ci, 'wind_direction_10m');
      if (s == null || d == null) return null;
      const r = (d * Math.PI) / 180; // "from" direction → vector pointing downwind
      return comp === 'u' ? -s * Math.sin(r) : -s * Math.cos(r);
    };
    fields.u.data.push(row((ci) => enc(uv(ci, 'u'), 10)));
    fields.v.data.push(row((ci) => enc(uv(ci, 'v'), 10)));
    fields.hs.data.push(row((ci) => enc(m(ci, 'wave_height'), 100)));
    fields.dir.data.push(row((ci) => enc(m(ci, 'wave_direction'), 1)));
    fields.tp.data.push(row((ci) => enc(m(ci, 'wave_period'), 10)));
    fields.sst.data.push(row((ci) => enc(m(ci, 'sea_surface_temperature'), 10)));
    fields.rain.data.push(row((ci) => enc(w(ci, 'precipitation'), 10)));
  }
  return { generatedAt: new Date().toISOString(), start: time[0], hours: tIdx.length, step, lats, lons, fields };
}

main().catch(async (e) => {
  console.error('[pipeline] fatal:', e.message ?? e);
  await insertRows('runs', [{ generated_at: new Date().toISOString(), sources, error: String(e.message ?? e) }]);
  process.exit(1);
});
