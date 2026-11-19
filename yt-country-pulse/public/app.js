// UI — vanilă, fără framework. Vorbește doar cu /api/pulse.

import { analyzeCsv } from './vidiq.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  countries: [],
  lastPayload: null,
  busy: false,
  activeView: 'day',
  vidiq: null,
  vidiqSort: 'views',
  channelMatch: null,
  channelLoading: false,
};

const nf = new Intl.NumberFormat('ro-RO');
const nfCompact = new Intl.NumberFormat('ro-RO', { notation: 'compact', maximumFractionDigits: 1 });

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff)) return '';
  const h = Math.round(diff / 3600_000);
  if (h < 1) return 'acum <1h';
  if (h < 24) return `acum ${h}h`;
  const d = Math.round(h / 24);
  return `acum ${d}z`;
}

/* ---------------- setup ---------------- */

async function init() {
  $('#date').value = localStorage.getItem('ytp.date') || yesterday();
  $('#seed').value = localStorage.getItem('ytp.seed') || '';
  $('#apiKey').value = localStorage.getItem('ytp.key') || '';
  $('#demo').checked = localStorage.getItem('ytp.demo') === '1';

  try {
    const res = await fetch('/api/countries');
    const data = await res.json();
    state.countries = data.countries || [];
  } catch {
    state.countries = [{ code: 'RO', name: 'România', flag: '🇷🇴' }];
  }

  const select = $('#country');
  select.innerHTML = state.countries
    .map((c) => `<option value="${esc(c.code)}">${esc(c.flag)} ${esc(c.name)} (${esc(c.code)})</option>`)
    .join('');
  select.value = localStorage.getItem('ytp.geo') || 'RO';
  if (!select.value) select.value = 'RO';

  $('#load').addEventListener('click', () => load());
  $('#country').addEventListener('change', () => load());
  $('#date').addEventListener('change', () => load());
  $('#demo').addEventListener('change', () => load());
  $('#apiKey').addEventListener('change', () => {
    localStorage.setItem('ytp.key', $('#apiKey').value.trim());
    load();
  });
  $('#seed').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') load();
  });
  $('#exportJson').addEventListener('click', exportJson);
  $('#exportCsv').addEventListener('click', exportCsv);

  initTabs();
  await initRange();
  await initHarvest();
  initVidiq();

  await load();
  if (state.activeView !== 'range') switchTab('day');
  syncDayStrict();
  await maybeAutoLoadDemo();
}

/**
 * Daca mediul nu are acces la Google (ex. preview in sandbox), generam automat
 * o colectare demo pe ultimele 30 de zile, ca pagina sa nu fie goala.
 */
async function maybeAutoLoadDemo() {
  if (localStorage.getItem('ytp.autoloaded') === '1') return;
  if (localStorage.getItem('ytp.job')) return;
  if (range.result) return;

  const payload = state.lastPayload;
  if (!payload) return;
  const noLive = payload.demo === true || payload.mode === 'offline' || payload.ok === false;
  if (!noLive) return;

  $('#rDemo').checked = true;
  $('#rTo').value = yesterday();
  $('#rFrom').value = addDaysISO(yesterday(), -29);
  localStorage.setItem('ytp.autoloaded', '1');
  switchTab('range');
  await collect();
}

function setBusy(busy) {
  state.busy = busy;
  $('#load').disabled = busy;
  $('#load').textContent = busy ? 'Se încarcă…' : 'Încarcă';
  if (busy) setPill('busy', 'se încarcă');
}

function setPill(kind, text) {
  const pill = $('#modePill');
  pill.className = `pill pill-${kind}`;
  pill.textContent = text;
}

/* ---------------- data ---------------- */

async function load({ fallback = false } = {}) {
  if (state.busy) return;
  setBusy(true);
  renderSkeletons();

  const geo = $('#country').value || 'RO';
  const date = $('#date').value || '';
  const seed = $('#seed').value.trim();
  const apiKey = $('#apiKey').value.trim();
  const demo = $('#demo').checked || fallback;

  localStorage.setItem('ytp.geo', geo);
  localStorage.setItem('ytp.date', date);
  localStorage.setItem('ytp.seed', seed);
  localStorage.setItem('ytp.demo', $('#demo').checked ? '1' : '0');

  try {
    const res = await fetch('/api/pulse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ geo, date: date || null, seed, apiKey, demo }),
    });
    const payload = await res.json();

    if (!payload.ok && !demo && !fallback) {
      // Sursele live nu au răspuns (ex. rețea blocată) -> arătăm demo, dar spunem clar.
      state.lastPayload = payload;
      setBusy(false);
      await load({ fallback: true });
      pushFallbackWarning();
      return;
    }

    state.lastPayload = payload;
    render(payload);
  } catch (err) {
    setPill('error', 'eroare');
    renderWarnings([{ level: 'error', text: `Nu am putut contacta serverul: ${err.message}` }]);
    $('#videos').innerHTML = '';
    $('#searches').innerHTML = '';
    $('#stats').innerHTML = '';
    $('#footGeo').textContent = '';
  } finally {
    setBusy(false);
  }
}

function pushFallbackWarning() {
  const box = $('#warnings');
  box.classList.remove('hidden');
  box.insertAdjacentHTML(
    'afterbegin',
    `<div class="warn-item error"><span class="ico">⚠</span><span>Sursele live (Google Trends / YouTube API) nu au răspuns din acest mediu de rulare. Afișez <strong>date DEMO</strong> ca să vezi cum arată aplicația. Rulează local sau pe Vercel pentru date reale.</span></div>`,
  );
}

/* ---------------- render ---------------- */

function renderSkeletons() {
  $('#videos').innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton"></div>').join('');
  $('#searches').innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton" style="height:44px"></div>').join('');
  $('#stats').innerHTML = Array.from({ length: 4 }, () => '<div class="skeleton" style="height:82px"></div>').join('');
  $('#warnings').classList.add('hidden');
  $('#warnings').innerHTML = '';
}

function render(payload) {
  const { country, demo, mode, warnings = [] } = payload;

  refreshPill();

  renderWarnings(warnings.map((w) => ({ level: demo ? 'info' : 'warn', text: w })));
  renderStats(payload);
  renderVideos(payload);
  renderSearches(payload);
  renderSeed(payload);
  renderSources(payload);

  $('#footGeo').textContent = `${country.flag} ${country.name} · ${payload.date || 'ultima zi disponibilă'}`;
}

function renderWarnings(items) {
  const box = $('#warnings');
  if (!items || items.length === 0) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.classList.remove('hidden');
  box.innerHTML = items
    .map((w) => {
      const ico = w.level === 'error' ? '⛔' : w.level === 'info' ? 'ℹ' : '⚠';
      return `<div class="warn-item ${w.level === 'error' ? 'error' : ''}"><span class="ico">${ico}</span><span>${esc(w.text)}</span></div>`;
    })
    .join('');
}

function dayFilteredSearches() {
  const items = state.lastPayload?.trendingSearches?.items || [];
  return items.filter((it) => passesFilters(it.query, it.category || 'other'));
}

function syncDayStrict() {
  const el = $('#dayStrict');
  if (el) el.checked = range.cleanMode === 'strict';
}

function renderStats(payload) {
  const searches = dayFilteredSearches();
  const allSearches = payload.trendingSearches?.items || [];
  const videos = payload.trendingVideos || [];
  const seedPoints = payload.seed?.points || [];

  const totalTraffic = searches.reduce((sum, s) => sum + (s.trafficValue || 0), 0);
  const peak = seedPoints.reduce((max, p) => Math.max(max, p.value || 0), 0);
  const topVideo = videos[0];

  const cards = [
    {
      k: 'Căutări în trend',
      v: searches.length || '—',
      m: searches.length
        ? `din ${allSearches.length} · ≈ ${nfCompact.format(totalTraffic)} cumulat`
        : `${allSearches.length} brute, 0 după filtre`,
    },
    {
      k: 'Videoclipuri în trend',
      v: videos.length || '—',
      m: topVideo ? `#1: ${topVideo.channel}` : 'necesită cheie API',
    },
    {
      k: 'Vârf de interes',
      v: payload.seed ? `${peak}/100` : '—',
      m: payload.seed ? `„${payload.seed.keyword}” · YouTube Search` : 'introdu un cuvânt',
    },
    {
      k: 'Ziua raportată',
      v: payload.trendingSearches?.dayDate || payload.date || '—',
      m: payload.demo ? 'eșantion demo' : 'sursă: Google Trends',
    },
  ];

  $('#stats').innerHTML = cards
    .map(
      (c) => `<div class="stat"><div class="k">${esc(c.k)}</div><div class="v">${esc(c.v)}</div><div class="m">${esc(c.m)}</div></div>`,
    )
    .join('');
}

function renderVideos(payload) {
  const videos = payload.trendingVideos || [];
  const box = $('#videos');
  const sub = $('#videosSub');

  if (!videos.length) {
    const src = (payload.sources || []).find((s) => s.id === 'youtube-trending');
    box.innerHTML = `<p class="empty">${
      src?.status === 'skipped'
        ? 'Adaugă o cheie <strong>YouTube Data API v3</strong> din „Setări avansate” ca să vezi videoclipurile în trend din această țară.'
        : 'Nicio dată despre videoclipuri în trend.'
    }</p>`;
    sub.textContent = 'YouTube Data API v3';
    return;
  }

  sub.textContent = `${videos.length} videoclipuri · ${payload.demo ? 'demo' : 'snapshot al momentului'}`;
  box.innerHTML = videos
    .map(
      (v) => `
      <article class="video">
        <div class="rank">${v.rank}</div>
        <div class="meta">
          <p class="title">${v.url ? `<a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a>` : esc(v.title)}</p>
          <div class="sub-line">
            <span>${esc(v.channel)}</span>
            <span>·</span>
            <span>${esc(timeAgo(v.publishedAt))}</span>
          </div>
        </div>
        <div class="views">${nfCompact.format(v.views || 0)} viz.</div>
      </article>`,
    )
    .join('');
}

