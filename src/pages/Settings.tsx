import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtDrive } from '../core/drive';
import type { Skill } from '../core/scoring';
import { PROFILES } from '../core/spotScore';
import { Section } from '../components/ui';
import { loadSpots, useAsync, useForecast } from '../lib/data';
import { agoLabel, num } from '../lib/format';
import { disablePush, enablePush, pushAvailable, syncPrefs } from '../lib/push';
import { getSettings, toggleFavorite, updateSettings, useSettings } from '../lib/settings';

const SKILLS: Skill[] = ['iniciante', 'intermediário', 'avançado'];

export default function SettingsPage() {
  const st = useSettings();
  const spots = useAsync(loadSpots, []);
  const { summary } = useForecast();
  const [msg, setMsg] = useState<string>();

  const set = (patch: Parameters<typeof updateSettings>[0]) => {
    updateSettings(patch);
    if (getSettings().notify) syncPrefs(getSettings()).catch(() => undefined);
  };

  const useGps = () => {
    if (!navigator.geolocation) return setMsg('GPS indisponível neste aparelho');
    navigator.geolocation.getCurrentPosition(
      (p) => { set({ location: 'gps', gps: [+p.coords.longitude.toFixed(3), +p.coords.latitude.toFixed(3)] }); setMsg('Localização atualizada'); },
      () => setMsg('Não foi possível obter a localização'),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };

  const toggleNotify = async () => {
    try {
      if (st.notify) { await disablePush(); set({ notify: false }); setMsg('Notificações desativadas'); }
      else { await enablePush(st); set({ notify: true }); setMsg('Notificações ativadas'); }
    } catch (e) { setMsg((e as Error).message); }
  };

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">Ajustes</h1>
      <p className="text-sm text-ink2">Tudo funciona sem mexer aqui. Os padrões são: intermediário, saindo de Porto Alegre, até 4 h de carro.</p>
      {msg && <p className="text-sm card p-2" role="status">{msg}</p>}

      <Section title="Seu nível">
        <div className="flex gap-1.5">
          {SKILLS.map((s) => <button key={s} className="chip capitalize" aria-pressed={st.skill === s} onClick={() => set({ skill: s })}>{s}</button>)}
        </div>
        <p className="text-xs text-ink2 mt-2">Tamanho ideal: {num(PROFILES[st.skill].minH)}–{num(PROFILES[st.skill].maxH)} m. Ondas acima do seu nível ganham alerta vermelho.</p>
      </Section>

      <Section title="De onde você sai">
        <div className="flex gap-1.5">
          <button className="chip" aria-pressed={st.location === 'poa'} onClick={() => set({ location: 'poa' })}>Porto Alegre</button>
          <button className="chip" aria-pressed={st.location === 'gps'} onClick={useGps}>Usar GPS</button>
        </div>
        <label className="block text-sm mt-3">
          Distância máxima: <b>{fmtDrive(st.maxDriveMin)}</b> de carro
          <input type="range" min={60} max={600} step={30} value={st.maxDriveMin} onChange={(e) => set({ maxDriveMin: +e.target.value })} className="w-full mt-1" />
        </label>
        <p className="text-[11px] text-muted">Tempo estimado em linha reta × 1,35 a 75 km/h (sem API de rotas).</p>
      </Section>

      <Section title="Notificações">
        <p className="text-sm text-ink2">Aviso quando um pico dentro do seu limite de distância chegar a nota ≥ 7 com confiança média/alta, de dia, nas próximas 72 h.</p>
        <button className="chip mt-2" aria-pressed={st.notify} onClick={toggleNotify} disabled={!pushAvailable() && !st.notify}>{st.notify ? 'Ativadas' : 'Ativar'}</button>
        {!pushAvailable() && <p className="text-[11px] text-muted mt-1">Requer instalação do app e servidor com Supabase + chaves VAPID configurados.</p>}
      </Section>

      <Section title="Favoritos">
        {st.favorites.length === 0 ? <p className="text-sm text-ink2">Toque na ☆ na página de um pico.</p> : (
          <ul className="text-sm space-y-1">
            {st.favorites.map((id) => {
              const s = spots.data?.find((x) => x.id === id);
              return (
                <li key={id} className="flex justify-between">
                  <Link to={`/spot/${id}`} className="underline">{s?.name ?? id}</Link>
                  <button onClick={() => toggleFavorite(id)} aria-label="Remover">✕</button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {summary && (
        <Section title="Fontes da última atualização" right={<span className="text-xs text-muted">{agoLabel(summary.generatedAt)}</span>}>
          <ul className="text-xs space-y-1">
            {summary.sources.map((s) => (
              <li key={s.id} className="flex gap-2">
                <span aria-hidden>{s.ok ? '✓' : s.skipped ? '–' : '✕'}</span>
                <span className={s.ok ? '' : 'text-muted'}>{s.label}{s.skipped ? ` (${s.skipped})` : s.error ? ` — falhou` : ''}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Sobre os dados">
        <ul className="text-xs text-ink2 list-disc pl-4 space-y-1">
          <li>Nota 0–10 calculada a partir do consenso de vários modelos (ECMWF, Météo-France, DWD, NOAA) ponderado pela precisão recente frente a boias.</li>
          <li>Confiança = concordância entre modelos + antecedência. Não muda a nota, só a certeza.</li>
          <li>Orientação, janela de swell, tipo de fundo e perigos são calculados automaticamente a partir do litoral (OSM / Natural Earth) — podem errar em enseadas pequenas.</li>
          <li>Modelos globais têm resolução de 9–28 km: não resolvem bancadas, refração fina nem ondas em baías abrigadas.</li>
          <li>Maré vem de modelo oceânico (~8 km), não da tábua oficial da Marinha.</li>
        </ul>
      </Section>
    </div>
  );
}
