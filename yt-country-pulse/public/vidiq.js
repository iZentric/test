// Analiza unui export CSV din vidIQ (canal) — parser + agregate, fără DOM.
// Pur: poate fi importat și din Node pentru teste.

/* ---------------- CSV ---------------- */

/** Parser CSV minimal (RFC 4180): ghilimele, "" escapate, newline în câmp, CRLF, BOM. */
export function parseCsv(text) {
  const src = String(text ?? '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  if (!rows.length) return { header: [], rows: [] };

  const header = rows[0].map((h) => h.trim().toUpperCase());
  const body = rows.slice(1).filter((r) => r.some((c) => String(c).trim() !== ''));
  return { header, rows: body };
}

/** Întoarce valoarea unei coloane după mai multe nume posibile. */
function pick(row, header, names) {
  for (const name of names) {
    const idx = header.indexOf(name);
    if (idx !== -1) return row[idx] ?? '';
  }
  // fallback: coloană care conține numele
  for (const name of names) {
    const idx = header.findIndex((h) => h.includes(name));
    if (idx !== -1) return row[idx] ?? '';
  }
  return '';
}

/* ---------------- numere / durate / date ---------------- */

const MULT = { k: 1e3, m: 1e6, b: 1e9 };

export function parseNumber(value) {
  let s = String(value ?? '').trim().replace(/\s|\u00a0/g, '');
  if (!s) return 0;
  let mult = 1;
  const suffix = s.match(/^([\d.,]+)([kmb])$/i);
  if (suffix) {
    s = suffix[1];
    mult = MULT[suffix[2].toLowerCase()] || 1;
  }
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // ultimul separator e cel zecimal
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    const parts = s.split(',');
    // „1,234" fără sufix = mii; „3,9K" = zecimale
    if (!suffix && parts.length === 2 && parts[1].length === 3) s = parts.join('');
    else s = s.replace(',', '.');
  } else if (hasDot) {
    const parts = s.split('.');
    const thousands = parts.length > 2 || (!suffix && parts.length === 2 && parts[1].length === 3);
    if (thousands) s = parts.slice(1).reduce((acc, p) => acc + p, parts[0]);
    if (thousands) s = s.replace(/\./g, '');
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * mult) : 0;
}

