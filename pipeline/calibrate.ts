/**
 * Daily calibration job: pairs past model forecasts at buoy sites with observations (±30 min),
 * fits per-region × per-model bias + accuracy weights (src/core/calibration.ts) and stores them.
 * The next pipeline run applies them automatically.
 */
import { fitCalibration, Pair } from '../src/core/calibration';
import { feeds } from './sources/observations';
import { flush, supabase, writeOut } from './store';

async function main() {
  const s = supabase();
  if (!s) {
    console.log('[calibrate] SUPABASE_* not set — calibration needs stored history; skipping');
    return;
  }
  const regionOf = new Map(feeds().map((f) => [f.id, f.region]));
  if (!regionOf.size) {
    console.log('[calibrate] OBS_FEEDS empty — no observations to calibrate against; skipping');
    return;
  }
  const since = new Date(Date.now() - 90 * 86400e3).toISOString();
  const { data: obs, error: e1 } = await s.from('observations').select('feed_id,time,hs,tp').gte('time', since).limit(100000);
  const { data: fc, error: e2 } = await s.from('model_forecasts').select('feed_id,model,valid_time,hs,tp').gte('valid_time', since).lte('valid_time', new Date().toISOString()).limit(500000);
  if (e1 || e2) throw new Error((e1 ?? e2)!.message);

  const byFeed = new Map<string, { t: number; hs: number | null; tp: number | null }[]>();
  for (const o of obs ?? []) {
    if (!byFeed.has(o.feed_id)) byFeed.set(o.feed_id, []);
    byFeed.get(o.feed_id)!.push({ t: new Date(o.time).getTime(), hs: o.hs, tp: o.tp });
  }
  for (const list of byFeed.values()) list.sort((a, b) => a.t - b.t);

  const pairs: Pair[] = [];
  const now = Date.now();
  for (const f of fc ?? []) {
    const region = regionOf.get(f.feed_id);
    const list = byFeed.get(f.feed_id);
    if (!region || !list) continue;
    const t = new Date(f.valid_time).getTime();
    const o = nearest(list, t);
    if (!o || Math.abs(o.t - t) > 30 * 60e3) continue;
    const ageDays = (now - t) / 86400e3;
    if (f.hs != null && o.hs != null) pairs.push({ region, model: f.model, var: 'hs', f: f.hs, o: o.hs, ageDays });
    if (f.tp != null && o.tp != null) pairs.push({ region, model: f.model, var: 'tp', f: f.tp, o: o.tp, ageDays });
  }
  const calib = fitCalibration(pairs);
  await s.from('calibration').upsert({ id: 1, data: calib, updated_at: calib.updatedAt });
  writeOut('calibration.json', calib);
  await flush();
  console.log(`[calibrate] ${pairs.length} pairs →`, JSON.stringify(calib.regions));
}

function nearest<T extends { t: number }>(list: T[], t: number): T | undefined {
  let lo = 0, hi = list.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const a = list[lo], b = list[lo - 1];
  if (!a) return b;
  if (!b) return a;
  return Math.abs(a.t - t) < Math.abs(b.t - t) ? a : b;
}

main().catch((e) => { console.error(e); process.exit(1); });
