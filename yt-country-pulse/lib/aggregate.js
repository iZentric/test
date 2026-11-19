// Agregare: din zile × interogari -> un tabel de interogari unice, cu metrici.

import { _internal, categoryLabel, CATEGORIES } from './classify.js';

const normKey = (q) => _internal.NORMALIZE(q);

const MAX_ROWS = 6000;
const SERIES_ROWS = 150; // doar primele randuri primesc serie pentru sparkline

export function aggregate(days) {
  const map = new Map();

  for (const day of days) {
    for (const item of day.items || []) {
      const key = normKey(item.query);
      if (!key) continue;

      let row = map.get(key);
      if (!row) {
        row = {
          key,
          query: item.query,
          category: item.category || 'other',
          totalTraffic: 0,
          days: 0,
          bestRank: 99,
          rankSum: 0,
          firstSeen: day.date,
          lastSeen: day.date,
          bestDay: { date: day.date, trafficValue: item.trafficValue || 0 },
          points: [],
        };
        map.set(key, row);
      }

      const traffic = item.trafficValue || 0;
      row.totalTraffic += traffic;
      row.days += 1;
      row.rankSum += item.rank || 0;
      row.bestRank = Math.min(row.bestRank, item.rank || 99);
      if (day.date < row.firstSeen) row.firstSeen = day.date;
      if (day.date > row.lastSeen) row.lastSeen = day.date;
      if (traffic > row.bestDay.trafficValue) row.bestDay = { date: day.date, trafficValue: traffic };
      row.points.push({ date: day.date, traffic, rank: item.rank });
      // varianta cea mai "frumoasa" a textului (cu majuscule/diacritice, daca apare)
      if (item.query.length > row.query.length && item.query.toLowerCase() === row.query.toLowerCase()) {
        row.query = item.query;
      }
    }
  }

  const dates = days.map((d) => d.date);
  const rows = [...map.values()]
    .map((r) => ({
      query: r.query,
      key: r.key,
      category: r.category,
      totalTraffic: r.totalTraffic,
      days: r.days,
      bestRank: r.bestRank,
      avgRank: Number((r.rankSum / Math.max(r.days, 1)).toFixed(1)),
      firstSeen: r.firstSeen,
      lastSeen: r.lastSeen,
      bestDay: r.bestDay,
      consistency: Number((r.days / Math.max(days.length, 1)).toFixed(3)),
    }))
    .sort((a, b) => b.totalTraffic - a.totalTraffic || b.days - a.days)
    .slice(0, MAX_ROWS);

  // serii doar pentru topul randurilor (sparkline in tabel)
  const seriesByKey = new Map();
  for (const row of rows.slice(0, SERIES_ROWS)) {
    const src = map.get(row.key);
    const byDate = new Map(src.points.map((p) => [p.date, p.traffic]));
    row.series = dates.map((d) => byDate.get(d) || 0);
  }

  const categoryStats = CATEGORIES.map((c) => {
    const items = rows.filter((r) => r.category === c.id);
    return {
      id: c.id,
      label: c.label,
      emoji: c.emoji,
      queries: items.length,
      totalTraffic: items.reduce((s, r) => s + r.totalTraffic, 0),
    };
  })
    .filter((c) => c.queries > 0)
    .sort((a, b) => b.totalTraffic - a.totalTraffic);

  const totalTraffic = rows.reduce((s, r) => s + r.totalTraffic, 0);
  const dayTotals = days.map((d) => ({
    date: d.date,
    queries: d.items.length,
    traffic: d.items.reduce((s, i) => s + (i.trafficValue || 0), 0),
  }));

  return {
    rows,
    categories: categoryStats,
    totals: {
      uniqueQueries: map.size,
      listedQueries: rows.length,
      daysWithData: days.length,
      totalTraffic,
      avgQueriesPerDay: Number((rows.reduce((s, r) => s + r.days, 0) / Math.max(days.length, 1)).toFixed(1)),
    },
    dayTotals,
    seriesCount: seriesByKey.size,
  };
}

export function labelFor(id) {
  return categoryLabel(id);
}
