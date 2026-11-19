// Crawler de sugestii (autocomplete) — construieste o lista ordonata de termeni
// pe care ii sugereaza YouTube pentru o tara, fara sa introduci tu cuvinte.
//
// De ce e nevoie de crawl in 2 niveluri: o singura litera da ~13 sugestii si
// nimeni nu repeta acelasi termen la doua litere diferite. Daca insa reinterogam
// termenii descoperiti, acelasi termen apare din mai multe directii -> abia atunci
// putem calcula un scor de "cit de cautat" e (frecventa intre prefixe x pozitie).

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { fetchSuggestions } from './suggest.js';
import { demoCorpus } from './demo.js';
import { cached } from './cache.js';
import { sleep } from './http.js';
import { normalizeText } from './text.js';

export const DEFAULT_SEEDS = [
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  ...'0123456789'.split(''),
  'ă', 'â', 'î', 'ș', 'ț',
  'cum', 'ce', 'cine', 'unde', 'cand', 'cat', 'care', 'de ce', 'pentru', 'cel mai', 'cum sa', 'top',
];

const SUGGEST_TTL = 6 * 60 * 60 * 1000; // 6 ore
const DATA_DIR = path.resolve(process.cwd(), 'data', 'harvest');
const MAX_JOBS = 5;

function latestFile(geo) {
  return path.join(DATA_DIR, `latest-${geo}.json`);
}

export async function loadLatest(geo) {
  try {
    const raw = await readFile(latestFile(geo), 'utf8');
    const data = JSON.parse(raw);
    return data && Array.isArray(data.terms) ? data : null;
  } catch {
    return null;
  }
}

async function saveLatest(geo, payload) {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(latestFile(geo), JSON.stringify(payload), 'utf8');
  } catch {
    /* persistenta e optionala */
  }
}

function emptyRow(term) {
  return {
    term,
    key: normalizeText(term),
    appearances: 0,
    weight: 0,
    bestRank: 99,
    rankSum: 0,
    seeds: new Set(),
  };
}

/**
 * @param {object} opts
 * @param {string} [opts.geo]      cod tara (RO)
 * @param {string} [opts.hl]       limba (ro)
 * @param {1|2}    [opts.depth]    niveluri de expandare
 * @param {string[]} [opts.extraSeeds] prefixe suplimentare
 * @param {number} [opts.maxExpansion] cati termeni sa reinterogam la nivelul 2
 * @param {Function} [opts.fetcher] injectabil pentru teste
 */
/** Fetcher demo: imita autocomplete-ul dintr-un corpus local, determinist. */
function demoFetcher(geo) {
  const corpus = demoCorpus(geo);
  return async ({ q }) => {
    const prefix = String(q || '').toLowerCase();
    if (!prefix) return [];
    return corpus.filter((t) => t.toLowerCase().startsWith(prefix)).slice(0, 13);
  };
}

