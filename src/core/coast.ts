/**
 * Coastline analysis: snapping, beach orientation and swell exposure by ray casting.
 * Pure functions over polylines ([lon,lat][]) so they run in Node and tests alike.
 */
import { angleDiff, destination, haversineKm, LonLat, makeProjector, norm360, segmentIntersectT } from './geo';

export interface CoastIndex {
  lines: LonLat[][];
  /** Flattened planar segments: [x1,y1,x2,y2, lineIdx, vertexIdx]. */
  segs: Float64Array;
  n: number;
  proj: ReturnType<typeof makeProjector>;
}

const SEG_STRIDE = 6;

export function buildCoastIndex(lines: LonLat[][]): CoastIndex {
  const lats = lines.flat().map((p) => p[1]);
  const refLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const proj = makeProjector(refLat);
  const n = lines.reduce((s, l) => s + l.length - 1, 0);
  const segs = new Float64Array(n * SEG_STRIDE);
  let k = 0;
  lines.forEach((line, li) => {
    for (let i = 0; i < line.length - 1; i++) {
      const a = proj.fwd(line[i]), b = proj.fwd(line[i + 1]);
      segs.set([a[0], a[1], b[0], b[1], li, i], k * SEG_STRIDE);
      k++;
    }
  });
  return { lines, segs, n, proj };
}

export interface Snap {
  point: LonLat;
  distKm: number;
  line: number;
  vertex: number;
}

/** Nearest point on the coastline to `p`. */
export function snapToCoast(idx: CoastIndex, p: LonLat): Snap {
  const P = idx.proj.fwd(p);
  let best = { d2: Infinity, x: 0, y: 0, line: 0, vertex: 0 };
  for (let k = 0; k < idx.n; k++) {
    const o = k * SEG_STRIDE;
    const x1 = idx.segs[o], y1 = idx.segs[o + 1], x2 = idx.segs[o + 2], y2 = idx.segs[o + 3];
    const dx = x2 - x1, dy = y2 - y1;
    const L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((P[0] - x1) * dx + (P[1] - y1) * dy) / L2)) : 0;
    const x = x1 + t * dx, y = y1 + t * dy;
    const d2 = (P[0] - x) ** 2 + (P[1] - y) ** 2;
    if (d2 < best.d2) best = { d2, x, y, line: idx.segs[o + 4], vertex: idx.segs[o + 5] };
  }
  return { point: idx.proj.inv([best.x, best.y]), distKm: Math.sqrt(best.d2), line: best.line, vertex: best.vertex };
}

/**
 * Coast tangent bearing near a snapped point: principal axis of vertices within
 * ±halfKm along the polyline. Returns bearing in [0,180).
 */
export function coastTangent(idx: CoastIndex, snap: Snap, halfKm = 2.5): number {
  const line = idx.lines[snap.line];
  const pts: [number, number][] = [idx.proj.fwd(snap.point)];
  const walk = (dir: 1 | -1) => {
    let acc = 0;
    let i = dir === 1 ? snap.vertex + 1 : snap.vertex;
    let prev = snap.point;
    let first = true;
    while (i >= 0 && i < line.length) {
      acc += haversineKm(prev, line[i]);
      // always keep the first neighbour so sparse (long, straight) segments still define a tangent
      if (acc > halfKm && !first) break;
      first = false;
      pts.push(idx.proj.fwd(line[i]));
      prev = line[i];
      i += dir;
    }
  };
  walk(1);
  walk(-1);
  if (pts.length < 2) {
    const a = idx.proj.fwd(line[snap.vertex]), b = idx.proj.fwd(line[Math.min(snap.vertex + 1, line.length - 1)]);
    pts.push(a, b);
  }
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pts) {
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy); // angle from +x (east) axis
  // planar angle from east, CCW → compass bearing from north, CW
  return norm360(90 - (theta * 180) / Math.PI) % 180;
}

/** Distance (km) until a ray from `p` along `brg` first crosses the coastline, or Infinity within maxKm. */
export function rayHitKm(idx: CoastIndex, p: LonLat, brg: number, maxKm = 300): number {
  const P = idx.proj.fwd(p);
  const Q = idx.proj.fwd(destination(p, brg, maxKm));
  let tMin = Infinity;
  for (let k = 0; k < idx.n; k++) {
    const o = k * SEG_STRIDE;
    const t = segmentIntersectT(P, Q, [idx.segs[o], idx.segs[o + 1]], [idx.segs[o + 2], idx.segs[o + 3]]);
    if (t !== null && t < tMin) tMin = t;
  }
  return tMin === Infinity ? Infinity : tMin * maxKm;
}

/** Fraction of a fetch distance that lets swell through: islands far away only cast partial shadows. */
export function fetchFactor(km: number): number {
  if (km < 15) return 0;
  if (km === Infinity || km >= 300) return 1;
  return 0.25 + (0.6 * (km - 15)) / 285;
}

