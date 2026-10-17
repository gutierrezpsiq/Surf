import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fmtDrive, driveMinutes } from '../core/drive';
import { compassPt } from '../core/geo';
import { wetsuit, waveEnergyKj } from '../core/physics';
import { bestWindow, verdict } from '../core/scoring';
import { explainHour, Factor } from '../core/explain';
import { tideStage } from '../core/physics';
import { nowIndex, PROFILES, scoreSeries } from '../core/spotScore';
import type { HourPoint, HourScore, Spot, SpotDetail } from '../core/types';
import { Compass } from '../components/Compass';
import { axisStyle, baseOption, chrome, EChart, EOption } from '../components/EChart';
import { ConfBadge, ErrorBox, Flags, Loading, ScorePill, Section, VerdictBadge } from '../components/ui';
import { inkOn, scoreColor, series } from '../lib/colors';
import { loadDetail, loadSpots, loadSummary, useAsync, useHome } from '../lib/data';
import { dayShort, hh, num, weekdayShort } from '../lib/format';
import { MODEL_LABEL, WAVE_MODEL_ORDER, WIND_MODEL_ORDER } from '../lib/models';
import { toggleFavorite, useSettings } from '../lib/settings';

const BREAK_LABEL: Record<Spot['breakType'], string> = { beach: 'Beach break (areia)', point: 'Ponta / costão', jetty: 'Junto a molhe', reef: 'Laje / recife', pier: 'Junto a plataforma' };
const REL_GROUP = (r: HourScore['windRel']) => (r === 'terral' || r === 'terral-lateral' || r === 'glassy' ? 0 : r === 'lateral' ? 1 : 2);

