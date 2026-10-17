/** Score a spot's hourly series end-to-end (shared by the pipeline and the app's re-scoring). */
import { isUsable } from './assemble';
import { tideStage } from './physics';
import { dailyBest, DEFAULT_PREFS, Prefs, scoreHour, Skill } from './scoring';
import type { HourPoint, HourScore, OfficialWarning, Spot, SpotSummary } from './types';

export const PROFILES: Record<Skill, Prefs> = {
  iniciante: { skill: 'iniciante', minH: 0.4, maxH: 1.2 },
  'intermediário': DEFAULT_PREFS,
  'avançado': { skill: 'avançado', minH: 1.5, maxH: 3.5 },
};

export function scoreSeries(spot: Spot, hours: HourPoint[], nowIdx: number, prefs: Prefs, warnings: OfficialWarning[] = []): HourScore[] {
  const tides = hours.map((h) => h.tide);
  return hours.map((h, i) => {
    if (!isUsable(h)) return { t: h.t, score: 0, conf: 'baixa', flags: [], windRel: 'lateral', energyKj: 0, reason: 'sem dados suficientes' };
    const hh = Number.isFinite(h.gust?.v) ? h : { ...h, gust: { v: h.wind.v * 1.4, s: 0, n: 0 } };
    return scoreHour(hh, { spot, prefs, leadHours: Math.max(0, i - nowIdx), tide: tideStage(tides, i), warnings });
  });
}

export function summarise(id: string, hours: HourPoint[], scores: HourScore[], nowIdx: number): SpotSummary {
  const day = hours.map((h) => h.day);
  // earlier hours today don't count as "best" anymore
  const future = scores.map((s, i) => (i < nowIdx ? { ...s, score: 0 } : s));
  const cur = scores[nowIdx];
  return {
    id,
    days: dailyBest(future, day),
    hourly: scores.map((s, i) => (day[i] ? Math.round(s.score * 10) : -1)),
    now: cur && { score: cur.score, conf: cur.conf, reason: cur.reason, flags: cur.flags },
    sst: hours[nowIdx]?.sst,
  };
}

/** Index of the current local hour (America/Sao_Paulo, fixed UTC−3) in a series; 0 if before start. */
export function nowIndex(times: string[], now = new Date()): number {
  const local = new Date(now.getTime() - 3 * 3600e3).toISOString().slice(0, 13) + ':00';
  const i = times.indexOf(local);
  if (i >= 0) return i;
  return local < times[0] ? 0 : times.length - 1;
}

/** File name of the precomputed summary for a skill profile. */
export function summaryFile(skill: Skill): string {
  return skill === 'intermediário' ? 'summary.json' : `summary-${skill === 'iniciante' ? 'iniciante' : 'avancado'}.json`;
}
