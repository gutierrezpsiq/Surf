import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fmtDrive } from '../core/drive';
import type { GridData } from '../core/types';
import { ConfBadge, ErrorBox, Loading } from '../components/ui';
import { fieldColor, inkOn, isDark, ORANGE, scoreColor } from '../lib/colors';
import { loadCities, loadGrid, loadLand, Row, useAsync, useForecast } from '../lib/data';
import { dayShort, hh, num } from '../lib/format';

type Field = 'none' | 'hs' | 'tp' | 'sst' | 'rain';
const FIELD: Record<Exclude<Field, 'none'>, { label: string; unit: string; min: number; max: number }> = {
  hs: { label: 'Altura', unit: 'm', min: 0, max: 4 },
  tp: { label: 'Período', unit: 's', min: 4, max: 16 },
  sst: { label: 'Temp. água', unit: '°C', min: 12, max: 28 },
  rain: { label: 'Chuva', unit: 'mm/h', min: 0, max: 8 },
};
const NA = -9999;

export default function MapPage() {
  const { rows, summary, error, loading } = useForecast();
  const grid = useAsync(loadGrid, []);
  const [field, setField] = useState<Field>('hs');
  const [wind, setWind] = useState(true);
  const [arrows, setArrows] = useState(true);
  const [t, setT] = useState<number>();
  const [playing, setPlaying] = useState(false);
  const [picked, setPicked] = useState<Row>();
  const wrap = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  // fill the space between whatever banners sit above and the bottom nav
  useLayoutEffect(() => {
    const fit = () => wrap.current && setHeight(window.innerHeight - wrap.current.getBoundingClientRect().top - (document.querySelector('nav')?.getBoundingClientRect().height ?? 64));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  });

  const g = grid.data;
  const startT = useMemo(() => {
    if (!g) return 0;
    const now = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 13) + ':00';
    const h = Math.round((new Date(`${now}Z`).getTime() - new Date(`${g.start}Z`).getTime()) / 3600e3);
    return Math.max(0, Math.min(g.hours - 1, Math.floor(h / g.step)));
  }, [g]);
  const ti = t ?? startT;

  useEffect(() => {
    if (!playing || !g) return;
    const id = setInterval(() => setT((x) => ((x ?? startT) + 1) % g.hours), 700);
    return () => clearInterval(id);
  }, [playing, g, startT]);

  if ((loading && !rows) || grid.loading) return <Loading what="mapa" />;
  if (error || !rows || !summary) return <ErrorBox msg={error ?? 'sem dados'} />;

  const hourIdx = g ? ti * g.step : 0;
  const tLabel = g ? new Date(new Date(`${g.start}Z`).getTime() + hourIdx * 3600e3).toISOString().slice(0, 16) : '';

  return (
    <div ref={wrap} className="-mx-4 -mt-3 -mb-24 relative" style={{ height: height ?? 'calc(100dvh - 64px)' }}>
      <MapView rows={rows} grid={g} ti={ti} hourIdx={hourIdx} field={field} wind={wind} arrows={arrows} onPick={setPicked} />

      <div className="absolute top-2 left-2 right-2 flex flex-wrap gap-1.5 z-10">
        {(['hs', 'tp', 'sst', 'rain', 'none'] as Field[]).map((f) => (
          <button key={f} className="chip bg-surface shadow-sm" aria-pressed={field === f} onClick={() => setField(f)}>
            {f === 'none' ? 'Sem camada' : FIELD[f].label}
          </button>
        ))}
        <button className="chip bg-surface shadow-sm" aria-pressed={wind} onClick={() => setWind(!wind)}>Vento</button>
        <button className="chip bg-surface shadow-sm" aria-pressed={arrows} onClick={() => setArrows(!arrows)}>Direção</button>
      </div>

      {field !== 'none' && (
        <div className="absolute right-2 top-24 z-10 card px-2 py-1.5 text-[10px] text-ink2">
          <div className="font-semibold mb-1">{FIELD[field].label} ({FIELD[field].unit})</div>
          <div className="w-28 h-2 rounded-sm" style={{ background: `linear-gradient(90deg, ${ORANGE.join(',')})` }} />
          <div className="flex justify-between"><span>{FIELD[field].min}</span><span>{FIELD[field].max}+</span></div>
        </div>
      )}

      {picked && (
        <MiniCard row={picked} hourIdx={hourIdx} tLabel={tLabel} onClose={() => setPicked(undefined)} />
      )}

      {g ? (
        <div className="absolute bottom-2 left-2 right-2 z-10 card px-3 py-2">
          <div className="flex items-center gap-2">
            <button onClick={() => setPlaying(!playing)} className="w-8 h-8 rounded-full border border-hair text-sm" aria-label={playing ? 'Pausar' : 'Animar'}>{playing ? '❚❚' : '▶'}</button>
            <input type="range" min={0} max={g.hours - 1} value={ti} onChange={(e) => { setPlaying(false); setT(+e.target.value); }} className="flex-1" aria-label="Horário" />
            <span className="text-xs font-semibold w-24 text-right">{dayShort(tLabel.slice(0, 10))} {hh(tLabel)}</span>
          </div>
        </div>
      ) : (
        <div className="absolute bottom-2 left-2 right-2 z-10 card p-2 text-xs">Camadas do mapa indisponíveis ({grid.error}); marcadores mostram a nota atual.</div>
      )}
    </div>
  );
}

