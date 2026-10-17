/**
 * Official warnings.
 *  - INMET: CAP/RSS feed of active warnings (default https://apiprevmet3.inmet.gov.br/avisos/rss).
 *    Not formally documented — parsed defensively; failure is logged and the run continues.
 *  - Marinha do Brasil (avisos de mau tempo, CHM): no machine-readable API is published; set
 *    MARINHA_AVISOS_URL to a CAP/RSS mirror if one becomes available.
 */
import type { OfficialWarning, StateCode } from '../../src/core/types';
import { fetchText } from '../http';

const INMET_RSS = process.env.INMET_RSS_URL ?? 'https://apiprevmet3.inmet.gov.br/avisos/rss';

const STATE_PATTERNS: [StateCode, RegExp][] = [
  ['PR', /\bParan[aá]\b|\bPR\b/],
  ['SC', /Santa Catarina|\bSC\b/],
  ['RS', /Rio Grande do Sul|\bRS\b/],
];

export function severityFrom(text: string): OfficialWarning['severity'] {
  if (/grande perigo|vermelh/i.test(text)) return 'vermelho';
  if (/perigo potencial|amarel/i.test(text)) return 'amarelo';
  if (/perigo|laranja/i.test(text)) return 'laranja';
  return 'info';
}

/** Is the warning relevant to surfing on the coast (wind, coastal wind, storm, sea, cyclone)? */
const RELEVANT = /vento|ventos costeiros|tempestade|temporal|ressaca|ciclone|ondas|mar|vendaval/i;

export function parseRss(xml: string, source: string): OfficialWarning[] {
  const items = xml.split(/<item[ >]/i).slice(1);
  const out: OfficialWarning[] = [];
  for (const it of items) {
    const tag = (n: string) => it.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, 'i'))?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() ?? '';
    const title = decode(tag('title'));
    const desc = decode(tag('description'));
    const text = `${title} ${desc}`;
    if (!RELEVANT.test(text)) continue;
    const states = STATE_PATTERNS.filter(([, re]) => re.test(text)).map(([s]) => s);
    if (!states.length) continue;
    const start = desc.match(/In[ií]cio\W+([0-9T:\- ]{10,19})/i)?.[1];
    const end = desc.match(/Fim\W+([0-9T:\- ]{10,19})/i)?.[1];
    out.push({ source, title: title.slice(0, 120), severity: severityFrom(text), areas: [], states, start: start?.trim().replace(' ', 'T'), end: end?.trim().replace(' ', 'T'), url: tag('link') || undefined });
  }
  return out;
}

function decode(s: string) {
  return s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

export async function fetchInmet(): Promise<OfficialWarning[]> {
  return parseRss(await fetchText(INMET_RSS, 30_000), 'INMET');
}

export async function fetchMarinha(): Promise<OfficialWarning[] | undefined> {
  const url = process.env.MARINHA_AVISOS_URL;
  if (!url) return undefined;
  return parseRss(await fetchText(url, 30_000), 'Marinha do Brasil');
}