export default function SpotPage() {
  const { id = '' } = useParams();
  const st = useSettings();
  const home = useHome();
  const spots = useAsync(loadSpots, []);
  const detail = useAsync(() => loadDetail(id), [id]);
  const summary = useAsync(() => loadSummary(st.skill), [st.skill]);
  const spot = spots.data?.find((s) => s.id === id);

  const scored = useMemo(() => {
    if (!spot || !detail.data) return undefined;
    const d = detail.data;
    const nowIdx = nowIndex(d.hours.map((h) => h.t));
    return { nowIdx, scores: scoreSeries(spot, d.hours, nowIdx, PROFILES[st.skill], summary.data?.warnings ?? []) };
  }, [spot, detail.data, summary.data, st.skill]);

  const dates = useMemo(() => [...new Set(detail.data?.hours.map((h) => h.t.slice(0, 10)) ?? [])], [detail.data]);
  const [date, setDate] = useState<string>();
  const [pickedHour, setPickedHour] = useState<number>();
  const [details, setDetails] = useState(false);
  const pickHour = useCallback((i: number) => setPickedHour(i), []);
  const sel = date ?? dates.find((d) => d >= new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)) ?? dates[0];

  if (spots.loading || detail.loading) return <Loading what="pico" />;
  if (!spot) return <ErrorBox msg="pico não encontrado" />;
  if (!detail.data || !scored) return <ErrorBox msg={detail.error ?? 'sem dados'} />;

  const d = detail.data;
  const idx = d.hours.map((h, i) => (h.t.startsWith(sel) ? i : -1)).filter((i) => i >= 0);
  const hours = idx.map((i) => d.hours[i]);
  const scores = idx.map((i) => scored.scores[i]);
  const win = bestWindow(scores, hours.map((h) => h.day));
  const bestI = win ? scores.findIndex((s) => s.score === win.score) : 0;
  const best = scores[bestI];
  // hour being explained: the one tapped on the chart, else the best of the day
  const hi = pickedHour != null && pickedHour < hours.length ? pickedHour : bestI;
  const bh = hours[hi], hs = scores[hi];
  const gi = idx[hi];
  const explanation =
    bh && hs && hs.reason !== 'sem dados suficientes'
      ? explainHour(bh, { spot, prefs: PROFILES[st.skill], leadHours: Math.max(0, gi - scored.nowIdx), tide: tideStage(d.hours.map((h) => h.tide), gi), warnings: summary.data?.warnings })
      : undefined;
  const fav = st.favorites.includes(spot.id);
  const dayBest = (ds: string) => {
    const ii = d.hours.map((h, i) => (h.t.startsWith(ds) && h.day && i >= scored.nowIdx - (ds === sel ? 99 : 0) ? scored.scores[i].score : -1));
    return Math.max(-1, ...ii);
  };
  const redDay = win ? scores.slice(win.start, win.end + 1).every((s) => s.flags.some((f) => f.code !== 'frio')) : false;

  return (
    <div className="space-y-3">
      <header className="flex items-start gap-2">
        <Link to="/" className="text-muted text-xl leading-none pt-0.5" aria-label="Voltar">‹</Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold leading-tight">{spot.name}</h1>
          <p className="text-xs text-muted">
            {spot.city ? `${spot.city} · ` : ''}{spot.state} · praia voltada para {compassPt(spot.facing)} ({spot.facing}°) · {fmtDrive(driveMinutes(home, [spot.lon, spot.lat]))} de carro
            {spot.kind === 'virtual' && ' · trecho gerado automaticamente'}
          </p>
        </div>
        <button onClick={() => toggleFavorite(spot.id)} className="text-2xl leading-none" aria-pressed={fav} aria-label={fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}>
          {fav ? '★' : '☆'}
        </button>
      </header>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4" role="tablist">
        {dates.map((ds) => {
          const b = dayBest(ds);
          return (
            <button key={ds} role="tab" aria-selected={ds === sel} onClick={() => { setDate(ds); setPickedHour(undefined); }} className={`flex flex-col items-center rounded-lg px-2 py-1 min-w-[52px] border ${ds === sel ? 'border-[color:var(--text-primary)]' : 'border-hair'}`}>
              <span className="text-[11px] text-ink2">{dayShort(ds)}</span>
              <span className="text-xs font-bold rounded px-1.5 mt-0.5" style={{ background: scoreColor(b), color: inkOn(scoreColor(b)) }}>
                {b < 0 ? '–' : num(b)}
              </span>
            </button>
          );
        })}
      </div>

      <section className="card p-4">
        {best && win ? (
          <div className="flex gap-3 items-center">
            <ScorePill score={win.score} size="lg" />
            <div className="min-w-0">
              <VerdictBadge v={verdict(win.score, best.conf, redDay)} />
              <p className="text-sm mt-1">
                Melhor janela <b>{hh(hours[win.start].t)}–{hh(hours[win.end].t)}</b> · <ConfBadge conf={best.conf} />
              </p>
              <p className="text-xs text-ink2 mt-1">{best.reason}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink2">Sem horário de luz com dados para este dia.</p>
        )}
        {best && best.flags.length > 0 && <div className="mt-2"><Flags flags={best.flags} /></div>}
        <ScoreBars hours={hours} scores={scores} win={win} selected={hi} onPick={pickHour} />
        <p className="text-[11px] text-muted -mt-1">Toque numa hora para ver a explicação dela.</p>
        {explanation && hs && (
          <div className="mt-3 border-t border-hair pt-3">
            <p className="text-sm">
              <b>Por que {num(hs.score)} às {hh(bh.t)}?</b> {explanation.summary}
            </p>
            <button className="mt-2 text-sm font-semibold underline" aria-expanded={details} onClick={() => setDetails(!details)}>
              {details ? 'Menos detalhes ▴' : 'Mais detalhes ▾'}
            </button>
            {details && <Details factors={explanation.factors} confidence={explanation.confidence} conf={hs.conf} flags={hs.flags} />}
          </div>
        )}
      </section>

      <Section title="Ondas" right={<span className="text-xs text-muted">consenso ± dispersão · seta = de onde vem</span>}>
        <WaveChart d={d} sel={sel} />
        {bh && (
          <p className="text-xs text-ink2 mt-2">
            {bh.swH ? <>Swell {compassPt(bh.swD?.v ?? bh.dir.v)} {num(bh.swH.v)} m @ {num(bh.swT?.v ?? bh.tp.v, 0)} s</> : <>Ondulação {compassPt(bh.dir.v)} {num(bh.hs.v)} m @ {num(bh.tp.v, 0)} s</>}
            {bh.sw2H != null && bh.sw2H > 0.2 && <> · 2º swell {compassPt(bh.sw2D ?? 0)} {num(bh.sw2H)} m @ {num(bh.sw2T, 0)} s</>}
            {bh.wwH != null && <> · mar de vento {num(bh.wwH)} m</>} · energia ≈ {Math.round(waveEnergyKj(bh.hs.v, bh.tp.v))} kJ
          </p>
        )}
      </Section>

      <Section title="Vento" right={<span className="text-xs text-muted">km/h · seta = para onde sopra</span>}>
        <WindChart hours={hours} scores={scores} />
        <div className="flex gap-3 text-[11px] text-ink2 mt-1">
          <Swatch c={series(0)} l="terral / glassy" />
          <Swatch c="var(--text-muted)" l="lateral" />
          <Swatch c={series(1)} l="maral" />
          <span className="flex items-center gap-1"><span className="w-3 border-t-2 border-dashed" style={{ borderColor: 'var(--text-secondary)' }} /> rajada</span>
        </div>
      </Section>

      <div className="grid sm:grid-cols-2 gap-3">
        <Section title="Maré" right={<span className="text-xs text-muted">nível do mar (modelo)</span>}>
          <TideChart hours={hours} sunrise={d.sunrise.find((s) => s.startsWith(sel))} sunset={d.sunset.find((s) => s.startsWith(sel))} />
          <p className="text-[11px] text-muted mt-1">Modelo MF (~8 km), não é a tábua da DHN. Litoral sul é de micromaré (&lt; 1 m): efeito pequeno na nota.</p>
        </Section>
        <Section title="Orientação">
          <div className="flex gap-3 items-center">
            <div className="w-40"><Compass spot={spot} swellDir={bh?.swD?.v ?? bh?.dir.v} windDir={bh?.windDir.v} size={170} /></div>
            <ul className="text-xs space-y-1 text-ink2">
              <li><Swatch c={series(2)} l={`Janela de swell ${compassPt(spot.window.from)}→${compassPt(spot.window.to)}`} /></li>
              <li><Swatch c={series(0)} l={`Swell ${bh ? compassPt(bh.swD?.v ?? bh.dir.v) : '–'}`} /></li>
              <li><Swatch c={series(1)} l={`Vento ${bh ? compassPt(bh.windDir.v) : '–'}`} /></li>
              <li>Terral: vento de {compassPt(spot.offshore)}</li>
            </ul>
          </div>
        </Section>
      </div>

      <Section title="Comparação de modelos" right={<span className="text-xs text-muted">altura (m), 7 dias</span>}>
        <ModelChart d={d} kind="wave" sel={sel} />
        <h3 className="text-sm font-semibold mt-4 mb-1">Vento por modelo (km/h)</h3>
        <ModelChart d={d} kind="wind" sel={sel} />
      </Section>

      <div className="grid sm:grid-cols-2 gap-3">
        <Section title="Água">
          <p className="text-3xl font-bold">{num(bh?.sst ?? hours.find((h) => h.sst != null)?.sst)} °C</p>
          <p className="text-sm text-ink2 mt-1">Roupa: <b className="text-ink">{wetsuit(bh?.sst ?? hours.find((h) => h.sst != null)?.sst)}</b></p>
        </Section>
        <Section title="Perigos e fundo">
          <p className="text-sm"><b>{BREAK_LABEL[spot.breakType]}</b> <span className="text-[11px] text-muted">(auto-inferido)</span></p>
          <ul className="text-sm list-disc pl-5 mt-1 text-ink2">
            {spot.hazards.map((h) => <li key={h}>{h}</li>)}
          </ul>
          <p className="text-[11px] text-muted mt-2">
            Fonte: {spot.inferred.breakSource}. Orientação {spot.inferred.orientationQuality === 'coarse' ? 'aproximada (litoral Natural Earth)' : 'do litoral OSM'}.
          </p>
        </Section>
      </div>

      <Section title="Tempo">
        <WeatherStrip hours={hours} scores={scores} />
      </Section>

      <p className="text-[11px] text-muted text-center pb-2">
        Atualizado {new Date(d.generatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })} · modelos: {modelsUsed(d)}
      </p>
    </div>
  );
}