function renderSearches(payload) {
  const all = payload.trendingSearches?.items || [];
  const items = dayFilteredSearches();
  const box = $('#searches');
  const sub = $('#searchesSub');

  if (!items.length) {
    box.innerHTML = all.length
      ? '<p class="empty">Toate cele ' + all.length + ' interogări ale zilei sunt filtrate (știri, stat, filme, sport…). Debifează „Fără știri, stat, filme, meciuri" ca să le vezi.</p>'
      : '<p class="empty">Google Trends nu a returnat căutări pentru această țară și zi.</p>';
    sub.textContent = all.length ? `0 din ${all.length} după filtre` : 'Google Trends';
    return;
  }

  sub.textContent = `${items.length} din ${all.length} după filtre · ${payload.demo ? 'demo' : 'Google Trends'}`;
  box.innerHTML = items
    .map((s) => {
      const related = (s.relatedQueries || []).map((q) => `<span class="chip">${esc(q)}</span>`).join('');
      const articles = (s.articles || [])
        .filter((a) => a.url)
        .map(
          (a) =>
            `<div class="article"><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a>${a.source ? ` — ${esc(a.source)}` : ''}</div>`,
        )
        .join('');
      return `
        <details class="search">
          <summary>
            <span class="n">${s.rank}</span>
            <span class="q">${esc(s.query)}</span>
            <span class="t">${esc(s.trafficLabel || '')}</span>
          </summary>
          <div class="detail">
            ${related ? `<div class="chips">${related}</div>` : ''}
            ${articles || '<div class="article">Fără articole asociate.</div>'}
          </div>
        </details>`;
    })
    .join('');
}

function renderSeed(payload) {
  const seed = payload.seed;
  const body = $('#seedBody');
  const sub = $('#seedSub');

  if (!seed) {
    sub.textContent = 'introdu un cuvânt ca să vezi seria';
    body.innerHTML = `<p class="empty">Scrie un cuvânt în câmpul de sus (ex. <code>vremea</code>) ca să vezi cum a evoluat interesul pe YouTube Search în ziua aleasă, plus interogările asociate.</p>`;
    return;
  }

  const points = seed.points || [];
  sub.textContent = `„${seed.keyword}” · ${seed.range?.start || ''} · filtre YouTube Search`;

  if (!points.length) {
    body.innerHTML = '<p class="empty">Google nu a returnat o serie pentru acest cuvânt.</p>';
    return;
  }

  const peak = Math.max(...points.map((p) => p.value), 1);
  const first = points[0]?.time || '';
  const mid = points[Math.floor(points.length / 2)]?.time || '';
  const last = points[points.length - 1]?.time || '';

  const top = (seed.top || [])
    .slice(0, 8)
    .map(
      (q) => `<div class="qrow"><span>${esc(q.query)}</span><span class="val">${esc(q.formattedValue || q.value || '')}</span></div>`,
    )
    .join('') || '<p class="empty">—</p>';

  const rising = (seed.rising || [])
    .slice(0, 8)
    .map(
      (q) =>
        `<div class="qrow"><span>${esc(q.query)}</span><span class="val ${q.isBreakout ? 'breakout' : ''}">${esc(
          q.formattedValue || (q.value ? `+${nf.format(q.value)}%` : ''),
        )}</span></div>`,
    )
    .join('') || '<p class="empty">—</p>';

  body.innerHTML = `
    <div class="spark-wrap">
      <div class="spark-head"><span>Interes relativ (0–100)</span><span>vârf ${peak}</span></div>
      <div class="spark">${sparkline(points)}</div>
      <div class="spark-head" style="margin-top:6px"><span>${esc(first)}</span><span>${esc(mid)}</span><span>${esc(last)}</span></div>
    </div>
    <div class="seed-tables">
      <div><h3>Top interogări</h3>${top}</div>
      <div><h3>În creștere</h3>${rising}</div>
    </div>`;
}

function sparkline(points) {
  const w = 600;
  const h = 168;
  const pad = 8;
  const values = points.map((p) => Math.max(0, Math.min(100, p.value)));
  const max = Math.max(...values, 1);
  const stepX = (w - pad * 2) / Math.max(values.length - 1, 1);
  const coords = values.map((v, i) => [pad + i * stepX, h - pad - (v / max) * (h - pad * 2 - 10)]);

  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${h - pad} L${coords[0][0].toFixed(1)},${h - pad} Z`;
  const dots = coords
    .map(([x, y], i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.4" fill="#ff8a3d" opacity="${i % 4 === 0 ? 0.95 : 0}" />`)
    .join('');

  return `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Serie de interes">
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ff4d4d" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="#ff4d4d" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#grad)" />
      <path d="${line}" fill="none" stroke="#ff6b6b" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" />
      ${dots}
    </svg>`;
}

function renderSources(payload) {
  const list = payload.sources || [];
  $('#sources').innerHTML = list
    .map((s) => {
      const note = s.status === 'ok'
        ? [s.provider, s.note, s.cached ? 'din cache' : 'proaspăt'].filter(Boolean).join(' · ')
        : [s.provider, s.error || s.note].filter(Boolean).join(' · ');
      return `
        <div class="source">
          <span class="dot ${esc(s.status)}"></span>
          <span>${esc(s.label)}<br><span class="note">${esc(note)}</span></span>
          <span class="${s.status === 'error' ? 'err' : 'prov'}">${esc(s.status)}</span>
        </div>`;
    })
    .join('');

  $('#generatedAt').textContent = payload.generatedAt
    ? `generat ${new Date(payload.generatedAt).toLocaleString('ro-RO')}`
    : '';
}

