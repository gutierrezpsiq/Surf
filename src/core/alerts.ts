import { driveMinutes } from './drive';
import type { LonLat } from './geo';
import type { Spot, Summary } from './types';

export interface AlertPrefs {
  home: LonLat;
  maxDriveMin: number;
  minScore: number;
}

export interface Alert { spotId: string; name: string; date: string; start: string; end: string; score: number; conf: string; driveMin: number }

/**
 * Spots within the drive limit with a daylight window ≥ minScore, medium/high confidence,
 * no safety flag, starting within 72 h of `now` (local ISO hour).
 */
export function findAlerts(summary: Summary, spots: Spot[], prefs: AlertPrefs, now: string): Alert[] {
  const byId = new Map(spots.map((s) => [s.id, s]));
  const limit = new Date(new Date(`${now}:00-03:00`).getTime() + 72 * 3600e3).toISOString();
  const out: Alert[] = [];
  for (const ss of summary.spots) {
    const spot = byId.get(ss.id);
    if (!spot) continue;
    const driveMin = driveMinutes(prefs.home, [spot.lon, spot.lat]);
    if (driveMin > prefs.maxDriveMin) continue;
    for (const d of ss.days) {
      if (!d.window || d.red || d.score < prefs.minScore || d.conf === 'baixa') continue;
      const startUtc = new Date(`${d.window.start}:00-03:00`).toISOString();
      if (d.window.end < now || startUtc > limit) continue;
      out.push({ spotId: ss.id, name: spot.name, date: d.date, start: d.window.start, end: d.window.end, score: d.score, conf: d.conf, driveMin });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
