/**
 * One-off: clip Natural Earth 10m coastline (+ minor islands) to the region and
 * write data/coastline.json (array of polylines [lon,lat][]).
 * Used as the offline fallback when Overpass/OSM is unreachable.
 *
 * Usage: tsx pipeline/tools/clip-natural-earth.ts <ne_10m_coastline.geojson> <ne_10m_minor_islands_coastline.geojson>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const BBOX = { west: -56, east: -45, south: -35.5, north: -23.5 };
const inBox = ([lon, lat]: number[]) =>
  lon >= BBOX.west && lon <= BBOX.east && lat >= BBOX.south && lat <= BBOX.north;

const out: number[][][] = [];
for (const file of process.argv.slice(2)) {
  const gj = JSON.parse(readFileSync(file, 'utf8'));
  for (const f of gj.features) {
    const g = f.geometry;
    const lines: number[][][] = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const line of lines) {
      let cur: number[][] = [];
      for (const p of line) {
        if (inBox(p)) cur.push([+p[0].toFixed(5), +p[1].toFixed(5)]);
        else if (cur.length) { if (cur.length > 1) out.push(cur); cur = []; }
      }
      if (cur.length > 1) out.push(cur);
    }
  }
}
writeFileSync('data/coastline.json', JSON.stringify({ source: 'Natural Earth 10m (public domain)', bbox: BBOX, lines: out }));
console.log(`wrote ${out.length} polylines, ${out.reduce((s, l) => s + l.length, 0)} vertices`);