function Swatch({ c, l }: { c: string; l: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: c }} />
      {l}
    </span>
  );
}

function modelsUsed(d: SpotDetail) {
  const ks = new Set<string>();
  d.hours.forEach((h) => Object.keys(h.m ?? {}).forEach((k) => ks.add(k)));
  return [...ks].map((k) => MODEL_LABEL[k.replace('w:', '')] ?? k).join(', ');
}

function ScoreBars({ hours, scores, win, selected, onPick }: { hours: HourPoint[]; scores: HourScore[]; win?: { start: number; end: number }; selected: number; onPick: (i: number) => void }) {
  const option = useMemo<EOption>(() => {
    const c = chrome();
    return {
      ...baseOption(),
      grid: { left: 24, right: 6, top: 14, bottom: 20 },
      tooltip: { ...(baseOption().tooltip as object), formatter: (p: any) => `<b>${hh(hours[p[0].dataIndex].t)} · ${num(scores[p[0].dataIndex].score)}</b><br/>${hours[p[0].dataIndex].day ? scores[p[0].dataIndex].reason : 'noite'}` },
      xAxis: { type: 'category', data: hours.map((h) => h.t.slice(11, 13)), ...axisStyle(), splitLine: { show: false }, axisLabel: { ...axisStyle().axisLabel, interval: 2 } },
      yAxis: { type: 'value', min: 0, max: 10, interval: 5, ...axisStyle() },
      series: [
        {
          type: 'bar',
          barCategoryGap: '12%',
          data: scores.map((s, i) => {
            const sel = i === selected ? { borderColor: c.text, borderWidth: 2 } : {};
            return hours[i].day ? { value: s.score, itemStyle: { color: scoreColor(s.score), borderRadius: [3, 3, 0, 0], ...sel } } : { value: 0.25, itemStyle: { color: c.grid, ...sel } };
          }),
          markArea: win ? { silent: true, itemStyle: { color: 'transparent', borderColor: c.text, borderWidth: 1.5, borderType: 'dashed' }, data: [[{ xAxis: win.start }, { xAxis: win.end }]] } : undefined,
        },
      ],
    };
  }, [hours, scores, win, selected]);
  return <div className="mt-3"><EChart option={option} height={130} onClick={onPick} /></div>;
}

