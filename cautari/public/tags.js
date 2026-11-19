// Generator de tag-uri pe dovezi.
// Regula de bază: tag-urile utilizatorului NU se șterg. Fiecare primește un verdict
// (aduce canalul / apare în căutări reale / fără dovezi în eșantion) și un loc în lista
// de 500 de caractere. Ce nu încape rămâne marcat, nu dispare.

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toks = (s) => norm(s).split(' ').filter(Boolean);

/** Expresia apare ca frază întreagă în text? (`cat` nu se potrivește cu `catel`) */
function hasPhrase(termTokens, tagTokens) {
  if (!tagTokens.length || tagTokens.length > termTokens.length) return false;
  for (let i = 0; i <= termTokens.length - tagTokens.length; i += 1) {
    let ok = true;
    for (let j = 0; j < tagTokens.length; j += 1) {
      if (termTokens[i + j] !== tagTokens[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

const GENERIC = new Set(
  norm(`youtube video videos live stream streaming gaming game joc jocuri update speed demo reactor
        cartoon cat the and for you new nou ro v 2 3 4 5 romania romana romane`).split(' '),
);

const STOP = new Set(
  norm(`a ai al ale am are asa asta au ca cam care ce cel ceva cine cum cu da dar de din doar dupa ea ei el
    ele era este eu fac fara fi fie fost iar il in la le lui mai ma mea mi mult nu o ori pe pentru peste sa
    sai sau se si sunt ta tale tau te ti toata toate tot totul tu un una unde va vom vor vs the and for you
    your new nou no`).split(' '),
);

/**
 * @param {object} o
 * @param {string} o.title      titlul videoclipului (opțional)
 * @param {Array} o.myTags      tag-urile utilizatorului (nu se șterg)
 * @param {Array} o.terms       căutări reale: {term, score}
 * @param {Array} o.tested      interogări testate: {query, position|null}
 * @param {Array} o.matches     interogări care aduc canalul: {query, position}
 * @param {number} [o.maxChars] limita YouTube (500)
 * @param {number} [o.maxTags]  plafon de tag-uri (25)
 */
export function buildTags({ title = '', myTags = [], terms = [], matches = [], maxChars = 500, maxTags = 40, maxNew = 10 } = {}) {
  const titleClean = String(title).trim();
  const titleTokens = toks(titleClean).filter((t) => t.length >= 3 && !STOP.has(t));
  const matchByQuery = new Map((matches || []).map((m) => [norm(m.query), m]));
  const termList = (terms || []).map((t) => {
    const term = typeof t === 'string' ? t : t.term;
    return { term, tokens: toks(term), score: Number(typeof t === 'object' ? t.score : 0) || 0 };
  });

  const warnings = [];
  const items = [];
  const myKeys = new Set();

  if (titleClean) {
    items.push({ tag: titleClean, origin: 'al-tau', kind: 'titlu', why: 'titlul exact — cea mai bună potrivire' });
  }

  // ---- 1. tag-urile utilizatorului, cu verdict ----
  for (const tag of myTags) {
    const key = norm(tag);
    if (!key || myKeys.has(key)) continue;
    myKeys.add(key);
    const tt = toks(tag);

    const singleGeneric = tt.length === 1 && (GENERIC.has(tt[0]) || STOP.has(tt[0]) || tt[0].length <= 2);
    const hit = [...matchByQuery.entries()].find(([q]) => hasPhrase(toks(q), tt));
    if (hit) {
      items.push({
        tag,
        origin: 'al-tau',
        kind: 'aduce',
        position: hit[1].position,
        why: `poziția #${hit[1].position} în căutare`,
      });
      continue;
    }

    if (singleGeneric) {
      items.push({
        tag,
        origin: 'al-tau',
        kind: 'generic',
        why: 'prea generic — umple limita de 500, nu aduce nimic',
      });
      continue;
    }

    const found = termList.filter((t) => hasPhrase(t.tokens, tt));
    if (found.length) {
      items.push({
        tag,
        origin: 'al-tau',
        kind: 'cautat',
        hits: found.length,
        example: found.sort((a, b) => b.score - a.score)[0].term,
        why: `apare în ${found.length} căutări reale (ex. „${found.sort((a, b) => b.score - a.score)[0].term}")`,
      });
      continue;
    }

    const generic = false;
    items.push({
      tag,
      origin: 'al-tau',
      kind: generic ? 'generic' : 'fara-dovezi',
      why: generic ? 'prea generic, fără dovezi' : 'fără dovezi în eșantionul de azi',
    });
  }

  // ---- 2. adăugiri: căutări reale legate de titlu, care nu sunt deja în listă ----
  const additions = [];
  const seenAdd = new Set();
  const add = (term, kind, why, extra = {}) => {
    const key = norm(term);
    if (!key || myKeys.has(key) || seenAdd.has(key)) return;
    seenAdd.add(key);
    additions.push({ tag: term, origin: 'nou', kind, why, ...extra });
  };

  for (const [query, m] of matchByQuery) {
    const tokens = toks(query);
    const relates = !titleTokens.length || tokens.some((t) => titleTokens.includes(t));
    if (relates) add(query, 'aduce', `poziția #${m.position} în căutare`, { position: m.position });
  }

  for (const t of termList) {
    if (!t.term) continue;
    const overlap = t.tokens.filter((x) => titleTokens.includes(x)).length;
    if (!overlap) continue;
    if (t.tokens.every((x) => STOP.has(x))) continue;
    add(t.term, 'cautat', `căutare reală · scor ${Math.round(t.score)}`, { score: t.score });
  }

  additions.sort(
    (a, b) =>
      (a.kind === 'aduce' ? 0 : 1) - (b.kind === 'aduce' ? 0 : 1) ||
      (a.position || 99) - (b.position || 99) ||
      (b.score || 0) - (a.score || 0),
  );

  // ---- 3. ordinea finală ----
  const rank = (it) => {
    if (it.kind === 'titlu') return 0;
    if (it.origin === 'al-tau' && it.kind === 'aduce') return 1;
    if (it.origin === 'nou' && it.kind === 'aduce') return 2;
    if (it.origin === 'nou') return 3;
    if (it.origin === 'al-tau' && it.kind === 'cautat') return 4;
    return 5;
  };
  const all = [...items, ...additions].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.position || 99) - (b.position || 99) ||
      (b.hits || 0) - (a.hits || 0) ||
      (b.score || 0) - (a.score || 0),
  );

  // ---- 4. umplerea bugetului de 500 de caractere ----
  let chars = 0;
  let count = 0;
  let newUsed = 0;
  for (const it of all) {
    const cost = it.tag.length + (count ? 2 : 0);
    const newFull = it.origin === 'nou' && newUsed >= maxNew;
    const fits = !newFull && count < maxTags && chars + cost <= maxChars;
    it.fits = fits;
    if (fits) {
      chars += cost;
      count += 1;
      if (it.origin === 'nou') newUsed += 1;
    }
  }

  const stats = {
    mine: items.length,
    aduce: items.filter((i) => i.kind === 'aduce').length + additions.filter((i) => i.kind === 'aduce').length,
    cautat: items.filter((i) => i.kind === 'cautat').length,
    faraDovezi: items.filter((i) => i.kind === 'fara-dovezi' || i.kind === 'generic').length,
    additions: additions.length,
    used: count,
    chars,
    maxChars,
  };

  if (!titleClean) warnings.push('Fără titlu, adăugirile sunt alese doar după dovezi — pune titlul pentru tag-uri pe video.');
  if (!termList.length) warnings.push('Fără căutări reale încărcate — verdictul „cautat" nu poate fi calculat.');

  return {
    items: all,
    copyFits: all.filter((i) => i.fits).map((i) => i.tag.toLowerCase()).join(', '),
    copyAll: all.map((i) => i.tag.toLowerCase()).join(', '),
    stats,
    warnings,
    titleTokens,
  };
}
