import { describe, expect, it } from 'vitest';
import { buildCoastIndex, exposure, exposureAt, isSea, mainWindow, orientation, rayHitKm, snapToCoast } from '../src/core/coast';
import type { LonLat } from '../src/core/geo';

// Straight N–S mainland coast at lon −50 (land to the west), plus a small island 10 km offshore.
const coast: LonLat[] = [];
for (let lat = -32; lat <= -26; lat += 0.05) coast.push([-50, +lat.toFixed(3)]);
const island: LonLat[] = [[-49.88, -29.02], [-49.86, -29.02], [-49.86, -28.98], [-49.88, -28.98], [-49.88, -29.02]];

describe('coast analysis', () => {
  const idx = buildCoastIndex([coast, island]);

  it('tells sea from land by ray parity', () => {
    expect(isSea(idx, [-49.5, -30])).toBe(true);
    expect(isSea(idx, [-50.5, -30])).toBe(false);
    expect(isSea(idx, [-49.87, -29.0])).toBe(false); // inside island
  });

  it('computes beach facing as the sea-side normal', () => {
    const snap = snapToCoast(idx, [-50.01, -30.5]);
    expect(snap.distKm).toBeLessThan(1.5);
    const o = orientation(idx, snap);
    expect(o.facing).toBeCloseTo(90, 0);
    expect(o.sea[0]).toBeGreaterThan(-50);
  });

  it('ray casting finds the island and the mainland', () => {
    expect(rayHitKm(idx, [-49.99, -29.0], 90)).toBeLessThan(12);
    expect(rayHitKm(idx, [-49.99, -30.5], 90)).toBe(Infinity);
    expect(rayHitKm(idx, [-49.99, -30.5], 270)).toBeLessThan(2);
  });

  it('exposure: open east, closed west, shadowed behind the island', () => {
    const open = exposure(idx, [-49.996, -30.5], 90).bins;
    expect(exposureAt(open, 90)).toBeGreaterThan(0.95);
    expect(exposureAt(open, 270)).toBe(0);
    expect(exposureAt(open, 180)).toBeLessThan(0.15); // parallel to the coast
    const shadow = exposure(idx, [-49.996, -29.0], 90).bins;
    expect(exposureAt(shadow, 90)).toBeLessThan(exposureAt(open, 90) * 0.7);
    const w = mainWindow(open);
    expect(w.width).toBeGreaterThanOrEqual(120);
  });
});