/* ---------------- exports ---------------- */

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function exportJson() {
  if (state.activeView === 'harvest') return exportHarvestJson();
  if (state.activeView === 'range') return exportRangeJson();
  if (!state.lastPayload) return;
  const geo = state.lastPayload.geo || 'RO';
  const date = state.lastPayload.date || 'latest';
  download(`youtube-pulse-${geo}-${date}.json`, JSON.stringify(state.lastPayload, null, 2), 'application/json');
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function exportCsv() {
  if (state.activeView === 'harvest') return exportHarvestCsv();
  if (state.activeView === 'range') return exportRangeCsv();
  const p = state.lastPayload;
  if (!p) return;

  const rows = [['sectiune', 'rank', 'nume', 'valoare', 'detalii', 'url']];

  (p.trendingSearches?.items || []).forEach((s) => {
    rows.push([
      'cautare_trend',
      s.rank,
      s.query,
      s.trafficValue,
      (s.relatedQueries || []).join(' | '),
      s.shareUrl || '',
    ]);
  });

  (p.trendingVideos || []).forEach((v) => {
    rows.push(['video_trend', v.rank, v.title, v.views, v.channel, v.url]);
  });

  (p.seed?.top || []).forEach((q, i) => {
    rows.push(['interes_top', i + 1, q.query, q.value, q.formattedValue || '', q.link || '']);
  });
  (p.seed?.rising || []).forEach((q, i) => {
    rows.push(['interes_rising', i + 1, q.query, q.value, q.formattedValue || '', q.link || '']);
  });
  (p.seed?.points || []).forEach((pt, i) => {
    rows.push(['serie_interes', i + 1, pt.time, pt.value, '', '']);
  });

  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n');
  download(`youtube-pulse-${p.geo}-${p.date || 'latest'}.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
}


/* ===================================================================
   TABEL PE PERIOADĂ — colectare în fundal, agregare, filtre, export
   =================================================================== */

const range = {
  jobId: null,
  job: null,
  result: null,
  pollTimer: null,
  events: [],
  excluded: new Set(),
  hideCountry: false,
  excludeWords: [],
  cleanMode: false,
  search: '',
  sort: 'days',
  minDays: 1,
  shown: 300,
};

const CLEAN_CATEGORIES = ['news', 'politics', 'education', 'lifestyle', 'tech', 'tv'];
const CLEAN_WORDS = [
  'bac', 'bacalaureat', 'conferinta', 'conferinte', 'aplicatie', 'aplicatii',
  'reteta', 'retete', 'restaurant', 'fast food', 'meniu', 'stiri', 'breaking',
];

// Tot ce tine de stat, bani publici, preturi reglementate si dezastre.
const STATE_CATEGORIES = ['news', 'politics', 'education', 'lifestyle', 'tech', 'tv', 'film', 'sport', 'money'];
const STATE_WORDS = [
  // dezastre / accidente
  'cutremur', 'seism', 'inundat', 'incendiu', 'explozie', 'accident', 'deces', 'morti', 'raniti', 'victime',
  'alerta', 'evacuare', 'dezastru',
  // stat / legi / institutii
  'guvern', 'minister', 'parlament', 'senat', 'lege', 'legi', 'ordonanta', 'impozit', 'taxa', 'taxe',
  'buget', 'anaf', 'subventie', 'ajutor social', 'somaj', 'somer', 'rovinieta', 'amenda', 'politie',
  'dna', 'tribunal', 'proces', 'dosar',
  // alegeri
  'alegeri', 'vot', 'votul', 'presedinte', 'ministru', 'primar', 'partid', 'coalitie', 'candidat', 'sondaj',
  // preturi / bani / utilitati
  'pret', 'preturi', 'scumpire', 'scumpiri', 'benzina', 'motorina', 'combustibil', 'factura', 'facturi',
  'energie', 'gaze', 'curent', 'pensie', 'pensii', 'salariu', 'salarii', 'inflatie', 'curs bnr', 'bursa',
  'credit', 'ipoteca', 'criza', 'razboi', 'ucraina', 'rusia',
  // filme / meciuri
  'film', 'filme', 'serial', 'meci', 'meciul', 'fotbal',
];

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAny(text, terms) {
  const hay = normalizeText(text);
  if (!hay) return false;
  const words = hay.split(' ');
  for (const raw of terms || []) {
    const term = normalizeText(raw);
    if (!term) continue;
    if (term.includes(' ') || term.includes('-')) {
      if (hay.includes(term)) return true;
      continue;
    }
    for (const w of words) {
      if (w === term || w.startsWith(term)) return true;
    }
  }
  return false;
}

function currentCountry() {
  const code = $('#rCountry').value || 'RO';
  return state.countries.find((c) => c.code === code) || { code, name: code, terms: [] };
}

function currentCountryTerms() {
  const c = currentCountry();
  const terms = c.terms && c.terms.length ? c.terms : [c.name];
  return terms.filter(Boolean);
}

function addDaysISO(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function initTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}


function refreshPill() {
  if (state.activeView === 'harvest') {
    if (harv.job && ['running', 'queued', 'cancelling'].includes(harv.job.status)) return setPill('busy', 'colectez');
    if (!harv.result) return setPill('idle', 'în așteptare');
    const demo = harv.result.stats?.demo;
    return setPill(demo ? 'demo' : 'live', demo ? 'sugestii demo' : 'sugestii live');
  }
  if (state.activeView === 'vidiq') {
    if (!state.vidiq || !state.vidiq.videos.length) return setPill('idle', 'fără fișier');
    return setPill('live', `csv local · ${state.vidiq.videos.length} clipuri`);
  }
  if (state.activeView === 'range') {
    if (range.job && ['running', 'queued', 'cancelling'].includes(range.job.status)) return setPill('busy', 'colectez');
    if (!range.result) return setPill('idle', 'în așteptare');
    return setPill(range.result.demo ? 'demo' : 'live', range.result.demo ? 'date demo' : 'tabel live');
  }
  const p = state.lastPayload;
  if (!p) return setPill('idle', 'în așteptare');
  if (p.demo) return setPill('demo', 'date demo');
  return setPill(p.mode === 'live' ? 'live' : p.mode === 'partial' ? 'partial' : 'error',
    p.mode === 'live' ? 'live' : p.mode === 'partial' ? 'parțial' : 'fără date');
}

function switchTab(name) {
  state.activeView = ['range', 'harvest', 'vidiq'].includes(name) ? name : 'day';
  document.querySelectorAll('.tab').forEach((b) => {
    const on = b.dataset.tab === state.activeView;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  $('#view-day').classList.toggle('hidden', state.activeView !== 'day');
  $('#view-range').classList.toggle('hidden', state.activeView !== 'range');
  $('#view-harvest').classList.toggle('hidden', state.activeView !== 'harvest');
  $('#view-vidiq').classList.toggle('hidden', state.activeView !== 'vidiq');
  if (state.activeView === 'vidiq') loadChannelMatch();
  refreshPill();
}

async function initRange() {
  const fill = (sel) => {
    sel.innerHTML = state.countries
      .map((c) => `<option value="${esc(c.code)}">${esc(c.flag)} ${esc(c.name)} (${esc(c.code)})</option>`)
      .join('');
  };
  fill($('#rCountry'));
  $('#rCountry').value = localStorage.getItem('ytp.geo') || 'RO';
  if (!$('#rCountry').value) $('#rCountry').value = 'RO';

  const to = yesterday();
  $('#rTo').value = localStorage.getItem('ytp.rTo') || to;
  $('#rFrom').value = localStorage.getItem('ytp.rFrom') || addDaysISO(to, -29);
  $('#rDemo').checked = localStorage.getItem('ytp.demo') === '1';

  document.querySelectorAll('.chip-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const days = Number(btn.dataset.days) || 30;
      const end = $('#rTo').value || yesterday();
      $('#rTo').value = end;
      $('#rFrom').value = addDaysISO(end, -(days - 1));
    });
  });

  $('#collectBtn').addEventListener('click', collect);
  $('#cancelJob').addEventListener('click', cancelCollect);
  $('#rSearch').addEventListener('input', (e) => {
    range.search = e.target.value.trim().toLowerCase();
    range.shown = 300;
    renderTable();
  });
  $('#rSort').addEventListener('change', (e) => {
    range.sort = e.target.value;
    persistFilters();
    renderTable();
  });
  $('#rMinDays').addEventListener('change', (e) => {
    range.minDays = Number(e.target.value) || 1;
    range.shown = 300;
    persistFilters();
    renderTable();
  });
  $('#rMore').addEventListener('click', () => {
    range.shown += 300;
    renderTable();
  });
  $('#dayTopN').addEventListener('change', renderDayTop);
  $('#dayTopOpen').addEventListener('change', renderDayTop);

  // filtre salvate
  try {
    const savedFilters = JSON.parse(localStorage.getItem('ytp.filters') || 'null');
    if (savedFilters) {
      range.excluded = new Set(savedFilters.excluded || []);
      range.hideCountry = Boolean(savedFilters.hideCountry);
      range.excludeWords = savedFilters.excludeWords || [];
      range.cleanMode = savedFilters.cleanMode || false;
      $('#hideCountry').checked = range.hideCountry;
      $('#excludeWords').value = range.excludeWords.join(', ');
      $('#cleanMode').classList.toggle('active', range.cleanMode === 'soft');
      $('#strictMode').classList.toggle('active', range.cleanMode === 'strict');
      if (savedFilters.sort) {
        range.sort = savedFilters.sort;
        $('#rSort').value = savedFilters.sort;
      }
      if (savedFilters.minDays) {
        range.minDays = savedFilters.minDays;
        $('#rMinDays').value = String(savedFilters.minDays);
      }
    } else {
      // prima vizita: pornim direct cu filtrul strict (fara stiri/stat/dezastre)
      applyCleanMode('strict');
    }
  } catch {
    /* ignoram filtrele corupte */
  }

  $('#hideCountry').addEventListener('change', (e) => {
    range.hideCountry = e.target.checked;
    persistFilters();
    refreshFiltered();
  });

  $('#excludeWords').addEventListener('input', (e) => {
    range.excludeWords = e.target.value
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    persistFilters();
    refreshFiltered();
  });

  $('#dayStrict').addEventListener('change', (e) => applyCleanMode(e.target.checked ? 'strict' : false));
  $('#cleanMode').addEventListener('click', () => applyCleanMode(range.cleanMode === 'soft' ? false : 'soft'));
  $('#strictMode').addEventListener('click', () => applyCleanMode(range.cleanMode === 'strict' ? false : 'strict'));
  $('#resetFilters').addEventListener('click', resetFilters);
  $('#rCountry').addEventListener('change', () => {
    updateCountryLabel();
    fetchEvents();
  });

  updateCountryLabel();
  fetchEvents();

  const saved = localStorage.getItem('ytp.job');
  if (saved) resumeJob(saved);
}

function updateCountryLabel() {
  const c = currentCountry();
  $('#countryLabel').textContent = c.name || c.code;
}

function persistFilters() {
  localStorage.setItem(
    'ytp.filters',
    JSON.stringify({
      excluded: [...range.excluded],
      hideCountry: range.hideCountry,
      excludeWords: range.excludeWords,
      cleanMode: range.cleanMode,
      sort: range.sort,
      minDays: range.minDays,
    }),
  );
}

function applyCleanMode(mode) {
  range.cleanMode = mode || false;

  if (range.cleanMode === 'soft') {
    range.excluded = new Set(CLEAN_CATEGORIES);
    range.hideCountry = true;
    range.excludeWords = [...CLEAN_WORDS];
  } else if (range.cleanMode === 'strict') {
    range.excluded = new Set(STATE_CATEGORIES);
    range.hideCountry = true;
    range.excludeWords = [...CLEAN_WORDS, ...STATE_WORDS];
  } else {
    range.excluded = new Set();
    range.hideCountry = false;
    range.excludeWords = [];
  }

  $('#hideCountry').checked = range.hideCountry;
  $('#excludeWords').value = range.excludeWords.join(', ');
  $('#cleanMode').classList.toggle('active', range.cleanMode === 'soft');
  $('#strictMode').classList.toggle('active', range.cleanMode === 'strict');
  persistFilters();
  refreshFiltered();
  if (range.result) renderCategoryChips(range.result);
  syncDayStrict();
  if (state.lastPayload) {
    renderStats(state.lastPayload);
    renderSearches(state.lastPayload);
  }
}

function resetFilters() {
  range.excluded = new Set();
  range.hideCountry = false;
  range.excludeWords = [];
  range.cleanMode = false;
  range.search = '';
  range.minDays = 1;
  range.sort = 'days';
  range.shown = 300;
  $('#hideCountry').checked = false;
  $('#excludeWords').value = '';
  $('#cleanMode').classList.remove('active');
  $('#strictMode').classList.remove('active');
  $('#rSearch').value = '';
  $('#rMinDays').value = '1';
  $('#rSort').value = 'days';
  persistFilters();
  refreshFiltered();
  if (range.result) renderCategoryChips(range.result);
  syncDayStrict();
  if (state.lastPayload) {
    renderStats(state.lastPayload);
    renderSearches(state.lastPayload);
  }
}

function refreshFiltered() {
  range.shown = 300;
  if (range.result) {
    renderTable();
    renderDayTop();
    renderForecast();
  }
}

function showRangeWarnings(items) {
  const box = $('#rangeWarnings');
  if (!items || !items.length) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.classList.remove('hidden');
  box.innerHTML = items
    .map((w) => {
      const ico = w.level === 'error' ? '⛔' : w.level === 'info' ? 'ℹ' : '⚠';
      return `<div class="warn-item ${w.level === 'error' ? 'error' : ''}"><span class="ico">${ico}</span><span>${esc(w.text)}</span></div>`;
    })
    .join('');
}

async function resumeJob(id) {
  try {
    const res = await fetch(`/api/jobs/${encodeURIComponent(id)}`);
    if (!res.ok) {
      localStorage.removeItem('ytp.job');
      return;
    }
    const data = await res.json();
    range.jobId = id;
    range.job = data.job;
    showJob(data.job);
    if (['running', 'queued', 'cancelling'].includes(data.job.status)) {
      switchTab('range');
      startPolling(id);
    } else if (data.result) {
      range.result = data.result;
      switchTab('range');
      renderRange();
    }
  } catch {
    /* ignoram: jobul poate fi expirat */
  }
}

async function collect() {
  const geo = $('#rCountry').value || 'RO';
  const from = $('#rFrom').value;
  const to = $('#rTo').value;
  const demo = $('#rDemo').checked;

  if (!from || !to) {
    showRangeWarnings([{ level: 'error', text: 'Alege intervalul (de la / până la).' }]);
    return;
  }

  localStorage.setItem('ytp.geo', geo);
  localStorage.setItem('ytp.rFrom', from);
  localStorage.setItem('ytp.rTo', to);
  localStorage.setItem('ytp.demo', demo ? '1' : '0');

  // păstrăm filtrele active (presetul „fără stat & dezastre" nu se resetează la o colectare nouă)
  range.search = '';
  range.shown = 300;
  $('#rSearch').value = '';
  range.result = null;
  $('#rBody').innerHTML = '';
  $('#rCats').innerHTML = '';
  $('#catBars').innerHTML = '';
  $('#rangeStats').innerHTML = '';
  showRangeWarnings([]);

  $('#collectBtn').disabled = true;
  setPill('busy', 'colectez');

  try {
    const res = await fetch('/api/collect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ geo, from, to, demo }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showRangeWarnings([{ level: 'error', text: data.error || 'Nu am putut porni colectarea.' }]);
      $('#collectBtn').disabled = false;
      setPill('error', 'eroare');
      return;
    }
    range.jobId = data.jobId;
    range.job = data.job;
    localStorage.setItem('ytp.job', data.jobId);
    showJob(data.job);
    startPolling(data.jobId);
  } catch (err) {
    showRangeWarnings([{ level: 'error', text: `Serverul nu a răspuns: ${err.message}` }]);
    $('#collectBtn').disabled = false;
    setPill('error', 'eroare');
  }
}

async function cancelCollect() {
  if (!range.jobId) return;
  try {
    await fetch(`/api/jobs/${encodeURIComponent(range.jobId)}/cancel`, { method: 'POST' });
  } catch {
    /* ignoram */
  }
}

function showJob(job) {
  if (!job) return;
  $('#jobBar').classList.remove('hidden');
  const p = job.progress || {};
  const pct = p.pct || 0;
  $('#jobTitle').textContent =
    job.status === 'done'
      ? 'Colectare terminată'
      : job.status === 'cancelled'
        ? 'Colectare anulată'
        : job.status === 'error'
          ? 'Colectare eșuată'
          : job.demo
            ? 'Generez date demo…'
            : 'Colectez de la Google Trends…';
  $('#jobFill').style.width = `${job.status === 'done' ? 100 : pct}%`;
  const parts = [
    `${job.status === 'done' ? 100 : pct}%`,
    `${p.index || 0}/${p.total || job.totalDays} zile`,
    `${p.done || 0} cu date`,
  ];
  if (p.empty) parts.push(`${p.empty} goale`);
  if (p.failed) parts.push(`${p.failed} erori`);
  if (p.currentDate && job.status === 'running') parts.push(`la ${p.currentDate}`);
  $('#jobText').textContent = parts.join(' · ');
  $('#cancelJob').classList.toggle('hidden', job.status !== 'running' && job.status !== 'queued');
}

function startPolling(id) {
  if (range.pollTimer) clearInterval(range.pollTimer);
  const tick = async () => {
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) {
        clearInterval(range.pollTimer);
        range.pollTimer = null;
        return;
      }
      range.job = data.job;
      showJob(data.job);
      if (['done', 'cancelled', 'error'].includes(data.job.status)) {
        clearInterval(range.pollTimer);
        range.pollTimer = null;
        $('#collectBtn').disabled = false;
        if (data.job.status === 'error') {
          setPill('error', 'eroare');
          showRangeWarnings([{ level: 'error', text: data.job.error || 'Colectarea a eșuat.' }]);
          return;
        }
        if (data.result) {
          range.result = data.result;
          renderRange();
        }
      }
    } catch {
      clearInterval(range.pollTimer);
      range.pollTimer = null;
      $('#collectBtn').disabled = false;
      setPill('error', 'eroare');
    }
  };
  tick();
  range.pollTimer = setInterval(tick, 1200);
}

/* ---------------- randare ---------------- */

function renderRange() {
  const r = range.result;
  if (!r) return;

  refreshPill();

  const cov = r.coverage || {};
  const warnings = [];
  if (r.demo) {
    warnings.push({ level: 'info', text: 'Date DEMO: eșantioane generate local, ca să vezi cum arată tabelul. Rulează local/Vercel pentru date reale.' });
  }
  if (cov.emptyDays?.length) {
    warnings.push({
      level: 'warn',
      text: `${cov.emptyDays.length} zile nu au returnat date de la Google${cov.emptyDays.length <= 6 ? ` (${cov.emptyDays.join(', ')})` : ''}.`,
    });
  }
  if (cov.failedDays?.length) {
    warnings.push({ level: 'warn', text: `${cov.failedDays.length} zile au eșuat (reîncearcă — zilele bune sunt deja cache-uite).` });
  }
  if (cov.mismatchedDays?.length) {
    warnings.push({
      level: 'warn',
      text: `${cov.mismatchedDays.length} zile au fost înlocuite de Google cu altă zi (limită de istoric a endpoint-ului).`,
    });
  }
  showRangeWarnings(warnings);

  renderRangeStats(r);
  renderCategoryChips(r);
  renderCategoryBars(r);
  renderTable();
  renderDayTop();
  renderForecast();

  $('#tableSub').textContent = `${r.from} → ${r.to} · ${cov.daysWithData || 0} zile cu date`;
  $('#rangeGeneratedAt').textContent = r.generatedAt
    ? `generat ${new Date(r.generatedAt).toLocaleString('ro-RO')}`
    : '';
  $('#footGeo').textContent = `${r.country?.flag || ''} ${r.country?.name || r.geo} · ${r.from} → ${r.to}`;
}

function renderRangeStats(r) {
  const cov = r.coverage || {};
  const totals = r.totals || {};
  const requested = cov.daysRequested || 0;
  const withData = cov.daysWithData || 0;
  const pct = requested ? Math.round((withData / requested) * 100) : 0;

  const cards = [
    { k: 'Acoperire', v: `${withData}/${requested}`, m: `${pct}% zile cu date` },
    { k: 'Interogări unice', v: nf.format(totals.uniqueQueries || 0), m: `${totals.listedQueries || 0} listate în tabel` },
    { k: 'Trafic cumulat', v: nfCompact.format(totals.totalTraffic || 0), m: 'sumă de estimări zilnice' },
    { k: 'Interogări / zi', v: totals.avgQueriesPerDay || '—', m: 'medie pe zilele colectate' },
    { k: 'Perioada', v: `${r.from} → ${r.to}`, m: r.demo ? 'mod demo' : 'Google Trends' },
  ];

  $('#rangeStats').innerHTML = cards
    .map(
      (c) => `<div class="stat"><div class="k">${esc(c.k)}</div><div class="v">${esc(c.v)}</div><div class="m">${esc(c.m)}</div></div>`,
    )
    .join('');
}

function categoryMeta(r) {
  const map = new Map();
  for (const c of r.categories || []) map.set(c.id, c);
  return map;
}

function renderCategoryChips(r) {
  const meta = categoryMeta(r);
  const chips = (r.categories || [])
    .map((c) => {
      const off = range.excluded.has(c.id);
      return `<button class="cat-chip ${off ? 'off' : 'on'}" data-cat="${esc(c.id)}" title="${
        off ? 'Click ca să includă' : 'Click ca să excludă'
      }">${esc(c.emoji)} ${esc(c.label)} <span class="cnt">${nf.format(c.queries)}</span></button>`;
    })
    .join('');
  $('#rCats').innerHTML = chips;

  document.querySelectorAll('#rCats .cat-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.cat;
      if (range.excluded.has(id)) range.excluded.delete(id);
      else range.excluded.add(id);
      renderCategoryChips(r);
      renderTable();
    });
  });
}

