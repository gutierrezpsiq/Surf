/**
 * One-off: clip Natural Earth 10m land polygons to the region and lightly simplify,
 * producing the app's offline basemap (public/basemap/land.json, GeoJSON).
 * Usage: tsx pipeline/tools/clip-land.ts <ne_10m_land.geojson>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const B = { w: -58, e: -44, s: -36, n: -22 };
type P = [number, number];

function clipRing(ring: P[]): P[] {
  const edges: [(p: P) => boolean, (a: P, b: P) => P][] = [
    [(p) => p[0] >= B.w, (a, b) => [B.w, a[1] + ((b[1] - a[1]) * (B.w - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= B.e, (a, b) => [B.e, a[1] + ((b[1] - a[1]) * (B.e - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= B.s, (a, b) => [a[0] + ((b[0] - a[0]) * (B.s - a[1])) / (b[1] - a[1]), B.s]],
    [(p) => p[1] <= B.n, (a, b) => [a[0] + ((b[0] - a[0]) * (B.n - a[1])) / (b[1] - a[1]), B.n]],
  ];
  let out = ring;
  for (const [inside, cut] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i], prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cut(prev, cur));
    }
    if (!out.length) break;
  }
  return out;
}

function simplify(ring: P[], minDeg = 0.003): P[] {
  const out: P[] = [];
  for (const p of ring) {
    const q = out[out.length - 1];
    if (!q || Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > minDeg) out.push([+p[0].toFixed(4), +p[1].toFixed(4)]);
  }
  return out;
}

const gj = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const polys: P[][][] = [];
for (const f of gj.features) {
  const g = f.geometry;
  const list: P[][][] = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  for (const poly of list) {
    const outer = simplify(clipRing(poly[0]));
    if (outer.length < 4) continue;
    outer.push(outer[0]);
    polys.push([outer]);
  }
}
mkdirSync('public/basemap', { recursive: true });
writeFileSync('public/basemap/land.json', JSON.stringify({ type: 'Feature', properties: { source: 'Natural Earth 10m (public domain)' }, geometry: { type: 'MultiPolygon', coordinates: polys } }));
console.log(`land: ${polys.length} polygons, ${polys.reduce((s, p) => s + p[0].length, 0)} vertices`);