export async function harvest({
  geo = 'RO',
  hl = 'ro',
  depth = 2,
  extraSeeds = [],
  maxExpansion = 40,
  delayMs = 220,
  demo = false,
  fetcher = null,
  onProgress = () => {},
  isCancelled = () => false,
} = {}) {
  const code = String(geo || 'RO').toUpperCase();
  const startedAt = new Date().toISOString();
  const ask_ = fetcher || (demo ? demoFetcher(code) : fetchSuggestions);
  const previous = await loadLatest(code);
  const previousKeys = new Set((previous?.terms || []).map((t) => normalizeText(t.term || t.query || '')));

  const seeds = [...new Set([...DEFAULT_SEEDS, ...extraSeeds].map((s) => String(s).trim()).filter(Boolean))];
  const rows = new Map();
  const queried = new Set();
  const errors = [];
  let requests = 0;

  // total estimat: seed-uri + (eventual) expandare
  let total = seeds.length + (depth >= 2 ? maxExpansion : 0);
  let index = 0;

  const ask = async (q) => {
    // in mod demo nu folosim cache (altfel se amesteca cu datele reale)
    if (demo) return ask_({ q, geo: code, hl });
    const key = `sug:${code}:${hl}:${q}`;
    const hit = await cached(key, SUGGEST_TTL, async () => {
      requests += 1;
      return ask_({ q, geo: code, hl });
    });
    return hit.value || [];
  };

  const absorb = async (seed, level = 1) => {
    const q = String(seed);
    if (queried.has(q)) return [];
    queried.add(q);

    let suggestions = [];
    try {
      suggestions = await ask(q);
    } catch (err) {
      errors.push({ seed: q, error: err?.message || 'eroare' });
      if (err?.status === 429) await sleep(2500 + Math.random() * 1500);
    }

    const seedKey = normalizeText(q);
    suggestions.forEach((rawTerm, position) => {
      const term = String(rawTerm || '').trim();
      if (!term) return;
      const key = normalizeText(term);
      if (!key || key === seedKey) return; // sugestia egala cu prefixul nu spune nimic

      let row = rows.get(key);
      if (!row) {
        row = emptyRow(term);
        rows.set(key, row);
      }
      // Pozitia conteaza (0 = cea mai probabila). Contributiile din nivelul 2 sunt
      // subponderate (sunt deja influentate de termenul-parinte), iar extensiile
      // directe ale prefixului ("gta 6" -> "gta 6 2026") sunt penalizate usor.
      const extension = key.startsWith(`${seedKey} `) ? 0.6 : 1;
      const levelFactor = level >= 2 ? 0.5 : 1;

      row.appearances += 1;
      row.weight += (1 / (position + 1)) * levelFactor * extension;
      row.bestRank = Math.min(row.bestRank, position + 1);
      row.rankSum += position + 1;
      row.seeds.add(q);
      if (term.length > row.term.length) row.term = term; // pastram varianta cea mai completa
    });

    return suggestions;
  };

  // ---- nivel 1: seed-uri ----
  for (const seed of seeds) {
    if (isCancelled()) break;
    await absorb(seed, 1);
    index += 1;
    onProgress({ index, total, currentSeed: seed, terms: rows.size, level: 1, cancelled: isCancelled() });
    if (delayMs && !demo) await sleep(delayMs + Math.random() * delayMs * 0.5);
  }

  // ---- nivel 2: reinterogam cei mai promitatori termeni ----
  if (depth >= 2 && !isCancelled()) {
    const candidates = [...rows.values()]
      .filter((r) => r.appearances >= 1 && r.term.length >= 5)
      .sort((a, b) => b.weight - a.weight)
      .map((r) => r.term)
      .filter((t) => !queried.has(t))
      .slice(0, maxExpansion);

    total = index + candidates.length;
    onProgress({ index, total, currentSeed: null, terms: rows.size, level: 2, cancelled: false });

    for (const term of candidates) {
      if (isCancelled()) break;
      await absorb(term, 2);
      index += 1;
      onProgress({ index, total, currentSeed: term, terms: rows.size, level: 2, cancelled: isCancelled() });
      if (delayMs && !demo) await sleep(delayMs + Math.random() * delayMs * 0.5);
    }
  }

  // ---- scor ----
  const list = [...rows.values()];
  const maxWeight = Math.max(0.0001, ...list.map((r) => r.weight));
  const maxAppearances = Math.max(1, ...list.map((r) => r.appearances));

  // Scorul combina doua semnale: cit de sus apare (pozitie) si din cite prefixe
  // diferite iese la iveala (acoperire). Un termen care apare din 5 directii
  // diferite e mai "real" decat unul prins o singura data pe locul 1.
  const terms = list
    .map((r) => ({
      term: r.term,
      score: Math.round((0.65 * (r.weight / maxWeight) + 0.35 * (r.appearances / maxAppearances)) * 1000) / 10,
      appearances: r.appearances,
      bestRank: r.bestRank,
      avgRank: Math.round((r.rankSum / r.appearances) * 10) / 10,
      seeds: [...r.seeds].slice(0, 6),
      isNew: !previousKeys.has(r.key),
    }))
    .sort((a, b) => b.score - a.score || b.appearances - a.appearances || a.term.localeCompare(b.term, 'ro'));

  const finishedAt = new Date().toISOString();
  const stats = {
    demo: Boolean(demo),
    uniqueTerms: terms.length,
    requests,
    seedsQueried: queried.size,
    newTerms: terms.filter((t) => t.isNew).length,
    errors: errors.length,
    previousRunAt: previous?.finishedAt || null,
    durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
  };

  await saveLatest(code, {
    geo: code,
    hl,
    depth,
    finishedAt,
    stats,
    terms: terms.slice(0, 5000),
  });

  return {
    geo: code,
    hl,
    depth,
    startedAt,
    finishedAt,
    stats,
    errors: errors.slice(0, 20),
    terms,
  };
}

/* ---------------- job-uri ---------------- */

const jobs = new Map();

function prune() {
  if (jobs.size <= MAX_JOBS) return;
  const done = [...jobs.values()]
    .filter((j) => j.status !== 'running' && j.status !== 'queued')
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  while (jobs.size > MAX_JOBS && done.length) jobs.delete(done.shift().id);
}

export function getHarvestJob(id) {
  return jobs.get(String(id)) || null;
}

export function cancelHarvestJob(id) {
  const job = jobs.get(String(id));
  if (!job) return null;
  if (job.status === 'running' || job.status === 'queued') {
    job.cancelRequested = true;
    job.status = 'cancelling';
  }
  return job;
}

export function listHarvestJobs() {
  return [...jobs.values()]
    .map((j) => ({ id: j.id, status: j.status, geo: j.geo, progress: j.progress, createdAt: j.createdAt }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function startHarvest({ geo = 'RO', hl = 'ro', depth = 2, extraSeeds = [], maxExpansion = 40, demo = false } = {}) {
  const id = randomUUID().slice(0, 8);
  const job = {
    id,
    status: 'queued',
    geo: String(geo).toUpperCase(),
    hl,
    depth: Number(depth) >= 2 ? 2 : 1,
    demo: Boolean(demo),
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    progress: { index: 0, total: 0, currentSeed: null, terms: 0, level: 1, pct: 0 },
    result: null,
    error: null,
    cancelRequested: false,
  };
  jobs.set(id, job);
  prune();

  runHarvest(job, { extraSeeds, maxExpansion, demo }).catch((err) => {
    job.status = 'error';
    job.error = err?.message || 'eroare';
    job.finishedAt = new Date().toISOString();
  });

  return job;
}

async function runHarvest(job, { extraSeeds, maxExpansion, demo = false }) {
  job.status = 'running';
  job.startedAt = new Date().toISOString();

  const result = await harvest({
    geo: job.geo,
    hl: job.hl,
    depth: job.depth,
    extraSeeds,
    maxExpansion,
    demo,
    isCancelled: () => job.cancelRequested,
    onProgress: (p) => {
      job.progress = {
        ...p,
        pct: p.total ? Math.round((p.index / p.total) * 100) : 0,
      };
    },
  });

  job.result = result;
  job.finishedAt = new Date().toISOString();
  job.status = job.cancelRequested ? 'cancelled' : 'done';
}

export function harvestMeta(job) {
  return {
    id: job.id,
    status: job.status,
    geo: job.geo,
    hl: job.hl,
    depth: job.depth,
    demo: job.demo,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    progress: job.progress,
    error: job.error,
    stats: job.result?.stats || null,
  };
}
