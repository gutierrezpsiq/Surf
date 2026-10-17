/**
 * Spot Score 0–10 for one spot at one hour.
 * Confidence (model agreement) never changes the score; it only qualifies it.
 */
import { exposureAt } from './coast';
import { confidenceFrom, uncertainty } from './consensus';
import { angleDiff, compassPt } from './geo';
import { shoalFactor, TideStage, waveEnergyKj } from './physics';
import type { Confidence, DayBest, HourPoint, HourScore, OfficialWarning, SafetyFlag, Spot, Verdict, WindRelation } from './types';

export type Skill = 'iniciante' | 'intermediário' | 'avançado';

export interface Prefs {
  skill: Skill;
  /** Preferred breaking height range (m). */
  minH: number;
  maxH: number;
}

export const DEFAULT_PREFS: Prefs = { skill: 'intermediário', minH: 0.8, maxH: 2.0 };

/** Above this breaking height a session is flagged unsafe for the skill level. */
export const SKILL_MAX_H: Record<Skill, number> = { iniciante: 1.3, intermediário: 2.5, avançado: 4.0 };

const lerp = (pts: [number, number][], x: number) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
};

/** Period quality: weighted heavily from 9 s up. */
export const periodQuality = (t: number) => lerp([[5, 0.1], [7, 0.35], [9, 0.7], [11, 0.9], [13, 1]], t);

export function sizeQuality(h: number, p: Prefs): number {
  if (h < p.minH) return lerp([[0.25, 0], [p.minH, 1]], h);
  if (h <= p.maxH) return 1;
  return lerp([[p.maxH, 1], [p.maxH * 1.8, 0]], h);
}

export function windRelation(windFrom: number, offshore: number, speed: number): WindRelation {
  if (speed < 6) return 'glassy';
  const d = angleDiff(windFrom, offshore);
  if (d <= 30) return 'terral';
  if (d <= 60) return 'terral-lateral';
  if (d <= 110) return 'lateral';
  if (d <= 150) return 'maral-lateral';
  return 'maral';
}

export function windQuality(rel: WindRelation, v: number, gust: number): number {
  let q: number;
  switch (rel) {
    case 'glassy': q = 1; break;
    case 'terral': q = lerp([[25, 1], [40, 0.85], [55, 0.55]], v); break;
    case 'terral-lateral': q = lerp([[15, 0.95], [25, 0.85], [40, 0.6]], v); break;
    case 'lateral': q = 1 - v / 45; break;
    case 'maral-lateral': q = 1 - v / 32; break;
    case 'maral': q = 1 - v / 25; break;
  }
  if (gust - v > 20) q *= 0.9;
  return Math.max(0.05, Math.min(1, q));
}

export interface Breaking {
  h: number; // estimated breaking height at the spot (m)
  t: number; // dominant period
  dir: number; // dominant direction
  e: number; // exposure of dominant component
  label: 'Swell' | 'Ondulação' | 'Mar de vento';
}

/** Combine swell partitions through the spot's exposure into a breaking height estimate. */
export function breaking(spot: Spot, h: HourPoint): Breaking {
  type Comp = { h: number; t: number; d: number; label: Breaking['label'] };
  const comps: Comp[] = [];
  if (h.swH && h.swT && h.swD && h.swH.v > 0.05) {
    comps.push({ h: h.swH.v, t: h.swT.v, d: h.swD.v, label: 'Swell' });
    if (h.sw2H && h.sw2T && h.sw2D != null && h.sw2H > 0.05) comps.push({ h: h.sw2H, t: h.sw2T, d: h.sw2D, label: 'Swell' });
    if (h.wwH && h.wwH > 0.05) comps.push({ h: h.wwH, t: Math.min(h.tp.v, 6), d: h.windDir.v, label: 'Mar de vento' });
  } else {
    comps.push({ h: h.hs.v, t: h.tp.v, d: h.dir.v, label: 'Ondulação' });
  }
  let sum = 0;
  let best = { contrib: -1, c: comps[0], e: 0 };
  for (const c of comps) {
    const e = exposureAt(spot.exposure, c.d);
    const eff = c.h * e * shoalFactor(c.t);
    sum += eff * eff;
    if (eff > best.contrib) best = { contrib: eff, c, e };
  }
  return { h: Math.sqrt(sum), t: best.c.t, dir: best.c.d, e: best.e, label: best.c.label };
}

export interface ScoreContext {
  spot: Spot;
  prefs?: Prefs;
  leadHours: number;
  tide?: TideStage;
  warnings?: OfficialWarning[];
}

const fmt = (x: number, d = 1) => x.toFixed(d).replace('.', ',');

