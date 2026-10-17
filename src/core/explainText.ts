import type { HourPoint } from './types';

const f1 = (x: number) => x.toFixed(1).replace('.', ',');

/** How much the models agree, in words (what the confidence badge is based on). */
export function consensusLabel(h: HourPoint, leadHours: number): string {
  const n = Math.min(h.hs.n, h.wind.n);
  const parts = [`${h.hs.n} modelos de onda e ${h.wind.n} de vento`];
  if (n >= 2) parts.push(`a altura varia ±${f1(h.hs.s)} m entre eles e o vento ±${Math.round(h.wind.s)} km/h`);
  else parts.push('só um modelo disponível: não dá para medir a concordância');
  parts.push(leadHours < 24 ? 'previsão para as próximas 24 h (mais confiável)' : `previsão para daqui a ${Math.round(leadHours / 24)} dia(s): quanto mais longe, menos certeza`);
  return parts.join('; ') + '.';
}
