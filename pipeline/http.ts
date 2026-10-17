/** fetch with timeout + retries; throws with a compact message. */
export async function fetchJson<T = any>(url: string, init: RequestInit & { timeoutMs?: number; retries?: number } = {}): Promise<T> {
  const { timeoutMs = 60_000, retries = 2, ...rest } = init;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...rest, signal: ctl.signal });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const err = new Error(`HTTP ${res.status} ${body.slice(0, 200)}`) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      // rate limited (per-minute quota): wait for the window to reset instead of hammering
      const wait = (e as { status?: number }).status === 429 ? 65_000 : 1500 * 2 ** attempt;
      if (attempt < retries) await new Promise((r) => setTimeout(r, wait));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchText(url: string, timeoutMs = 60_000): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
