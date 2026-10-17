import { useSyncExternalStore } from 'react';
import type { Skill } from '../core/scoring';

export interface Settings {
  skill: Skill;
  favorites: string[];
  location: 'poa' | 'gps';
  gps?: [number, number]; // lon, lat
  maxDriveMin: number;
  notify: boolean;
}

const DEFAULTS: Settings = { skill: 'intermediário', favorites: [], location: 'poa', maxDriveMin: 240, notify: false };
const KEY = 'swellsul:settings';
const listeners = new Set<() => void>();
let current: Settings = load();

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

export function getSettings() {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode: keep in memory */
  }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function toggleFavorite(id: string) {
  const f = current.favorites;
  updateSettings({ favorites: f.includes(id) ? f.filter((x) => x !== id) : [...f, id] });
}
