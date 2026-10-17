import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtDrive } from '../core/drive';
import { compassPt } from '../core/geo';
import { axisStyle, baseOption, chrome, EChart, EOption } from '../components/EChart';
import { ConfBadge, ErrorBox, Loading, ScorePill } from '../components/ui';
import { series } from '../lib/colors';
import { loadDetail, useForecast } from '../lib/data';
import { dayShort, hh, num, todayLocal } from '../lib/format';
import { useSettings } from '../lib/settings';
import type { SpotDetail } from '../core/types';

export default function Compare() {
  const { rows, summary, error, loading } = useForecast();
  const st = useSettings();
  const [picked, setPicked] = useState<string[]>();
  const [pickedDate, setDate] = useState<string>();
  const [details, setDetails] = useState<Record<string, SpotDetail>>({});

  const defaults = useMemo(() => {
    if (!rows) return [];
    if (st.favorites.length >= 2) return st.favorites.slice(0, 4);
    const first = rows[0]?.sum.days.find((d) => d.date >= todayLocal() && d.window)?.date ?? todayLocal();
    const today = first;
    return [...rows].filter((r) => r.spot.kind !== 'virtual').sort((a, b) => (b.sum.days.find((d) => d.date === today)?.score ?? 0) - (a.sum.days.find((d) => d.date === today)?.score ?? 0)).slice(0, 3).map((r) => r.spot.id);
  }, [rows, st.favorites]);
  const ids = picked ?? defaults;

  useEffect(() => {
    ids.forEach((id) => !details[id] && loadDetail(id).then((d) => setDetails((p) => ({ ...p, [id]: d })), () => undefined));
  }, [ids, details]);

  if (loading && !rows) return <Loading />;
  if (error || !rows || !summary) return <ErrorBox msg={error ?? 'sem dados'} />;

  const chosen = ids.map((id) => rows.find((r) => r.spot.id === id)).filter((r): r is NonNullable<typeof r> => !!r);
  const dates = chosen[0]?.sum.days.filter((d) => d.date >= todayLocal() && d.window).map((d) => d.date).slice(0, 7) ?? [];
  const date = pickedDate && dates.includes(pickedDate) ? pickedDate : dates[0] ?? todayLocal();
  const toggle = (id: string) => setPicked(ids.includes(id) ? ids.filter((x) => x !== id) : ids.length >= 4 ? ids : [...ids, id]);
  const options = rows.filter((r) => r.spot.kind !== 'virtual' || ids.includes(r.spot.id)).sort((a, b) => a.spot.name.localeCompare(b.spot.name, 'pt-BR'));

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">Comparar</h1>
      <div className="flex flex-wrap gap-1.5">
        {chosen.map((r, i) => (
          <button key={r.spot.id} className="chip flex items-center gap-1.5" onClick={() => toggle(r.spot.id)} aria-label={`Remover ${r.spot.name}`}>
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: series(i) }} />
            {r.spot.name} ✕
          </button>
        ))}
        {ids.length < 4 && (
          <select className="chip bg-surface" value="" onChange={(e) => e.target.value && toggle(e.target.value)} aria-label="Adicionar pico">
            <option value="">+ adicionar pico</option>
            {options.filter((r) => !ids.includes(r.spot.id)).map((r) => <option key={r.spot.id} value={r.spot.id}>{r.spot.name}</option>)}
          </select>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1">
        {dates.map((d) => <button key={d} className="chip whitespace-nowrap" aria-pressed={d === date} onClick={() => setDate(d)}>{dayShort(d)}</button>)}
      </div>

      <div className={`grid gap-2 ${chosen.length > 2 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
        {chosen.map((r, i) => {
          const d = r.sum.days.find((x) => x.date === date);
          const det = details[r.spot.id];
          const h = d?.window && det?.hours.find((x) => x.t === d.window!.start);
          return (
            <Link key={r.spot.id} to={`/spot/${r.spot.id}`} className="card p-3 block" style={{ borderTop: `3px solid ${series(i)}` }}>
              <p className="font-semibold text-sm truncate">{r.spot.name}</p>
              <p className="text-[11px] text-muted">{fmtDrive(r.drive)}</p>
              <div className="flex items-center gap-2 mt-2">
                <ScorePill score={d?.score} />
                <div className="text-xs">
                  {d?.window ? <b>{hh(d.window.start)}–{hh(d.window.end)}</b> : '–'}
                  {d && <div><ConfBadge conf={d.conf} compact /></div>}
                </div>
              </div>
              {h && (
                <dl className="text-xs mt-2 grid grid-cols-2 gap-x-2 text-ink2">
                  <dt>Onda</dt><dd className="text-ink font-medium">{num(h.hs.v)} m {num(h.tp.v, 0)} s</dd>
                  <dt>Direção</dt><dd className="text-ink font-medium">{compassPt(h.swD?.v ?? h.dir.v)}</dd>
                  <dt>Vento</dt><dd className="text-ink font-medium">{compassPt(h.windDir.v)} {Math.round(h.wind.v)}</dd>
                  <dt>Água</dt><dd className="text-ink font-medium">{num(h.sst)}°</dd>
                </dl>
              )}
            </Link>
          );
        })}
      </div>

      {chosen.length > 0 && <CompareChart chosen={chosen.map((r) => ({ id: r.spot.id, name: r.spot.name, hourly: r.sum.hourly }))} start={summary.start} date={date} />}
    </div>
  );
}

function CompareChart({ chosen, start, date }: { chosen: { id: string; name: string; hourly: number[] }[]; start: string; date: string }) {
  const option = useMemo<EOption>(() => {
    const c = chrome();
    const off = Math.round((new Date(`${date}T00:00:00Z`).getTime() - new Date(`${start.slice(0, 10)}T00:00:00Z`).getTime()) / 3600e3);
    const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    return {
      ...baseOption(),
      grid: { left: 26, right: 8, top: 22 + 20 * Math.ceil(chosen.length / 2), bottom: 22 },
      legend: { top: 0, icon: 'rect', itemWidth: 14, itemHeight: 3, textStyle: { color: c.muted, fontSize: 11 } },
      xAxis: { type: 'category', data: hours, ...axisStyle(), splitLine: { show: false }, axisLabel: { ...axisStyle().axisLabel, interval: 2 } },
      yAxis: { type: 'value', min: 0, max: 10, ...axisStyle() },
      tooltip: { ...(baseOption().tooltip as object), valueFormatter: (v: number) => (v == null ? 'noite' : num(v)) },
      series: chosen.map((s, i) => ({
        name: s.name, type: 'line', color: series(i), symbol: 'circle', symbolSize: 6, lineStyle: { width: 2 },
        data: hours.map((_, h) => { const v = s.hourly[off + h]; return v == null || v < 0 ? null : v / 10; }),
      })),
    };
  }, [chosen, start, date]);
  return (
    <section className="card p-4">
      <h2 className="font-semibold text-[15px] mb-2">Nota hora a hora</h2>
      <EChart option={option} height={200} />
    </section>
  );
}
