import { describe, expect, it } from 'vitest';
import { confidenceFrom, consensusCircular, consensusLinear, uncertainty } from '../src/core/consensus';
import { cv } from './helpers';

describe('consensus', () => {
  it('weighted linear mean and spread, ignoring nulls', () => {
    const c = consensusLinear([{ model: 'a', v: 1 }, { model: 'b', v: 2 }, { model: 'c', v: null }], { a: 3, b: 1 })!;
    expect(c.v).toBeCloseTo(1.25);
    expect(c.n).toBe(2);
    expect(c.s).toBeGreaterThan(0);
    expect(consensusLinear([{ model: 'a', v: null }])).toBeUndefined();
  });
  it('circular consensus across north', () => {
    const c = consensusCircular([{ model: 'a', v: 355 }, { model: 'b', v: 5 }])!;
    expect(Math.min(c.v, 360 - c.v)).toBeLessThan(0.5);
  });
  it('confidence: agreement → alta, divergence → baixa, single model never alta', () => {
    expect(confidenceFrom(uncertainty({ hs: cv(1.5, 0.05), tp: cv(11, 0.4), dir: cv(130, 8), wind: cv(10, 1), windDir: cv(300, 10), leadHours: 6 }))).toBe('alta');
    expect(confidenceFrom(uncertainty({ hs: cv(1.5, 0.6), tp: cv(11, 3), dir: cv(130, 50), wind: cv(20, 10), windDir: cv(300, 80), leadHours: 6 }))).toBe('baixa');
    expect(confidenceFrom(uncertainty({ hs: cv(1.5, 0, 1), wind: cv(10, 0, 1), leadHours: 0 }))).not.toBe('alta');
  });
  it('lead time degrades confidence', () => {
    const base = { hs: cv(1.5, 0.1), tp: cv(11, 0.5), dir: cv(130, 10), wind: cv(10, 2), windDir: cv(300, 15) };
    expect(uncertainty({ ...base, leadHours: 150 })).toBeGreaterThan(uncertainty({ ...base, leadHours: 0 }));
  });
});
