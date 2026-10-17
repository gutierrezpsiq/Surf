/**
 * Automatic spot database.
 *   1. Coastline: OpenStreetMap natural=coastline via Overpass; fallback to committed
 *      Natural Earth 10m clip (data/coastline.json) when Overpass is unreachable.
 *   2. Spots: curated seed names + OSM sport=surfing features + virtual points every ~8 km.
 *   3. For each: snap to coast → orientation (normal facing the sea) → swell exposure by
 *      ray casting → break type & hazards inferred from OSM structures / coastline shape.
 * Output: public/data/spots.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildCoastIndex, CoastIndex, exposure, mainWindow, orientation, snapToCoast } from '../src/core/coast';
import { haversineKm, LonLat, norm360, compassPt } from '../src/core/geo';
import { regionFor } from '../src/core/regions';
import type { BreakType, Spot } from '../src/core/types';
import { fetchJson } from './http';
import { SEEDS } from './seeds';

const BBOX = { s: -33.76, w: -54.0, n: -25.32, e: -47.8 }; // PR/SC/RS coast (Chuí → PR/SP border)
const OVERPASS = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';
const VIRTUAL_SPACING_KM = 8;

interface OsmFeature { kind: 'surf' | 'breakwater' | 'groyne' | 'pier' | 'reef' | 'rock' | 'cliff'; name?: string; pts: LonLat[] }

async function overpass(): Promise<{ coast: LonLat[][]; features: OsmFeature[] } | null> {
  const bb = `(${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e})`;
  const q = `[out:json][timeout:180];
(
  way["natural"="coastline"]${bb};
  nwr["sport"="surfing"]${bb};
  nwr["man_made"~"^(breakwater|groyne|pier)$"]${bb};
  nwr["natural"~"^(reef|rock|bare_rock|cliff)$"]${bb};
);
out geom;`;
  try {
    const js = await fetchJson<any>(OVERPASS, {
      method: 'POST',
      body: new URLSearchParams({ data: q }),
      // Overpass rejects anonymous clients (HTTP 406) — identify the app per its usage policy
      headers: { 'User-Agent': 'SwellSul/0.1 (+https://github.com/gutierrezpsiq/Surf)', Accept: 'application/json' },
      timeoutMs: 200_000,
      retries: 1,
    });
    const coast: LonLat[][] = [];
    const features: OsmFeature[] = [];
    for (const el of js.elements ?? []) {
      const pts: LonLat[] = el.type === 'node' ? [[el.lon, el.lat]] : (el.geometry ?? []).map((g: any) => [g.lon, g.lat]);
      if (el.center) pts.push([el.center.lon, el.center.lat]);
      const t = el.tags ?? {};
      if (t.natural === 'coastline') coast.push(pts);
      else if (t.sport === 'surfing') features.push({ kind: 'surf', name: t.name, pts });
      else if (t.man_made) features.push({ kind: t.man_made, pts });
      else if (t.natural === 'bare_rock') features.push({ kind: 'rock', pts });
      else if (t.natural) features.push({ kind: t.natural, pts });
    }
    return { coast: stitch(coast).map((l) => decimate(l, 0.25)).filter((l) => l.length > 1), features };
  } catch (e) {
    console.warn(`[spots] Overpass unavailable (${(e as Error).message}); using Natural Earth fallback`);
    return null;
  }
}

/** Join OSM coastline ways that share endpoints so tangents can be computed across way boundaries. */
function stitch(ways: LonLat[][]): LonLat[][] {
  const key = (p: LonLat) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
  const byStart = new Map<string, number>();
  ways.forEach((w, i) => byStart.set(key(w[0]), i));
  const used = new Set<number>();
  const out: LonLat[][] = [];
  ways.forEach((w, i) => {
    if (used.has(i)) return;
    used.add(i);
    const line = [...w];
    let next = byStart.get(key(line[line.length - 1]));
    while (next !== undefined && !used.has(next)) {
      used.add(next);
      line.push(...ways[next].slice(1));
      next = byStart.get(key(line[line.length - 1]));
    }
    out.push(line);
  });
  return out;
}

/** Keep vertices ≥ minKm apart (plus endpoints): full-res OSM coastline is far denser than ray casting needs. */
function decimate(line: LonLat[], minKm: number): LonLat[] {
  const out: LonLat[] = [line[0]];
  for (let i = 1; i < line.length - 1; i++) if (haversineKm(out[out.length - 1], line[i]) >= minKm) out.push(line[i]);
  if (line.length > 1) out.push(line[line.length - 1]);
  return out;
}

function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function nearbyFeatures(features: OsmFeature[], p: LonLat, km: number) {
  return features.filter((f) => f.kind !== 'surf' && f.pts.some((q) => haversineKm(p, q) <= km));
}