const arrowRot = (fromDeg: number) => -(fromDeg + 180); // ECharts rotates counter-clockwise; arrow points where it goes

function WaveChart({ d, sel }: { d: SpotDetail; sel: string }) {
  const option = useMemo<EOption>(() => {
    const c = chrome();
    const t = d.hours.map((h) => h.t);
    const lo = d.hours.map((h) => Math.max(0, h.hs.v - (h.hs.s || 0)));
    const band = d.hours.map((h, i) => (h.hs.s || 0) * 2 + (h.hs.v - (h.hs.s || 0) - lo[i]));
    const selIdx = t.map((x, i) => (x.startsWith(sel) ? i : -1)).filter((i) => i >= 0);
    return {
      ...baseOption(),
      grid: { left: 30, right: 30, top: 14, bottom: 22 },
      tooltip: { ...(baseOption().tooltip as object), formatter: (p: any) => { const h = d.hours[p[0].dataIndex]; return `${dayShort(h.t.slice(0, 10))} ${hh(h.t)}<br/>${num(h.hs.v)} m ±${num(h.hs.s)} · ${num(h.tp.v, 0)} s · de ${compassPt(h.dir.v)}`; } },
      xAxis: { type: 'category', data: t, ...axisStyle(), splitLine: { show: false }, axisLabel: { ...axisStyle().axisLabel, interval: (i: number) => i % 24 === 12, formatter: (v: string) => weekdayShort(v.slice(0, 10)) } },
      yAxis: [{ type: 'value', name: 'm', nameGap: 4, nameTextStyle: { fontSize: 10, color: c.muted }, ...axisStyle(), min: 0 }],
      series: [
        { type: 'line', stack: 'b', data: lo, lineStyle: { opacity: 0 }, symbol: 'none', silent: true },
        { type: 'line', stack: 'b', data: band, lineStyle: { opacity: 0 }, symbol: 'none', areaStyle: { color: series(0), opacity: 0.18 }, silent: true },
        {
          type: 'line', data: d.hours.map((h) => h.hs.v), symbol: 'none', lineStyle: { width: 2, color: series(0) },
          markArea: selIdx.length ? { silent: true, itemStyle: { color: c.grid, opacity: 0.5 }, data: [[{ xAxis: t[selIdx[0]] }, { xAxis: t[selIdx[selIdx.length - 1]] }]] } : undefined,
        },
        {
          type: 'scatter', symbol: 'arrow', symbolSize: [7, 11], silent: true,
          data: d.hours.map((h, i) => (i % 6 === 3 ? { value: [i, h.hs.v + 0.15], symbolRotate: arrowRot(h.swD?.v ?? h.dir.v), itemStyle: { color: c.text } } : null)).filter(Boolean),
        },
      ],
    };
  }, [d, sel]);
  return <EChart option={option} height={170} />;
}