function renderCategoryBars(r) {
  const cats = r.categories || [];
  const max = Math.max(1, ...cats.map((c) => c.totalTraffic));
  $('#catBars').innerHTML = cats
    .map(
      (c) => `
      <div class="cat-bar">
        <span class="name">${esc(c.emoji)} ${esc(c.label)}</span>
        <span class="track"><span class="fill" style="width:${Math.max(2, Math.round((c.totalTraffic / max) * 100))}%"></span></span>
        <span class="val">${nf.format(c.queries)} · ${nfCompact.format(c.totalTraffic)}</span>
      </div>`,
    )
    .join('');
  $('#catSub').textContent = `${cats.length} categorii detectate`;
}

function passesFilters(query, category) {
  if (range.excluded.has(category)) return false;
  if (range.hideCountry && containsAny(query, currentCountryTerms())) return false;
  if (range.excludeWords.length && containsAny(query, range.excludeWords)) return false;
  return true;
}

function filteredRows() {
  const r = range.result;
  if (!r) return [];
  let rows = (r.rows || []).filter((x) => passesFilters(x.query, x.category));
  if (range.minDays > 1) rows = rows.filter((x) => x.days >= range.minDays);
  if (range.search) rows = rows.filter((x) => x.query.toLowerCase().includes(range.search));

  const by = range.sort;
  rows = [...rows];
  if (by === 'days') rows.sort((a, b) => b.days - a.days || b.totalTraffic - a.totalTraffic);
  else if (by === 'bestRank') rows.sort((a, b) => a.bestRank - b.bestRank || b.totalTraffic - a.totalTraffic);
  else if (by === 'alpha') rows.sort((a, b) => a.query.localeCompare(b.query, 'ro'));
  else rows.sort((a, b) => b.totalTraffic - a.totalTraffic || b.days - a.days);

  return rows;
}

