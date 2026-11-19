// Client HTTP minimal, fara dependinte. Include: cookie jar (Google Trends cere un NID),
// retry cu backoff pe 429/5xx, timeout si strip pentru prefixul XSSI ")]}'" din raspunsurile Google.

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export class HttpError extends Error {
  constructor(message, { status = 0, body = '', url = '' } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const jar = new Map(); // host -> Map(name -> value)

function storeCookies(host, setCookies) {
  if (!setCookies || setCookies.length === 0) return;
  let store = jar.get(host);
  if (!store) {
    store = new Map();
    jar.set(host, store);
  }
  for (const raw of setCookies) {
    const [pair] = String(raw).split(';');
    const eq = pair.indexOf('=');
    if (eq < 1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!value || /expires=Thu,\s*01 Jan 1970/i.test(raw)) store.delete(name);
    else store.set(name, value);
  }
}

function cookieHeader(host) {
  const store = jar.get(host);
  if (!store || store.size === 0) return '';
  return [...store].map(([k, v]) => `${k}=${v}`).join('; ');
}

const NON_RETRYABLE = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET',
  'ENETUNREACH', 'EHOSTUNREACH', 'EPROTO', 'CERT_HAS_EXPIRED',
]);

function describeNetworkError(err) {
  const code = err?.cause?.code || err?.code || '';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return 'Nu pot accesa Google din acest mediu (DNS indisponibil). Rulează local sau pe un server cu internet.';
  }
  if (code === 'ECONNRESET' || code === 'EPROTO') {
    return 'Conexiunea către Google este blocată de acest mediu (conexiune resetată).';
  }
  if (code === 'ECONNREFUSED' || code === 'ENETUNREACH' || code === 'EHOSTUNREACH') {
    return 'Conexiunea către Google a fost refuzată/blocată din acest mediu de rulare.';
  }
  return `Cerere eșuată: ${err?.message || 'necunoscut'}${code ? ` (${code})` : ''}`;
}

export async function rawFetch(url, { headers = {}, retries = 2, timeoutMs = 12000, backoffMs = 900 } = {}) {
  const target = new URL(url);
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      const wait = backoffMs * 2 ** (attempt - 1) * (1 + Math.random() * 0.35);
      await sleep(Math.round(wait));
    }
    try {
      const cookie = cookieHeader(target.host);
      const res = await fetch(target, {
        headers: {
          'user-agent': UA,
          'accept-language': 'en-US,en;q=0.9,ro;q=0.8',
          accept: '*/*',
          ...(cookie ? { cookie } : {}),
          ...headers,
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (typeof res.headers.getSetCookie === 'function') {
        storeCookies(target.host, res.headers.getSetCookie());
      }

      if (res.status === 429) {
        lastError = new HttpError('Too Many Requests (429) — Google a limitat cererea', {
          status: 429,
          url,
        });
        continue;
      }
      if (res.status >= 500) {
        lastError = new HttpError(`Eroare upstream ${res.status}`, { status: res.status, url });
        continue;
      }
      return res;
    } catch (err) {
      const code = err?.cause?.code || err?.code || '';
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        lastError = new HttpError('Cererea a expirat (timeout)', { url });
      } else if (err instanceof HttpError) {
        lastError = err;
      } else {
        lastError = new HttpError(describeNetworkError(err), { url });
        if (NON_RETRYABLE.has(code)) break; // DNS/firewall: reîncercarea nu ajută
      }
    }
  }
  throw lastError;
}

export function stripXssi(text) {
  return String(text).replace(/^\)\]\}',?\s*/, '');
}

export async function fetchJson(url, opts) {
  const res = await rawFetch(url, opts);
  const text = await res.text();
  if (!res.ok) {
    throw new HttpError(`HTTP ${res.status}`, { status: res.status, body: text.slice(0, 400), url });
  }
  const cleaned = stripXssi(text.trim());
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new HttpError('Răspuns invalid (nu e JSON)', { status: res.status, body: text.slice(0, 200), url });
  }
}

export async function warmSession(geo) {
  // Google trimite cookie-ul NID aici; fara el API-urile interne raspund des cu 429.
  try {
    const res = await rawFetch(`https://trends.google.com/trends/?geo=${encodeURIComponent(geo || 'RO')}`, {
      retries: 1,
      timeoutMs: 12000,
    });
    await res.text();
    return true;
  } catch {
    return false;
  }
}

/**
 * Verificare rapida de acces la retea (o singura data la 5 minute).
 * Scop: sa nu stam 30s pe retry-uri cand mediul nu are internet deloc.
 */
let probeCache = { at: 0, ok: null, error: null };

export async function canReachGoogle({ force = false } = {}) {
  const now = Date.now();
  if (!force && probeCache.ok !== null && now - probeCache.at < 5 * 60 * 1000) return probeCache;
  try {
    const res = await rawFetch('https://trends.google.com/trends/', {
      retries: 0,
      timeoutMs: 4500,
      headers: { accept: 'text/html' },
    });
    await res.text();
    probeCache = { at: now, ok: true, error: null };
  } catch (err) {
    probeCache = { at: now, ok: false, error: err?.message || 'fără conexiune' };
  }
  return probeCache;
}
