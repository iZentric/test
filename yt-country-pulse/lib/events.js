// Evenimente recurente (sarbatori, sezoane comerciale, evenimente mari).
// Nu sunt predictii: sunt date care se repeta anual dupa reguli cunoscute,
// iar lumea cauta despre ele in perioada respectiva.
//
// `approx: true` = data variaza de la an la an; o dam orientativ.

const FIXED = [
  { month: 1, day: 1, name: 'Anul Nou', kind: 'sarbatoare', keywords: ['revelion', 'focuri de artificii', 'urari'], why: 'noaptea dintre ani' },
  { month: 1, day: 24, name: 'Ziua Unirii Principatelor', kind: 'sarbatoare', countries: ['RO'], keywords: ['unirea', '24 ianuarie'], why: 'sarbatoare nationala (RO)' },
  { month: 2, day: 14, name: 'Valentine\'s Day', kind: 'comert', keywords: ['valentine', 'cadouri', 'idei de cadouri'], why: 'cadouri si iesiri' },
  { month: 2, day: 24, name: 'Dragobete', kind: 'sarbatoare', countries: ['RO'], keywords: ['dragobete', 'traditii'], why: 'varianta romaneasca a zilei indragostitilor' },
  { month: 3, day: 1, name: 'Martisor', kind: 'sarbatoare', countries: ['RO', 'MD', 'BG'], keywords: ['martisor', '8 martie', 'cadouri femei'], why: 'inceputul primaverii' },
  { month: 3, day: 8, name: 'Ziua Femeii', kind: 'comert', keywords: ['ziua femeii', 'flori', 'cadouri'], why: 'flori si cadouri' },
  { month: 4, day: 1, name: '1 Aprilie', kind: 'fun', keywords: ['pacelI', 'glume', 'farse'], why: 'glume si pacaleli' },
  { month: 5, day: 1, name: 'Ziua Muncii', kind: 'sarbatoare', keywords: ['1 mai', 'mini-vacanta', 'iesiri'], why: 'vacanta scurta' },
  { month: 6, day: 1, name: 'Ziua Copilului', kind: 'sarbatoare', keywords: ['ziua copilului', 'idei pentru copii'], why: 'activitati si cadouri pentru copii' },
  { month: 8, day: 15, name: 'Adormirea Maicii Domnului', kind: 'sarbatoare', countries: ['RO', 'GR', 'BG', 'RS'], keywords: ['sarbatoare', '15 august', 'mini-vacanta'], why: 'sarbatoare legala' },
  { month: 10, day: 31, name: 'Halloween', kind: 'fun', keywords: ['halloween', 'costume', 'machiaj'], why: 'petreceri si costume' },
  { month: 11, day: 30, name: 'Sfantul Andrei', kind: 'sarbatoare', countries: ['RO'], keywords: ['sfantul andrei', 'traditii', 'noaptea lupilor'], why: 'sarbatoare nationala (RO)' },
  { month: 12, day: 1, name: 'Ziua Nationala a Romaniei', kind: 'sarbatoare', countries: ['RO'], keywords: ['1 decembrie', 'parada', 'ziua nationala'], why: 'sarbatoare nationala (RO)' },
  { month: 12, day: 25, name: 'Craciun', kind: 'sarbatoare', keywords: ['craciun', 'mos craciun', 'cadouri', 'brad'], why: 'cel mai mare varf comercial al anului' },
  { month: 12, day: 26, name: 'A doua zi de Craciun', kind: 'sarbatoare', keywords: ['craciun', 'reduceri'], why: 'continuare sarbatoare' },
  { month: 12, day: 31, name: 'Revelion', kind: 'sarbatoare', keywords: ['revelion', 'petreceri', 'focuri de artificii'], why: 'sfarsit de an' },
];

const KIND_LABELS = {
  sarbatoare: 'sărbătoare',
  comert: 'comerț',
  sport: 'sport',
  muzica: 'muzică',
  film: 'film',
  fun: 'distracție',
  eveniment: 'eveniment',
};

const DAY = 86400000;

function iso(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

function addDays(isoDate, delta) {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + delta * DAY).toISOString().slice(0, 10);
}

/** Paste ortodox (calendar iulian -> gregorian, offset 13 zile in 1900-2099) */
function orthodoxEaster(year) {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return addDays(iso(year, month, day), 13);
}