/**
 * Point-in-sea by ray parity: the region's open ocean lies to the east, so a horizontal ray
 * to `eastLon` crosses the coastline an even number of times from the sea, odd from land.
 */
export function isSea(idx: CoastIndex, p: LonLat, eastLon = -44.9): boolean {
  const [px, py] = idx.proj.fwd(p);
  const qx = idx.proj.fwd([eastLon, p[1]])[0];
  let crossings = 0;
  for (let k = 0; k < idx.n; k++) {
    const o = k * SEG_STRIDE;
    const x1 = idx.segs[o], y1 = idx.segs[o + 1], x2 = idx.segs[o + 2], y2 = idx.segs[o + 3];
    // half-open rule so a shared vertex on the ray is counted once
    if (y1 > py === y2 > py) continue;
    const x = x1 + ((py - y1) * (x2 - x1)) / (y2 - y1);
    if (x > px && x <= qx) crossings++;
  }
  return crossings % 2 === 0;
}

/**
 * Beach facing + sea-side point: of the two normals to the coast tangent, keep the one whose
 * offset point lies in the sea; if ambiguous (spits, islets) prefer the side with the longer fetch.
 */
export function orientation(idx: CoastIndex, snap: Snap, offsetKm = 0.4) {
  const tan = coastTangent(idx, snap);
  const candidates = [norm360(tan + 90), norm360(tan - 90)].map((facing) => {
    const sea = destination(snap.point, facing, offsetKm);
    let open = 0;
    for (let d = -60; d <= 60; d += 15) open += Math.min(rayHitKm(idx, sea, facing + d, 150), 150);
    return { facing, sea, open, wet: isSea(idx, sea) };
  });
  candidates.sort((a, b) => Number(b.wet) - Number(a.wet) || b.open - a.open);
  const best = candidates[0];
  // Effective facing = mean direction of open water seen from the spot (a cove faces its mouth,
  // a beach beside a jetty faces the sea, not the jetty). Coast-line tangent is only the fallback.
  let sx = 0, sy = 0, total = 0;
  for (let b = 0; b < 360; b += 10) {
    const km = Math.min(rayHitKm(idx, best.sea, b, 150), 150);
    const w = km < 1 ? 0 : km / 150;
    sx += w * Math.sin((b * Math.PI) / 180);
    sy += w * Math.cos((b * Math.PI) / 180);
    total += w;
  }
  const strength = total ? Math.hypot(sx, sy) / total : 0;
  if (strength > 0.15) {
    const open = norm360((Math.atan2(sx, sy) * 180) / Math.PI);
    return { ...best, facing: open, tangentFacing: best.facing };
  }
  return { ...best, tangentFacing: best.facing };
}

/**
 * Exposure 0..1 per 10° sector for swell arriving FROM that direction at `sea`.
 * Combines ray-cast fetch with an angular refraction factor relative to the beach facing.
 */
export function exposure(idx: CoastIndex, sea: LonLat, facing: number): { bins: number[]; nearBlocked: number } {
  const bins: number[] = [];
  let nearBlocked = 0, nearTotal = 0;
  for (let b = 0; b < 36; b++) {
    let acc = 0;
    for (const off of [-2.5, 2.5]) {
      const brg = b * 10 + off;
      const km = rayHitKm(idx, sea, brg);
      const diff = angleDiff(brg, facing);
      const ang = diff >= 95 ? 0 : Math.pow(Math.cos((Math.min(diff, 90) * Math.PI) / 180), 0.6);
      acc += fetchFactor(km) * ang;
      nearTotal++;
      if (km < 3) nearBlocked++;
    }
    bins.push(+(acc / 2).toFixed(2));
  }
  return { bins, nearBlocked: nearBlocked / nearTotal };
}

/** Longest contiguous run of sectors with exposure ≥ thr → {from,to} compass range. */
export function mainWindow(bins: number[], thr = 0.35): { from: number; to: number; width: number } {
  const n = bins.length;
  let best = { start: 0, len: 0 };
  for (let s = 0; s < n; s++) {
    if (bins[s] < thr || bins[(s - 1 + n) % n] >= thr) continue;
    let len = 0;
    while (len < n && bins[(s + len) % n] >= thr) len++;
    if (len > best.len) best = { start: s, len };
  }
  if (best.len === 0 && bins.every((b) => b >= thr)) best = { start: 0, len: n };
  if (best.len === 0) {
    // nothing above threshold (sheltered cove): report the single most exposed sector
    const k = bins.indexOf(Math.max(...bins));
    best = { start: k, len: 1 };
  }
  return { from: best.start * 10 - 5 < 0 ? 355 : best.start * 10 - 5, to: norm360((best.start + best.len) * 10 - 5), width: best.len * 10 };
}

/** Exposure for a direction, linear interpolation between 10° bins. */
export function exposureAt(bins: number[], dirFrom: number): number {
  const x = norm360(dirFrom) / 10;
  const i = Math.floor(x) % 36, j = (i + 1) % 36, f = x - Math.floor(x);
  return bins[i] * (1 - f) + bins[j] * f;
}