function MiniCard({ row, hourIdx, tLabel, onClose }: { row: Row; hourIdx: number; tLabel: string; onClose: () => void }) {
  const v = row.sum.hourly[hourIdx];
  const day = row.sum.days.find((d) => d.date === tLabel.slice(0, 10));
  return (
    <div className="absolute left-2 right-2 bottom-16 z-20 card p-3 shadow-lg">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <p className="font-semibold truncate">{row.spot.name}</p>
          <p className="text-xs text-muted">{row.spot.city ? `${row.spot.city} · ` : ''}{row.spot.state} · {fmtDrive(row.drive)} de carro</p>
        </div>
        <button onClick={onClose} aria-label="Fechar" className="text-muted">✕</button>
      </div>
      <div className="flex items-center gap-3 mt-2 text-sm">
        <span>Às {hh(tLabel)}: <b>{v == null || v < 0 ? 'noite' : num(v / 10)}</b></span>
        {day?.window && <span>Melhor do dia: <b>{hh(day.window.start)}–{hh(day.window.end)}</b> ({num(day.score)})</span>}
      </div>
      {day && <div className="mt-1"><ConfBadge conf={day.conf} /></div>}
      <Link to={`/spot/${row.spot.id}`} className="inline-block mt-2 text-sm font-semibold underline">Ver previsão completa →</Link>
    </div>
  );
}

