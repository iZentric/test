// Generator de tag-uri pe bază de dovezi: ce caută lumea real (autocomplete RO) și ce
// interogări chiar aduc canalul în rezultate. Pur — fără DOM.

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// nume de creatori / canale — tag-uri cu ele nu ajută, doar umplu limita
const CREATORS = new Set(
  norm(
    `izentric nocivanu skincraft iraphahell isilent xslayder ihatepink iugin highman maxinfinite
     marius iancu snik codrin rapha werty zbir bercea sora sammy viktoria berceni justitiarul
     mrbeast pewdiepie sssniperwolf`,
  ).split(' '),
);

const STOP = new Set(
  norm(
    `a ai al ale am are asa asta au ca cam care ce cel ceva cine cum cu da dar de din doar dupa ea ei el
     ele era este eu fac fara fi fie fost iar il in la le lui mai ma mea mi mult nu o ori pe pentru
     peste sa sai sau se si sunt ta tale tau te ti toata toate tot totul tu un una unde va vom vor
     vs the and for you your new nou no`,
  ).split(' '),
);

const GENERIC = new Set(
  norm(`youtube video videos joc jocuri gaming game romania romana romane ro online free gratis hd 4k`).split(' '),
);

const KIND_ORDER = { titlu: 0, aduce: 1, cautat: 2, creator: 3, existent: 4, generic: 5 };

/**
 * @param {object} o
 * @param {string} o.title            titlul videoclipului
 * @param {string} [o.existing]       tag-urile pe care le folosești deja (virgulă)
 * @param {Array}  [o.terms]          termeni reali din autocomplete: {term, score}
 * @param {Array}  [o.tested]         interogări testate: {query, position|null}
 * @param {Array}  [o.matches]        interogările care aduc canalul: {query, position}
 * @param {number} [o.maxChars]       limita YouTube (500)
 */
export function buildTags({ title = '', existing = '', terms = [], tested = [], matches = [], maxChars = 500, maxTags = 25 } = {}) {
  const titleClean = String(title).trim();
  const titleTokens = norm(titleClean).split(' ').filter((t) => t.length >= 3 && !STOP.has(t));
  const warnings = [];

  const matchByQuery = new Map(matches.map((m) => [norm(m.query), m.position]));
  const positionByQuery = new Map(
    (tested || []).filter((t) => t.position).map((t) => [norm(t.query), t.position]),
  );

  const entries = new Map();
  const dropped = [];
  const push = (tag, kind, why, extra = {}) => {
    const key = norm(tag);
    if (!key || key.length < 3) return;
    const current = entries.get(key);
    if (current && KIND_ORDER[current.kind] <= KIND_ORDER[kind]) return;
    entries.set(key, { tag: tag.trim(), kind, why, ...extra });
  };

  // 1. titlul exact — YouTube îl potrivește cel mai bine
  if (titleClean) push(titleClean, 'titlu', 'titlul exact: cea mai bună potrivire pentru căutarea video', {});

  // 2. interogările care chiar aduc canalul
  for (const [query, position] of positionByQuery) {
    const tokens = query.split(' ');
    const relates = tokens.some((t) => titleTokens.includes(t)) || titleTokens.length === 0;
    if (!relates) continue;
    push(query, 'aduce', `poziția #${position} în căutarea YouTube`, { position });
  }

  // 3. termeni reali din autocomplete, legați de titlu
  for (const item of terms) {
    const term = typeof item === 'string' ? item : item.term;
    if (!term) continue;
    const tokens = norm(term).split(' ');
    const overlap = tokens.filter((t) => titleTokens.includes(t)).length;
    if (!overlap) continue;
    if (tokens.every((t) => GENERIC.has(t) || STOP.has(t))) continue;
    const score = Number(item.score) || 0;
    const creatorBased = tokens.some((t) => CREATORS.has(t));
    push(
      term,
      creatorBased ? 'creator' : 'cautat',
      creatorBased
        ? `căutare reală, dar e numele altui creator · scor ${Math.round(score)}`
        : `căutare reală în RO · scor ${Math.round(score)}`,
      { score, position: matchByQuery.get(norm(term)) || null },
    );
  }

  // 4. tag-urile existente, triate
  const existingList = String(existing)
    .split(/[,\n]/)
    .flatMap((chunk) => {
      const t = chunk.trim();
      // lipit fără virgule: îl spargem în cuvinte, altfel devine un singur „tag" gigantic
      if (t.length > 40 && !t.includes(',')) return t.split(/\s+/);
      return [t];
    })
    .map((t) => t.trim())
    .filter(Boolean);
  for (const tag of existingList) {
    const key = norm(tag);
    const tokens = key.split(' ');
    if (tokens.some((t) => CREATORS.has(t))) {
      push(tag, 'creator', 'nume de creator — păstrează-l doar dacă e canalul tău');
      continue;
    }
    if (tokens.every((t) => GENERIC.has(t) || STOP.has(t))) {
      dropped.push({ tag, why: 'prea generic — concurență uriașă, nimic specific' });
      continue;
    }
    if (tokens.length === 1 && tokens[0].length < 4) {
      dropped.push({ tag, why: 'prea scurt — YouTube îl ignoră' });
      continue;
    }
    push(tag, 'existent', 'tag existent, păstrat');
  }

  // 5. sortare + umplere până la limita de caractere
  const sorted = [...entries.values()].sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (a.position || 99) - (b.position || 99) ||
      (b.score || 0) - (a.score || 0) ||
      b.tag.length - a.tag.length,
  );

  const tags = [];
  let chars = 0;
  // diversitate: max 4 tag-uri care încep la fel, ca lista să nu fie „gta 6" × 15
  const prefixCount = new Map();
  for (const entry of sorted) {
    if (tags.length >= maxTags) {
      dropped.push({ tag: entry.tag, why: `peste plafonul de ${maxTags} tag-uri` });
      continue;
    }
    const add = entry.tag.length + (tags.length ? 2 : 0);
    if (chars + add > maxChars) {
      dropped.push({ tag: entry.tag, why: `nu încape în ${maxChars} caractere` });
      continue;
    }
    const prefix = norm(entry.tag).split(' ').slice(0, 2).join(' ');
    const used = prefixCount.get(prefix) || 0;
    if (used >= 4) {
      dropped.push({ tag: entry.tag, why: 'a cincea variantă a aceleiași expresii — nu mai ajută' });
      continue;
    }
    prefixCount.set(prefix, used + 1);
    chars += add;
    tags.push(entry);
  }

  if (!titleClean) warnings.push('Pune titlul videoclipului: fără el, tag-urile sunt ghicituri.');
  if (titleClean.length > 70) warnings.push('Titlul are peste 70 de caractere — YouTube îl taie în rezultate.');
  if (!matchByQuery.size) warnings.push('Nu există interogări care să aducă canalul în datele curente.');

  return { tags, dropped, chars, maxChars, warnings, titleTokens };
}
