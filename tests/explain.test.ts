import { describe, expect, it } from 'vitest';
import { explainHour } from '../src/core/explain';
import { cv, eastSpot, hour } from './helpers';

const spot = eastSpot();

describe('score explanation', () => {
  it('names what helps and what hurts, in plain Portuguese', () => {
    const e = explainHour(hour({ hs: cv(0.5), tp: cv(12), windDir: cv(270), wind: cv(8) }), { spot, leadHours: 3, tide: 'enchendo' });
    expect(e.summary).toMatch(/^Ajuda: .*período longo \(12 s\).*vento terral/);
    expect(e.summary).toMatch(/atrapalha: onda pequena/);
    const size = e.factors.find((f) => f.key === 'tamanho')!;
    expect(size.effect).toBe('atrapalha');
    expect(size.ideal).toMatch(/0,8–2,0 m para nível intermediário/);
    expect(e.factors.map((f) => f.key)).toEqual(['tamanho', 'periodo', 'direcao', 'vento', 'mare', 'energia']);
    expect(e.confidence).toMatch(/4 modelos de onda/);
  });

  it('flags onshore wind and blocked swell', () => {
    const e = explainHour(hour({ windDir: cv(90), wind: cv(25), dir: cv(260) }), { spot, leadHours: 100 });
    expect(e.factors.find((f) => f.key === 'vento')!.effect).toBe('atrapalha');
    expect(e.factors.find((f) => f.key === 'direcao')!.effect).toBe('atrapalha');
    expect(e.summary).toMatch(/vento maral \(25 km\/h\)/);
    expect(e.confidence).toMatch(/daqui a 4 dia/);
  });
});