function inferBreak(name: string, near: OsmFeature[], nearBlocked: number): { type: BreakType; source: string; hazards: string[] } {
  const hazards: string[] = [];
  const kinds = new Set(near.map((f) => f.kind));
  let type: BreakType = 'beach';
  let source = 'padrão: praia de areia (fundo presumido)';
  if (kinds.has('reef')) { type = 'reef'; source = 'OSM natural=reef ≤ 1 km'; hazards.push('Fundo de laje/recife'); }
  else if (kinds.has('breakwater') || kinds.has('groyne') || /molhe/i.test(name)) {
    type = 'jetty'; source = kinds.size ? 'OSM man_made=breakwater/groyne ≤ 1 km' : 'nome contém "molhe"';
    hazards.push('Molhes/pedras na arrebentação');
  } else if (kinds.has('pier') || /plataforma/i.test(name)) {
    type = 'pier'; source = kinds.has('pier') ? 'OSM man_made=pier ≤ 1 km' : 'nome contém "plataforma"';
    hazards.push('Pilares da plataforma de pesca');
  } else if (nearBlocked < 0.4) {
    type = 'point'; source = 'geometria: ponta/costão (terra em < 40 % das direções a 3 km)';
    hazards.push('Costão rochoso próximo');
  }
  if (kinds.has('rock') || kinds.has('cliff')) hazards.push('Pedras/costão (OSM)');
  if (nearBlocked > 0.6) hazards.push('Enseada abrigada: só entra com swell grande');
  if (type === 'beach' || type === 'pier') hazards.push('Correntes de retorno comuns em praia exposta');
  return { type, source, hazards: [...new Set(hazards)] };
}

function analyse(idx: CoastIndex, features: OsmFeature[], coastSource: Spot['inferred']['coastSource'], p: LonLat, name: string) {
  const snap = snapToCoast(idx, p);
  const o = orientation(idx, snap);
  const ex = exposure(idx, o.sea, o.facing);
  const win = mainWindow(ex.bins);
  const near = nearbyFeatures(features, snap.point, 1);
  const br = inferBreak(name, near, ex.nearBlocked);
  return { snap, facing: Math.round(o.facing), sea: o.sea, ex, win, br, coastSource };
}

async function main() {
  const osm = await overpass();
  const coastSource: Spot['inferred']['coastSource'] = osm && osm.coast.length > 10 ? 'osm' : 'naturalearth';
  const lines: LonLat[][] = coastSource === 'osm' ? osm!.coast : JSON.parse(readFileSync('data/coastline.json', 'utf8')).lines;
  const features = osm?.features ?? [];
  const idx = buildCoastIndex(lines);
  console.log(`[spots] coastline: ${coastSource}, ${lines.length} lines, ${idx.n} segments; OSM features: ${features.length}`);

  const spots: Spot[] = [];
  const make = (name: string, p: LonLat, kind: Spot['kind'], a = analyse(idx, features, coastSource, p, name)): Spot => {
    const { state, region } = regionFor(a.snap.point[1]);
    return {
      id: slug(name),
      name,
      state,
      region,
      lat: +a.sea[1].toFixed(5),
      lon: +a.sea[0].toFixed(5),
      kind,
      facing: a.facing,
      offshore: norm360(a.facing + 180),
      exposure: a.ex.bins,
      window: { from: a.win.from, to: a.win.to },
      breakType: a.br.type,
      hazards: a.br.hazards,
      inferred: {
        coastSource,
        breakSource: a.br.source,
        orientationQuality: coastSource === 'osm' ? 'good' : 'coarse',
      },
    };
  };

  for (const s of SEEDS) spots.push(make(s.name, [s.lon, s.lat], 'seed'));
  for (const f of features.filter((f) => f.kind === 'surf' && f.name)) {
    const p = f.pts[f.pts.length - 1];
    if (spots.some((s) => haversineKm([s.lon, s.lat], p) < 1.5)) continue;
    spots.push(make(f.name!, p, 'osm'));
  }

  // Virtual points: walk each coastline, every ~8 km, keep open-ocean ones away from named spots.
  const named = [...spots];
  for (const line of lines) {
    let acc = 0;
    for (let i = 1; i < line.length; i++) {
      acc += haversineKm(line[i - 1], line[i]);
      if (acc < VIRTUAL_SPACING_KM) continue;
      acc = 0;
      const p = line[i];
      if (p[1] > BBOX.n || p[1] < BBOX.s || p[0] < BBOX.w || p[0] > BBOX.e) continue;
      if (spots.some((s) => haversineKm([s.lon, s.lat], p) < VIRTUAL_SPACING_KM * 0.6)) continue;
      const a = analyse(idx, features, coastSource, p, '');
      // Keep only coast open to the South Atlantic swell sectors (ENE→S); drops bays, Lagoa dos Patos, channels.
      if (a.win.width < 60 || Math.max(...a.ex.bins.slice(6, 21)) < 0.6) continue;
      const ref = named.reduce((b, s) => (haversineKm([s.lon, s.lat], p) < haversineKm([b.lon, b.lat], p) ? s : b));
      const d = Math.round(haversineKm([ref.lon, ref.lat], p));
      const dir = compassPt(Math.atan2(p[0] - ref.lon, p[1] - ref.lat) * (180 / Math.PI)).replace(/^(NN|SS)/, (m) => m[0]);
      const cityRef = SEEDS.find((s) => s.name === ref.name)?.city ?? ref.name;
      const name = `Litoral ${d} km ${dir} de ${cityRef}`;
      const spot = make(name, p, 'virtual', a);
      spot.id = `v-${slug(name)}`;
      spots.push(spot);
    }
  }

  // ensure unique ids
  const seen = new Map<string, number>();
  for (const s of spots) {
    const n = seen.get(s.id) ?? 0;
    seen.set(s.id, n + 1);
    if (n) s.id = `${s.id}-${n + 1}`;
  }
  spots.sort((a, b) => b.lat - a.lat);
  mkdirSync('public/data', { recursive: true });
  writeFileSync('public/data/spots.json', JSON.stringify({ generatedAt: new Date().toISOString(), coastSource, spots }));
  console.log(`[spots] ${spots.length} spots (${spots.filter((s) => s.kind === 'seed').length} seed, ${spots.filter((s) => s.kind === 'osm').length} osm, ${spots.filter((s) => s.kind === 'virtual').length} virtual)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
