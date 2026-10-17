import { describe, expect, it } from 'vitest';
import { findAlerts } from '../src/core/alerts';
import { driveMinutes, PORTO_ALEGRE } from '../src/core/drive';
import { nowIndex, PROFILES, scoreSeries, summarise } from '../src/core/spotScore';
import type { Summary } from '../src/core/types';
import { cv, eastSpot, hour } from './helpers';

describe('drive time', () => {
  it('Porto Alegre → Torres is roughly 2.5–3.5 h', () => {
    const m = driveMinutes(PORTO_ALEGRE, [-49.725, -29.355]);
    expect(m).toBeGreaterThan(120);
    expect(m).toBeLessThan(210);
  });
});

describe('spot summary + alerts', () => {
  const spot = eastSpot({ id: 'torres', lat: -29.355, lon: -49.725, state: 'RS' });
  const hours = Array.from({ length: 48 }, (_, i) => {
    const h = i % 24;
    const t = `2026-10-${17 + Math.floor(i / 24)}T${String(h).padStart(2, '0')}:00`;
    const good = i >= 30 && i <= 34; // tomorrow 06–10h
    return hour({ t, day: h >= 6 && h <= 18, windDir: cv(good ? 270 : 90), wind: cv(good ? 8 : 25) });
  });
  const scores = scoreSeries(spot, hours, 0, PROFILES['intermediário']);
  const sum = summarise(spot.id, hours, scores, 0);

  it('summarises per day with the best daylight window', () => {
    expect(sum.days).toHaveLength(2);
    expect(sum.days[1].window).toMatchObject({ start: '2026-10-18T06:00', end: '2026-10-18T10:00' });
    expect(sum.days[1].reason).toMatch(/terral/);
    expect(sum.hourly[0]).toBe(-1); // night
  });

  it('alerts only within drive limit and 72 h', () => {
    const summary = { spots: [sum] } as unknown as Summary;
    const near = findAlerts(summary, [spot], { home: PORTO_ALEGRE, maxDriveMin: 240, minScore: 7 }, '2026-10-17T08:00');
    expect(near.map((a) => a.date)).toEqual(['2026-10-18']);
    expect(findAlerts(summary, [spot], { home: PORTO_ALEGRE, maxDriveMin: 60, minScore: 7 }, '2026-10-17T08:00')).toEqual([]);
    expect(findAlerts(summary, [spot], { home: PORTO_ALEGRE, maxDriveMin: 240, minScore: 7 }, '2026-10-12T08:00')).toEqual([]);
  });

  it('nowIndex maps wall-clock to the local series', () => {
    const times = hours.map((h) => h.t);
    expect(nowIndex(times, new Date('2026-10-17T12:30:00Z'))).toBe(9);
    expect(nowIndex(times, new Date('2026-10-01T00:00:00Z'))).toBe(0);
  });
});
