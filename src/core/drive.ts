import { haversineKm, LonLat } from './geo';

export const PORTO_ALEGRE: LonLat = [-51.2177, -30.0346];

/**
 * Drive time estimate without a routing API: great-circle distance × 1.35 road-winding factor
 * at an average 75 km/h, plus 10 min to park. Coastal BR-101 / RS-030 trips land within ~15 %.
 */
export function driveMinutes(from: LonLat, to: LonLat): number {
  return Math.round(((haversineKm(from, to) * 1.35) / 75) * 60 + 10);
}

export function fmtDrive(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}
