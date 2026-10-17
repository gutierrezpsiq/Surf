/**
 * Output: always writes JSON files to OUT_DIR (default public/data, served statically / deployed
 * to Pages). When SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set it also uploads the same files
 * to the public Storage bucket `forecast` and persists history rows used for calibration.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const OUT_DIR = process.env.OUT_DIR ?? 'public/data';
let sb: SupabaseClient | null | undefined;

export function supabase(): SupabaseClient | null {
  if (sb !== undefined) return sb;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  sb = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return sb;
}

const pending: Promise<unknown>[] = [];

export function writeOut(rel: string, data: unknown) {
  const body = JSON.stringify(data);
  const p = join(OUT_DIR, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
  const s = supabase();
  if (s) {
    pending.push(
      s.storage.from('forecast').upload(rel, body, { upsert: true, contentType: 'application/json', cacheControl: '600' }).then(({ error }) => {
        if (error) console.warn(`[store] upload ${rel}: ${error.message}`);
      }),
    );
  }
}

export async function flush() {
  await Promise.all(pending);
}

export function readLocal<T>(rel: string): T | undefined {
  const p = join(OUT_DIR, rel);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : undefined;
}

export async function insertRows(table: string, rows: object[]) {
  const s = supabase();
  if (!s || !rows.length) return;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await s.from(table).upsert(rows.slice(i, i + 500));
    if (error) console.warn(`[store] ${table}: ${error.message}`);
  }
}
