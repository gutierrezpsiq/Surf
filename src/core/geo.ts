/** Small spherical-geometry helpers. Angles in degrees, distances in km. */
export const R_EARTH_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export type LonLat = [number, number];

/** Normalise any angle to [0, 360). */
export function norm360(a: number): number {
  return ((a % 360) + 360) % 360;
}

/** Smallest absolute difference between two bearings, in [0, 180]. */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(norm360(a) - norm360(b));
  return d > 180 ? 360 - d : d;
}

export function haversineKm(a: LonLat, b: LonLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial compass bearing from a to b. */
export function bearing(a: LonLat, b: LonLat): number {
  const φ1 = rad(a[1]), φ2 = rad(b[1]), Δλ = rad(b[0] - a[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return norm360(deg(Math.atan2(y, x)));
}

/** Point reached travelling `km` from `p` along bearing `brg`. */
export function destination(p: LonLat, brg: number, km: number): LonLat {
  const δ = km / R_EARTH_KM, θ = rad(brg), φ1 = rad(p[1]), λ1 = rad(p[0]);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [deg(λ2), deg(φ2)];
}

/**
 * Local equirectangular projection around a reference latitude (km).
 * Accurate to <0.5 % over a few hundred km — plenty for ray casting.
 */
export function makeProjector(refLat: number) {
  const kx = (Math.PI / 180) * R_EARTH_KM * Math.cos(rad(refLat));
  const ky = (Math.PI / 180) * R_EARTH_KM;
  return {
    fwd: ([lon, lat]: LonLat): [number, number] => [lon * kx, lat * ky],
    inv: ([x, y]: [number, number]): LonLat => [x / kx, y / ky],
  };
}

/**
 * Intersection parameter t∈[0,1] along segment p→p2 with segment q→q2, or null.
 * Planar coordinates.
 */
export function segmentIntersectT(
  p: [number, number], p2: [number, number], q: [number, number], q2: [number, number],
): number | null {
  const rx = p2[0] - p[0], ry = p2[1] - p[1];
  const sx = q2[0] - q[0], sy = q2[1] - q[1];
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const qpx = q[0] - p[0], qpy = q[1] - p[1];
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** Circular (vector) mean of bearings with optional weights. Returns NaN if undefined. */
export function circularMean(angles: number[], weights?: number[]): number {
  let s = 0, c = 0;
  angles.forEach((a, i) => {
    const w = weights ? weights[i] : 1;
    s += w * Math.sin(rad(a));
    c += w * Math.cos(rad(a));
  });
  if (Math.abs(s) < 1e-9 && Math.abs(c) < 1e-9) return NaN;
  return norm360(deg(Math.atan2(s, c)));
}

/** Circular spread: weighted RMS of angular deviations from the circular mean (degrees). */
export function circularSpread(angles: number[], weights?: number[]): number {
  const m = circularMean(angles, weights);
  if (Number.isNaN(m)) return 180;
  let sw = 0, acc = 0;
  angles.forEach((a, i) => {
    const w = weights ? weights[i] : 1;
    sw += w;
    acc += w * angleDiff(a, m) ** 2;
  });
  return sw ? Math.sqrt(acc / sw) : 0;
}

const COMPASS_PT = ['N', 'NNE', 'NE', 'ENE', 'L', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
/** 16-point compass label in Portuguese (L = leste, O = oeste). */
export function compassPt(deg16: number): string {
  return COMPASS_PT[Math.round(norm360(deg16) / 22.5) % 16];
}
