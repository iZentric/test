// Clasificare pe categorii, pe baza de cuvinte-cheie (RO + EN).
// E un clasificator euristic: rapid, transparent, fara model. Nu e perfect —
// interogarile sunt scurte si ambigue ("romania", "cine a castigat"), deci
// orice rezultat poate fi rafinat din UI cu filtrele de cautare.

export const CATEGORIES = [
  { id: 'weather', label: 'Vremea', emoji: '🌦️' },
  { id: 'news', label: 'Știri & Actualitate', emoji: '📰' },
  { id: 'politics', label: 'Politică & Alegeri', emoji: '🏛️' },
  { id: 'sport', label: 'Sport', emoji: '⚽' },
  { id: 'music', label: 'Muzică', emoji: '🎵' },
  { id: 'film', label: 'Film & Serial', emoji: '🎬' },
  { id: 'tv', label: 'TV & Emisiuni', emoji: '📺' },
  { id: 'gaming', label: 'Gaming', emoji: '🎮' },
  { id: 'tech', label: 'Tehnologie', emoji: '💻' },
  { id: 'auto', label: 'Auto', emoji: '🚗' },
  { id: 'money', label: 'Bani & Afaceri', emoji: '💰' },
  { id: 'health', label: 'Sănătate', emoji: '🩺' },
  { id: 'education', label: 'Educație', emoji: '🎓' },
  { id: 'lifestyle', label: 'Lifestyle & Rețete', emoji: '🍳' },
  { id: 'celebs', label: 'Vedete & Monden', emoji: '✨' },
  { id: 'lottery', label: 'Loto & Pariuri', emoji: '🎰' },
  { id: 'other', label: 'Altele', emoji: '📦' },
];

const LABEL = new Map(CATEGORIES.map((c) => [c.id, c.label]));

