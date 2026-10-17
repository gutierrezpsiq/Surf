/**
 * Plain-language explanation of a score: one summary line plus, per factor, what the forecast
 * says, what would be ideal and whether it helps or hurts. Written for beginners.
 */
import { consensusLabel } from './explainText';
import { compassPt } from './geo';
import type { TideStage } from './physics';
import { components, ScoreContext, SKILL_MAX_H } from './scoring';
import type { HourPoint } from './types';

export type Effect = 'ajuda' | 'neutro' | 'atrapalha';

export interface Factor {
  key: 'tamanho' | 'periodo' | 'direcao' | 'vento' | 'mare' | 'energia';
  label: string;
  /** 0..1 how good this factor is for surfing right now. */
  q: number;
  effect: Effect;
  forecast: string;
  ideal: string;
  why: string;
}

export interface Explanation {
  summary: string;
  factors: Factor[];
  confidence: string;
}

const f1 = (x: number) => x.toFixed(1).replace('.', ',');
const effectOf = (q: number): Effect => (q >= 0.8 ? 'ajuda' : q < 0.55 ? 'atrapalha' : 'neutro');

const TIDE_TEXT: Record<TideStage, string> = { enchendo: 'enchendo', vazando: 'vazando', cheia: 'cheia (alta)', seca: 'seca (baixa)' };

