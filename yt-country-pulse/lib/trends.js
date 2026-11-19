// Client pentru Google Trends (endpoint-uri publice, neoficiale — aceleași pe care le folosește site-ul).
//
// Ce putem lua:
//  1. dailyTrending()      – căutările care au fost în trend într-o țară, într-o zi (inclusiv ziua cerută).
//  2. youtubeInterest()    – interesul pentru un cuvânt în filtrele YouTube Search (property=youtube),
//                            plus interogările "top" și "rising" asociate.
//
// Google nu publică o listă completă "toate căutările din YouTube ale unei țări într-o zi".
// Nu există. Apropierea corectă e: trend-uri zilnice + semnale de interes pe YouTube Search.

import { fetchJson, HttpError, warmSession } from './http.js';

const BASE = 'https://trends.google.com';
const HL = 'en-US';

function parseTraffic(label) {
  if (!label) return 0;
  const clean = String(label).replace(/[+,]/g, '').trim().toUpperCase();
  const num = parseFloat(clean);
  if (!Number.isFinite(num)) return 0;
  if (clean.includes('M')) return Math.round(num * 1_000_000);
  if (clean.includes('K')) return Math.round(num * 1_000);
  return Math.round(num);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Căutări în trend pentru o țară. Dacă `date` (YYYY-MM-DD) e dată, cere ziua respectivă;
 * altfel Google întoarce ultima zi disponibilă (de regulă ziua de ieri).
 */
export async function dailyTrending({ geo, date }) {
  await warmSession(geo);
  const params = new URLSearchParams({ hl: HL, tz: '0', geo });
  if (date) params.set('date', date.replaceAll('-', ''));
  else params.set('ns', '15');

  const url = `${BASE}/trends/api/dailytrends?${params.toString()}`;
  const data = await fetchJson(url, { retries: 2 });

  const days = data?.default?.trendingSearchesDays || [];
  const day = days[0];
  if (!day) {
    return { requestedDate: date || null, dayDate: null, items: [] };
  }

  const items = (day.trendingSearches || []).map((t, index) => {
    const query = t?.title?.query || '';
    const trafficLabel = t?.formattedTraffic || '';
    return {
      rank: index + 1,
      query,
      exploreUrl: t?.title?.exploreLink ? `${BASE}${t.title.exploreLink}` : null,
      shareUrl: t?.shareUrl || null,
      trafficValue: parseTraffic(trafficLabel),
      trafficLabel,
      relatedQueries: (t?.relatedQueries || []).map((r) => r?.query).filter(Boolean).slice(0, 8),
      articles: (t?.articles || []).slice(0, 3).map((a) => ({
        title: a?.articleTitle || '',
        url: a?.url || '',
        source: a?.source || '',
        timeAgo: a?.timeAgo || '',
      })),
    };
  });

  const raw = String(day.date || ''); // 20261118
  const dayDate = /^\d{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : null;

  return { requestedDate: date || null, dayDate, items };
}

/**
 * Interes pentru un cuvânt în YouTube Search, într-o țară, într-o fereastră de 1 zi.
 * Întoarce seria orară/zi (depinde de Google) + interogări top / rising.
 */
export async function youtubeInterest({ keyword, geo, date }) {
  const start = date || addDays(todayUtc(), -1);
  const end = addDays(start, 1);
  const time = `${start} ${end}`;

  await warmSession(geo);

  const exploreReq = {
    comparisonItem: [{ keyword, geo, time }],
    category: 0,
    property: 'youtube',
  };

  const exploreUrl =
    `${BASE}/trends/api/explore?hl=${HL}&tz=0` +
    `&req=${encodeURIComponent(JSON.stringify(exploreReq))}` +
    `&gprop=youtube`;

  const explore = await fetchJson(exploreUrl, { retries: 2 });
  const widgets = Array.isArray(explore?.widgets) ? explore.widgets : [];
  const timeseries = widgets.find((w) => w.id === 'TIMESERIES');
  const related = widgets.find((w) => w.id === 'RELATED_QUERIES');

  if (!timeseries) {
    throw new HttpError(
      `Google Trends nu are date pentru "${keyword}" în ${geo} la data ${start}. Încearcă alt cuvânt sau altă zi.`,
      { status: 404 },
    );
  }

  const tsUrl =
    `${BASE}/trends/api/widgetdata/multiline?hl=${HL}&tz=0` +
    `&req=${encodeURIComponent(JSON.stringify(timeseries.request))}` +
    `&token=${encodeURIComponent(timeseries.token)}`;
  const tsData = await fetchJson(tsUrl, { retries: 2 });

  const points = (tsData?.default?.timelineData || []).map((p) => ({
    time: p?.formattedTime || '',
    timestamp: p?.time ? Number(p.time) : null,
    value: Array.isArray(p?.value) ? Number(p.value[0]) || 0 : 0,
  }));

  let top = [];
  let rising = [];
  if (related) {
    try {
      const rqUrl =
        `${BASE}/trends/api/widgetdata/relatedsearches?hl=${HL}&tz=0` +
        `&req=${encodeURIComponent(JSON.stringify(related.request))}` +
        `&token=${encodeURIComponent(related.token)}`;
      const rqData = await fetchJson(rqUrl, { retries: 1 });
      const lists = rqData?.default?.rankedList || [];
      const mapList = (list) =>
        (list?.rankedKeyword || []).slice(0, 25).map((k) => ({
          query: k?.query || '',
          value: Number(k?.value) || 0,
          formattedValue: k?.formattedValue || '',
          isBreakout: Boolean(k?.isBreakout),
          link: k?.link ? `${BASE}${k.link}` : null,
        }));
      top = mapList(lists[0]);
      rising = mapList(lists[1]);
    } catch {
      /* related queries sunt "nice to have" — nu blocam seria principala */
    }
  }

  return {
    keyword,
    geo,
    property: 'youtube',
    range: { start, end },
    points,
    top,
    rising,
  };
}

export const _internal = { parseTraffic, addDays };
