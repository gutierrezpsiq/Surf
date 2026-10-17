/**
 * Data access: the app only reads precomputed JSON (pipeline output). Network-first in the
 * service worker, so the last good data stays available offline.
 */
import { useEffect, useMemo, useState } from 'react';
import { driveMinutes, PORTO_ALEGRE } from '../core/drive';
import type { LonLat } from '../core/geo';
import { summaryFile } from '../core/spotScore';
import type { GridData, Spot, SpotDetail, Summary } from '../core/types';
import { useSettings } from './settings';

const BASE = import.meta.env.BASE_URL;
const sbUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
/** Forecast files: explicit URL, else Supabase public bucket, else bundled /data (GitHub Pages build). */
export const DATA_URL: string = (import.meta.env.VITE_DATA_URL as string | undefined) ?? (sbUrl ? `${sbUrl}/storage/v1/object/public/forecast/` : `${BASE}data/`);

const cache = new Map<string, Promise<unknown>>();
function get<T>(url: string): Promise<T> {
  if (!cache.has(url)) {
    const p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return r.json();
    });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return cache.get(url) as Promise<T>;
}

export const loadSpots = () => get<{ spots: Spot[]; coastSource: string }>(`${BASE}data/spots.json`).then((d) => d.spots);
export const loadSummary = (skill: Parameters<typeof summaryFile>[0]) => get<Summary>(`${DATA_URL}${summaryFile(skill)}`);
export const loadDetail = (id: string) => get<SpotDetail>(`${DATA_URL}spot/${id}.json`);
export const loadGrid = () => get<GridData>(`${DATA_URL}grid.json`);
export interface CityFeature { type: 'Feature'; properties: { name: string; state: string; label: [number, number]; named: boolean }; geometry: { type: 'MultiPolygon'; coordinates: number[][][][] } }
export const loadCities = () => get<{ type: 'FeatureCollection'; features: CityFeature[] }>(`${BASE}basemap/cities.json`);
export const loadLand = () => get<{ type: 'Feature'; geometry: { type: 'MultiPolygon'; coordinates: number[][][][] } }>(`${BASE}basemap/land.json`);

type State<T> = { data?: T; error?: string; loading: boolean };

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): State<T> {
  const [s, set] = useState<State<T>>({ loading: true });
  useEffect(() => {
    let alive = true;
    set((p) => ({ ...p, loading: true }));
    fn().then(
      (data) => alive && set({ data, loading: false }),
      (e) => alive && set({ error: String(e.message ?? e), loading: false }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return s;
}

export function useHome(): LonLat {
  const st = useSettings();
  return st.location === 'gps' && st.gps ? st.gps : PORTO_ALEGRE;
}

/** Spots + current-skill summary joined, with drive time from home. */
export function useForecast() {
  const st = useSettings();
  const home = useHome();
  const spots = useAsync(loadSpots, []);
  const summary = useAsync(() => loadSummary(st.skill), [st.skill]);
  const rows = useMemo(() => {
    if (!spots.data || !summary.data) return undefined;
    const byId = new Map(summary.data.spots.map((s) => [s.id, s]));
    return spots.data
      .filter((s) => byId.has(s.id))
      .map((spot) => ({ spot, sum: byId.get(spot.id)!, drive: driveMinutes(home, [spot.lon, spot.lat]) }));
  }, [spots.data, summary.data, home]);
  return { rows, summary: summary.data, error: spots.error ?? summary.error, loading: spots.loading || summary.loading };
}

export type Row = NonNullable<ReturnType<typeof useForecast>['rows']>[number];