// Ordinea conteaza la scoruri egale: primele au prioritate.
const RULES = {
  weather: [
    'vremea', 'vreme', 'vremii', 'meteo', 'prognoza', 'temperatur', 'ninsoare', 'zapada', 'canicul',
    'ploaie', 'furtuna', 'cod galben', 'cod portocaliu', 'cod rosu', 'weather', 'forecast', 'snow',
  ],
  lottery: ['loto', 'joker', 'noroc', 'bingo', 'pariuri', 'superbet', 'fortuna', 'casino', 'lottery'],
  education: [
    'bac', 'bacalaureat', 'admitere', 'subiecte', 'rezolvare', 'evaluare nationala', 'examen',
    'facultate', 'universitate', 'teza', 'profesor',
  ],
  sport: [
    'fotbal', 'meci', 'meciul', 'gol', 'golurile', 'liga', 'campionat', 'cupa', 'tenis', 'simona halep',
    'rezultate', 'clasament', 'transfer', 'echipa', 'echipei', 'handbal', 'baschet', 'volei', 'rugby',
    'formula 1', 'f1', 'ufc', 'box', 'olimp', 'maraton', 'derby', 'fcsb', 'steaua', 'rapid', 'dinamo',
    'cfr', 'nationala', 'romania -', 'romania-', ' vs ', 'nba', 'nfl', 'premier league', 'champions',
    'superliga', 'antrenor', 'jucator', 'penalty', 'highlights', 'scores',
  ],
  gaming: [
    'joc', 'jocuri', 'gta 6', 'gta 5', 'gta v', 'gta online', 'gta', 'minecraft', 'roblox', 'fortnite',
    'fifa', 'ea fc', 'cs2', 'csgo', 'valorant',
    'lol', 'league of legends', 'pubg', 'among us', 'gameplay', 'streamer', 'speedrun', 'ps5', 'xbox',
  ],
  music: [
    'piesa', 'melodie', 'versuri', 'album', 'single', 'concert', 'videoclip', 'manele', 'populara',
    'lyrics', 'song', 'remix', 'festival', 'eurovision', 'vocea', 'x factor',
  ],
  film: [
    'film', 'filme', 'serial', 'seriale', 'trailer', 'episod', 'sezon', 'netflix', 'hbo', 'disney',
    'cinema', 'actor', 'actrita', 'dublat', 'subtitrat', 'movie', 'series', 'episode', 'imdb',
  ],
  tv: [
    'emisiune', 'emisiunea', 'show', 'survivor', 'masterchef', 'iumor', 'te cunosc de undeva',
    'romania are talent', 'vocea romaniei', 'pro tv', 'antena', 'kanal d', 'stirile', 'breaking news',
    'talk show', 'podcast',
  ],
  tech: [
    'iphone', 'samsung', 'xiaomi', 'huawei', 'pixel', 'telefon', 'laptop', 'tableta', 'aplicatie',
    'aplicatia', 'android', 'ios', 'windows', 'chatgpt', 'openai', 'inteligenta artificiala',
    'internet', 'wifi', 'software', 'actualizare', 'unboxing', 'gadget',
  ],
  auto: [
    'masina', 'masini', 'auto', 'automobil', 'tesla', 'bmw', 'audi', 'mercedes', 'dacia', 'ford',
    'volkswagen', 'toyota', 'motor', 'anvelope', 'permis', 'rovinieta', 'service auto',
    'masina electrica', 'electrice', 'hybrid',
  ],
  money: [
    'bitcoin', 'btc', 'cripto', 'ethereum', 'bursa', 'dolar', 'euro', 'leu', 'curs bnr', 'salariu',
    'salariul', 'salarii', 'pensie', 'pensia', 'pensii', 'taxe', 'impozit', 'anaf', 'credit', 'credite',
    'ipotec', 'inflatie', 'pret', 'preturi', 'scumpiri', 'factura', 'facturi', 'energie', 'gaze',
    'investitii', 'afacere', 'business',
  ],
  health: [
    'simptome', 'boala', 'boli', 'medic', 'medicament', 'pastile', 'tratament', 'gripa', 'raceala',
    'covid', 'dieta', 'slabit', 'nutritie', 'analize', 'spital', 'vaccin', 'sanatate', 'doctor',
  ],
  lifestyle: [
    'reteta', 'retete', 'gatit', 'mancare', 'ciorba', 'sarmale', 'prajitura', 'tort', 'mic dejun',
    'calatorie', 'vacanta', 'hotel', 'litoral', 'munte', 'moda', 'machiaj', 'coafura', 'fitness',
    'workout', 'diy', 'curatenie', 'gradina', 'animale', 'recipe', 'cooking',
  ],
  celebs: [
    'nunta', 'divort', 'logodna', 'sarcina', 'iubit', 'iubita', 'despartire', 'vedeta',
    'cancan', 'monden', 'interviu', 'confesiune', 'scandal', 'drama',
  ],
  news: [
    'stire', 'stiri', 'stirile', 'breaking', 'accident', 'cutremur', 'incendiu', 'explozie', 'alerta',
    'protest', 'greva', 'razboi', 'ucraina', 'rusia', 'atac', 'morti', 'raniti', 'politie', 'dna',
    'tribunal', 'arest', 'sentinta', 'guvernul', 'ministrul', 'premierul', 'senat', 'parlament',
    'catastrofa', 'inundatii', 'victime', 'dezastru', 'news', 'live',
  ],
  politics: [
    'alegeri', 'alegerea', 'vot', 'votul', 'presedinte', 'presedintele', 'premier', 'partid',
    'candidat', 'campanie', 'sondaj', 'guvern', 'coalitie', 'minister', 'primar', 'europarlamentare',
    'referendum', 'election', 'president',
  ],
};

const NORMALIZE = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // scoate diacriticele
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// termenii din reguli sunt deja normalizati (fara diacritice)
const COMPILED = Object.entries(RULES).map(([id, terms]) => ({
  id,
  terms: terms.map((t) => NORMALIZE(t)),
  order: Object.keys(RULES).indexOf(id),
}));

function score(term, haystack, words) {
  if (!term) return 0;
  // fraze / termeni cu spatiu sau cratima: potrivire pe substring
  if (term.includes(' ') || term.includes('-')) {
    return haystack.includes(term) ? 3 + term.length / 10 : 0;
  }
  // altfel: prefix de cuvant, oriunde in interogare (acopera plural, genitiv)
  for (const w of words) {
    if (w === term) return 2.4 + term.length / 20;
    if (w.startsWith(term)) return 2 + term.length / 20;
  }
  return 0;
}

export function classify(query) {
  const haystack = NORMALIZE(query);
  if (!haystack) return { category: 'other', score: 0 };

  const words = haystack.split(' ');
  let best = { id: 'other', score: 0.0001, order: 999 };
  for (const rule of COMPILED) {
    let total = 0;
    for (const term of rule.terms) total += score(term, haystack, words);
    if (total > best.score) best = { id: rule.id, score: total, order: rule.order };
  }
  return { category: best.id, score: Number(best.score.toFixed(2)), label: LABEL.get(best.id) };
}

export function categoryLabel(id) {
  return LABEL.get(id) || 'Altele';
}

export function isCategory(id) {
  return LABEL.has(id);
}

export const _internal = { NORMALIZE };
