import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtDrive } from '../core/drive';
import { confRank, verdict } from '../core/scoring';
import type { DayBest } from '../core/types';
import { ConfBadge, ErrorBox, Flags, HourStrip, Loading, ScoreLegend, ScorePill, VerdictBadge } from '../components/ui';
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
      .sort((a, b) => b.day.score - a.day.score || confRank(b.day.conf) - confRank(a.day.conf) || a.drive - b.drive);
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
          return (
            <li key={r.spot.id}>
              <Link to={`/spot/${r.spot.id}`} className="card p-3 flex gap-3 items-start">
                <ScorePill score={r.day.score} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-semibold truncate">
                      <span className="text-muted mr-1">{i + 1}.</span>
                      {r.spot.name}
                    </p>
                    <span className="text-xs text-muted whitespace-nowrap">{fmtDrive(r.drive)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm mt-0.5">
                    {w && <b>{hh(w.start)}–{hh(w.end)}</b>}
                    <ConfBadge conf={r.day.conf} compact />
                    <span className="text-xs text-muted truncate">{r.spot.city ? `${r.spot.city}, ` : ''}{r.spot.state}</span>
                  </div>
                  {r.day.reason && <p className="text-xs text-ink2 mt-1 line-clamp-2">{r.day.reason}</p>}
                  <div className="mt-2">
                    <HourStrip hourly={r.sum.hourly} start={dayOffset} window={from != null ? { from, to: to! } : undefined} />
                  </div>
                  {r.day.red && r.sum.now && <div className="mt-1.5"><Flags flags={r.sum.now.flags} /></div>}
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
      <div className="flex justify-between items-center">
        <ScoreLegend />
        <span className="text-[11px] text-muted">faixa = horário da melhor janela</span>
      </div>
    </div>
  );
}
