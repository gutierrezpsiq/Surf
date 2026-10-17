import { describe, expect, it } from 'vitest';
import { splitModels } from '../pipeline/sources/openMeteo';
import { parseNdbc } from '../pipeline/sources/observations';
import { parseRss, severityFrom } from '../pipeline/sources/warnings';

describe('Open-Meteo parsing', () => {
  it('splits multi-model suffixed variables and drops all-null ones', () => {
    const hourly = {
      time: ['t0'],
      wave_height_ecmwf_wam: [1.2],
      wave_height_meteofrance_wave: [1.4],
      swell_wave_height_ecmwf_wam: [null],
      swell_wave_height_meteofrance_wave: [1.1],
      sea_level_height_msl_meteofrance_currents: [0.3],
    };
    const r = splitModels(hourly, ['ecmwf_wam', 'meteofrance_wave', 'meteofrance_currents'], ['wave_height', 'swell_wave_height', 'sea_level_height_msl']);
    expect(r.ecmwf_wam).toEqual({ wave_height: [1.2] });
    expect(r.meteofrance_wave.swell_wave_height).toEqual([1.1]);
    expect(r.meteofrance_currents.sea_level_height_msl).toEqual([0.3]);
  });
  it('maps unsuffixed single-model responses to best_match', () => {
    expect(splitModels({ time: [], wave_height: [1] }, [], ['wave_height'])).toEqual({ best_match: { wave_height: [1] } });
  });
});

describe('warnings', () => {
  it('parses relevant INMET RSS items and maps states/severity', () => {
    const xml = `<rss><channel>
      <item><title>Aviso de Ventos Costeiros. Severidade Grau: Perigo</title><description><![CDATA[Áreas: Litoral de Santa Catarina e Rio Grande do Sul. Início: 2026-10-17 12:00 Fim: 2026-10-18 06:00]]></description><link>https://alertas2.inmet.gov.br/1</link></item>
      <item><title>Baixa Umidade. Severidade Grau: Perigo Potencial</title><description>Goiás</description></item>
    </channel></rss>`;
    const w = parseRss(xml, 'INMET');
    expect(w).toHaveLength(1);
    expect(w[0].states).toEqual(['SC', 'RS']);
    expect(w[0].severity).toBe('laranja');
    expect(w[0].start).toBe('2026-10-17T12:00');
    expect(severityFrom('Grande Perigo')).toBe('vermelho');
    expect(severityFrom('Perigo Potencial')).toBe('amarelo');
  });
});

describe('observations', () => {
  it('parses NDBC realtime2 text', () => {
    const txt = `#YY  MM DD hh mm WDIR WSPD GST  WVHT   DPD   APD MWD   PRES  ATMP  WTMP  DEWP  VIS PTDY  TIDE
#yr  mo dy hr mn degT m/s  m/s     m   sec   sec degT   hPa  degC  degC  degC  nmi  hPa    ft
2026 10 17 03 00 230  5.0  7.0   1.6  11.0   7.2 140 1015.0  18.0  19.0  15.0   MM   MM    MM
2026 10 17 02 00 230  5.0  7.0    MM    MM   7.2 MM  1015.0  18.0  19.0  15.0   MM   MM    MM`;
    const o = parseNdbc(txt, 'b1');
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ feed: 'b1', time: '2026-10-17T03:00:00.000Z', hs: 1.6, tp: 11, dir: 140 });
  });
});

import { inRing, labelPoint, municipalityAt, Municipality } from '../pipeline/sources/ibge';
describe('IBGE municipalities', () => {
  const sq = (x: number, y: number): [number, number][] => [[x, y], [x + 0.2, y], [x + 0.2, y + 0.2], [x, y + 0.2], [x, y]];
  const ms: Municipality[] = [
    { code: '4321204', name: 'Torres', state: 'RS', rings: [sq(-49.9, -29.4)] },
    { code: '4321600', name: 'Tramandaí', state: 'RS', rings: [sq(-50.3, -30.1)] },
  ];
  it('finds the containing or nearest (offshore spot) municipality', () => {
    expect(inRing([-49.8, -29.3], ms[0].rings[0])).toBe(true);
    expect(municipalityAt(ms, [-49.8, -29.3])?.name).toBe('Torres');
    expect(municipalityAt(ms, [-49.69, -29.3])?.name).toBe('Torres'); // ~1 km offshore
    expect(municipalityAt(ms, [-48.0, -29.3])).toBeUndefined();
  });
  it('labels at the centroid', () => {
    const [x, y] = labelPoint(ms[0]);
    expect(x).toBeCloseTo(-49.8, 5);
    expect(y).toBeCloseTo(-29.3, 5);
  });
});
