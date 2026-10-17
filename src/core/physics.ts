/** Wave physics helpers and sea-state derived indicators. */

const RHO = 1025; // kg/m³ sea water
const G = 9.81;

/**
 * Wave energy per wave per metre of crest, in kJ: E = ρ g² H² T² / (64 π) / 1000
 * (deep-water energy flux × period). Secondary indicator to compare swells of different period.
 */
export function waveEnergyKj(h: number, t: number): number {
  if (!(h > 0) || !(t > 0)) return 0;
  return (RHO * G * G * h * h * t * t) / (64 * Math.PI) / 1000;
}

/** Breaking-height amplification by period (longer swell shoals more). */
export function shoalFactor(t: number): number {
  return Math.min(1.5, Math.max(0.9, 0.6 + 0.06 * t));
}

export type TideStage = 'enchendo' | 'vazando' | 'cheia' | 'seca';

/** Tide stage at index i of an hourly sea-level series. */
export function tideStage(levels: (number | undefined)[], i: number): TideStage | undefined {
  const at = (k: number) => levels[Math.max(0, Math.min(levels.length - 1, k))];
  const cur = at(i);
  if (cur == null) return undefined;
  const win = [] as number[];
  for (let k = i - 6; k <= i + 6; k++) {
    const v = at(k);
    if (v != null) win.push(v);
  }
  const lo = Math.min(...win), hi = Math.max(...win);
  const range = hi - lo;
  const prev = at(i - 1) ?? cur, next = at(i + 1) ?? cur;
  const pos = range > 0.02 ? (cur - lo) / range : 0.5;
  if (pos > 0.85) return 'cheia';
  if (pos < 0.15) return 'seca';
  return next - prev >= 0 ? 'enchendo' : 'vazando';
}

/** Wetsuit recommendation by sea surface temperature (°C). */
export function wetsuit(sst: number | undefined): string {
  if (sst == null) return 'sem dado de temperatura';
  if (sst >= 24) return 'lycra / bermuda';
  if (sst >= 21) return 'long john ou top 1 mm';
  if (sst >= 18) return 'long 2/2 mm';
  if (sst >= 15.5) return 'long 3/2 mm';
  if (sst >= 13) return 'long 4/3 mm + bota';
  return 'long 5/4 mm + bota, luva e capuz';
}