/** Paste catolic (Meeus, calendar gregorian) */
function catholicEaster(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

/** a n-a zi de weekday (0=duminica) din luna data; n negativ = de la sfarsit */
function nthWeekday(year, month, weekday, n) {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const shift = (weekday - first.getUTCDay() + 7) % 7;
    return iso(year, month, 1 + shift + (n - 1) * 7);
  }
  const last = new Date(Date.UTC(year, month, 0));
  const shift = (last.getUTCDay() - weekday + 7) % 7;
  return iso(year, month, last.getUTCDate() - shift + (n + 1) * 7);
}

function computedFor(year) {
  const orthodox = orthodoxEaster(year);
  const catholic = catholicEaster(year);
  const blackFriday = nthWeekday(year, 11, 5, 4); // a 4-a vineri din noiembrie

  return [
    { date: orthodox, name: 'Paște ortodox', kind: 'sarbatoare', countries: ['RO', 'MD', 'BG', 'GR', 'RS', 'UA', 'RU'], keywords: ['paste', 'oua rosii', 'cozonac', 'vacanta'], why: 'cel mai mare varf de cautari din primavara' },
    { date: addDays(orthodox, -7), name: 'Floriile', kind: 'sarbatoare', countries: ['RO', 'MD', 'BG', 'GR', 'RS', 'UA', 'RU'], keywords: ['florii', 'salcie'], why: 'cu o saptamana inainte de Paste' },
    { date: catholic, name: 'Paște catolic', kind: 'sarbatoare', keywords: ['easter', 'paste'], why: 'in tari catolice' },
    { date: addDays(orthodox, 49), name: 'Rusaliile', kind: 'sarbatoare', countries: ['RO', 'MD', 'BG', 'GR', 'RS', 'UA', 'RU'], keywords: ['rusalii', 'pogorarea sfantului duh'], why: 'la 7 saptamani dupa Paste' },
    { date: blackFriday, name: 'Black Friday', kind: 'comert', keywords: ['black friday', 'reduceri', 'oferte'], why: 'cel mai mare varf de reduceri din toamna' },
    { date: addDays(blackFriday, 3), name: 'Cyber Monday', kind: 'comert', keywords: ['cyber monday', 'oferte online'], why: 'luni, dupa Black Friday' },
    { date: nthWeekday(year, 2, 0, 1), approx: true, name: 'Super Bowl', kind: 'sport', keywords: ['super bowl', 'halftime show'], why: 'prima duminica din februarie (aprox.)' },
    { date: nthWeekday(year, 5, 6, 3), approx: true, name: 'Eurovision', kind: 'muzica', keywords: ['eurovision', 'finala'], why: 'a treia sambata din mai (aprox.)' },
    { date: nthWeekday(year, 2, 0, -1), approx: true, name: 'Premiile Oscar', kind: 'film', keywords: ['oscar', 'castigatori'], why: 'sfarsitul lui februarie (aprox.)' },
  ];
}

export function eventsBetween(fromISO, toISO, { geo = 'RO', refDate = null } = {}) {
  const from = fromISO;
  const to = toISO;
  const startYear = Number(from.slice(0, 4));
  const endYear = Number(to.slice(0, 4));
  const ref = refDate || new Date().toISOString().slice(0, 10);
  const out = [];

  for (let year = startYear; year <= endYear; year += 1) {
    const fixed = FIXED.map((e) => ({ ...e, date: iso(year, e.month, e.day) }));
    const computed = computedFor(year);
    for (const ev of [...fixed, ...computed]) {
      if (ev.date < from || ev.date > to) continue;
      if (ev.countries && !ev.countries.includes(geo)) continue;
      const daysUntil = Math.round((Date.parse(`${ev.date}T00:00:00Z`) - Date.parse(`${ref}T00:00:00Z`)) / DAY);
      out.push({
        date: ev.date,
        name: ev.name,
        kind: ev.kind,
        kindLabel: KIND_LABELS[ev.kind] || ev.kind,
        keywords: ev.keywords || [],
        why: ev.why || '',
        approx: Boolean(ev.approx),
        daysUntil,
        localized: geo === 'RO' ? true : false,
      });
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function upcomingEvents({ geo = 'RO', days = 30, from = null } = {}) {
  const start = from || new Date().toISOString().slice(0, 10);
  const end = addDays(start, Math.max(1, Math.min(days, 400)));
  return eventsBetween(start, end, { geo });
}

export const _internal = { orthodoxEaster, catholicEaster, nthWeekday };