function sparkMini(series) {
  if (!Array.isArray(series) || series.length < 2) return '';
  const w = 80;
  const h = 20;
  const max = Math.max(1, ...series);
  const step = w / (series.length - 1);
  const pts = series
    .map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`)
    .join(' ');
  return `<svg class="spark-mini" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="#ff8a3d" stroke-width="1.6" /></svg>`;
}

function renderTable() {
  const r = range.result;
  if (!r) return;

  const rows = filteredRows();
  const meta = categoryMeta(r);
  const shown = rows.slice(0, range.shown);

  $('#rBody').innerHTML = shown
    .map((x, i) => {
      const c = meta.get(x.category) || { label: 'Altele', emoji: '📦' };
      return `<tr>
        <td class="col-n">${i + 1}</td>
        <td class="rq">${esc(x.query)}</td>
        <td><span class="badge-cat">${esc(c.emoji)} ${esc(c.label)}</span></td>
        <td class="col-num">${x.days}</td>
        <td class="col-num">${nfCompact.format(x.totalTraffic)}</td>
        <td class="col-num">#${x.bestRank}</td>
        <td class="col-date">${esc(x.firstSeen)}</td>
        <td class="col-date">${esc(x.lastSeen)}</td>
        <td>${sparkMini(x.series)}</td>
      </tr>`;
    })
    .join('');

  if (!rows.length) {
    $('#rBody').innerHTML = '<tr><td colspan="9" class="empty" style="padding:18px">Nicio interogare pentru filtrele curente.</td></tr>';
  }

  $('#rCount').textContent = `${nf.format(rows.length)} interogări după filtre${rows.length > shown.length ? ` · afișate ${nf.format(shown.length)}` : ''}`;
  $('#rMore').classList.toggle('hidden', rows.length <= shown.length);
}

/* ---------------- top pe fiecare zi ---------------- */

function renderDayTop() {
  const r = range.result;
  const box = $('#dayTopBody');
  const sub = $('#dayTopSub');

  if (!r) {
    box.innerHTML = '<p class="empty">Colectează o perioadă ca să vezi topul fiecărei zile.</p>';
    sub.textContent = '—';
    return;
  }

  const perDay = Number($('#dayTopN').value) || 10;
  const openAll = $('#dayTopOpen').checked;
  const meta = categoryMeta(r);

  const days = [...(r.days || [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 120);
  const blocks = [];

  for (const day of days) {
    const items = (day.items || [])
      .filter((it) => passesFilters(it.query, it.category))
      .sort((a, b) => (b.trafficValue || 0) - (a.trafficValue || 0) || (a.rank || 99) - (b.rank || 99));

    if (!items.length) continue;

    const top = items.slice(0, perDay);
    const peek = top.slice(0, 3).map((t) => t.query).join(' · ');
    const list = top
      .map((t) => {
        const c = meta.get(t.category) || { label: 'Altele', emoji: '📦' };
        return `<li>${esc(t.query)}<span class="cat">${esc(c.emoji)} ${esc(c.label)}</span>${
          t.trafficLabel ? `<span class="t">${esc(t.trafficLabel)}</span>` : ''
        }</li>`;
      })
      .join('');

    blocks.push(`<details class="day-block" ${openAll ? 'open' : ''}>
      <summary>
        <span class="d">${esc(day.date.split('-').reverse().join('.'))}</span>
        <span class="n">${items.length} după filtre</span>
        <span class="peek">${esc(peek)}</span>
      </summary>
      <ol class="day-list">${list}</ol>
    </details>`);
  }

  if (!blocks.length) {
    box.innerHTML = '<p class="empty">Nicio interogare nu trece filtrele în perioada colectată. Încearcă să oprești „Mod curat" sau să lungești intervalul.</p>';
    sub.textContent = '0 zile';
    return;
  }

  box.innerHTML = blocks.join('');
  sub.textContent = `${blocks.length} zile · top ${perDay} pe zi după filtre`;
}

/* ---------------- estimare (momentum) ---------------- */

function renderForecast() {
  const r = range.result;
  const box = $('#forecastBody');
  const sub = $('#forecastSub');

  if (!r) {
    box.innerHTML = '<p class="empty">Colectează o perioadă ca să vezi estimarea.</p>';
    sub.textContent = '—';
    return;
  }

  const hasMomentum = (r.rows || []).some((x) => x.momentum !== null && x.momentum !== undefined);
  if (!hasMomentum) {
    box.innerHTML = '<p class="empty">Ai nevoie de minim ~21 de zile colectate ca estimarea să aibă sens (comparație 7 zile vs 14 zile).</p>';
    sub.textContent = 'interval prea scurt';
    return;
  }

  const meta = categoryMeta(r);
  const base = filteredRows().filter(
    (x) => typeof x.momentum === 'number' && x.momentum >= 1.12 && (x.recentDays || 0) >= 2,
  );
  const top = base
    .sort((a, b) => b.momentum - a.momentum || (b.recentAvg || 0) - (a.recentAvg || 0))
    .slice(0, 15);

  if (!top.length) {
    box.innerHTML = '<p class="empty">Nimic în creștere clară pentru filtrele curente. Încearcă „Mod curat" oprit sau un interval mai lung.</p>';
    sub.textContent = '0 semnale';
    return;
  }

  sub.textContent = `${top.length} interogări cu trafic în creștere · ultimele 7 zile vs cele 14 dinainte`;

  box.innerHTML = top
    .map((x, i) => {
      const c = meta.get(x.category) || { label: 'Altele', emoji: '📦' };
      const hot = x.momentum >= 1.35;
      return `<div class="fcast-row">
        <span class="pos">${i + 1}</span>
        <span>
          <span class="q">${esc(x.query)}</span>
          <div class="meta">apărut în ${x.recentDays}/7 zile recente · ${x.days} zile în total</div>
        </span>
        <span class="cat">${esc(c.emoji)} ${esc(c.label)}</span>
        <span class="mom ${hot ? 'hot' : ''}">×${x.momentum.toFixed(2)}</span>
      </div>`;
    })
    .join('');
}

/* ---------------- evenimente recurente ---------------- */

async function fetchEvents() {
  const geo = $('#rCountry').value || 'RO';
  try {
    const res = await fetch(`/api/events?geo=${encodeURIComponent(geo)}&days=75`);
    const data = await res.json();
    range.events = data.events || [];
  } catch {
    range.events = [];
  }
  renderEvents();
}

function formatEventDate(isoDate) {
  const [, m, d] = isoDate.split('-');
  return `${d}.${m}`;
}

function renderEvents() {
  const box = $('#eventsBody');
  const sub = $('#eventsSub');
  const events = range.events || [];

  if (!events.length) {
    box.innerHTML = '<p class="empty">Niciun eveniment recurent în perioada următoare.</p>';
    sub.textContent = '—';
    return;
  }

  sub.textContent = `următoarele 75 de zile · ${events.length} evenimente`;
  box.innerHTML = events
    .map((e) => {
      const when =
        e.daysUntil <= 0 ? 'azi' : e.daysUntil === 1 ? 'mâine' : e.daysUntil < 14 ? `peste ${e.daysUntil}z` : `peste ${e.daysUntil}z`;
      const chips = (e.keywords || [])
        .slice(0, 4)
        .map((k) => `<span class="chip">${esc(k)}</span>`)
        .join('');
      return `<div class="event">
        <span class="date">${esc(formatEventDate(e.date))}${e.approx ? ' <span class="hint">aprox.</span>' : ''}</span>
        <span>
          <span class="name">${esc(e.name)}</span>
          <div class="why">${esc(e.why)}</div>
          ${chips ? `<div class="chips">${chips}</div>` : ''}
        </span>
        <span class="in ${e.daysUntil <= 7 ? 'now' : ''}">${esc(when)}</span>
      </div>`;
    })
    .join('');
}

/* ---------------- export perioadă ---------------- */

function exportRangeJson() {
  const r = range.result;
  if (!r) return;
  download(`youtube-tabel-${r.geo}-${r.from}_${r.to}.json`, JSON.stringify(r, null, 2), 'application/json');
}

function exportRangeCsv() {
  const r = range.result;
  if (!r) return;
  const rows = filteredRows();
  const meta = categoryMeta(r);
  const lines = ['loc,interogare,categorie,zile_aparitie,trafic_cumulat_estimat,loc_minim,prima_zi,ultima_zi,consistenta'];
  rows.forEach((x, i) => {
    const c = meta.get(x.category);
    lines.push(
      [
        i + 1,
        csvCell(x.query),
        csvCell(c ? c.label : 'Altele'),
        x.days,
        x.totalTraffic,
        x.bestRank,
        x.firstSeen,
        x.lastSeen,
        x.consistency,
      ].join(','),
    );
  });
  download(`youtube-tabel-${r.geo}-${r.from}_${r.to}.csv`, `\uFEFF${lines.join('\n')}`, 'text/csv;charset=utf-8');
}


/* ===================================================================
   CRAWLER DE SUGESTII (autocomplete YouTube)
   =================================================================== */

const harv = {
  jobId: null,
  job: null,
  result: null,
  pollTimer: null,
  search: '',
  sort: 'score',
  onlyNew: false,
  shown: 300,
};

async function initHarvest() {
  const fill = (sel) => {
    sel.innerHTML = state.countries
      .map((c) => `<option value="${esc(c.code)}">${esc(c.flag)} ${esc(c.name)} (${esc(c.code)})</option>`)
      .join('');
  };
  fill($('#hCountry'));
  $('#hCountry').value = localStorage.getItem('ytp.geo') || 'RO';
  if (!$('#hCountry').value) $('#hCountry').value = 'RO';
  $('#hHl').value = localStorage.getItem('ytp.hl') || ($('#hCountry').value === 'RO' ? 'ro' : 'en');
  $('#hDepth').value = localStorage.getItem('ytp.hdepth') || '2';
  $('#hDemo').checked = localStorage.getItem('ytp.hdemo') === '1';

  $('#hStart').addEventListener('click', startHarvest);
  $('#hCancel').addEventListener('click', cancelHarvest);
  $('#hSearch').addEventListener('input', (e) => {
    harv.search = e.target.value.trim().toLowerCase();
    harv.shown = 300;
    renderHarvestTable();
  });
  $('#hSort').addEventListener('change', (e) => {
    harv.sort = e.target.value;
    renderHarvestTable();
  });
  $('#hOnlyNew').addEventListener('change', (e) => {
    harv.onlyNew = e.target.checked;
    harv.shown = 300;
    renderHarvestTable();
  });
  $('#hMore').addEventListener('click', () => {
    harv.shown += 300;
    renderHarvestTable();
  });
  $('#hCountry').addEventListener('change', () => {
    $('#hHl').value = $('#hCountry').value === 'RO' ? 'ro' : 'en';
    loadHarvestLatest();
  });

  await loadHarvestLatest();

  const saved = localStorage.getItem('ytp.hjob');
  if (saved) resumeHarvest(saved);
}

async function loadHarvestLatest() {
  const geo = $('#hCountry').value || 'RO';
  try {
    const res = await fetch(`/api/harvest/latest?geo=${encodeURIComponent(geo)}`);
    const data = await res.json();
    if (!data.latest) {
      $('#hSub').textContent = 'nicio rulare anterioară salvată';
      return;
    }
    harv.result = {
      geo,
      terms: data.latest.terms,
      stats: { ...data.latest.stats, uniqueTerms: data.latest.total },
      finishedAt: data.latest.finishedAt,
      fromSnapshot: true,
    };
    renderHarvest();
  } catch {
    /* ignoram */
  }
}

async function startHarvest() {
  const geo = $('#hCountry').value || 'RO';
  const hl = $('#hHl').value || 'ro';
  const depth = Number($('#hDepth').value) || 2;
  const demo = $('#hDemo').checked;
  const extraSeeds = $('#hSeeds')
    .value.split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 30);

  localStorage.setItem('ytp.hl', hl);
  localStorage.setItem('ytp.hdepth', String(depth));
  localStorage.setItem('ytp.hdemo', demo ? '1' : '0');
  localStorage.setItem('ytp.geo', geo);

  $('#hStart').disabled = true;
  setPill('busy', 'colectez');
  $('#hWarnings').classList.add('hidden');
  $('#hWarnings').innerHTML = '';

  try {
    const res = await fetch('/api/harvest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ geo, hl, depth, demo, extraSeeds, maxExpansion: 40 }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showHarvestWarning(data.error || 'Nu am putut porni colectarea.');
      $('#hStart').disabled = false;
      setPill('error', 'eroare');
      return;
    }
    harv.jobId = data.jobId;
    harv.job = data.job;
    localStorage.setItem('ytp.hjob', data.jobId);
    showHarvestJob(data.job);
    pollHarvest(data.jobId);
  } catch (err) {
    showHarvestWarning(`Serverul nu a răspuns: ${err.message}`);
    $('#hStart').disabled = false;
    setPill('error', 'eroare');
  }
}

async function cancelHarvest() {
  if (!harv.jobId) return;
  try {
    await fetch(`/api/harvest/${encodeURIComponent(harv.jobId)}/cancel`, { method: 'POST' });
  } catch {
    /* ignoram */
  }
}

async function resumeHarvest(id) {
  try {
    const res = await fetch(`/api/harvest/${encodeURIComponent(id)}`);
    if (!res.ok) {
      localStorage.removeItem('ytp.hjob');
      return;
    }
    const data = await res.json();
    harv.jobId = id;
    harv.job = data.job;
    showHarvestJob(data.job);
    if (['running', 'queued', 'cancelling'].includes(data.job.status)) {
      switchTab('harvest');
      pollHarvest(id);
    } else if (data.result) {
      harv.result = data.result;
      switchTab('harvest');
      renderHarvest();
    }
  } catch {
    /* job expirat */
  }
}

function showHarvestJob(job) {
  $('#hJobBar').classList.remove('hidden');
  const p = job.progress || {};
  const pct = job.status === 'done' ? 100 : p.pct || 0;
  $('#hJobTitle').textContent =
    job.status === 'done'
      ? 'Gata'
      : job.status === 'cancelled'
        ? 'Anulat'
        : job.status === 'error'
          ? 'Eroare'
          : job.demo
            ? 'Generez sugestii demo…'
            : 'Colectez sugestii de la YouTube…';
  $('#hJobFill').style.width = `${pct}%`;
  const parts = [`${pct}%`, `${p.index || 0}/${p.total || '?'} cereri`, `${p.terms || 0} termeni`];
  if (p.level === 2) parts.push('nivelul 2 (expandare)');
  if (p.currentSeed) parts.push(`„${p.currentSeed}"`);
  $('#hJobText').textContent = parts.join(' · ');
  $('#hCancel').classList.toggle('hidden', !['running', 'queued', 'cancelling'].includes(job.status));
}