function MapView({ rows, grid, ti, hourIdx, field, wind, arrows, onPick }: { rows: Row[]; grid?: GridData; ti: number; hourIdx: number; field: Field; wind: boolean; arrows: boolean; onPick: (r: Row) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const fieldCv = useRef<HTMLCanvasElement>(null);
  const windCv = useRef<HTMLCanvasElement>(null);
  const map = useRef<maplibregl.Map>();
  const markers = useRef<Map<string, { m: maplibregl.Marker; el: HTMLDivElement }>>(new Map());
  const cityLabels = useRef<{ el: HTMLDivElement; named: boolean; mk: maplibregl.Marker }[]>([]);
  const [ready, setReady] = useState(0);
  const [land, setLand] = useState<number[][][][]>();
  const [zoom, setZoom] = useState(5.6);
  const dark = isDark();
  useEffect(() => {
    loadLand().then((l) => setLand(l.geometry.coordinates), () => undefined);
  }, []);

  useEffect(() => {
    const m = new maplibregl.Map({
      container: box.current!,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'sea', type: 'background', paint: { 'background-color': dark ? '#10202e' : '#dbe8f3' } }],
      },
      center: [-49.6, -29.0],
      zoom: 5.6,
      minZoom: 4,
      maxZoom: 13,
      attributionControl: { compact: true, customAttribution: 'Natural Earth · Open-Meteo' },
      dragRotate: false,
      hash: 'map',
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    map.current = m;
    m.on('load', async () => {
      try {
        const landGj = await loadLand();
        m.addSource('land', { type: 'geojson', data: landGj as any });
        m.addLayer({ id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': dark ? '#262624' : '#f3f2ee' } });
        m.addLayer({ id: 'coast', type: 'line', source: 'land', paint: { 'line-color': dark ? '#55544f' : '#a9a79f', 'line-width': 0.8 } });
      } catch {
        /* basemap is decoration; markers still work */
      }
      try {
        const cities = await loadCities();
        m.addSource('cities', { type: 'geojson', data: cities as any });
        m.addLayer({ id: 'city-lines', type: 'line', source: 'cities', paint: { 'line-color': dark ? '#7d7b74' : '#8f8d86', 'line-width': 1, 'line-dasharray': [3, 2] } });
        // City names as HTML labels (no glyph server needed). Cities with named spots show first.
        for (const f of cities.features) {
          const el = document.createElement('div');
          el.className = 'city-label';
          el.textContent = f.properties.name;
          el.dataset.named = String(f.properties.named);
          el.setAttribute('aria-hidden', 'true');
          // anchored on its right edge: the name extends inland (west), away from the spot markers on the coast
          cityLabels.current.push({ el, named: f.properties.named, mk: new maplibregl.Marker({ element: el, anchor: 'right', offset: [-8, 0] }).setLngLat(f.properties.label).addTo(m) });
        }
        setReady((x) => x + 1);
      } catch {
        /* cities.json is produced by the spot rebuild (IBGE); optional */
      }
      setReady((x) => x + 1);
    });
    const redraw = () => setReady((x) => x + 1);
    m.on('moveend', redraw);
    m.on('zoomend', () => setZoom(m.getZoom()));
    m.on('resize', redraw);
    return () => m.remove();
  }, [dark]);

  // markers
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const r of rows) {
      let entry = markers.current.get(r.spot.id);
      if (!entry) {
        const el = document.createElement('div');
        el.style.cssText = 'border-radius:6px;font:600 11px Inter,system-ui;padding:1px 4px;min-width:22px;text-align:center;border:1.5px solid rgba(0,0,0,.35);cursor:pointer';
        el.addEventListener('click', (e) => { e.stopPropagation(); onPick(r); });
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', r.spot.name);
        entry = { m: new maplibregl.Marker({ element: el }).setLngLat([r.spot.lon, r.spot.lat]).addTo(m), el };
        markers.current.set(r.spot.id, entry);
      }
      const v = r.sum.hourly[hourIdx];
      const s = v == null || v < 0 ? -1 : v / 10;
      const bg = scoreColor(s);
      entry.el.style.background = bg;
      entry.el.style.color = inkOn(bg);
      entry.el.style.opacity = r.spot.kind === 'virtual' ? '0.8' : '1';
      // auto-generated stretches only once zoomed in, to keep the regional view readable
      entry.el.style.display = r.spot.kind === 'virtual' && zoom < 7.5 ? 'none' : '';
      entry.el.dataset.score = String(s);
      entry.el.textContent = s < 0 ? '☾' : num(s, 0);
      if (zoom >= 9) {
        const nm = document.createElement('span');
        nm.className = 'spot-name';
        nm.textContent = r.spot.name.replace(/^.*? – /, '');
        entry.el.appendChild(nm);
      }
      entry.el.title = `${r.spot.name}: ${s < 0 ? 'noite' : num(s)}`;
    }
    // declutter: where markers would overlap, keep the best-scoring spot (zoom in to see the rest)
    const placed: [number, number][] = [];
    const visible = rows
      .map((r) => ({ r, e: markers.current.get(r.spot.id)! }))
      .filter((x) => x.e.el.style.display !== 'none')
      .sort((a, b) => Number(b.e.el.dataset.score) - Number(a.e.el.dataset.score) || Number(a.r.spot.kind === 'virtual') - Number(b.r.spot.kind === 'virtual'));
    for (const { r, e } of visible) {
      const p = m.project([r.spot.lon, r.spot.lat]);
      if (placed.some(([x, y]) => Math.abs(x - p.x) < 26 && Math.abs(y - p.y) < 20)) e.el.style.display = 'none';
      else placed.push([p.x, p.y]);
    }
  }, [rows, hourIdx, onPick, ready, zoom]);

  // city labels: greedy collision avoidance — cities with named spots first, then the rest while they fit
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const placed: [number, number, number, number][] = [];
    const order = [...cityLabels.current].sort((a, b) => Number(b.named) - Number(a.named));
    for (const c of order) {
      const p = m.project(c.mk.getLngLat());
      const w = c.el.textContent!.length * 6.4 + 6, h = 14;
      const box: [number, number, number, number] = [p.x - 8 - w, p.y - h / 2, p.x - 8, p.y + h / 2];
      const hit = placed.some((q) => box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1]);
      const show = !hit && (c.named || zoom >= 7);
      c.el.style.display = show ? '' : 'none';
      if (show) placed.push(box);
    }
  }, [zoom, ready]);

  // scalar field + direction arrows
  useEffect(() => {
    const m = map.current, cv = fieldCv.current;
    if (!m || !cv || !grid) return;
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth: w, clientHeight: h } = box.current!;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.width = `${w}px`; cv.style.height = `${h}px`;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const nx = grid.lons.length;
    const half = Math.abs(grid.lats[1] - grid.lats[0]) / 2;
    if (field !== 'none') {
      const f = grid.fields[field], spec = FIELD[field];
      const row = f.data[ti];
      grid.lats.forEach((la, i) => grid.lons.forEach((lo, j) => {
        const raw = row[i * nx + j];
        if (raw === NA) return;
        const val = raw / f.scale;
        if (field === 'rain' && val < 0.1) return;
        const a = m.project([lo - half, la + half]), b = m.project([lo + half, la - half]);
        const [r, gg, bb] = fieldColor((val - spec.min) / (spec.max - spec.min));
        ctx.fillStyle = `rgba(${r},${gg},${bb},0.62)`;
        ctx.fillRect(a.x, a.y, b.x - a.x + 0.5, b.y - a.y + 0.5);
      }));
      // marine fields stop at the coastline
      if (land && field !== 'rain') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        for (const poly of land) for (const ring of poly) ring.forEach(([lo, la], k) => {
          const p = m.project([lo, la]);
          if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.fill('evenodd');
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    if (arrows) {
      const d = grid.fields.dir, hs = grid.fields.hs;
      ctx.strokeStyle = dark ? '#f0efec' : '#0b0b0b';
      ctx.lineWidth = 1.4;
      grid.lats.forEach((la, i) => grid.lons.forEach((lo, j) => {
        const raw = d.data[ti][i * nx + j];
        if (raw === NA) return;
        const p = m.project([lo, la]);
        const len = 6 + Math.min(10, (hs.data[ti][i * nx + j] / hs.scale) * 4);
        const go = ((raw + 180) * Math.PI) / 180; // direction of travel
        const dx = Math.sin(go) * len, dy = -Math.cos(go) * len;
        ctx.beginPath();
        ctx.moveTo(p.x - dx / 2, p.y - dy / 2);
        ctx.lineTo(p.x + dx / 2, p.y + dy / 2);
        const ang = Math.atan2(dy, dx);
        ctx.lineTo(p.x + dx / 2 - 4 * Math.cos(ang - 0.5), p.y + dy / 2 - 4 * Math.sin(ang - 0.5));
        ctx.moveTo(p.x + dx / 2, p.y + dy / 2);
        ctx.lineTo(p.x + dx / 2 - 4 * Math.cos(ang + 0.5), p.y + dy / 2 - 4 * Math.sin(ang + 0.5));
        ctx.stroke();
      }));
    }
  }, [grid, ti, field, arrows, ready, dark, land]);

  // animated wind particles (leaflet-velocity style)
  useEffect(() => {
    const m = map.current, cv = windCv.current;
    if (!m || !cv || !grid || !wind) {
      cv?.getContext('2d')?.clearRect(0, 0, cv.width, cv.height);
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth: w, clientHeight: h } = box.current!;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.width = `${w}px`; cv.style.height = `${h}px`;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const nx = grid.lons.length, ny = grid.lats.length;
    const lon0 = grid.lons[0], lat0 = grid.lats[0], dLon = grid.lons[1] - lon0, dLat = grid.lats[1] - lat0;
    const U = grid.fields.u.data[ti], V = grid.fields.v.data[ti];
    const sample = (lon: number, lat: number): [number, number] | null => {
      const x = (lon - lon0) / dLon, y = (lat - lat0) / dLat;
      const i = Math.floor(y), j = Math.floor(x);
      if (i < 0 || j < 0 || i >= ny - 1 || j >= nx - 1) return null;
      const fx = x - j, fy = y - i;
      const at = (arr: number[], a: number, b: number) => arr[a * nx + b];
      const c = [[i, j], [i, j + 1], [i + 1, j], [i + 1, j + 1]].map(([a, b]) => [at(U, a, b), at(V, a, b)]);
      if (c.some(([u]) => u === NA)) return null;
      const lerp = (k: 0 | 1) => (c[0][k] * (1 - fx) + c[1][k] * fx) * (1 - fy) + (c[2][k] * (1 - fx) + c[3][k] * fx) * fy;
      return [lerp(0) / 10, lerp(1) / 10];
    };
    const bounds = m.getBounds();
    const rnd = () => [bounds.getWest() + Math.random() * (bounds.getEast() - bounds.getWest()), bounds.getSouth() + Math.random() * (bounds.getNorth() - bounds.getSouth()), Math.floor(Math.random() * 80)] as [number, number, number];
    const N = Math.min(2500, Math.round((w * h) / 250));
    const parts = Array.from({ length: N }, rnd);
    const k = 0.0009 / Math.pow(2, m.getZoom() - 5.6); // degrees per (km/h) per frame
    let raf = 0;
    const ink = dark ? '240,239,236' : '30,30,30';
    const frame = () => {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = 'rgba(0,0,0,0.92)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = 1.1;
      for (const p of parts) {
        const uv = sample(p[0], p[1]);
        if (!uv || p[2]++ > 90) { Object.assign(p, rnd()); continue; }
        const a = m.project([p[0], p[1]]);
        p[0] += uv[0] * k / Math.cos((p[1] * Math.PI) / 180);
        p[1] += uv[1] * k;
        const b = m.project([p[0], p[1]]);
        const sp = Math.hypot(uv[0], uv[1]);
        ctx.strokeStyle = `rgba(${ink},${Math.min(0.9, 0.25 + sp / 50)})`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      raf = requestAnimationFrame(frame);
    };
    const stop = () => { cancelAnimationFrame(raf); ctx.clearRect(0, 0, w, h); };
    m.on('movestart', stop);
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) frame();
    return () => { cancelAnimationFrame(raf); m.off('movestart', stop); };
  }, [grid, ti, wind, ready, dark]);

  return (
    <div className="absolute inset-0">
      {/* inline position: maplibre's stylesheet forces .maplibregl-map to position:relative */}
      <div ref={box} style={{ position: 'absolute', inset: 0 }} />
      <canvas ref={fieldCv} className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }} />
      <canvas ref={windCv} className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }} />
    </div>
  );
}
