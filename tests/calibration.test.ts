import { describe, expect, it } from 'vitest';
import { assemble } from '../src/core/assemble';
import { fitCalibration, Pair } from '../src/core/calibration';

function pairs(model: string, factor: number, noise: number, n: number): Pair[] {
  const out: Pair[] = [];
  for (let i = 0; i < n; i++) {
    const o = 0.8 + (i % 10) * 0.2;
    out.push({ region: 'RS-N', model, var: 'hs', o, f: o * factor + noise * Math.sin(i * 1.7), ageDays: i % 20 });
    out.push({ region: 'RS-N', model, var: 'tp', o: 10, f: 9, ageDays: i % 20 });
  }
  return out;
}

describe('calibration', () => {
  it('learns a multiplicative Hs bias and additive Tp bias', () => {
    const c = fitCalibration(pairs('gfs', 1.25, 0, 400));
    const m = c.regions['RS-N']!.gfs;
    expect(1 / m.hsA).toBeGreaterThan(1.15);
    expect(1 / m.hsA).toBeLessThan(1.3);
    expect(m.tpB).toBeGreaterThan(0.8);
  });
  it('shrinks corrections when data is scarce', () => {
    const m = fitCalibration(pairs('gfs', 1.25, 0, 5)).regions['RS-N']!.gfs;
    expect(m.hsA).toBeGreaterThan(0.9);
  });
  it('gives more weight to the more accurate model', () => {
    const c = fitCalibration([...pairs('good', 1, 0.05, 300), ...pairs('noisy', 1, 0.5, 300)]);
    expect(c.regions['RS-N']!.good.weight).toBeGreaterThan(c.regions['RS-N']!.noisy.weight);
  });
  it('assemble applies calibration to consensus', () => {
    const raw = {
      time: ['2026-10-17T09:00'],
      wave: { a: { wave_height: [2], wave_peak_period: [10], wave_direction: [120] }, b: { wave_height: [1], wave_peak_period: [10], wave_direction: [140] } },
      wind: { x: { wind_speed_10m: [10], wind_direction_10m: [300], wind_gusts_10m: [15], is_day: [1] } },
    };
    const plain = assemble(raw, 'RS-N')[0];
    expect(plain.hs.v).toBeCloseTo(1.5);
    expect(plain.dir.v).toBeGreaterThan(120);
    expect(plain.dir.v).toBeLessThan(130); // weighted towards the bigger model
    const cal = assemble(raw, 'RS-N', { updatedAt: '', regions: { 'RS-N': { a: { hsA: 0.5, tpB: 0, n: 100, weight: 1 } } } })[0];
    expect(cal.hs.v).toBeCloseTo(1.0);
    expect(cal.m!.a[0]).toBe(1);
    expect(cal.day).toBe(true);
  });
});
