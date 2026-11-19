// Colectare pe interval: cere trend-urile zilnice zi cu zi (sau le genereaza in mod demo),
// le clasifica pe categorii si le pune intr-un format comun.

import { cached, cacheWrite } from './cache.js';
import * as trends from './trends.js';
import { demoPulse } from './demo.js';
import { classify } from './classify.js';
import { sleep } from './http.js';

export const MAX_DAYS = 400;
const DAY_TTL = 60 * 24 * 60 * 60 * 1000; // 60 zile: trend-urile istorice nu se schimba

export function isValidDate(d) {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
}

export function dateRange(from, to) {
  if (!isValidDate(from) || !isValidDate(to)) throw new Error('Date invalidă (format YYYY-MM-DD)');
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (start > end) throw new Error('Data de început e după data de sfârșit');
  const out = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
    if (out.length > MAX_DAYS) throw new Error(`Intervalul depășește ${MAX_DAYS} de zile`);
  }
  return out;
}

function normalizeItem(item) {
  const { category } = classify(item.query);
  return {
    rank: item.rank,
    query: item.query,
    category,
    trafficLabel: item.trafficLabel || '',
    trafficValue: item.trafficValue || 0,
    relatedQueries: (item.relatedQueries || []).slice(0, 3),
  };
}

export async function collectDay({ geo, date, demo }) {
  if (demo) {
    const sim = demoPulse({ geo, date, seed: '' });
    return {
      date,
      items: (sim.trendingSearches?.items || []).map(normalizeItem),
      source: 'demo',
      cached: false,
    };
  }

  const key = `day:${geo}:${date}`;
  const hit = await cached(key, DAY_TTL, async () => {
    const data = await trends.dailyTrending({ geo, date });
    return {
      dayDate: data.dayDate,
      items: (data.items || []).map(normalizeItem),
    };
  });

  return {
    date,
    dayDate: hit.value.dayDate || null,
    items: hit.value.items || [],
    source: 'live',
    cached: hit.cached,
  };
}

/**
 * Colecteaza un interval intreg. Secvential si politicos (pauze intre cereri),
 * cu retry pe 429 si posibilitate de anulare.
 */
export async function collectRange({ geo, from, to, demo = false, onProgress = () => {}, isCancelled = () => false }) {
  const dates = dateRange(from, to);
  const days = [];
  const empty = [];
  const failed = [];
  const mismatched = [];
  let cancelled = false;

  for (let i = 0; i < dates.length; i += 1) {
    if (isCancelled()) {
      cancelled = true;
      break;
    }
    const date = dates[i];
    let day = null;

    try {
      day = await collectDay({ geo, date, demo });
    } catch (err) {
      if (err?.status === 429) {
        await sleep(4000 + Math.random() * 2000);
        try {
          day = await collectDay({ geo, date, demo });
        } catch (err2) {
          failed.push({ date, error: err2?.message || 'eroare' });
        }
      } else {
        failed.push({ date, error: err?.message || 'eroare' });
      }
    }

    if (day) {
      if (day.items.length === 0) empty.push(date);
      else {
        days.push({ date, items: day.items });
        if (day.dayDate && day.dayDate !== date) mismatched.push({ requested: date, returned: day.dayDate });
      }
    }

    // politete: pauza doar cand am lovit efectiv reteaua
    if (!demo && day && !day.cached) await sleep(350 + Math.random() * 400);

    onProgress({
      index: i + 1,
      total: dates.length,
      done: days.length,
      empty: empty.length,
      failed: failed.length,
      currentDate: date,
      cancelled: isCancelled(),
    });
  }

  return { days, empty, failed, mismatched, cancelled, requested: dates.length };
}

export async function clearDayCache(geo, dates) {
  // util la debugging: forteaza re-fetch pentru anumite zile
  for (const date of dates) await cacheWrite(`day:${geo}:${date}`, null, 0);
}