export function explainHour(h: HourPoint, ctx: ScoreContext): Explanation {
  const { p, br, rel, sq, tq, wq, tideMod, energyKj } = components(h, ctx);
  const spot = ctx.spot;
  const factors: Factor[] = [];

  const openSea = h.swH ? `swell de ${f1(h.swH.v)} m em mar aberto` : `ondulação de ${f1(h.hs.v)} m em mar aberto`;
  factors.push({
    key: 'tamanho',
    label: 'Tamanho da onda',
    q: sq,
    // inside the preferred range helps; clearly outside it hurts
    effect: sq >= 0.999 ? 'ajuda' : sq < 0.85 ? 'atrapalha' : 'neutro',
    forecast: `~${f1(br.h)} m na arrebentação (${openSea})`,
    ideal: `${f1(p.minH)}–${f1(p.maxH)} m para nível ${p.skill}; acima de ${f1(SKILL_MAX_H[p.skill])} m vira alerta`,
    why:
      br.h < p.minH
        ? 'Abaixo do ideal: ondas pequenas, com pouca força para remar e surfar.'
        : br.h > p.maxH
          ? 'Acima do ideal para o seu nível: mais difícil passar a arrebentação e mais perigoso.'
          : 'Dentro da faixa ideal para o seu nível.',
  });

  factors.push({
    key: 'periodo',
    label: 'Período',
    q: tq,
    effect: effectOf(tq),
    forecast: `${Math.round(br.t)} s entre uma onda e outra`,
    ideal: '9 s ou mais (ondulação organizada, com força); abaixo de 7 s o mar fica mexido',
    why:
      br.t >= 11
        ? 'Período longo: ondas vêm de longe, chegam em séries organizadas e com mais força.'
        : br.t >= 9
          ? 'Bom período: ondas razoavelmente organizadas.'
          : br.t >= 7
            ? 'Período médio: ondas mais fracas e menos alinhadas.'
            : 'Período curto: mar de vento, ondas fracas e bagunçadas.',
  });

  const dq = Math.max(0, Math.min(1, br.e));
  factors.push({
    key: 'direcao',
    label: 'Direção do swell',
    q: dq,
    effect: effectOf(dq),
    forecast: `vem de ${compassPt(br.dir)} (${Math.round(br.dir)}°) · ${Math.round(br.e * 100)} % da energia entra no pico`,
    ideal: `entre ${compassPt(spot.window.from)} e ${compassPt(spot.window.to)}; a praia está voltada para ${compassPt(spot.facing)}`,
    why:
      br.e >= 0.8
        ? 'O swell chega de frente para a praia, sem obstáculos.'
        : br.e >= 0.4
          ? 'O swell chega meio de lado: parte da energia se perde antes de chegar.'
          : 'O swell vem de uma direção bloqueada (costão, ilha ou de trás da praia): pouca onda entra.',
  });

  const relText: Record<string, string> = {
    glassy: 'sem vento (glassy)',
    terral: 'terral (da terra para o mar)',
    'terral-lateral': 'terral-lateral',
    lateral: 'lateral (paralelo à praia)',
    'maral-lateral': 'maral-lateral',
    maral: 'maral (do mar para a terra)',
  };
  factors.push({
    key: 'vento',
    label: 'Vento',
    q: wq,
    effect: effectOf(wq),
    forecast: rel === 'glassy' ? `fraco, ${Math.round(h.wind.v)} km/h — mar liso` : `${relText[rel]}, de ${compassPt(h.windDir.v)} a ${Math.round(h.wind.v)} km/h (rajadas ${Math.round(h.gust.v)})`,
    ideal: `sem vento ou terral fraco (vento de ${compassPt(spot.offshore)}), até ~20 km/h`,
    why:
      rel === 'glassy'
        ? 'Sem vento a superfície fica lisa: o melhor cenário.'
        : rel.startsWith('terral')
          ? 'Vento terral segura a parede da onda e deixa a formação limpa' + (h.wind.v > 25 ? ', mas forte demais dificulta a remada.' : '.')
          : rel === 'lateral'
            ? 'Vento lateral deixa a onda com textura e as séries menos definidas.'
            : 'Vento maral desmancha as ondas antes de quebrarem: mar mexido.',
  });

  if (ctx.tide) {
    const q = tideMod >= 1.02 ? 0.85 : tideMod >= 0.99 ? 0.7 : tideMod >= 0.95 ? 0.6 : 0.45;
    factors.push({
      key: 'mare',
      label: 'Maré',
      q,
      effect: effectOf(q),
      forecast: `${TIDE_TEXT[ctx.tide]}${h.tide != null ? ` (${f1(h.tide)} m do nível médio)` : ''}`,
      ideal: spot.breakType === 'point' || spot.breakType === 'reef' ? 'meia-maré enchendo; maré seca expõe pedras' : 'meia-maré enchendo (efeito pequeno no Sul, maré < 1 m)',
      why: 'No litoral sul a variação de maré é pequena; ela só ajusta a nota em poucos por cento.',
    });
  }

  const eq = Math.min(1, energyKj / 100);
  factors.push({
    key: 'energia',
    label: 'Energia da onda',
    q: eq,
    effect: energyKj < 15 ? 'atrapalha' : energyKj > 60 ? 'ajuda' : 'neutro',
    forecast: `≈ ${Math.round(energyKj)} kJ por metro de crista`,
    ideal: 'acima de ~60 kJ para ondas com força; abaixo de 15 kJ quase não dá para surfar',
    why: 'Junta tamanho e período num número só: duas ondas de mesma altura, a de período maior tem muito mais força.',
  });

  const helps = factors.filter((f) => f.effect === 'ajuda' && f.key !== 'energia' && f.key !== 'mare');
  const hurts = factors.filter((f) => f.effect === 'atrapalha' && f.key !== 'energia').sort((a, b) => a.q - b.q);
  const short: Record<Factor['key'], (f: Factor) => string> = {
    tamanho: () => (br.h < p.minH ? `onda pequena (~${f1(br.h)} m)` : br.h > p.maxH ? `onda grande (~${f1(br.h)} m)` : `tamanho bom (~${f1(br.h)} m)`),
    periodo: () => `período ${br.t >= 9 ? 'longo' : br.t >= 7 ? 'médio' : 'curto'} (${Math.round(br.t)} s)`,
    direcao: () => (br.e >= 0.8 ? 'swell de frente para a praia' : 'swell entrando torto'),
    vento: () => (rel === 'glassy' ? 'sem vento' : rel.startsWith('terral') ? 'vento terral' : rel === 'lateral' ? 'vento lateral' : `vento maral (${Math.round(h.wind.v)} km/h)`),
    mare: () => `maré ${ctx.tide}`,
    energia: () => '',
  };
  const parts: string[] = [];
  if (helps.length) parts.push(`ajuda: ${helps.map((f) => short[f.key](f)).join(', ')}`);
  if (hurts.length) parts.push(`atrapalha: ${hurts.map((f) => short[f.key](f)).join(', ')}`);
  const summary = parts.length ? `${parts.join(' · ')}.` : 'Condições medianas em todos os fatores.';

  return { summary: summary.charAt(0).toUpperCase() + summary.slice(1), factors, confidence: consensusLabel(h, ctx.leadHours) };
}
