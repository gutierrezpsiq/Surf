import { describe, expect, it } from 'vitest';
import { waveEnergyKj, tideStage, wetsuit } from '../src/core/physics';
import { bestWindow, breaking, dailyBest, periodQuality, scoreHour, verdict, windRelation } from '../src/core/scoring';
import type { HourScore } from '../src/core/types';
import { cv, eastSpot, hour } from './helpers';

const spot = eastSpot();
const ctx = { spot, leadHours: 6 };

describe('scoring', () => {
  it('classifies wind relative to the beach', () => {
    expect(windRelation(270, 270, 12)).toBe('terral');
    expect(windRelation(225, 270, 12)).toBe('terral-lateral');
    expect(windRelation(180, 270, 12)).toBe('lateral');
    expect(windRelation(90, 270, 12)).toBe('maral');
    expect(windRelation(90, 270, 3)).toBe('glassy');
  });

  it('offshore beats onshore for the same swell', () => {
    const off = scoreHour(hour(), ctx).score;
    const on = scoreHour(hour({ windDir: cv(90) , wind: cv(20) }), ctx).score;
    expect(off).toBeGreaterThan(7);
    expect(on).toBeLessThan(3);
  });

  it('weights period heavily from 9 s', () => {
    expect(periodQuality(9)).toBeGreaterThanOrEqual(0.7);
    expect(periodQuality(7)).toBeLessThan(0.4);
    const long = scoreHour(hour({ tp: cv(12) }), ctx).score;
    const short = scoreHour(hour({ tp: cv(6) }), ctx).score;
    expect(long - short).toBeGreaterThan(3);
  });

  it('swell from behind the beach does not reach it', () => {
    expect(breaking(spot, hour({ dir: cv(270) })).h).toBe(0);
    expect(scoreHour(hour({ dir: cv(270) }), ctx).score).toBeLessThan(1);
  });

  it('uses swell partitions through exposure when available', () => {
    const b = breaking(spot, hour({ swH: cv(1.2), swT: cv(12), swD: cv(100), wwH: 0.5 }));
    expect(b.label).toBe('Swell');
    expect(b.t).toBe(12);
    expect(b.h).toBeGreaterThan(1.2);
  });

  it('safety caps: lightning, gusts, oversize, official warning', () => {
    const lightning = scoreHour(hour({ cape: 2500, rain: 3 }), ctx);
    expect(lightning.score).toBeLessThanOrEqual(3);
    expect(lightning.flags.map((f) => f.code)).toContain('raio');
    const gusty = scoreHour(hour({ gust: cv(65) }), ctx);
    expect(gusty.flags.map((f) => f.code)).toContain('rajada');
    expect(gusty.score).toBeLessThanOrEqual(4);
    const big = scoreHour(hour({ hs: cv(3.5) }), { ...ctx, prefs: { skill: 'iniciante', minH: 0.5, maxH: 1.2 } });
    expect(big.flags.map((f) => f.code)).toContain('grande');
    const warned = scoreHour(hour(), { ...ctx, warnings: [{ source: 'INMET', title: 'Ventos costeiros', severity: 'laranja', areas: [], states: ['SC'] }] });
    expect(warned.flags.map((f) => f.code)).toContain('aviso');
    expect(warned.score).toBeLessThanOrEqual(3);
  });

  it('writes a one-line pt-BR reason', () => {
    const r = scoreHour(hour({ windDir: cv(300) }), { ...ctx, tide: 'enchendo' }).reason;
    expect(r).toMatch(/^Ondulação L 1,\d m @ 11 s, vento ONO 10 km\/h terral, maré enchendo, confiança (alta|média|baixa)$/);
  });

  it('best window is the contiguous daylight run near the peak', () => {
    const mk = (s: number, i: number): HourScore => ({ t: `2026-10-17T${String(i).padStart(2, '0')}:00`, score: s, conf: 'alta', flags: [], windRel: 'terral', energyKj: 0, reason: '' });
    const scores = [2, 3, 6, 7.5, 8, 7.4, 5, 9].map(mk);
    const day = [true, true, true, true, true, true, true, false];
    expect(bestWindow(scores, day)).toEqual({ start: 3, end: 5, score: 8 });
    const d = dailyBest(scores, day);
    expect(d).toHaveLength(1);
    expect(d[0].window).toEqual({ start: '2026-10-17T03:00', end: '2026-10-17T05:00', score: 8 });
  });

  it('verdict', () => {
    expect(verdict(7.5, 'alta', false)).toBe('Vai');
    expect(verdict(7.5, 'baixa', false)).toBe('Talvez');
    expect(verdict(5.5, 'alta', false)).toBe('Talvez');
    expect(verdict(9, 'alta', true)).toBe('Fica em casa');
    expect(verdict(3, 'alta', false)).toBe('Fica em casa');
  });
});

describe('physics', () => {
  it('energy grows with H² T²', () => {
    expect(waveEnergyKj(2, 10) / waveEnergyKj(1, 10)).toBeCloseTo(4);
    expect(waveEnergyKj(1, 10)).toBeGreaterThan(40);
  });
  it('tide stage', () => {
    const s = Array.from({ length: 25 }, (_, i) => 0.4 * Math.sin((2 * Math.PI * i) / 12.4));
    expect(tideStage(s, 1)).toBe('enchendo');
    expect(tideStage(s, 3)).toBe('cheia');
    expect(tideStage(s, 6)).toBe('vazando');
    expect(tideStage(s, 9)).toBe('seca');
  });
  it('wetsuit by SST', () => {
    expect(wetsuit(25)).toMatch(/lycra/);
    expect(wetsuit(16)).toBe('long 3/2 mm');
    expect(wetsuit(12)).toMatch(/capuz/);
  });
});
