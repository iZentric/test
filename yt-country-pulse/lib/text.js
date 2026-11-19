// Utilitare de text: normalizare (fara diacritice, lowercase) si potrivire pe liste de cuvinte.

export function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text) {
  return normalizeText(text).split(' ').filter(Boolean);
}

/** true daca vreun termen apare ca prefix de cuvant sau ca fraza in text */
export function containsAny(text, terms) {
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

/** filtreaza lista de stringuri dupa o lista de termeni blocati (pastreaza ce nu e blocat) */
export function rejectMatching(items, terms) {
  const blocked = (terms || []).map(normalizeText).filter(Boolean);
  if (!blocked.length) return items;
  return items.filter((item) => !containsAny(item, blocked));
}
