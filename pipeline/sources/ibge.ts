/**
 * IBGE municipalities (official boundaries + names) for map context and spot naming.
 *   mesh:  https://servicodados.ibge.gov.br/api/v4/malhas/estados/{UF}?intrarregiao=municipio&qualidade=intermediaria&formato=application/vnd.geo+json
 *          (falls back to /api/v3/malhas)
 *   names: https://servicodados.ibge.gov.br/api/v1/localidades/estados/{UF}/municipios
 */
import { fetchJson } from '../http';
import type { LonLat } from '../../src/core/geo';
import type { StateCode } from '../../src/core/types';

const UF: Record<StateCode, number> = { PR: 41, SC: 42, RS: 43 };
const BASE = 'https://servicodados.ibge.gov.br/api';

export interface Municipality {
  code: string;
  name: string;
  state: StateCode;
  /** Outer rings only ([lon,lat][]). */
  rings: LonLat[][];
}

const codeOf = (props: Record<string, unknown>): string | undefined => {
  for (const k of ['codarea', 'CD_MUN', 'id', 'codigo', 'cod']) if (props?.[k] != null) return String(props[k]);
  const any = Object.values(props ?? {}).find((v) => /^\d{7}$/.test(String(v)));
  return any != null ? String(any) : undefined;
};

export async function fetchMunicipalities(): Promise<Municipality[]> {
  const out: Municipality[] = [];
  for (const [state, uf] of Object.entries(UF) as [StateCode, number][]) {
    const q = `intrarregiao=municipio&qualidade=intermediaria&formato=${encodeURIComponent('application/vnd.geo+json')}`;
    const headers = { Accept: 'application/vnd.geo+json, application/json' };
    let mesh: any;
    try {
      mesh = await fetchJson(`${BASE}/v4/malhas/estados/${uf}?${q}`, { headers, retries: 1 });
    } catch {
      mesh = await fetchJson(`${BASE}/v3/malhas/estados/${uf}?${q}`, { headers, retries: 1 });
    }
    const names = await fetchJson<{ id: number; nome: string }[]>(`${BASE}/v1/localidades/estados/${uf}/municipios`, { retries: 1 });
    const nameById = new Map(names.map((n) => [String(n.id), n.nome]));
    for (const f of mesh.features ?? []) {
      const code = codeOf(f.properties);
      const name = code ? nameById.get(code) : undefined;
      if (!code || !name) continue;
      const g = f.geometry;
      const rings: LonLat[][] = g?.type === 'Polygon' ? [g.coordinates[0]] : g?.type === 'MultiPolygon' ? g.coordinates.map((p: LonLat[][]) => p[0]) : [];
      if (rings.length) out.push({ code, name, state, rings });
    }
  }
  return out;
}

/** Point-in-ring (ray casting, planar lon/lat is fine at this scale). */
export function inRing(p: LonLat, ring: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance (km, equirectangular) from p to a ring's edges. */
export function ringDistanceKm(p: LonLat, ring: LonLat[]): number {
  const kx = 111.32 * Math.cos((p[1] * Math.PI) / 180), ky = 110.57;
  let best = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const ax = (ring[i - 1][0] - p[0]) * kx, ay = (ring[i - 1][1] - p[1]) * ky;
    const bx = (ring[i][0] - p[0]) * kx, by = (ring[i][1] - p[1]) * ky;
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/** Municipality containing p, else the nearest one within maxKm. */
export function municipalityAt(ms: Municipality[], p: LonLat, maxKm = 8): Municipality | undefined {
  let best: Municipality | undefined, bd = Infinity;
  for (const m of ms) {
    for (const r of m.rings) {
      if (inRing(p, r)) return m;
      const d = ringDistanceKm(p, r);
      if (d < bd) { bd = d; best = m; }
    }
  }
  return bd <= maxKm ? best : undefined;
}

/** Area-weighted centroid of the largest ring (label anchor). */
export function labelPoint(m: Municipality): LonLat {
  const ring = m.rings.reduce((a, b) => (Math.abs(area(b)) > Math.abs(area(a)) ? b : a));
  let cx = 0, cy = 0, A = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    cx += (ring[j][0] + ring[i][0]) * f;
    cy += (ring[j][1] + ring[i][1]) * f;
    A += f;
  }
  return A ? [cx / (3 * A), cy / (3 * A)] : ring[0];
}
function area(r: LonLat[]) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
}
