import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtDrive } from '../core/drive';
import type { StateCode } from '../core/types';
import { ErrorBox, Loading, ScoreLegend } from '../components/ui';
import { inkOn, scoreColor } from '../lib/colors';
import { useForecast } from '../lib/data';
import { dayShort, num, todayLocal } from '../lib/format';
import { useSettings } from '../lib/settings';

type Filter = 'perto' | 'favoritos' | StateCode | 'todos';

export default function Week() {
  const { rows, error, loading } = useForecast();
  const st = useSettings();
  const nav = useNavigate();
  const [filter, setFilter] = useState<Filter>(st.favorites.length ? 'favoritos' : 'perto');
  const [named, setNamed] = useState(true);
  const today = todayLocal();

  const data = useMemo(() => {
    if (!rows) return undefined;
    const dates = [...new Set(rows.flatMap((r) => r.sum.days.map((d) => d.date)))].filter((d) => d >= today).sort().slice(0, 7);
    const list = rows
      .filter((r) => (named ? r.spot.kind !== 'virtual' : true))
      .filter((r) => (filter === 'favoritos' ? st.favorites.includes(r.spot.id) : filter === 'perto' ? r.drive <= st.maxDriveMin : filter === 'todos' ? true : r.spot.state === filter))
      .map((r) => ({ r, best: Math.max(0, ...r.sum.days.filter((d) => dates.includes(d.date)).map((d) => d.score)) }))
      .sort((a, b) => b.best - a.best);
    return { dates, list };
  }, [rows, filter, named, st.favorites, st.maxDriveMin, today]);

  if (loading && !rows) return <Loading />;
  if (error || !data) return <ErrorBox msg={error ?? 'sem dados'} />;

  const filters: [Filter, string][] = [['perto', `até ${fmtDrive(st.maxDriveMin)}`], ['favoritos', '★'], ['RS', 'RS'], ['SC', 'SC'], ['PR', 'PR'], ['todos', 'todos']];
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">Semana</h1>
      <div className="flex flex-wrap gap-1.5">
        {filters.map(([f, l]) => (
          <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{l}</button>
        ))}
        <button className="chip" aria-pressed={!named} onClick={() => setNamed(!named)} title="Incluir trechos gerados automaticamente">+ trechos</button>
      </div>
      {data.list.length === 0 ? (
        <p className="text-sm text-ink2">Nenhum pico neste filtro{filter === 'favoritos' ? ' — marque favoritos com ☆ na página do pico' : ''}.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm border-separate" style={{ borderSpacing: 2 }}>
            <thead>
              <tr>
                <th className="text-left font-medium text-muted text-xs sticky left-0 bg-surface px-2 py-1">Pico</th>
                {data.dates.map((d) => <th key={d} className="font-medium text-muted text-xs px-1">{dayShort(d)}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.list.map(({ r }) => (
                <tr key={r.spot.id} onClick={() => nav(`/spot/${r.spot.id}`)} className="cursor-pointer">
                  <th scope="row" className="text-left font-normal sticky left-0 bg-surface px-2 py-1 max-w-[130px] truncate">
                    {r.spot.name}
                    <span className="block text-[10px] text-muted truncate">{r.spot.city ?? r.spot.state} · {fmtDrive(r.drive)}</span>
                  </th>
                  {data.dates.map((date) => {
                    const d = r.sum.days.find((x) => x.date === date);
                    const bg = scoreColor(d?.score);
                    const label = d ? `${num(d.score)}${d.red ? ' ⚠' : d.conf === 'baixa' ? '?' : ''}` : '–';
                    return (
                      <td key={date} className="text-center rounded-md font-semibold text-[13px] h-10 min-w-[40px]" style={{ background: bg, color: inkOn(bg), outline: d?.conf === 'baixa' ? `2px dashed ${inkOn(bg)}` : undefined, outlineOffset: -4 }}
                        title={d?.window ? `${d.window.start.slice(11, 16)}–${d.window.end.slice(11, 16)} · confiança ${d.conf}` : ''}>
                        {label}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="space-y-1"><ScoreLegend /><p className="text-[11px] text-muted">Melhor nota de cada dia (horas de luz). ? com borda tracejada = confiança baixa · ⚠ = alerta de segurança.</p></div>
    </div>
  );
}
