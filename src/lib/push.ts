/** Web Push subscription → Supabase RPC (pipeline/notify.ts sends the alerts). */
import { createClient } from '@supabase/supabase-js';
import type { Settings } from './settings';
import { PORTO_ALEGRE } from '../core/drive';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export const pushAvailable = () => !!(url && anon && vapid && 'serviceWorker' in navigator && 'PushManager' in window);

function b64ToBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function enablePush(s: Settings): Promise<void> {
  if (!pushAvailable()) throw new Error('Notificações não configuradas neste servidor');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permissão negada');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapid!) }));
  await syncPrefs(s, sub);
}

export async function syncPrefs(s: Settings, existing?: PushSubscription | null) {
  if (!pushAvailable()) return;
  const sub = existing ?? (await (await navigator.serviceWorker.ready).pushManager.getSubscription());
  if (!sub) return;
  const j = sub.toJSON();
  const sb = createClient(url!, anon!);
  const { error } = await sb.rpc('upsert_push_subscription', {
    p_endpoint: j.endpoint,
    p_keys: j.keys,
    p_prefs: { home: s.location === 'gps' && s.gps ? s.gps : PORTO_ALEGRE, maxDriveMin: s.maxDriveMin, minScore: 7, skill: s.skill, favorites: s.favorites },
  });
  if (error) throw new Error(error.message);
}

export async function disablePush() {
  if (!('serviceWorker' in navigator)) return;
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
  if (!sub) return;
  if (url && anon) await createClient(url, anon).rpc('delete_push_subscription', { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}