function WindChart({ hours, scores }: { hours: HourPoint[]; scores: HourScore[] }) {
  const option = useMemo<EOption>(() => {
    const c = chrome();
    const col = [series(0), c.muted, series(1)];
    return {
      ...baseOption(),
      grid: { left: 30, right: 6, top: 20, bottom: 20 },
      tooltip: { ...(baseOption().tooltip as object), formatter: (p: any) => { const h = hours[p[0].dataIndex]; return `${hh(h.t)}: ${Math.round(h.wind.v)} km/h de ${compassPt(h.windDir.v)} (${scores[p[0].dataIndex].windRel})<br/>rajada ${Math.round(h.gust.v)} km/h`; } },
      xAxis: { type: 'category', data: hours.map((h) => h.t.slice(11, 13)), ...axisStyle(), splitLine: { show: false }, axisLabel: { ...axisStyle().axisLabel, interval: 2 } },
      yAxis: { type: 'value', min: 0, ...axisStyle() },
      series: [
        { type: 'bar', barCategoryGap: '15%', data: hours.map((h, i) => ({ value: Math.round(h.wind.v), itemStyle: { color: col[REL_GROUP(scores[i].windRel)], borderRadius: [3, 3, 0, 0] } })) },
        { type: 'line', data: hours.map((h) => Math.round(h.gust.v)), symbol: 'none', lineStyle: { width: 1.5, type: 'dashed', color: c.text, opacity: 0.6 } },
        { type: 'scatter', symbol: 'arrow', symbolSize: [7, 11], silent: true, data: hours.map((h, i) => (i % 2 === 0 ? { value: [i, Math.round(h.gust.v) + 4], symbolRotate: arrowRot(h.windDir.v), itemStyle: { color: c.text } } : null)).filter(Boolean) },
      ],
    };
  }, [hours, scores]);
  return <EChart option={option} height={150} />;
}

