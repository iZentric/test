// Client pentru endpoint-ul public de autocomplete YouTube/Google.
//   https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&hl=ro&gl=RO&q=...
//
// Atentie: endpoint-ul e public, dar neoficial. Nu e "hack", nu ocoleste nicio
// autentificare — doar intreaba ce ar sugera bara de cautare. Fara volum de cautari.

import { rawFetch, HttpError } from './http.js';

const ENDPOINT = 'https://suggestqueries.google.com/complete/search';

/** Decodeaza body-ul tolerant: Google trimite uneori charset gresit in header. */
async function decodeBody(res) {
  const buf = await res.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  const badUtf8 = (utf8.match(/\uFFFD/g) || []).length;
  if (badUtf8 === 0) return utf8;
  try {
    const cp1250 = new TextDecoder('windows-1250').decode(buf);
    const badCp = (cp1250.match(/\uFFFD/g) || []).length;
    return badCp < badUtf8 ? cp1250 : utf8;
  } catch {
    return utf8;
  }
}

/** Extrage primul array JSON complet (ignora restul, ex. `,{"q":"..."}` de la coada). */
function extractFirstJsonArray(text) {
  const start = text.indexOf('[');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Raspunsul vine ca JSONP: window.google.ac.h([...]) sau direct [...]
 * Structura standard: [query, [[sugestie, [tipuri], [metadate]], ...], {...}]
 */
export function parseSuggestPayload(text) {
  let body = String(text || '').trim();
  if (!body) return [];

  const open = body.indexOf('(');
  const close = body.lastIndexOf(')');
  if (open !== -1 && close > open) body = body.slice(open + 1, close);
  body = body.replace(/^\)\]\}',?\s*/, '');

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    const arrayText = extractFirstJsonArray(body);
    if (!arrayText) return [];
    try {
      data = JSON.parse(arrayText);
    } catch {
      return [];
    }
  }

  const extract = (entries) =>
    (entries || [])
      .map((entry) => {
        if (Array.isArray(entry)) return String(entry[0] || '');
        if (entry && typeof entry === 'object') return String(entry.q || entry.phrase || '');
        return String(entry || '');
      })
      .map((s) => s.trim())
      .filter(Boolean);

  if (Array.isArray(data)) {
    if (Array.isArray(data[1])) return extract(data[1]);
    return extract(data);
  }
  if (data && Array.isArray(data.d)) return extract(data.d);
  if (data && Array.isArray(data.suggestions)) return extract(data.suggestions);
  return [];
}

/**
 * Cere sugestiile pentru un prefix. `q` poate fi gol (Google intoarce, de regula, nimic).
 * @returns {Promise<string[]>} lista ordonata de sugestii (pozitia 0 = cea mai probabila)
 */
export async function fetchSuggestions({ q = '', geo = 'RO', hl = 'ro', timeoutMs = 8000 } = {}) {
  const url =
    `${ENDPOINT}?client=youtube&ds=yt` +
    `&hl=${encodeURIComponent(hl)}&gl=${encodeURIComponent(geo)}` +
    `&q=${encodeURIComponent(q)}`;

  const res = await rawFetch(url, {
    retries: 2,
    timeoutMs,
    headers: { accept: '*/*', 'accept-language': `${hl},en;q=0.8` },
  });

  if (!res.ok) {
    throw new HttpError(`Autocomplete a raspuns ${res.status}`, { status: res.status, url });
  }
  return parseSuggestPayload(await decodeBody(res));
}

export const _internal = { decodeBody, extractFirstJsonArray };
