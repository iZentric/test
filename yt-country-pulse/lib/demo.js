// Date DEMO (eșantion), generate determinist din (țară + dată + cuvânt).
// Scop: UI-ul si preview-ul sa functioneze si fara acces la Google.
// Sunt clar marcate `demo: true` si nu pretind a fi date reale.

import { countryOf } from './countries.js';

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POOLS = {
  RO: {
    queries: [
      'vremea mâine', 'rezultatele de azi', 'cât e ceasul', 'știrile românia',
      'meci românia', 'rețetă ciorbă', 'factura electrica', 'trafic autostrada',
      'emisiune live', 'cântec nou', 'bancul zilei', 'curs bnr', 'starea vremii',
      'film românesc', 'interviu', 'podcast românesc',
    ],
    channels: ['Știrile PRO', 'Observator Oficial', 'Neața cu Soare', 'Liga Sportivă', 'Bucătăria Mariei', 'Vlog de Week-end'],
    titles: [
      'CE S-A ÎNTÂMPLAT AZI ÎN ROMÂNIA | Rezumatul zilei',
      'Vremea se schimbă radical. Prognoza completă pentru 7 zile',
      'Toate golurile și fazele importante | Rezumat',
      'Rețeta de ciorbă pe care o fac toți bunicii',
      'Am testat 5 aplicații românești. Aproape toate sunt bune',
      'Prețurile au explodat. Ce spun specialiștii',
      'LIVE: conferința de presă, integral',
      'Am fost în cel mai liniștit sat din țară',
    ],
  },
  US: {
    queries: [
      'weather today', 'nfl scores', 'news live', 'how to cook', 'video music',
      'stock market today', 'movie trailer', 'ai news', 'election results', 'song lyrics',
      'game highlights', 'recipe easy', 'iphone review', 'workout at home', 'asmr',
    ],
    channels: ['Daily News Now', 'SportsCenter Clips', 'MusicVault', 'TechCheck', 'Kitchen Lab', 'Late Night Highlights'],
    titles: [
      'BREAKING: Full coverage of today\'s top story',
      'Every highlight from last night\'s game',
      'This song is everywhere right now',
      'I tested the new phone for a week. Here\'s the truth',
      'The 15-minute dinner everyone is making',
      'Why everyone is talking about this',
      'Full press briefing — complete video',
      'I spent 24 hours in the most remote town',
    ],
  },
  DEFAULT: {
    queries: [
      'weather today', 'news live', 'highlights', 'full movie', 'new song',
      'how to', 'tutorial', 'match today', 'results', 'trailer', 'vlog',
      'live stream', 'reaction', 'compilation', 'interview',
    ],
    channels: ['Global News', 'Sports Daily', 'Music Now', 'How-To Hub', 'Live Today', 'Explained'],
    titles: [
      'Top story today — full report',
      'Match highlights and reactions',
      'New release everyone is playing',
      'Step by step guide for beginners',
      'LIVE from the city center',
      'The video that went viral overnight',
      'Interview: the full conversation',
      '24 hours in the most remote place',
    ],
  },
};

const HOUR_LABELS = Array.from({ length: 25 }, (_, i) => {
  const d = new Date(Date.UTC(2024, 0, 1, i));
  return `${String(i).padStart(2, '0')}:00`;
});

function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function shuffle(rand, arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function demoPulse({ geo, date, seed }) {
  const country = countryOf(geo);
  const pool = POOLS[country.code] || POOLS.DEFAULT;
  const day = date || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const rand = mulberry32(hashString(`${country.code}|${day}|${seed || ''}`));

  const queries = shuffle(rand, pool.queries).slice(0, 12);
  const trendingSearches = queries.map((query, i) => {
    // trafic descrescator, ca la Google Trends (cu zgomot mic, ca sa nu fie liniar)
    const traffic = Math.round((2_000_000 / Math.pow(i + 1.15, 1.05)) * (0.92 + rand() * 0.16));
    const label = traffic >= 1_000_000
      ? `${(traffic / 1_000_000).toFixed(1)}M+`
      : `${Math.round(traffic / 1000)}K+`;
    return {
      rank: i + 1,
      query,
      exploreUrl: null,
      shareUrl: null,
      trafficValue: traffic,
      trafficLabel: label,
      relatedQueries: shuffle(rand, pool.queries)
        .filter((q) => q !== query)
        .slice(0, 4),
      articles: [
        {
          title: `${query} — subiectul momentului`,
          url: 'https://trends.google.com/trends/',
          source: 'Google Trends',
          timeAgo: `${1 + Math.floor(rand() * 10)}h ago`,
        },
      ],
    };
  });

  const trendingVideos = pool.titles.map((title, i) => {
    const views = Math.round((1_500_000 / (i * 0.55 + 1)) * (0.6 + rand() * 0.9));
    const hoursAgo = 1 + Math.floor(rand() * 40);
    return {
      rank: i + 1,
      videoId: `demo${String(i).padStart(7, '0')}`,
      title,
      channel: pick(rand, pool.channels),
      channelId: '',
      publishedAt: new Date(Date.parse(`${day}T12:00:00Z`) - hoursAgo * 3600_000).toISOString(),
      thumbnail: '',
      views,
      likes: Math.round(views * (0.02 + rand() * 0.05)),
      comments: Math.round(views * (0.001 + rand() * 0.004)),
      url: 'https://www.youtube.com/',
      tags: [],
    };
  });

  const keyword = seed || queries[0];
  const base = 25 + rand() * 20;
  const points = HOUR_LABELS.map((time, i) => {
    const wave = Math.sin((i / 24) * Math.PI * 2 - 1.1) * 22;
    const spike = i > 13 && i < 19 ? (i - 13) * 6 : 0;
    const value = Math.max(3, Math.round(base + wave + spike + rand() * 9));
    return { time, timestamp: i, value: Math.min(100, value) };
  });

  const top = shuffle(rand, pool.queries)
    .slice(0, 8)
    .map((query, i) => ({
      query: i === 0 ? keyword : query,
      value: Math.round(100 / (i + 1)),
      formattedValue: '',
      isBreakout: false,
      link: null,
    }));

  const rising = [
    `${keyword} live`,
    `${keyword} azi`,
    `${keyword} explicat`,
    `${keyword} reactie`,
    `${keyword} 2026`,
  ].map((query, i) => ({
    query,
    value: 4200 - i * 620,
    formattedValue: i === 0 ? 'Breakout' : `+${(4200 - i * 620).toLocaleString('en-US')}%`,
    isBreakout: i === 0,
    link: null,
  }));

  return {
    demo: true,
    trendingVideos,
    trendingSearches: {
      requestedDate: date || null,
      dayDate: day,
      items: trendingSearches,
    },
    seed: {
      keyword,
      geo: country.code,
      property: 'youtube',
      range: { start: day, end: day },
      points,
      top,
      rising,
    },
  };
}