function TideChart({ hours, sunrise, sunset }: { hours: HourPoint[]; sunrise?: string; sunset?: string }) {
  const option = useMemo<EOption>(() => {
    const c = chrome();
    const x = hours.map((h) => h.t.slice(11, 13));
    const sr = sunrise ? sunrise.slice(11, 13) : '06', ss = sunset ? sunset.slice(11, 13) : '18';
    return {
      ...baseOption(),
      grid: { left: 34, right: 6, top: 10, bottom: 20 },
      tooltip: { ...(baseOption().tooltip as object), formatter: (p: any) => `${x[p[0].dataIndex]}h: ${num(hours[p[0].dataIndex].tide, 2)} m` },
      xAxis: { type: 'category', data: x, boundaryGap: false, ...axisStyle(), splitLine: { show: false }, axisLabel: { ...axisStyle().axisLabel, interval: 5 } },
      yAxis: { type: 'value', ...axisStyle(), axisLabel: { ...axisStyle().axisLabel, formatter: (v: number) => num(v, 1) } },
      series: [
        {
          type: 'line', smooth: true, symbol: 'none', data: hours.map((h) => h.tide ?? null), lineStyle: { width: 2, color: series(0) }, areaStyle: { color: series(0), opacity: 0.12 },
          markArea: { silent: true, itemStyle: { color: c.grid, opacity: 0.8 }, data: [[{ xAxis: '00' }, { xAxis: sr }], [{ xAxis: ss }, { xAxis: x[x.length - 1] }]] },
        },
      ],
    };
  }, [hours, sunrise, sunset]);
  if (!hours.some((h) => h.tide != null)) return <p className="text-sm text-ink2">Sem dado de maré.</p>;
  return <EChart option={option} height={130} />;
}

function ModelChart({ d, kind, sel }: { d: SpotDetail; kind: 'wave' | 'wind'; sel: string }) {
  const option = useMemo<EOption>(() => {
    const c = chrome();
    const order = kind === 'wave' ? WAVE_MODEL_ORDER : WIND_MODEL_ORDER;
    const key = (m: string) => (kind === 'wave' ? m : `w:${m}`);
    const present = order.filter((m) => d.hours.some((h) => h.m?.[key(m)]));
    const t = d.hours.map((h) => h.t);
    const selIdx = t.map((x, i) => (x.startsWith(sel) ? i : -1)).filter((i) => i >= 0);
    return {
      ...baseOption(),
      grid: { left: 30, right: 8, top: 36, bottom: 22 },
      legend: { top: 0, itemWidth: 14, itemHeight: 3, textStyle: { color: c.muted, fontSize: 10 }, icon: 'rect' },
      xAxis: { type: 'category', data: t, ...axisStyle(), splitLine: { show: false }, axisLabel: { ...axisStyle().axisLabel, interval: (i: number) => i % 24 === 12, formatter: (v: string) => weekdayShort(v.slice(0, 10)) } },
      yAxis: { type: 'value', min: 0, ...axisStyle() },
      tooltip: { ...(baseOption().tooltip as object), valueFormatter: (v: number) => (v == null ? '–' : kind === 'wave' ? `${num(v)} m` : `${Math.round(v)} km/h`) },
      series: [
        ...present.map((m) => ({
          name: MODEL_LABEL[m] ?? m, type: 'line', symbol: 'none', lineStyle: { width: 1.5 },
          color: series(order.indexOf(m)), data: d.hours.map((h) => h.m?.[key(m)]?.[0] ?? null),
        })),
        {
          name: 'Consenso', type: 'line', symbol: 'none', color: c.text, lineStyle: { width: 2.5, type: 'dashed' },
          data: d.hours.map((h) => (kind === 'wave' ? h.hs.v : h.wind.v)),
          markArea: selIdx.length ? { silent: true, itemStyle: { color: c.grid, opacity: 0.5 }, data: [[{ xAxis: t[selIdx[0]] }, { xAxis: t[selIdx[selIdx.length - 1]] }]] } : undefined,
        },
      ],
    };
  }, [d, kind, sel]);
  return <EChart option={option} height={190} />;
}

function WeatherStrip({ hours, scores }: { hours: HourPoint[]; scores: HourScore[] }) {
  const pick = hours.map((h, i) => ({ h, s: scores[i] })).filter((_, i) => i % 3 === 0);
  const sky = (h: HourPoint) => ((h.rain ?? 0) >= 0.5 ? '🌧️' : (h.cloud ?? 0) > 70 ? '☁️' : (h.cloud ?? 0) > 30 ? (h.day ? '⛅' : '☁️') : h.day ? '☀️' : '🌙');
  return (
    <div className="grid grid-cols-8 text-center text-[11px] gap-y-1">
      {pick.map(({ h, s }) => (
        <div key={h.t} className="flex flex-col items-center gap-0.5">
          <span className="text-muted">{hh(h.t)}</span>
          <span aria-hidden className="text-base">{s.flags.some((f) => f.code === 'raio') ? '⚡' : sky(h)}</span>
          <span className="font-semibold">{num(h.temp, 0)}°</span>
          <span className="text-ink2">{num(h.rain, 1)} mm</span>
          <span className="text-muted">UV {num(h.uv, 0)}</span>
        </div>
      ))}
    </div>
  );
}

