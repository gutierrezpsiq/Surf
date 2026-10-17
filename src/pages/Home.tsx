import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtDrive } from '../core/drive';
import { confRank, verdict } from '../core/scoring';
import type { DayBest } from '../core/types';
import { ConfBadge, DayBar, ErrorBox, Flags, Loading, ScoreLegend, ScorePill, VerdictBadge } from '../components/ui';
import { compassPt } from '../core/geo';
import type { WindRelation } from '../core/types';
import { Row, useForecast } from '../lib/data';
import { dayShort, hh, num, todayLocal } from '../lib/format';
import { useSettings } from '../lib/settings';

type Ranked = Row & { day: DayBest };

export default function Home() {
  const { rows, summary, error, loading } = useForecast();
  const st = useSettings();
  const [anyDistance, setAnyDistance] = useState(false);
  const now = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 16);
  // After dark (no window left today anywhere) the screen rolls over to the next day.
  const today = useMemo(() => {
    const t = todayLocal();
    if (!rows) return t;
    const dates = [...new Set(rows.flatMap((r) => r.sum.days.map((d) => d.date)))].filter((d) => d >= t).sort();
    const hasLight = rows.some((r) => r.sum.days.some((d) => d.date === t && d.window && d.window.end >= now.slice(0, 13) + ':00' && d.score > 0));
    return hasLight ? t : dates.find((d) => d > t) ?? t;
  }, [rows, now]);

  const ranked = useMemo(() => {
    if (!rows) return [];
    return rows
      .map((r) => ({ ...r, day: r.sum.days.find((d) => d.date === today) }))
      .filter((r): r is Ranked => !!r.day && (anyDistance || r.drive <= st.maxDriveMin))
      .sort((a, b) => {
        // near-ties (< 0.3) go to named spots over auto-generated stretches
        const d = b.day.score - a.day.score;
        if (Math.abs(d) < 0.3) {
          const v = Number(a.spot.kind === 'virtual') - Number(b.spot.kind === 'virtual');
          if (v) return v;
        }
        return d || confRank(b.day.conf) - confRank(a.day.conf) || a.drive - b.drive;
      })
      // one spot per city keeps the Top 5 varied
      .filter((r, i, all) => all.findIndex((x) => (x.spot.city ?? x.spot.id) === (r.spot.city ?? r.spot.id)) === i);
  }, [rows, today, anyDistance, st.maxDriveMin]);

  const nextBest = useMemo(() => {
    if (!rows) return undefined;
    let best: { r: Row; d: DayBest } | undefined;
    for (const r of rows) {
      if (!anyDistance && r.drive > st.maxDriveMin) continue;
      for (const d of r.sum.days) if (d.date > today && !d.red && (!best || d.score > best.d.score)) best = { r, d };
    }
    return best;
  }, [rows, today, anyDistance, st.maxDriveMin]);

  if (loading && !rows) return <Loading />;
  if (error || !rows || !summary) return <ErrorBox msg={error ?? 'sem dados'} />;

  const top = ranked.slice(0, 5);
  const best = top[0];
  const v = best ? verdict(best.day.score, best.day.conf, best.day.red) : 'Fica em casa';
  const dayOffset = Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${summary.start.slice(0, 10)}T00:00:00Z`).getTime()) / 86400e3) * 24;
  const warnings = summary.warnings.filter((w) => w.severity !== 'info');

  return (
    <div className="space-y-3">
      <header className="flex items-baseline justify-between">
        <h1 className="text-lg font-bold tracking-tight">Swell Sul</h1>
        <span className="text-xs text-muted">{st.location === 'gps' && st.gps ? 'da sua localização' : 'de Porto Alegre'}</span>
      </header>

      {warnings.length > 0 && (
        <div className="card p-3 text-sm border-[color:var(--critical)]">
          <span aria-hidden>⚠️ </span>
          <b>Aviso oficial:</b> {warnings[0].title} ({warnings[0].states.join(', ')}){warnings.length > 1 && ` e mais ${warnings.length - 1}`}
        </div>
      )}

      <section className="card p-4" aria-live="polite">
        <p className="text-xs uppercase tracking-wide text-muted mb-1">{dayShort(today)}</p>
        <VerdictBadge v={v} big />
        {best ? (
          <Link to={`/spot/${best.spot.id}`} className="block mt-3">
            <p className="text-[15px]">
              <b>{best.spot.name}</b>
              {best.day.window && (
                <>
                  {' '}
                  das <b>{hh(best.day.window.start)}</b> às <b>{hh(best.day.window.end)}</b>
                </>
              )}
            </p>
            <div className="flex items-center gap-2 mt-1 text-sm text-ink2">
              <span>nota {num(best.day.score)}</span>·<ConfBadge conf={best.day.conf} />·<span>{fmtDrive(best.drive)} de carro</span>
            </div>
            {best.day.reason && <p className="text-xs text-ink2 mt-1">{best.day.reason}</p>}
          </Link>
        ) : (
          <p className="mt-3 text-sm text-ink2">Nenhum pico dentro de {fmtDrive(st.maxDriveMin)} de carro.</p>
        )}
        {nextBest && (v !== 'Vai' || nextBest.d.score > (best?.day.score ?? 0) + 1) && (
          <p className="mt-3 text-sm border-t border-hair pt-2">
            Melhor nos próximos dias: <Link to={`/spot/${nextBest.r.spot.id}`} className="font-semibold underline">{nextBest.r.spot.name}</Link> · {dayShort(nextBest.d.date)}{' '}
            {nextBest.d.window && `${hh(nextBest.d.window.start)}–${hh(nextBest.d.window.end)}`} · nota {num(nextBest.d.score)} ({nextBest.d.conf})
          </p>
        )}
      </section>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Top 5 · {dayShort(today).toLowerCase()}</h2>
        <div className="flex gap-1.5">
          <button className="chip" aria-pressed={!anyDistance} onClick={() => setAnyDistance(false)}>
            até {fmtDrive(st.maxDriveMin)}
          </button>
          <button className="chip" aria-pressed={anyDistance} onClick={() => setAnyDistance(true)}>
            todos
          </button>
        </div>
      </div>

      <ol className="space-y-2">
        {top.map((r, i) => {
          const w = r.day.window;
          const from = w ? +w.start.slice(11, 13) : undefined, to = w ? +w.end.slice(11, 13) : undefined;
          const f = r.day.facts;
          return (
            <li key={r.spot.id}>
              <Link to={`/spot/${r.spot.id}`} className="card p-3 flex gap-3 items-start">
                <ScorePill score={r.day.score} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-semibold truncate">{r.spot.name}</p>
                    <span className="text-xs text-muted whitespace-nowrap">🚗 {fmtDrive(r.drive)}</span>
                  </div>
                  <p className="text-xs text-muted truncate">
                    {r.spot.city ? `${r.spot.city}, ` : ''}
                    {r.spot.state} · <ConfBadge conf={r.day.conf} />
                  </p>
                  {f ? (
                    <div className="flex flex-wrap gap-1.5 mt-2 text-xs">
                      <Fact icon="🌊" text={`${num(f.h)} m · ${f.t} s · ${compassPt(f.dir)}`} label="Onda na arrebentação, período e direção" />
                      <Fact icon="💨" text={f.rel === 'glassy' ? 'sem vento' : `${REL_SHORT[f.rel]} ${f.wind} km/h`} label="Vento" />
                    </div>
                  ) : (
                    r.day.reason && <p className="text-xs text-ink2 mt-1 line-clamp-2">{r.day.reason}</p>
                  )}
                  <div className="mt-2.5 flex items-center gap-2">
                    <span className="text-xs font-semibold whitespace-nowrap">{w ? `${hh(w.start)}–${hh(w.end)}` : 'sem janela'}</span>
                    <div className="flex-1">
                      <DayBar hourly={r.sum.hourly} start={dayOffset} window={from != null ? { from, to: to! } : undefined} score={r.day.score} />
                    </div>
                  </div>
                  {r.day.red && r.sum.now && <div className="mt-1.5"><Flags flags={r.sum.now.flags} /></div>}
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
      <div className="space-y-1">
        <ScoreLegend />
        <p className="text-[11px] text-muted">Barra = horas de luz do dia; trecho colorido = melhor janela para surfar.</p>
      </div>
    </div>
  );
}

const REL_SHORT: Record<WindRelation, string> = { glassy: 'sem vento', terral: 'terral', 'terral-lateral': 'terral-lat.', lateral: 'lateral', 'maral-lateral': 'maral-lat.', maral: 'maral' };

function Fact({ icon, text, label }: { icon: string; text: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 border border-hair" title={label}>
      <span aria-hidden>{icon}</span>
      <span className="sr-only">{label}: </span>
      {text}
    </span>
  );
}
