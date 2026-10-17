import type { ReactNode } from 'react';
import type { Confidence, SafetyFlag, Verdict } from '../core/types';
import { bandLabel, BANDS, inkOn, scoreColor, STATUS } from '../lib/colors';
import { num } from '../lib/format';

export function ScorePill({ score, size = 'md', title }: { score: number | null | undefined; size?: 'sm' | 'md' | 'lg'; title?: string }) {
  const bg = scoreColor(score);
  const ink = inkOn(bg);
  const empty = score == null || score < 0;
  const cls = size === 'lg' ? 'w-20 h-20 rounded-2xl' : size === 'sm' ? 'w-9 h-7 rounded-md' : 'w-16 h-14 rounded-xl';
  const num_ = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-sm' : 'text-xl';
  return (
    <div className={`${cls} flex flex-col items-center justify-center shrink-0 leading-none`} style={{ background: bg, color: ink }} title={title ?? 'Nota de 0 a 10'} aria-label={empty ? 'sem nota' : `nota ${num(score)} de 10, ${bandLabel(score)}`}>
      <span className={`${num_} font-bold tracking-tight`}>{empty ? '–' : num(score)}</span>
      {size !== 'sm' && !empty && <span className="text-[10px] font-semibold uppercase tracking-wide mt-1 opacity-90">{bandLabel(score)}</span>}
    </div>
  );
}

const CONF_DOTS: Record<Confidence, string> = { alta: '●●●', 'média': '●●○', baixa: '●○○' };
export function ConfBadge({ conf, compact }: { conf: Confidence; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink2 whitespace-nowrap" title="Confiança: concordância entre modelos e antecedência">
      <span aria-hidden className="tracking-[-2px] text-[10px]">{CONF_DOTS[conf]}</span>
      {compact ? conf : `confiança ${conf}`}
    </span>
  );
}

const VERDICT: Record<Verdict, { color: string; icon: string }> = {
  Vai: { color: STATUS.good, icon: '✓' },
  Talvez: { color: STATUS.warning, icon: '?' },
  'Fica em casa': { color: STATUS.critical, icon: '✕' },
};
export function VerdictBadge({ v, big }: { v: Verdict; big?: boolean }) {
  const s = VERDICT[v];
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold ${big ? 'text-4xl' : 'text-base'}`}>
      <span aria-hidden className={`${big ? 'w-11 h-11 text-2xl' : 'w-6 h-6 text-sm'} rounded-full inline-flex items-center justify-center text-white`} style={{ background: s.color }}>
        {s.icon}
      </span>
      {v === 'Vai' ? 'Vai!' : v}
    </span>
  );
}

const FLAG_ICON: Record<SafetyFlag['code'], string> = { raio: '⚡', rajada: '💨', grande: '🌊', aviso: '⚠️', frio: '🥶' };
export function Flags({ flags }: { flags: SafetyFlag[] }) {
  if (!flags.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((f) => (
        <span key={f.code} className="text-xs rounded-md px-2 py-0.5 font-medium" style={{ background: f.code === 'frio' ? 'var(--hair)' : STATUS.critical, color: f.code === 'frio' ? 'var(--text-primary)' : '#fff' }}>
          <span aria-hidden>{FLAG_ICON[f.code]} </span>
          {f.label}
        </span>
      ))}
    </div>
  );
}

/** Hourly scores (×10, −1 = night) as a strip of cells; best window outlined. */
export function HourStrip({ hourly, start, window, labels }: { hourly: number[]; start: number; window?: { from: number; to: number }; labels?: boolean }) {
  const cells = hourly.slice(start, start + 24);
  return (
    <div>
      <div className="flex gap-[2px]" role="img" aria-label="Nota hora a hora">
        {cells.map((v, i) => {
          const inWin = window && i >= window.from && i <= window.to;
          return (
            <div
              key={i}
              title={`${String(i).padStart(2, '0')}h: ${v < 0 ? 'noite' : num(v / 10)}`}
              className="flex-1 h-5 rounded-[3px]"
              style={{ background: scoreColor(v < 0 ? -1 : v / 10), outline: inWin ? '2px solid var(--text-primary)' : undefined, outlineOffset: -1 }}
            />
          );
        })}
      </div>
      {labels && (
        <div className="flex justify-between text-[10px] text-muted mt-0.5">
          {[0, 6, 12, 18, 23].map((h) => (
            <span key={h}>{String(h).padStart(2, '0')}h</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-[15px]">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Loading({ what = 'previsão' }: { what?: string }) {
  return <div className="p-8 text-center text-ink2">Carregando {what}…</div>;
}

export function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="card p-4 text-sm">
      <p className="font-semibold">Sem dados de previsão disponíveis.</p>
      <p className="text-ink2 mt-1">O app mostra a última previsão salva; se nunca houve uma, o pipeline ainda não rodou. ({msg})</p>
    </div>
  );
}

export function ScoreLegend() {
  return (
    <div className="flex flex-wrap items-center gap-1" aria-label="Faixas de nota">
      {BANDS.map((b, i) => {
        const bg = scoreColor(b.min + 1);
        const max = BANDS[i + 1]?.min ?? 10;
        return (
          <span key={b.label} className="text-[10px] font-semibold rounded px-1.5 py-0.5" style={{ background: bg, color: inkOn(bg) }}>
            {b.label} {b.min}–{max}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Daylight bar for one day: the track spans the hours with light, the best window is drawn in
 * its score colour with its times. Replaces the row of hourly squares.
 */
export function DayBar({ hourly, start, window, score }: { hourly: number[]; start: number; window?: { from: number; to: number }; score: number }) {
  const day = hourly.slice(start, start + 24);
  const lit = day.map((v, i) => (v >= 0 ? i : -1)).filter((i) => i >= 0);
  if (!lit.length) return null;
  const a = lit[0], b = lit[lit.length - 1] + 1;
  const pct = (h: number) => `${((h - a) / (b - a)) * 100}%`;
  const bg = scoreColor(score);
  return (
    <div aria-label={window ? `Melhor janela das ${window.from}h às ${window.to + 1}h` : 'Sem janela boa'}>
      <div className="relative h-2.5 rounded-full" style={{ background: 'var(--hair)' }}>
        {window && (
          <div className="absolute top-0 bottom-0 rounded-full" style={{ left: pct(Math.max(a, window.from)), width: `calc(${pct(Math.min(b, window.to + 1))} - ${pct(Math.max(a, window.from))})`, background: bg, minWidth: 8 }} />
        )}
      </div>
      <div className="relative h-3.5 text-[10px] text-muted mt-0.5">
        <span className="absolute left-0">{String(a).padStart(2, '0')}h</span>
        <span className="absolute right-0">{String(b).padStart(2, '0')}h</span>
      </div>
    </div>
  );
}