function pollHarvest(id) {
  if (harv.pollTimer) clearInterval(harv.pollTimer);
  const tick = async () => {
    try {
      const res = await fetch(`/api/harvest/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) {
        clearInterval(harv.pollTimer);
        harv.pollTimer = null;
        return;
      }
      harv.job = data.job;
      showHarvestJob(data.job);
      if (['done', 'cancelled', 'error'].includes(data.job.status)) {
        clearInterval(harv.pollTimer);
        harv.pollTimer = null;
        $('#hStart').disabled = false;
        if (data.job.status === 'error') {
          setPill('error', 'eroare');
          showHarvestWarning(data.job.error || 'Colectarea a eșuat.');
          return;
        }
        if (data.result) {
          harv.result = data.result;
          renderHarvest();
        }
      }
    } catch {
      clearInterval(harv.pollTimer);
      harv.pollTimer = null;
      $('#hStart').disabled = false;
      setPill('error', 'eroare');
    }
  };
  tick();
  harv.pollTimer = setInterval(tick, 1200);
}

function showHarvestWarning(text) {
  const box = $('#hWarnings');
  box.classList.remove('hidden');
  box.innerHTML = `<div class="warn-item error"><span class="ico">⛔</span><span>${esc(text)}</span></div>`;
}

function renderHarvest() {
  const r = harv.result;
  if (!r) return;

  const stats = r.stats || {};
  refreshPill();

  const cards = [
    { k: 'Termeni unici', v: nf.format(stats.uniqueTerms || r.terms.length), m: `${stats.seedsQueried || '—'} prefixe interogate` },
    { k: 'Termeni noi', v: nf.format(stats.newTerms || 0), m: stats.previousRunAt ? `față de ${stats.previousRunAt.slice(0, 10)}` : 'prima rulare' },
    { k: 'Cereri', v: nf.format(stats.requests || 0), m: `${Math.round((stats.durationMs || 0) / 1000)}s durată` },
    { k: 'Țara / limba', v: `${r.geo} / ${r.hl || 'ro'}`, m: r.fromSnapshot ? 'rulare anterioară' : 'proaspăt' },
  ];
  $('#hStats').innerHTML = cards
    .map((c) => `<div class="stat"><div class="k">${esc(c.k)}</div><div class="v">${esc(c.v)}</div><div class="m">${esc(c.m)}</div></div>`)
    .join('');

  $('#hGeneratedAt').textContent = r.finishedAt ? `rulat ${new Date(r.finishedAt).toLocaleString('ro-RO')}` : '';
  $('#hSub').textContent = `${nf.format(r.terms.length)} termeni · ${r.fromSnapshot ? 'din ultima rulare salvată' : 'colectare nouă'}`;

  if (r.errors && r.errors.length) {
    showHarvestWarning(`${r.errors.length} prefixe au eșuat (ex. „${r.errors[0].seed}": ${r.errors[0].error}). Reîncearcă — ce a mers e deja în cache.`);
  }

  renderHarvestTable();
}

function harvestRows() {
  const r = harv.result;
  if (!r) return [];
  let rows = [...r.terms];
  if (harv.onlyNew) rows = rows.filter((t) => t.isNew);
  if (harv.search) rows = rows.filter((t) => t.term.toLowerCase().includes(harv.search));

  if (harv.sort === 'appearances') rows.sort((a, b) => b.appearances - a.appearances || b.score - a.score);
  else if (harv.sort === 'alpha') rows.sort((a, b) => a.term.localeCompare(b.term, 'ro'));
  else if (harv.sort === 'new') rows.sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.score - a.score);
  else rows.sort((a, b) => b.score - a.score || b.appearances - a.appearances);

  return rows;
}

function renderHarvestTable() {
  const rows = harvestRows();
  const shown = rows.slice(0, harv.shown);

  $('#hBody').innerHTML = shown
    .map((t, i) => {
      const seeds = (t.seeds || [])
        .slice(0, 4)
        .map((s) => `<span class="chip">${esc(s)}</span>`)
        .join('');
      return `<tr>
        <td class="col-n">${i + 1}</td>
        <td class="rq">${esc(t.term)}</td>
        <td class="col-num">${t.score.toFixed(1)}</td>
        <td class="col-num">${t.appearances}</td>
        <td class="col-num">#${t.bestRank}</td>
        <td><div class="chips">${seeds}</div></td>
        <td>${t.isNew ? '<span class="badge-new">NOU</span>' : ''}</td>
      </tr>`;
    })
    .join('');

  if (!rows.length) {
    $('#hBody').innerHTML = '<tr><td colspan="7" class="empty" style="padding:18px">Nicio sugestie pentru filtrele curente.</td></tr>';
  }

  $('#hCount').textContent = `${nf.format(rows.length)} sugestii${rows.length > shown.length ? ` · afișate ${nf.format(shown.length)}` : ''}`;
  $('#hMore').classList.toggle('hidden', rows.length <= shown.length);
}

function exportHarvestJson() {
  const r = harv.result;
  if (!r) return;
  download(`youtube-sugestii-${r.geo}.json`, JSON.stringify(r, null, 2), 'application/json');
}

function exportHarvestCsv() {
  const r = harv.result;
  if (!r) return;
  const rows = harvestRows();
  const lines = ['loc,termen,scor,aparitiI,cel_mai_bun_loc,medie_loc,surse,nou'];
  rows.forEach((t, i) => {
    lines.push(
      [i + 1, csvCell(t.term), t.score, t.appearances, t.bestRank, t.avgRank, csvCell((t.seeds || []).join(' | ')), t.isNew ? 'da' : 'nu'].join(','),
    );
  });
  download(`youtube-sugestii-${r.geo}.csv`, `\uFEFF${lines.join('\n')}`, 'text/csv;charset=utf-8');
}

/* ---------------- analiză canal (export CSV vidIQ) ---------------- */

const vzInt = (n) => nf.format(Math.round(Number(n) || 0));
const vzPct = (x) => `${(Number(x) * 100).toFixed(2)}%`;
const vzDur = (s) => {
  const t = Math.round(Number(s) || 0);
  if (!t) return '—';
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
const vzDate = (iso) => (iso ? iso.split('-').reverse().join('.') : '—');

function showVidiqWarnings(list) {
  const box = $('#vzWarn');
  if (!list || !list.length) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.classList.remove('hidden');
  box.innerHTML = list
    .map((w) => {
      const ico = w.level === 'error' ? '⛔' : w.level === 'info' ? 'ℹ' : '⚠';
      return `<div class="warn-item ${w.level === 'error' ? 'error' : ''}"><span class="ico">${ico}</span><span>${esc(w.text)}</span></div>`;
    })
    .join('');
}

function initVidiq() {
  $('#vzPick').addEventListener('click', () => $('#vzFile').click());
  $('#vzFile').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) await loadVidiqFile(file);
  });

  const drop = $('#vzDrop');
  for (const ev of ['dragenter', 'dragover']) {
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add('over');
    });
  }
  for (const ev of ['dragleave', 'drop']) {
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.remove('over');
    });
  }
  drop.addEventListener('drop', async (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) await loadVidiqFile(file);
  });

  $('#vzParsePaste').addEventListener('click', () => {
    const text = $('#vzPaste').value.trim();
    if (!text) return showVidiqWarnings([{ level: 'error', text: 'Lipește întâi CSV-ul.' }]);
    ingestVidiq(text, 'text lipit');
  });

  $('#vzSort').value = state.vidiqSort;
  $('#vzSort').addEventListener('change', () => {
    state.vidiqSort = $('#vzSort').value;
    renderVidiqVideos();
  });

  $('#vzExport').addEventListener('click', exportVidiq);
  $('#vzCopyKw').addEventListener('click', copyVidiqKeywords);
  $('#vzClear').addEventListener('click', () => {
    localStorage.removeItem('ytp.vidiq');
    state.vidiq = null;
    $('#vzPaste').value = '';
    renderVidiq();
    refreshPill();
  });

  const saved = localStorage.getItem('ytp.vidiq');
  if (saved) {
    try {
      const obj = JSON.parse(saved);
      if (obj && obj.csv) ingestVidiq(obj.csv, obj.name || 'fișier salvat', { silent: true });
    } catch {
      localStorage.removeItem('ytp.vidiq');
    }
  }
  renderVidiq();
}

