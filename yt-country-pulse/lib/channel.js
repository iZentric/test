// „Care căutări reale din România duc la canalul X?" — interoghează căutarea YouTube
// (innertube, API-ul public al site-ului) și verifică dacă videoclipurile canalului
// apar în primele rezultate pentru fiecare interogare.
//
// Fără cheie API. Fără OAuth. Doar endpoint-ul public pe care îl folosește youtube.com.

import { normalizeText } from './text.js';
import { sleep } from './http.js';

const INNERTUBE = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false';
const CLIENT_VERSION = '2.20241105.01.00';

export const MAX_RESULTS = 20;

/* ---------------- extragere rezultate ---------------- */

function textOf(node) {
  if (!node) return '';
  if (typeof node.simpleText === 'string') return node.simpleText;
  if (Array.isArray(node.runs)) return node.runs.map((r) => r.text || '').join('');
  return '';
}

/** Caută recursiv toate obiectele videoRenderer / compactVideoRenderer, în ordinea din răspuns. */
function collectRenderers(root, out = [], depth = 0) {
  if (!root || typeof root !== 'object' || depth > 40 || out.length >= MAX_RESULTS) return out;
  if (root.videoRenderer) out.push(root.videoRenderer);
  else if (root.compactVideoRenderer) out.push(root.compactVideoRenderer);
  if (root.videoRenderer || root.compactVideoRenderer) return out;
  for (const value of Object.values(root)) {
    if (out.length >= MAX_RESULTS) break;
    collectRenderers(value, out, depth + 1);
  }
  return out;
}

export function parseSearchResults(data) {
  const renderers = collectRenderers(data);
  return renderers
    .map((r) => {
      const owner = r.ownerText || r.longBylineText || r.shortBylineText;
      return {
        videoId: r.videoId || '',
        title: textOf(r.title) || textOf(r.headline),
        channel: textOf(owner) || '',
        channelId: owner?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '',
        published: textOf(r.publishedTimeText) || '',
        views: textOf(r.viewCountText) || '',
        isLive: Boolean(r.badges?.some?.((b) => b.metadataBadgeRenderer?.style === 'BADGE_STYLE_TYPE_LIVE_NOW')),
      };
    })
    .filter((r) => r.videoId)
    .slice(0, MAX_RESULTS);
}

/* ---------------- cererea către YouTube ---------------- */

