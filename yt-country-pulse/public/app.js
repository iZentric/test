// UI — vanilă, fără framework. Vorbește doar cu /api/pulse.

const $ = (sel) => document.querySelector(sel);

const state = {
  countries: [],
  lastPayload: null,
  busy: false,
  activeView: 'day',
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

  load();
  if (state.activeView !== 'range') switchTab('day');
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

  const pillKind = demo ? 'demo' : mode === 'live' ? 'live' : mode === 'partial' ? 'partial' : 'error';
  const pillText = demo ? 'date demo' : mode === 'live' ? 'live' : mode === 'partial' ? 'parțial' : 'fără date';
  setPill(pillKind, pillText);

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

function renderStats(payload) {
  const searches = payload.trendingSearches?.items || [];
  const videos = payload.trendingVideos || [];
  const seedPoints = payload.seed?.points || [];

  const totalTraffic = searches.reduce((sum, s) => sum + (s.trafficValue || 0), 0);
  const peak = seedPoints.reduce((max, p) => Math.max(max, p.value || 0), 0);
  const topVideo = videos[0];

  const cards = [
    {
      k: 'Căutări în trend',
      v: searches.length || '—',
      m: searches.length ? `≈ ${nfCompact.format(totalTraffic)} căutări estimate, cumulat` : 'indisponibil',
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
  const items = payload.trendingSearches?.items || [];
  const box = $('#searches');
  const sub = $('#searchesSub');

  if (!items.length) {
    box.innerHTML = '<p class="empty">Google Trends nu a returnat căutări pentru această țară și zi.</p>';
    sub.textContent = 'Google Trends';
    return;
  }

  sub.textContent = `top ${items.length} · ${payload.demo ? 'demo' : 'Google Trends'}`;
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
  excluded: new Set(),
  search: '',
  sort: 'days',
  minDays: 1,
  shown: 300,
};

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

function switchTab(name) {
  state.activeView = name === 'range' ? 'range' : 'day';
  document.querySelectorAll('.tab').forEach((b) => {
    const on = b.dataset.tab === state.activeView;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  $('#view-day').classList.toggle('hidden', state.activeView !== 'day');
  $('#view-range').classList.toggle('hidden', state.activeView !== 'range');
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
    renderTable();
  });
  $('#rMinDays').addEventListener('change', (e) => {
    range.minDays = Number(e.target.value) || 1;
    range.shown = 300;
    renderTable();
  });
  $('#rMore').addEventListener('click', () => {
    range.shown += 300;
    renderTable();
    });

  const saved = localStorage.getItem('ytp.job');
  if (saved) resumeJob(saved);
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

  range.excluded = new Set();
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

  setPill(r.demo ? 'demo' : 'live', r.demo ? 'date demo' : 'tabel live');

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

function filteredRows() {
  const r = range.result;
  if (!r) return [];
  let rows = (r.rows || []).filter((x) => !range.excluded.has(x.category));
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

init();