async function loadVidiqFile(file) {
  try {
    const text = await file.text();
    ingestVidiq(text, file.name || 'export.csv');
  } catch (err) {
    showVidiqWarnings([{ level: 'error', text: `Nu am putut citi fișierul: ${err.message}` }]);
  }
}

function ingestVidiq(text, name, { silent = false } = {}) {
  const result = analyzeCsv(text, { fileName: name });
  state.vidiq = result;
  try {
    if (text.length <= 2_000_000) localStorage.setItem('ytp.vidiq', JSON.stringify({ name, csv: text }));
    else if (!silent) showVidiqWarnings([{ level: 'info', text: 'Fișierul e mare — analiza merge, dar nu îl pot ține minte după refresh.' }]);
  } catch {
    /* quota depășită — analiza rămâne în memorie */
  }
  renderVidiq();
  refreshPill();
  return result;
}

function renderVidiq() {
  const r = state.vidiq;
  const has = Boolean(r && r.videos.length);

  $('#vzActions').classList.toggle('hidden', !has);
  $('#vzSource').textContent = has
    ? `${r.fileName} · ${vzInt(r.videos.length)} videoclipuri · ${r.columns.length} coloane`
    : 'niciun fișier încărcat';

  if (!has) {
    $('#vzStats').innerHTML = '';
    for (const id of ['#vzVideoBody', '#vzKwCommonBody', '#vzKwRareBody', '#vzWordBody', '#vzBigramBody', '#vzDays']) {
      $(id).innerHTML = '';
    }
    $('#vzVideoSub').textContent = '';
    $('#vzKwSub').textContent = '';
    $('#vzDaysSub').textContent = '';
    showVidiqWarnings(r && r.warnings ? r.warnings.map((t) => ({ level: 'error', text: t })) : []);
    return;
  }

  showVidiqWarnings(r.warnings.map((t) => ({ level: 'info', text: t })));

  const s = r.summary;
  $('#vzStats').innerHTML = [
    { k: 'Videoclipuri', v: vzInt(s.count), m: s.spanDays ? `${vzDate(s.dateFrom)} → ${vzDate(s.dateTo)} · ${s.spanDays} zile` : '' },
    { k: 'Views total', v: vzInt(s.totalViews), m: `medie ${vzInt(s.avgViews)} · mediană ${vzInt(s.medianViews)}` },
    { k: 'Like / comentarii', v: `${vzPct(s.likeRate)}`, m: `${vzInt(s.totalLikes)} like · ${vzInt(s.totalComments)} comentarii · ${vzPct(s.commentRate)}` },
    {
      k: 'Shorts vs. video lung',
      v: `${s.shorts.count} / ${s.longs.count}`,
      m: `short mediu ${vzInt(s.shorts.avgViews)} · lung mediu ${vzInt(s.longs.avgViews)}`,
    },
    {
      k: 'Scor vidIQ mediu',
      v: s.avgScore.toFixed(1),
      m: `corelație cu views: ${s.cardScoreCorr >= 0 ? '+' : ''}${s.cardScoreCorr.toFixed(2)} (nu e cauzalitate)`,
    },
    { k: 'Ritm de publicare', v: `${s.uploadsPerDay.toFixed(1)}/zi`, m: s.spanDays ? `${s.count} videoclipuri în ${s.spanDays} zile` : '' },
    {
      k: 'Keywords distincte',
      v: vzInt(s.distinctKeywords),
      m: s.videosWithoutKeywords ? `${s.videosWithoutKeywords} videoclipuri fără keywords` : 'toate au keywords',
    },
  ]
    .map((c) => `<div class="stat"><div class="k">${esc(c.k)}</div><div class="v">${esc(c.v)}</div><div class="m">${esc(c.m)}</div></div>`)
    .join('');

  renderVidiqVideos();
  renderVidiqKeywords();
  renderVidiqWords();
  renderVidiqDays();
}

