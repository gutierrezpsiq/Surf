export const TZ = 'America/Sao_Paulo';

export const num = (x: number | undefined | null, d = 1) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(d).replace('.', ','));

/** "2026-10-17T09:00" (local) → "09h". */
export const hh = (t: string) => `${t.slice(11, 13)}h`;

export function dayShort(date: string): string {
  const d = new Date(`${date}T12:00:00-03:00`);
  const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 21 * 3600e3).toISOString().slice(0, 10);
  if (date === today) return 'Hoje';
  if (date === tomorrow) return 'Amanhã';
  const s = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', timeZone: TZ }).replace('.', '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function agoLabel(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
}

export const todayLocal = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

/** Compact weekday for chart axes ("Sáb", "Dom"). */
export function weekdayShort(date: string): string {
  const s = new Date(`${date}T12:00:00-03:00`).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: TZ }).replace('.', '');
  return s.charAt(0).toUpperCase() + s.slice(1, 3);
}