export async function fetchSearchResults(query, { fetcher, geo = 'RO', hl = 'ro', timeoutMs = 15000 } = {}) {
  const doFetch = fetcher || ((...a) => fetch(...a));
  const body = {
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: CLIENT_VERSION,
        hl,
        gl: geo,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
      },
    },
    query,
    params: 'EgIQAQ%3D%3D',
  };

  let lastError = null;
  try {
    const res = await doFetch(INNERTUBE, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept-language': `${hl}-${geo},${hl};q=0.9`,
        origin: 'https://www.youtube.com',
        referer: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) {
      const data = await res.json();
      const results = parseSearchResults(data);
      if (results.length) return { results, method: 'innertube' };
    } else {
      lastError = `innertube HTTP ${res.status}`;
    }
  } catch (err) {
    lastError = `innertube: ${err?.message || err}`;
  }

  // fallback: pagina HTML, din care scoatem ytInitialData
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=${hl}&gl=${geo}`;
    const res = await doFetch(url, {
      headers: {
        'accept-language': `${hl}-${geo},${hl};q=0.9`,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const html = await res.text();
    const m = html.match(/ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s) || html.match(/ytInitialData\s*=\s*(\{.+?\});/s);
    if (!m) return { results: [], method: 'html', error: `${lastError || ''} · ytInitialData negăsit`.trim() };
    const results = parseSearchResults(JSON.parse(m[1]));
    return { results, method: 'html' };
  } catch (err) {
    return { results: [], method: 'html', error: `${lastError || ''} · html: ${err?.message || err}`.trim() };
  }
}

/* ---------------- potrivirea cu canalul ---------------- */

/**
 * Numele de canal se potrivesc dacă unul îl conține pe celălalt (normalizat, fără diacritice).
 * Conținerea se acceptă doar pentru nume de minim 5 caractere, ca să nu prindem tot ce are „sky".
 */
export function channelMatches(name, target) {
  const a = normalizeText(name);
  if (!a) return false;
  const names = (target.names && target.names.length ? target.names : [target.name])
    .map((n) => normalizeText(n))
    .filter(Boolean);
  return names.some((n) => {
    if (!n) return false;
    if (a === n) return true;
    if (n.length < 5 || a.length < 5) return false;
    return a.includes(n) || n.includes(a);
  });
}

export function matchInResults(results, target) {
  const ids = new Set(target.videoIds || []);
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    const byVideo = ids.has(r.videoId);
    const byChannel = channelMatches(r.channel, target) || (target.channelIds || []).includes(r.channelId);
    if (byVideo || byChannel) {
      return { position: i + 1, hit: r, via: byVideo ? 'video' : 'canal' };
    }
  }
  return null;
}

/* ---------------- alegerea interogărilor de testat ---------------- */

/**
 * Din termenii recoltați din autocomplete, păstrează pe cei care au legătură cu canalul
 * (token din tag-uri/titluri) + interogările date explicit.
 */
export function pickQueries(terms, target, { limit = 150, minTokenLength = 3 } = {}) {
  const tokens = new Set(
    [...(target.keywords || []), ...(target.titles || [])]
      .flatMap((t) => normalizeText(t).split(' '))
      .filter((t) => t.length >= minTokenLength),
  );
  // tokenii prea generali nu ajută la filtrare
  const generic = new Set(['jocuri', 'jocul', 'joc', 'gaming', 'video', 'romania', 'horror', 'live', 'reactie', 'update']);
  const strong = new Set([...tokens].filter((t) => !generic.has(t)));

  const scored = [];
  for (const item of terms) {
    const term = typeof item === 'string' ? item : item.term || item.query || '';
    if (!term) continue;
    const norm = normalizeText(term);
    const words = norm.split(' ');
    const hits = words.filter((w) => strong.has(w)).length;
    const score = Number(item.score) || 0;
    if (hits > 0) scored.push({ query: term, hits, score });
  }

  const seen = new Set();
  const out = [];
  const push = (q) => {
    const key = normalizeText(q);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(q);
  };

  for (const q of target.queries || []) push(q);
  scored.sort((a, b) => b.hits - a.hits || b.score - a.score);
  for (const s of scored) push(s.query);
  return out.slice(0, limit);
}

/* ---------------- rularea pe un lot ---------------- */

export async function matchChannel({
  queries,
  target,
  geo = 'RO',
  hl = 'ro',
  fetcher = null,
  delayMs = 350,
  limit = 150,
  onProgress = () => {},
  log = () => {},
} = {}) {
  const startedAt = Date.now();
  const names = [...new Set([...(target.names || []), target.name].filter(Boolean).map((n) => normalizeText(n)))];
  const norm = { ...target, names };

  const tested = [];
  const matches = [];
  const errors = [];
  let method = null;
  let requests = 0;
  const list = queries.slice(0, limit);

  for (let i = 0; i < list.length; i += 1) {
    const query = list[i];
    const res = await fetchSearchResults(query, { fetcher, geo, hl });
    requests += 1;
    if (res.method) method = res.method;
    if (res.error) errors.push({ query, error: res.error });

    const match = res.results.length ? matchInResults(res.results, norm) : null;
    tested.push({ query, results: res.results.length, position: match?.position || null });
    if (match) {
      matches.push({
        query,
        position: match.position,
        via: match.via,
        title: match.hit.title,
        videoId: match.hit.videoId,
        url: `https://www.youtube.com/watch?v=${match.hit.videoId}`,
        channel: match.hit.channel,
        published: match.hit.published,
        views: match.hit.views,
        results: res.results.length,
      });
    }
    onProgress({ index: i + 1, total: list.length, query, matched: matches.length });
    if (requests === 1) log(`prima cerere: ${res.method}, ${res.results.length} rezultate${res.error ? `, ${res.error}` : ''}`);
    if (i < list.length - 1) await sleep(delayMs);
  }

  matches.sort((a, b) => a.position - b.position || (a.query < b.query ? -1 : 1));

  return {
    geo,
    hl,
    finishedAt: new Date().toISOString(),
    target: { name: target.name || '', names: norm.names, videoIds: target.videoIds || [] },
    stats: {
      queriesTested: tested.length,
      matched: matches.length,
      matchedTop3: matches.filter((m) => m.position <= 3).length,
      matchedTop10: matches.filter((m) => m.position <= 10).length,
      noMatch: tested.length - matches.length,
      requests,
      durationMs: Date.now() - startedAt,
      errors: errors.length,
      method,
    },
    matches,
    tested,
    errors: errors.slice(0, 20),
  };
}