function vidiqSorted() {
  const list = [...state.vidiq.videos];
  const sort = state.vidiqSort;
  const cmp = {
    views: (a, b) => b.views - a.views,
    score: (a, b) => b.score - a.score,
    date: (a, b) => (a.dateISO < b.dateISO ? 1 : a.dateISO > b.dateISO ? -1 : b.views - a.views),
    engagement: (a, b) => b.engagementRate - a.engagementRate,
    duration: (a, b) => b.durationSec - a.durationSec,
  }[sort] || ((a, b) => b.views - a.views);
  return list.sort(cmp);
}

function renderVidiqVideos() {
  const r = state.vidiq;
  if (!r || !r.videos.length) return;
  const rows = vidiqSorted();
  const labels = { views: 'views', score: 'scor vidIQ', date: 'cele mai noi', engagement: 'engagement', duration: 'durată' };
  $('#vzVideoSub').textContent = `${vzInt(rows.length)} videoclipuri · sortate după ${labels[state.vidiqSort] || 'views'}`;
  $('#vzVideoBody').innerHTML = rows
    .map(
      (v, i) => `<tr>
        <td class="tnum">${i + 1}</td>
        <td class="title-cell">${v.url ? `<a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a>` : esc(v.title)}${v.isShort ? ' <span class="chip-short">short</span>' : ''}</td>
        <td class="tnum">${esc(vzDate(v.dateISO))}</td>
        <td class="tnum">${esc(vzDur(v.durationSec))}</td>
        <td class="tnum num">${vzInt(v.views)}</td>
        <td class="tnum num">${vzInt(v.likes)}</td>
        <td class="tnum num">${vzInt(v.comments)}</td>
        <td class="tnum num">${vzPct(v.engagementRate)}</td>
        <td class="tnum num">${v.score.toFixed(1)}</td>
        <td class="tnum num">${vzInt(v.keywords.length)}</td>
      </tr>`,
    )
    .join('');
}

function renderVidiqKeywords() {
  const r = state.vidiq;
  if (!r || !r.videos.length) return;
  const common = r.keywords.filter((k) => k.share >= 0.7);
  const rare = r.keywords
    .filter((k) => k.share < 0.7)
    .sort((a, b) => a.videos - b.videos || b.avgViews - a.avgViews)
    .slice(0, 60);
  $('#vzKwSub').textContent = `${vzInt(r.keywords.length)} distincte · ${common.length} în peste 70% din videoclipuri · ${rare.length} distinctive`;

  const row = (cells) => `<tr>${cells.map((c, i) => `<td${i ? ' class="tnum num"' : ''}>${c}</td>`).join('')}</tr>`;
  $('#vzKwCommonBody').innerHTML = common.length
    ? common.map((k) => row([esc(k.term), vzInt(k.videos), vzInt(k.views)])).join('')
    : '<tr><td colspan="3">—</td></tr>';
  $('#vzKwRareBody').innerHTML = rare.length
    ? rare.map((k) => row([esc(k.term), vzInt(k.videos), vzInt(k.avgViews)])).join('')
    : '<tr><td colspan="3" class="kw-none">Toate tag-urile se repetă în aproape toate videoclipurile — canalul folosește aceeași listă copiată. Nimic distinctiv de scos la iveală.</td></tr>';
}

function renderVidiqWords() {
  const r = state.vidiq;
  if (!r || !r.videos.length) return;
  const row = (a) => `<tr><td>${esc(a.term)}</td><td class="tnum num">${vzInt(a.videos)}</td><td class="tnum num">${vzInt(a.avgViews)}</td></tr>`;
  $('#vzWordBody').innerHTML = r.words.slice(0, 30).map(row).join('') || '<tr><td colspan="3">—</td></tr>';
  const bigrams = [...r.bigrams].sort((a, b) => b.videos - a.videos || b.avgViews - a.avgViews);
  $('#vzBigramBody').innerHTML = bigrams.slice(0, 30).map(row).join('') || '<tr><td colspan="3">—</td></tr>';
}

function renderVidiqDays() {
  const r = state.vidiq;
  if (!r || !r.videos.length) return;
  const days = r.days.slice(0, 45);
  const max = Math.max(...days.map((d) => d.views), 1);
  $('#vzDaysSub').textContent = `${days.length} zile cu publicări · max ${vzInt(max)} views/zi`;
  $('#vzDays').innerHTML = days
    .map(
      (d) => `<div class="vz-day">
        <span class="d">${esc(vzDate(d.dateISO))}</span>
        <span class="bar"><i style="width:${Math.max(2, Math.round((d.views / max) * 100))}%"></i></span>
        <span class="v">${vzInt(d.views)} views · ${vzInt(d.videos)} clip${d.videos === 1 ? '' : 'uri'}</span>
      </div>`,
    )
    .join('');
}

function exportVidiq() {
  const r = state.vidiq;
  if (!r || !r.videos.length) return;
  const payload = {
    fileName: r.fileName,
    generatedAt: new Date().toISOString(),
    summary: r.summary,
    videos: r.videos,
    keywords: r.keywords,
    words: r.words,
    bigrams: r.bigrams,
    days: r.days,
  };
  download(
    `analiza-canal-${(r.fileName || 'vidiq').replace(/\.csv$/i, '').replace(/[^\w.-]+/g, '-').slice(0, 40)}.json`,
    JSON.stringify(payload, null, 2),
    'application/json;charset=utf-8',
  );
}

async function copyVidiqKeywords() {
  const r = state.vidiq;
  if (!r || !r.keywords.length) return;
  const text = r.keywords.map((k) => k.term).join(', ');
  const btn = $('#vzCopyKw');
  const label = btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = `copiat ${r.keywords.length} keywords`;
  } catch {
    btn.textContent = 'copiere blocată — vezi consola';
    console.log(text);
  }
  setTimeout(() => {
    btn.textContent = label;
  }, 2200);
}

/* ---------------- căutări reale care aduc canalul în rezultate ---------------- */

async function loadChannelMatch({ force = false } = {}) {
  if (state.channelLoading) return;
  if (state.channelMatch && !force) return;
  state.channelLoading = true;
  const box = $('#vzChannelWarn');
  try {
    const geo = localStorage.getItem('ytp.geo') || 'RO';
    const res = await fetch(`/api/channel/latest?geo=${encodeURIComponent(geo)}`);
    const data = await res.json();
    state.channelMatch = data.latest || null;
  } catch {
    state.channelMatch = null;
  } finally {
    state.channelLoading = false;
  }
  renderChannelMatch();
}

function renderChannelMatch() {
  const r = state.channelMatch;
  const box = $('#vzChannelWarn');
  if (!r) {
    box.classList.remove('hidden');
    box.innerHTML =
      '<div class="warn-item"><span class="ico">ℹ</span><span>Nu există încă o rulare pentru țara asta. ' +
      'Se generează cu <code>node cli.js --channel-match</code> (sau automat, în GitHub Actions).</span></div>';
    $('#vzChannelStats').innerHTML = '';
    $('#vzChannelBody').innerHTML = '';
    $('#vzChannelSub').textContent = 'fără date';
    $('#vzChannelFoot').textContent = '';
    return;
  }
  box.classList.add('hidden');
  box.innerHTML = '';

  const s = r.stats || {};
  const tested = s.queriesTested || 0;
  const matched = s.matched || 0;
  const rate = tested ? Math.round((matched / tested) * 100) : 0;
  $('#vzChannelSub').textContent = `${r.target?.name || 'canal'} · ${matched}/${tested} căutări (${rate}%)`;
  $('#vzChannelStats').innerHTML = [
    { k: 'Căutări testate', v: nf.format(tested), m: `${nf.format(s.requests || 0)} cereri către YouTube` },
    { k: 'Aduc canalul', v: nf.format(matched), m: `${rate}% din interogările relevante` },
    { k: 'În top 3', v: nf.format(s.matchedTop3 || 0), m: `top 10: ${nf.format(s.matchedTop10 || 0)}` },
    { k: 'Rulat la', v: r.finishedAt ? r.finishedAt.slice(0, 10) : '—', m: `${Math.round((s.durationMs || 0) / 1000)}s · ${s.method || '—'}` },
  ]
    .map((c) => `<div class="stat"><div class="k">${esc(c.k)}</div><div class="v">${esc(c.v)}</div><div class="m">${esc(c.m)}</div></div>`)
    .join('');

  const rows = (r.matches || []).slice(0, 80);
  $('#vzChannelBody').innerHTML = rows.length
    ? rows
        .map(
          (m) => `<tr>
            <td class="tnum">#${m.position}</td>
            <td class="title-cell">${esc(m.query)}</td>
            <td class="tnum num">${m.position}</td>
            <td class="title-cell"><a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.title)}</a></td>
            <td class="tnum">${m.via === 'video' ? 'videoclip din CSV' : 'canal'}</td>
          </tr>`,
        )
        .join('')
    : '<tr><td colspan="5" class="kw-none">Nicio potrivire — canalul nu apare în primele 20 de rezultate pentru interogările testate.</td></tr>';

  const errs = r.errors?.length || 0;
  $('#vzChannelFoot').textContent = [
    `${matched} căutări aduc canalul în primele 20 de rezultate`,
    s.noMatch ? `${nf.format(s.noMatch)} testate fără potrivire` : '',
    errs ? `${errs} cereri au eșuat` : '',
    s.method ? `metodă: ${s.method}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

init();