export function parseDuration(value) {
  const s = String(value ?? '').trim();
  if (!s) return 0;
  if (/^\d+$/.test(s)) return Number.parseInt(s, 10);
  const parts = s.split(':').map((p) => Number.parseInt(p.replace(/\D/g, ''), 10) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

export function parseDate(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
}

/* ---------------- text ---------------- */

const STOPWORDS = new Set(
  `a ai al ale alt am are asa asta asupra au avea ba ca cam care caut ce cel ceva cine cum cu
   da dacă dar dat de deloc din doar doi dupa ea ei el ele era este esti eu fac fara făcut fi
   fie fost iar il in intre intreaga iti la le li lui mai ma mea mei mele mi mult murit n nici
   nimic niște no nu o ori pe pentru peste putin sa sai sau se si sisunt sunt ta tale tau te ti
   toata toate tot totul tu un una unde unei unui va vă vom vor vreau vrei hai uite vino fii
   stii spune fa face facut macar inca deja aici acum
   the a an and are as at be been but by can do for from had has have he her his how i if in
   into is it its just like me my no not of on or our out she so than that the their them then
   there these they this to too up was we were what when where which who why will with you your
   vs video videos ep episod part part1 full hd 4k live oficial official new nou`
    .split(/\s+/)
    .filter(Boolean),
);

const normalizeToken = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').trim();

export function titleWords(title) {
  const tokens = String(title ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map(normalizeToken)
    .filter((t) => t && t.length > 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
  const words = [...new Set(tokens)];
  const bigrams = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return { words, bigrams: [...new Set(bigrams)] };
}

/* ---------------- analiza ---------------- */

export function analyzeCsv(text, { fileName = '' } = {}) {
  const { header, rows } = parseCsv(text);
  const warnings = [];
  if (!header.length) return empty(fileName, 'Fișierul pare gol.');
  if (!header.includes('TITLE') && !header.includes('VIDEO TITLE')) {
    warnings.push('Nu găsesc coloana TITLE — sigur e export din vidIQ?');
  }

  const videos = rows
    .map((row) => {
      const title = String(pick(row, header, ['TITLE', 'VIDEO TITLE'])).trim();
      const id = String(pick(row, header, ['ID', 'VIDEO ID'])).trim();
      const keywordsRaw = String(pick(row, header, ['KEYWORDS', 'TAGS', 'KEYWORD']));
      const keywords = [...new Set(keywordsRaw.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean))];
      const durationSec = parseDuration(pick(row, header, ['DURATION']));
      const views = parseNumber(pick(row, header, ['VIEWS', 'VIDEO VIEWS']));
      const likes = parseNumber(pick(row, header, ['YT LIKES', 'LIKES']));
      const comments = parseNumber(pick(row, header, ['YT COMMENTS', 'COMMENTS']));
      const score = Number.parseFloat(String(pick(row, header, ['VIDIQ SCORE', 'SCORE'])).replace(',', '.')) || 0;
      return {
        id,
        title,
        url: id ? `https://www.youtube.com/watch?v=${id}` : '',
        dateISO: parseDate(pick(row, header, ['DATE PUBLISHED', 'PUBLISHED', 'DATE'])),
        durationSec,
        isShort: durationSec > 0 && durationSec <= 60,
        views,
        likes,
        comments,
        score,
        engagementRate: views ? (likes + comments) / views : 0,
        keywords,
        descLinks: parseNumber(pick(row, header, ['DESC LINK COUNT'])),
        descWords: parseNumber(pick(row, header, ['DESC WORD COUNT'])),
      };
    })
    .filter((v) => v.title || v.id);

  if (!videos.length) return empty(fileName, 'Niciun videoclip în fișier.');
  if (videos.some((v) => !v.dateISO)) warnings.push('Unele date de publicare nu au putut fi citite.');
  if (videos.every((v) => v.views === 0)) warnings.push('Coloana VIEWS lipsește sau e zero.');

  /* --- sumar --- */
  const viewsList = videos.map((v) => v.views).sort((a, b) => a - b);
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  const totalViews = sum(videos.map((v) => v.views));
  const totalLikes = sum(videos.map((v) => v.likes));
  const totalComments = sum(videos.map((v) => v.comments));
  const median = (arr) => {
    if (!arr.length) return 0;
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[mid] : Math.round((arr[mid - 1] + arr[mid]) / 2);
  };
  const dates = videos.map((v) => v.dateISO).filter(Boolean).sort();
  const dateFrom = dates[0] || '';
  const dateTo = dates[dates.length - 1] || '';
  const spanDays = dateFrom && dateTo ? Math.round((Date.parse(dateTo) - Date.parse(dateFrom)) / 86_400_000) + 1 : 0;

  const shorts = videos.filter((v) => v.isShort);
  const longs = videos.filter((v) => !v.isShort);
  const avg = (arr) => (arr.length ? Math.round(sum(arr) / arr.length) : 0);
  const byViews = [...videos].sort((a, b) => b.views - a.views);
  const byScore = [...videos].sort((a, b) => b.score - a.score);

  // corelație simplă scor vidIQ vs. views (Pearson)
  let corr = 0;
  if (videos.length > 2) {
    const xs = videos.map((v) => v.score);
    const ys = videos.map((v) => Math.log10(v.views + 1));
    const mx = avg(xs.map((x) => x)) || 0;
    const my = sum(ys) / ys.length;
    let num = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < videos.length; i += 1) {
      const a = xs[i] - mx;
      const b = ys[i] - my;
      num += a * b;
      dx += a * a;
      dy += b * b;
    }
    corr = dx && dy ? num / Math.sqrt(dx * dy) : 0;
  }

  /* --- keywords --- */
  const kwMap = new Map();
  for (const v of videos) {
    for (const k of v.keywords) {
      const cur = kwMap.get(k) || { term: k, videos: 0, views: 0, scoreSum: 0 };
      cur.videos += 1;
      cur.views += v.views;
      cur.scoreSum += v.score;
      kwMap.set(k, cur);
    }
  }
  const keywords = [...kwMap.values()]
    .map((k) => ({
      ...k,
      share: k.videos / videos.length,
      avgViews: k.videos ? Math.round(k.views / k.videos) : 0,
      avgScore: k.videos ? k.scoreSum / k.videos : 0,
    }))
    .sort((a, b) => b.videos - a.videos || b.avgViews - a.avgViews);

  /* --- cuvinte + bigrame din titluri --- */
  const wordMap = new Map();
  const biMap = new Map();
  for (const v of videos) {
    const { words, bigrams } = titleWords(v.title);
    for (const w of words) {
      const cur = wordMap.get(w) || { term: w, videos: 0, views: 0 };
      cur.videos += 1;
      cur.views += v.views;
      wordMap.set(w, cur);
    }
    for (const b of bigrams) {
      const cur = biMap.get(b) || { term: b, videos: 0, views: 0 };
      cur.videos += 1;
      cur.views += v.views;
      biMap.set(b, cur);
    }
  }
  const sortAgg = (map) =>
    [...map.values()].sort((a, b) => b.videos - a.videos || b.views - a.views).map((x) => ({
      ...x,
      avgViews: Math.round(x.views / x.videos),
    }));

  /* --- pe zile --- */
  const dayMap = new Map();
  for (const v of videos) {
    if (!v.dateISO) continue;
    const cur = dayMap.get(v.dateISO) || { dateISO: v.dateISO, videos: 0, views: 0 };
    cur.videos += 1;
    cur.views += v.views;
    dayMap.set(v.dateISO, cur);
  }
  const days = [...dayMap.values()].sort((a, b) => (a.dateISO < b.dateISO ? 1 : -1));

  return {
    fileName,
    columns: header,
    warnings,
    videos,
    summary: {
      count: videos.length,
      totalViews,
      avgViews: avg(viewsList),
      medianViews: median(viewsList),
      minViews: viewsList[0] || 0,
      maxViews: viewsList[viewsList.length - 1] || 0,
      totalLikes,
      totalComments,
      likeRate: totalViews ? totalLikes / totalViews : 0,
      commentRate: totalViews ? totalComments / totalViews : 0,
      avgScore: videos.reduce((a, v) => a + v.score, 0) / videos.length,
      dateFrom,
      dateTo,
      spanDays,
      uploadsPerDay: spanDays ? videos.length / spanDays : 0,
      cardScoreCorr: corr,
      shorts: { count: shorts.length, avgViews: avg(shorts.map((v) => v.views)), totalViews: sum(shorts.map((v) => v.views)) },
      longs: { count: longs.length, avgViews: avg(longs.map((v) => v.views)), totalViews: sum(longs.map((v) => v.views)) },
      topByViews: byViews.slice(0, 5).map((v) => ({ title: v.title, views: v.views, url: v.url })),
      topByScore: byScore.slice(0, 5).map((v) => ({ title: v.title, score: v.score, views: v.views, url: v.url })),
      distinctKeywords: keywords.length,
      videosWithoutKeywords: videos.filter((v) => !v.keywords.length).length,
    },
    keywords,
    words: sortAgg(wordMap),
    bigrams: sortAgg(biMap),
    days,
  };
}

function empty(fileName, why) {
  return {
    fileName,
    columns: [],
    warnings: [why],
    videos: [],
    summary: null,
    keywords: [],
    words: [],
    bigrams: [],
    days: [],
  };
}
