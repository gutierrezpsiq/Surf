/**
 * Push notifications (Web Push / VAPID). Runs after each pipeline run.
 * Subscriptions + per-device prefs live in Supabase (push_subscriptions); each alert
 * (device × spot × day) is sent once (notifications_sent).
 */
import { readFileSync } from 'node:fs';
import webpush from 'web-push';
import { findAlerts } from '../src/core/alerts';
import { fmtDrive, PORTO_ALEGRE } from '../src/core/drive';
import type { Spot, Summary } from '../src/core/types';
import { readLocal, supabase } from './store';

async function main() {
  const s = supabase();
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!s || !pub || !priv) {
    console.log('[notify] needs SUPABASE_* and VAPID_* env; skipping');
    return;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com', pub, priv);
  const summary = readLocal<Summary>('summary.json');
  if (!summary) throw new Error('summary.json missing — run the pipeline first');
  const { spots } = JSON.parse(readFileSync('public/data/spots.json', 'utf8')) as { spots: Spot[] };
  const now = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 13) + ':00';

  const { data: subs, error } = await s.from('push_subscriptions').select('endpoint,keys,prefs');
  if (error) throw new Error(error.message);
  let sent = 0;
  for (const sub of subs ?? []) {
    const p = sub.prefs ?? {};
    const alerts = findAlerts(summary, spots, { home: p.home ?? PORTO_ALEGRE, maxDriveMin: p.maxDriveMin ?? 180, minScore: p.minScore ?? 7 }, now)
      .filter((a) => !p.favoritesOnly || (p.favorites ?? []).includes(a.spotId));
    for (const a of alerts.slice(0, 3)) {
      const { data: dup } = await s.from('notifications_sent').select('endpoint').eq('endpoint', sub.endpoint).eq('spot_id', a.spotId).eq('day', a.date).maybeSingle();
      if (dup) continue;
      const body = {
        title: `${a.name}: ${a.score.toFixed(1).replace('.', ',')}/10`,
        body: `${dayLabel(a.date)} ${a.start.slice(11, 16)}–${a.end.slice(11, 16)} · confiança ${a.conf} · ${fmtDrive(a.driveMin)} de carro`,
        url: `/spot/${a.spotId}`,
      };
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(body));
        await s.from('notifications_sent').insert({ endpoint: sub.endpoint, spot_id: a.spotId, day: a.date });
        sent++;
      } catch (e: any) {
        if (e.statusCode === 404 || e.statusCode === 410) await s.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        else console.warn('[notify]', e.message);
      }
    }
  }
  console.log(`[notify] ${sent} notifications sent to ${subs?.length ?? 0} devices`);
}

function dayLabel(date: string) {
  const d = new Date(`${date}T12:00:00-03:00`);
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', timeZone: 'America/Sao_Paulo' });
}

main().catch((e) => { console.error(e); process.exit(1); });
