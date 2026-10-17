import { describe, expect, it } from 'vitest';
import { angleDiff, bearing, circularMean, circularSpread, compassPt, destination, haversineKm, norm360 } from '../src/core/geo';

describe('geo', () => {
  it('normalises and diffs angles across north', () => {
    expect(norm360(-10)).toBe(350);
    expect(angleDiff(350, 10)).toBe(20);
    expect(angleDiff(90, 270)).toBe(180);
  });
  it('circular mean wraps around 0°', () => {
    expect(circularMean([350, 10])).toBeCloseTo(0, 5);
    expect(circularMean([80, 100], [1, 3])).toBeCloseTo(95, 0);
    expect(circularSpread([350, 10])).toBeCloseTo(10, 1);
  });
  it('destination/bearing/haversine are consistent', () => {
    const p: [number, number] = [-48.5, -27.6];
    const q = destination(p, 120, 50);
    expect(haversineKm(p, q)).toBeCloseTo(50, 3);
    expect(bearing(p, q)).toBeCloseTo(120, 1);
  });
  it('labels compass points in Portuguese', () => {
    expect(compassPt(135)).toBe('SE');
    expect(compassPt(270)).toBe('O');
    expect(compassPt(90)).toBe('L');
  });
});
