import type { Cv, HourPoint, Spot } from '../src/core/types';

export const cv = (v: number, s = 0, n = 4): Cv => ({ v, s, n });

/** Straight beach facing east (90°): offshore wind comes from the west (270°). */
export function eastSpot(over: Partial<Spot> = {}): Spot {
  const exposure = Array.from({ length: 36 }, (_, b) => {
    const d = Math.abs(((b * 10 - 90 + 540) % 360) - 180);
    return d >= 95 ? 0 : +Math.pow(Math.cos((Math.min(d, 90) * Math.PI) / 180), 0.6).toFixed(2);
  });
  return {
    id: 'test', name: 'Teste', state: 'SC', region: 'SC-ILHA', lat: -27.6, lon: -48.4, kind: 'seed',
    facing: 90, offshore: 270, exposure, window: { from: 5, to: 175 }, breakType: 'beach', hazards: [],
    inferred: { coastSource: 'naturalearth', breakSource: 'test', orientationQuality: 'coarse' },
    ...over,
  };
}

export function hour(over: Partial<HourPoint> = {}): HourPoint {
  return {
    t: '2026-10-17T09:00',
    hs: cv(1.4, 0.1), tp: cv(11, 0.5), dir: cv(90, 5),
    wind: cv(10, 1), windDir: cv(270, 10), gust: cv(15, 2),
    day: true, cape: 0, rain: 0, sst: 19,
    ...over,
  };
}
