// Tot ce face pagina: ia /api/data o dată și desenează două liste. Nimic altceva.

const $ = (sel) => document.querySelector(sel);
const nf = new Intl.NumberFormat('ro-RO');

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const dataAt = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('ro-RO')} ${d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}`;
};

const state = { harvest: null, channel: null, terms: [], maxScore: 1, matchedQueries: new Set() };

function showError(text) {
  const box = $('#error');
  box.textContent = text;
  box.classList.remove('hidden');
}

function renderChips() {
  const h = state.harvest;
  const c = state.channel;
  const chips = [];
  if (h) {
    chips.push(`<span class="chip">căutări unice <b>${nf.format(h.terms.length)}</b></span>`);
    chips.push(`<span class="chip">prefixe interogate <b>${nf.format(h.stats?.seedsQueried || 0)}</b></span>`);
    chips.push(`<span class="chip">actualizat <b>${esc(dataAt(h.finishedAt))}</b></span>`);
  }
  if (c) {
    chips.push(`<span class="chip">testate pentru canal <b>${nf.format(c.stats?.queriesTested || 0)}</b></span>`);
    chips.push(`<span class="chip">îl aduc în rezultate <b>${nf.format(c.stats?.matched || 0)}</b></span>`);
  }
  $('#chips').innerHTML = chips.join('');
  $('#footLeft').textContent = h ? `autocomplete YouTube · ${h.stats?.requests || 0} cereri · ${Math.round((h.stats?.durationMs || 0) / 1000)}s` : '';
  $('#footRight').textContent = c?.target?.name ? `canal urmărit: ${c.target.name}` : '';
}

function renderMatches() {
  const c = state.channel;
  const box = $('#matches');
  if (!c || !c.matches?.length) {
    $('#matchSub').textContent = c ? 'nicio potrivire în rularea curentă' : 'fără date';
    box.innerHTML = '<p class="muted">Nicio căutare din cele testate nu aduce canalul în primele 20 de rezultate.</p>';
    return;
  }
  $('#matchSub').textContent = `${c.stats.matched} din ${c.stats.queriesTested} căutări · ${c.stats.matchedTop3} pe locul 1–3 · ${dataAt(c.finishedAt)}`;
  box.innerHTML = c.matches
    .map(
      (m) => `<a class="match${m.position <= 3 ? ' top3' : ''}" href="${esc(m.url)}" target="_blank" rel="noopener">
        <span class="pos">#${m.position}</span>
        <span>
          <span class="q">${esc(m.query)}</span>
          <span class="v">
            <b>${esc(m.title)}</b>
            ${m.views ? `<span>${esc(m.views)}</span>` : ''}
            ${m.published ? `<span>${esc(m.published)}</span>` : ''}
            <span>${m.via === 'video' ? 'videoclip din export' : 'alt videoclip al canalului'}</span>
          </span>
        </span>
        <span class="go">deschide pe YouTube ↗</span>
      </a>`,
    )
    .join('');
}

function renderTerms() {
  const q = norm($('#search').value.trim());
  const onlyMatched = $('#onlyMatched').checked;
  const count = $('#count').value;

  let list = state.terms;
  if (q) list = list.filter((t) => norm(t.term).includes(q));
  if (onlyMatched) list = list.filter((t) => state.matchedQueries.has(norm(t.term)));

  const total = list.length;
  if (count !== 'all') list = list.slice(0, Number(count));

  $('#termsSub').textContent = `${nf.format(total)} căutări${total !== list.length ? ` · afișate ${nf.format(list.length)}` : ''}`;

  const max = state.maxScore || 1;
  $('#terms').innerHTML = list
    .map(
      (t, i) => `<li class="term" data-term="${esc(norm(t.term))}">
        <span class="n">${i + 1}</span>
        <span class="t">${esc(t.term)}${t.isNew ? '<span class="badge">nou</span>' : ''}${
          state.matchedQueries.has(norm(t.term)) ? '<span class="badge">aduce canalul</span>' : ''
        }</span>
        <span class="bar"><i style="width:${Math.max(2, Math.round((t.score / max) * 100))}%"></i></span>
        <span class="s">scor ${Math.round(t.score)}</span>
      </li>`,
    )
    .join('');

  $('#termsEmpty').classList.toggle('hidden', list.length > 0);
}

function renderNoMatch() {
  const c = state.channel;
  if (!c) return;
  const noMatch = (c.tested || []).filter((t) => !t.position).map((t) => t.query);
  $('#noMatchCount').textContent = `(${noMatch.length})`;
  $('#noMatch').innerHTML = noMatch.map((t) => `<span class="chip">${esc(t)}</span>`).join('');
}

async function init() {
  let payload;
  try {
    const res = await fetch('/api/data');
    payload = await res.json();
  } catch (err) {
    showError(`Nu pot lua datele de la server: ${err.message}`);
    return;
  }
  if (!payload.harvest) {
    showError('Nu există încă o colectare pentru România. Rulează crawlerul (vezi README) sau așteaptă rularea automată.');
    return;
  }

  state.harvest = payload.harvest;
  state.channel = payload.channel;
  state.terms = [...(payload.harvest.terms || [])].sort((a, b) => b.score - a.score || b.appearances - a.appearances);
  state.maxScore = state.terms[0]?.score || 1;
  state.matchedQueries = new Set((payload.channel?.matches || []).map((m) => norm(m.query)));

  renderChips();
  renderMatches();
  renderTerms();
  renderNoMatch();

  $('#search').addEventListener('input', renderTerms);
  $('#onlyMatched').addEventListener('change', renderTerms);
  $('#count').addEventListener('change', renderTerms);
}

init();
