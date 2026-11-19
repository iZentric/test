// Orchestrator: aduna toate sursele pentru o tara + zi, tolerа la erori partiale.

import { countryOf, isSupported } from './countries.js';
import { cached } from './cache.js';
import * as trends from './trends.js';
import * as youtube from './youtube.js';
import { demoPulse } from './demo.js';
import { classify } from './classify.js';
import { canReachGoogle } from './http.js';

const TTL = {
  trending: 30 * 60 * 1000, // 30 min
  videos: 15 * 60 * 1000, // 15 min
  interest: 30 * 60 * 1000,
};

/** Adauga categoria pe fiecare interogare (ca UI-ul sa poata filtra si in tabul "O zi"). */
function withCategories(items) {
  return (items || []).map((item) => ({ ...item, category: classify(item.query).category }));
}

function source(status, extra = {}) {
  return { status, ...extra };
}

export async function buildPulse({ geo = 'RO', date = null, seed = '', apiKey = '', demo = false, videoLimit = 24 }) {
  const country = countryOf(geo);
  const code = country.code;
  const cleanDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : null;
  const cleanSeed = String(seed || '').trim().slice(0, 100);

  const warnings = [];
  if (!isSupported(code)) {
    warnings.push(`Țara "${code}" nu e în lista predefinită; încercăm oricum (Google/YouTube pot refuza codul).`);
  }

  if (demo) {
    const data = demoPulse({ geo: code, date: cleanDate, seed: cleanSeed });
    if (data?.trendingSearches?.items) {
      data.trendingSearches.items = withCategories(data.trendingSearches.items);
    }
    return {
      ok: true,
      mode: 'demo',
      demo: true,
      geo: code,
      country,
      date: cleanDate,
      generatedAt: new Date().toISOString(),
      sources: [
        source('demo', { id: 'trends-trending', label: 'Căutări în trend', provider: 'Google Trends', note: 'date demonstrative' }),
        source('demo', { id: 'youtube-trending', label: 'Videoclipuri în trend', provider: 'YouTube Data API', note: 'date demonstrative' }),
        source('demo', { id: 'youtube-search-interest', label: 'Interes YouTube Search', provider: 'Google Trends', note: 'date demonstrative' }),
      ],
      warnings: ['Rulezi în modul DEMO: cifrele sunt eșantioane generate local, nu date reale.'],
      ...data,
    };
  }

  // Daca mediul nu are acces la internet, nu are sens sa insistam cu retry-uri.
  const probe = await canReachGoogle();
  if (!probe.ok) {
    return {
      ok: false,
      mode: 'offline',
      demo: false,
      geo: code,
      country,
      date: cleanDate,
      generatedAt: new Date().toISOString(),
      sources: [
        source('error', { id: 'trends-trending', label: 'Căutări în trend', provider: 'Google Trends', error: probe.error }),
        source('error', { id: 'youtube-trending', label: 'Videoclipuri în trend', provider: 'YouTube Data API v3', error: probe.error }),
        source('error', { id: 'youtube-search-interest', label: 'Interes YouTube Search', provider: 'Google Trends', error: probe.error }),
      ],
      warnings: [
        `Nu există acces la Google din acest mediu (${probe.error}).`,
        'Rulează aplicația local sau pe un server cu internet, ori folosește modul demo.',
      ],
      trendingVideos: [],
      trendingSearches: { requestedDate: cleanDate, dayDate: null, items: [] },
      seed: null,
    };
  }

  const [trendRes, videoRes, interestRes] = await Promise.allSettled([
    cached(`trending:${code}:${cleanDate || 'latest'}`, TTL.trending, () =>
      trends.dailyTrending({ geo: code, date: cleanDate }),
    ),
    apiKey
      ? cached(`videos:${code}:${videoLimit}`, TTL.videos, () =>
          youtube.trendingVideos({ apiKey, geo: code, maxResults: videoLimit }),
        )
      : Promise.reject(new Error('SKIP_NO_KEY')),
    cleanSeed
      ? cached(`interest:${code}:${cleanDate || 'latest'}:${cleanSeed.toLowerCase()}`, TTL.interest, () =>
          trends.youtubeInterest({ keyword: cleanSeed, geo: code, date: cleanDate }),
        )
      : Promise.reject(new Error('SKIP_NO_SEED')),
  ]);

  const sources = [];
  let trendingSearches = { requestedDate: cleanDate, dayDate: null, items: [] };
  let trendingVideos = [];
  let seedData = null;

  // 1. Cautari in trend
  if (trendRes.status === 'fulfilled') {
    const value = trendRes.value.value;
    trendingSearches = { ...value, items: withCategories(value.items) };
    if (value.items.length === 0) {
      sources.push(source('empty', { id: 'trends-trending', label: 'Căutări în trend', provider: 'Google Trends', note: 'nicio zi disponibilă pentru data cerută' }));
      warnings.push('Google Trends nu a returnat căutări pentru data aleasă (posibil prea recent sau prea vechi).');
    } else {
      if (cleanDate && value.dayDate && cleanDate !== value.dayDate) {
        warnings.push(`Ai cerut ${cleanDate}, dar Google a returnat ziua ${value.dayDate} (ultima disponibilă).`);
      }
      sources.push(
        source('ok', {
          id: 'trends-trending',
          label: 'Căutări în trend',
          provider: 'Google Trends',
          note: 'endpoint public Google (neoficial)',
          cached: trendRes.value.cached,
          fetchedAt: trendRes.value.fetchedAt,
        }),
      );
    }
  } else {
    const err = trendRes.reason;
    sources.push(source('error', { id: 'trends-trending', label: 'Căutări în trend', provider: 'Google Trends', error: err?.message || 'eroare' }));
    warnings.push(
      err?.status === 429
        ? 'Google Trends a limitat cererile (429). Așteaptă 1–2 minute, folosește cache-ul sau modul demo.'
        : `Google Trends nu a răspuns: ${err?.message || 'eroare necunoscută'}.`,
    );
  }

  // 2. Videoclipuri in trend (YouTube oficial)
  if (videoRes.status === 'fulfilled') {
    trendingVideos = videoRes.value.value.items;
    sources.push(
      source('ok', {
        id: 'youtube-trending',
        label: 'Videoclipuri în trend',
        provider: 'YouTube Data API v3',
        note: 'API oficial · snapshot al momentului',
        cached: videoRes.value.cached,
        fetchedAt: videoRes.value.fetchedAt,
      }),
    );
  } else if (String(videoRes.reason?.message) === 'SKIP_NO_KEY') {
    sources.push(
      source('skipped', {
        id: 'youtube-trending',
        label: 'Videoclipuri în trend',
        provider: 'YouTube Data API v3',
        note: 'adaugă o cheie API ca să activezi',
      }),
    );
    warnings.push('Fără cheie YouTube Data API nu pot lua videoclipurile în trend (restul datelor funcționează).');
  } else {
    const msg = youtube.friendlyYouTubeError(videoRes.reason);
    sources.push(source('error', { id: 'youtube-trending', label: 'Videoclipuri în trend', provider: 'YouTube Data API v3', error: msg }));
    warnings.push(msg);
  }

  // 3. Interes YouTube Search pentru cuvant
  if (interestRes.status === 'fulfilled') {
    seedData = interestRes.value.value;
    sources.push(
      source('ok', {
        id: 'youtube-search-interest',
        label: `Interes YouTube Search: „${cleanSeed}”`,
        provider: 'Google Trends',
        note: 'filtru YouTube Search · endpoint public neoficial',
        cached: interestRes.value.cached,
        fetchedAt: interestRes.value.fetchedAt,
      }),
    );
  } else if (String(interestRes.reason?.message) === 'SKIP_NO_SEED') {
    sources.push(
      source('skipped', {
        id: 'youtube-search-interest',
        label: 'Interes YouTube Search',
        provider: 'Google Trends',
        note: 'introdu un cuvânt pentru serie + interogări asociate',
      }),
    );
  } else {
    const err = interestRes.reason;
    sources.push(source('error', { id: 'youtube-search-interest', label: `Interes: „${cleanSeed}”`, provider: 'Google Trends', error: err?.message || 'eroare' }));
    warnings.push(`Interesul pentru „${cleanSeed}” nu a putut fi luat: ${err?.message || 'eroare'}.`);
  }

  const okCount = sources.filter((s) => s.status === 'ok').length;
  const mode = okCount === 0 ? 'error' : okCount === sources.length ? 'live' : 'partial';

  return {
    ok: okCount > 0,
    mode,
    demo: false,
    geo: code,
    country,
    date: cleanDate,
    generatedAt: new Date().toISOString(),
    sources,
    warnings,
    trendingVideos,
    trendingSearches,
    seed: seedData,
  };
}