export function scoreHour(h: HourPoint, ctx: ScoreContext): HourScore {
  const p = ctx.prefs ?? DEFAULT_PREFS;
  const br = breaking(ctx.spot, h);
  const rel = windRelation(h.windDir.v, ctx.spot.offshore, h.wind.v);
  const sq = sizeQuality(br.h, p);
  const tq = periodQuality(br.t);
  const dq = 0.4 + 0.6 * br.e;
  const wq = windQuality(rel, h.wind.v, h.gust.v);
  let tideMod = 1;
  if (ctx.tide === 'enchendo') tideMod = 1.03;
  else if (ctx.tide === 'cheia' || ctx.tide === 'seca') tideMod = 0.97;
  if (ctx.tide === 'seca' && (ctx.spot.breakType === 'point' || ctx.spot.breakType === 'reef')) tideMod = 0.92;
  const energyKj = waveEnergyKj(br.h, br.t);
  const energyMod = energyKj < 15 ? 0.9 : 1;

  let score = 10 * Math.pow(sq, 0.8) * (0.35 + 0.65 * tq) * dq * wq * tideMod * energyMod;
  if (rel === 'glassy' && sq > 0.3) score += 0.3;

  // Safety caps
  const flags: SafetyFlag[] = [];
  let cap = 10;
  const cape = h.cape ?? 0;
  if (cape >= 2000 || (cape >= 800 && (h.rain ?? 0) >= 0.5)) {
    flags.push({ code: 'raio', label: 'Risco de raios' });
    cap = Math.min(cap, 3);
  }
  if (h.gust.v >= 50) {
    flags.push({ code: 'rajada', label: `Rajadas ${Math.round(h.gust.v)} km/h` });
    cap = Math.min(cap, 4);
  }
  if (br.h > SKILL_MAX_H[p.skill]) {
    flags.push({ code: 'grande', label: `Ondas ~${fmt(br.h)} m acima do seu nível` });
    cap = Math.min(cap, 3);
  }
  const severe = (ctx.warnings ?? []).filter((w) => w.states.includes(ctx.spot.state) && (w.severity === 'laranja' || w.severity === 'vermelho') && inRange(h.t, w));
  if (severe.length) {
    flags.push({ code: 'aviso', label: severe[0].title });
    cap = Math.min(cap, 3);
  }
  if (h.sst != null && h.sst < 14) flags.push({ code: 'frio', label: `Água ${fmt(h.sst, 0)} °C` });
  score = Math.max(0, Math.min(cap, score));

  const conf = confidenceFrom(uncertainty({ hs: h.hs, tp: h.tp, dir: h.dir, wind: h.wind, windDir: h.windDir, leadHours: ctx.leadHours }));
  const relLabel = rel === 'glassy' ? 'sem vento (glassy)' : rel;
  const reason =
    `${br.label} ${compassPt(br.dir)} ${fmt(br.h)} m @ ${Math.round(br.t)} s, ` +
    (rel === 'glassy' ? `vento fraco, glassy` : `vento ${compassPt(h.windDir.v)} ${Math.round(h.wind.v)} km/h ${relLabel}`) +
    (ctx.tide ? `, maré ${ctx.tide}` : '') +
    `, confiança ${conf}`;

  return { t: h.t, score: Math.round(score * 10) / 10, conf, flags, windRel: rel, energyKj: Math.round(energyKj), reason };
}

function inRange(t: string, w: OfficialWarning): boolean {
  if (w.start && t < w.start.slice(0, 16)) return false;
  if (w.end && t > w.end.slice(0, 16)) return false;
  return true;
}

/** Best contiguous daylight window around the day's top hour (hours scoring ≥ best − 1). */
export function bestWindow(scores: HourScore[], day: boolean[]): { start: number; end: number; score: number } | undefined {
  let bi = -1;
  scores.forEach((s, i) => {
    if (day[i] && (bi < 0 || s.score > scores[bi].score)) bi = i;
  });
  if (bi < 0) return undefined;
  const thr = scores[bi].score - 1;
  let a = bi, b = bi;
  while (a > 0 && day[a - 1] && scores[a - 1].score >= thr) a--;
  while (b < scores.length - 1 && day[b + 1] && scores[b + 1].score >= thr) b++;
  return { start: a, end: b, score: scores[bi].score };
}

const CONF_RANK: Record<Confidence, number> = { baixa: 0, 'média': 1, alta: 2 };
export const confRank = (c: Confidence) => CONF_RANK[c];

/** Group hourly scores into days (local date prefix of `t`). */
export function dailyBest(scores: HourScore[], day: boolean[]): DayBest[] {
  const byDate = new Map<string, number[]>();
  scores.forEach((s, i) => {
    const d = s.t.slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(i);
  });
  return [...byDate.entries()].map(([date, idx]) => {
    const sub = idx.map((i) => scores[i]);
    const w = bestWindow(sub, idx.map((i) => day[i]));
    if (!w) return { date, score: 0, conf: 'baixa' as Confidence, red: false };
    const top = sub[sub.findIndex((s) => s.score === w.score)];
    const winScores = sub.slice(w.start, w.end + 1);
    return {
      date,
      score: w.score,
      conf: top.conf,
      window: { start: sub[w.start].t, end: sub[w.end].t, score: w.score },
      red: winScores.every((s) => s.flags.some((f) => f.code !== 'frio')),
      reason: top.reason,
    };
  });
}

export function verdict(score: number, conf: Confidence, red: boolean): Verdict {
  if (red) return 'Fica em casa';
  if (score >= 7) return conf === 'baixa' ? 'Talvez' : 'Vai';
  if (score >= 5) return 'Talvez';
  return 'Fica em casa';
}
