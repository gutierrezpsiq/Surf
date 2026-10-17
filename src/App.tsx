import { lazy, Suspense } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { Loading } from './components/ui';
import Home from './pages/Home';
import { useForecast } from './lib/data';
import { agoLabel } from './lib/format';

const SpotPage = lazy(() => import('./pages/SpotPage'));
const Week = lazy(() => import('./pages/Week'));
const MapPage = lazy(() => import('./pages/MapPage'));
const Compare = lazy(() => import('./pages/Compare'));
const SettingsPage = lazy(() => import('./pages/Settings'));

const NAV = [
  { to: '/', label: 'Agora', icon: 'M3 12l9-8 9 8v8a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z' },
  { to: '/semana', label: 'Semana', icon: 'M4 5h16v15H4zM4 9h16M9 5v15M14 5v15' },
  { to: '/mapa', label: 'Mapa', icon: 'M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14' },
  { to: '/comparar', label: 'Comparar', icon: 'M6 20V10M12 20V4M18 20v-7' },
  { to: '/ajustes', label: 'Ajustes', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 01-4 0v-.1a1.6 1.6 0 00-2.7-1.1l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00-1.1-2.7H3a2 2 0 010-4h.1a1.6 1.6 0 001.1-2.7l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 002.7-1.1V3a2 2 0 014 0v.1a1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 001.1 2.7H21a2 2 0 010 4h-.1a1.6 1.6 0 00-1.5 1z' },
];

function StatusBar() {
  const { summary } = useForecast();
  if (!summary) return null;
  const failed = summary.sources.filter((s) => !s.ok && !s.skipped);
  const stale = Date.now() - new Date(summary.generatedAt).getTime() > 12 * 3600e3;
  return (
    <>
      {summary.demo && (
        <div className="bg-[#fab219] text-black text-xs font-semibold text-center px-3 py-1.5">
          DADOS DE DEMONSTRAÇÃO (sintéticos) — rode o pipeline para previsões reais
        </div>
      )}
      {(stale || failed.length > 0) && (
        <div className="text-[11px] text-center px-3 py-1 text-ink2 border-b border-hair">
          {stale && <>Previsão de {agoLabel(summary.generatedAt)} (offline ou atrasada). </>}
          {failed.length > 0 && <>Fontes indisponíveis: {failed.map((f) => f.label.split(' (')[0]).join(', ')}.</>}
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <div className="min-h-full flex flex-col max-w-3xl mx-auto">
      <StatusBar />
      <main className="flex-1 px-4 pt-3 pb-24">
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/spot/:id" element={<SpotPage />} />
            <Route path="/semana" element={<Week />} />
            <Route path="/mapa" element={<MapPage />} />
            <Route path="/comparar" element={<Compare />} />
            <Route path="/ajustes" element={<SettingsPage />} />
          </Routes>
        </Suspense>
      </main>
      <nav className="fixed bottom-0 inset-x-0 border-t border-hair bg-surface z-20" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-3xl mx-auto grid grid-cols-5">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `flex flex-col items-center py-2 text-[11px] ${isActive ? 'text-ink font-semibold' : 'text-muted'}`}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden>
                <path d={n.icon} />
              </svg>
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