const EFFECT: Record<Factor['effect'], { icon: string; label: string }> = {
  ajuda: { icon: '▲', label: 'ajuda' },
  neutro: { icon: '■', label: 'neutro' },
  atrapalha: { icon: '▼', label: 'atrapalha' },
};

function Details({ factors, confidence, conf, flags }: { factors: Factor[]; confidence: string; conf: HourScore['conf']; flags: HourScore['flags'] }) {
  return (
    <div className="mt-3 space-y-3">
      {factors.map((f) => (
        <div key={f.key} className="rounded-lg border border-hair p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-sm">{f.label}</h3>
            <span className="text-xs font-semibold whitespace-nowrap" style={{ color: f.effect === 'atrapalha' ? 'var(--critical)' : 'var(--text-secondary)' }}>
              <span aria-hidden>{EFFECT[f.effect].icon}</span> {EFFECT[f.effect].label}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-hair overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(f.q * 100)} aria-label={`${f.label}: ${Math.round(f.q * 100)} % do ideal`}>
            <div className="h-full rounded-full" style={{ width: `${Math.round(f.q * 100)}%`, background: scoreColor(f.q * 10) }} />
          </div>
          <dl className="text-xs mt-2 grid grid-cols-[64px_1fr] gap-x-2 gap-y-1">
            <dt className="text-muted">Previsão</dt><dd>{f.forecast}</dd>
            <dt className="text-muted">Ideal</dt><dd>{f.ideal}</dd>
          </dl>
          <p className="text-xs text-ink2 mt-1.5">{f.why}</p>
        </div>
      ))}
      <div className="rounded-lg border border-hair p-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Confiança</h3>
          <ConfBadge conf={conf} compact />
        </div>
        <p className="text-xs text-ink2 mt-1.5">{confidence} A confiança não muda a nota: diz o quanto dá para acreditar nela.</p>
      </div>
      {flags.length > 0 && (
        <div className="rounded-lg border border-hair p-3">
          <h3 className="font-semibold text-sm mb-1.5">Alertas de segurança</h3>
          <Flags flags={flags} />
          <p className="text-xs text-ink2 mt-1.5">Com alerta, a nota é limitada (no máximo 3–4) mesmo que as ondas estejam boas.</p>
        </div>
      )}
      <Glossary />
    </div>
  );
}

function Glossary() {
  const items: [string, string][] = [
    ['Swell', 'Ondulação formada por tempestades longe da costa. É o que traz ondas boas e organizadas.'],
    ['Mar de vento', 'Ondas criadas pelo vento local: curtas, fracas e bagunçadas.'],
    ['Período', 'Segundos entre uma onda e a seguinte. Quanto maior, mais força e organização.'],
    ['Terral', 'Vento que sopra da terra para o mar. Segura a onda e deixa a parede lisa: o melhor vento.'],
    ['Maral', 'Vento do mar para a terra. Desmancha as ondas: o pior vento.'],
    ['Glassy', 'Sem vento: mar espelhado, condição ideal.'],
    ['Janela de swell', 'Direções de onde o swell consegue chegar ao pico sem ser bloqueado por costões ou ilhas.'],
    ['Arrebentação', 'Onde a onda quebra. A altura mostrada aqui é a estimada nesse ponto, não em mar aberto.'],
  ];
  return (
    <details className="rounded-lg border border-hair p-3">
      <summary className="font-semibold text-sm cursor-pointer">Como ler a previsão (glossário)</summary>
      <dl className="text-xs mt-2 space-y-1.5">
        {items.map(([t, d]) => (
          <div key={t}>
            <dt className="font-semibold inline">{t}: </dt>
            <dd className="inline text-ink2">{d}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
