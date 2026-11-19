# YouTube Country Pulse

**Ce a căutat o țară pe YouTube.** Două moduri:

- **O zi** — topul căutărilor din ziua respectivă + videoclipurile în trend + interesul pe un cuvânt anume.
- **Tabel pe perioadă** — colectează zi cu zi până la **un an**, agregă totul într-un singur tabel de interogări unice, cu **categorii**, filtre, sortare și export CSV/JSON. Aici vezi „ce a căutat lumea aproape în fiecare zi".

UI web + CLI, zero dependințe, Node 18+.

---

## Tabel pe perioadă (ce ai cerut)

1. Alegi țara și intervalul — butoane rapide: **7 zile**, **luna asta** (30), **90 zile**, **ultimul an** (365). Maxim 400 de zile.
2. Aplicația cere trend-urile **zi cu zi** (Google Trends), în fundal, cu pauze între cereri. Progresul se vede în timp real și poți anula.
3. Rezultatul: **un tabel** cu o linie per interogare unică:

| coloană | sens |
|---|---|
| Interogare | textul căutat |
| Categorie | dedusă din cuvinte-cheie (Știri, Sport, Vremea, Muzică, Gaming…) |
| Zile | în câte zile din interval a apărut în top |
| Trafic cumulat | suma estimărilor zilnice (proxy pentru interes total) |
| Loc minim | cea mai bună poziție atinsă |
| Prima / ultima zi | când a apărut prima și ultima oară |

4. Filtre: **dezactivezi categorii cu un click** (ex. „Știri" + „Sport"), cauți text, ceri minim N zile de apariție, sortezi după frecvență / trafic / loc / alfabetic.
5. Export **CSV** (tabelul filtrat) sau **JSON** (tot, inclusiv datele brute pe zile).

Un an întreg = ~365 de cereri, adică **5–10 minute** în fundal. Zilele luate se cache-uiesc 60 de zile, deci o re-colectare e aproape instantă. Rezultatele se scriu și în `data/collections/`.

### 🧹 Mod curat — fără știri, țară, bac, mâncare, aplicații

Un click pe **Mod curat** scoate exact lucrurile care nu te interesează:

- categorii întregi: **Știri & Actualitate**, **Politică**, **Educație** (bac/admitere), **Lifestyle & Rețete** (mâncare, restaurante), **Tehnologie** (aplicații), **TV & Emisiuni** (conferințe de presă, talk-show);
- **subiecte despre țară**: numele țării, capitala și orașele mari (pentru RO: „românia", „bucurești", „cluj", „timișoara"…);
- **cuvinte custom**, editabile: `bac, bacalaureat, conferinta, aplicatie, reteta, restaurant, meniu…`.

Ce rămâne: sport, muzică, film/serial, gaming, vedete, auto, bani, sănătate, vremea, loto — adică subiectele pentru care lumea chiar deschide YouTube.
Filtrele se salvează în browser și se aplică și în tabel, și în estimare. Butonul **Resetează filtrele** le scoate pe toate.

### Ce urmează — estimare, nu ghicit

Două panouri, ambele marcate clar ca estimări:

1. **Estimare: ce urcă** — pentru fiecare interogare compară media traficului din **ultimele 7 zile** cu media din **cele 14 zile dinainte** (cu netezire, ca să nu iasă valori absurde din 1–2 apariții). Rezultatul e un multiplicator (×1,4 = trafic cu 40% mai mare în ultima săptămână). Cere minim ~21 de zile colectate.
2. **Ce urmează: evenimente recurente** — sărbători legale, **Paște ortodox/catolic** (calculat corect), Floriile, Rusaliile, **Black Friday** (a 4-a vineri din noiembrie), Cyber Monday, Crăciun, Revelion, Super Bowl, Eurovision, Oscar. Fiecare cu cuvintele pe care le caută lumea în jurul lui. Evenimentele specifice României apar doar pentru RO.

Asta e tot ce se poate spune onest despre „ce se va căuta luna viitoare": **momentum** din date reale + **calendar** de evenimente care se repetă. Nimeni nu poate ști căutările viitoare — dar poți ști ce urcă acum și ce se apropie.

---

## Ce e posibil și ce nu (important)

Google **nu** publică o listă completă de tipul „toate căutările făcute pe YouTube în România". Nu există API, dataset sau endpoint public pentru asta — nici oficial, nici „pe sub masă". Ce există e **top-ul zilei**: ~20 de interogări pe zi și pe țară.

Deci, practic:

- un an întreg înseamnă maximum **~7.300 de intrări brute**, care se unifică în câteva mii de interogări unice — asta e tot ce se poate obține legitim;
- „aproape în fiecare zi" se vede exact în coloana **Zile** (ex. 94 din 365) și în sortarea după frecvență;
- nu există istoric public al videoclipurilor „trending" pe zile — doar snapshot-ul de moment (YouTube Data API).

Sursele folosite:

| Sursă | Ce dă | Statut |
|---|---|---|
| Google Trends — trend-uri zilnice (`/trends/api/dailytrends`, cu `date=YYYYMMDD`) | top căutări pe zi și țară: text, volum estimat, interogări asociate, articole | endpoint public, folosit de site-ul Google Trends; **neoficial** |
| Google Trends — `property=youtube` | interes relativ 0–100 pentru un cuvânt în YouTube Search | tot **neoficial**, dar e exact filtrul „YouTube Search" din Trends |
| YouTube Data API v3 — `videos.list?chart=mostPopular` | top videoclipuri în trend pe țară | **oficial**, cheie gratuită, 10.000 unități/zi |
| Clasificare locală (`lib/classify.js`) | categorii pe bază de cuvinte-cheie RO+EN | local, transparent, euristic |

Consecințe: endpoint-urile Trends pot răspunde cu **429** dacă insiști → cache + retry cu backoff + pauze între zile + rate limit per IP. Nu se face scraping de pagini HTML, nu se ocolește nicio autentificare, nu se folosesc conturi.

---

## Pornire

```bash
cd yt-country-pulse
npm start                 # → http://localhost:3000
```

Fără `npm install` — nu are nicio dependință.

Cheia YouTube (opțională, doar pentru videoclipuri):

1. Google Cloud Console → proiect → **APIs & Services → Library → YouTube Data API v3 → Enable**.
2. **Credentials → Create credentials → API key**.
3. O pui în UI (Setări avansate — rămâne în `localStorage`) sau ca env: `YOUTUBE_API_KEY=AIza... npm start`.

### Mod demo

Bifează **demo** (în ambele tab-uri) sau folosește `--demo` în CLI. Generează eșantioane deterministe, ca să vezi UI-ul fără nicio cerere către Google. Sunt marcate peste tot ca `demo`.

---

## CLI

O zi:

```bash
node cli.js --geo RO --date 2026-11-18
node cli.js --geo RO --seed "vremea" --key AIza...
node cli.js --geo DE --csv > germania.csv
```

Tabel pe perioadă:

```bash
node cli.js --geo RO --range 30 --exclude news,sport --top 40
node cli.js --geo RO --from 2026-01-01 --to 2026-11-18 --exclude news,sport --out tabel.csv
node cli.js --geo RO --range 365 --demo --json an.json
```

Flag-uri: `--range`, `--from`, `--to`, `--exclude` (id-uri de categorii), `--top`, `--out` (CSV), `--json`, `--demo`, `--limit`, `--list`.

---

## API

### O zi

`GET|POST /api/pulse` → `{ geo, date, seed, apiKey, demo }`.

### Perioadă

`POST /api/collect`

```json
{ "geo": "RO", "from": "2026-01-01", "to": "2026-11-18", "demo": false }
```

→ `202 { ok: true, jobId: "e09b57a7", job: { ... } }`

`GET /api/jobs/:id` → `{ job: { status, progress, coverage, ... }, result: {...} }`

`POST /api/jobs/:id/cancel` → anulare. `GET /api/jobs` → ultimele job-uri.

`result` conține:

```json
{
  "geo": "RO", "from": "2026-01-01", "to": "2026-11-18",
  "coverage": { "daysWithData": 351, "daysRequested": 365, "emptyDays": [...], "failedDays": [...] },
  "totals": { "uniqueQueries": 2874, "listedQueries": 2874, "totalTraffic": 1234567890, "avgQueriesPerDay": 19.8 },
  "categories": [{ "id": "sport", "label": "Sport", "queries": 412, "totalTraffic": 99000000 }],
  "rows": [{
    "query": "vremea mâine", "category": "weather", "totalTraffic": 8123456,
    "days": 94, "bestRank": 1, "avgRank": 6.2,
    "firstSeen": "2026-01-03", "lastSeen": "2026-11-17",
    "bestDay": { "date": "2026-02-11", "trafficValue": 300000 },
    "consistency": 0.257, "series": [0, 0, 120000, ...]
  }],
  "dayTotals": [{ "date": "2026-01-01", "queries": 20, "traffic": 5400000 }],
  "days": [{ "date": "2026-01-01", "items": [{ "query": "...", "category": "...", "trafficValue": 0, "relatedQueries": [] }] }]
}
```

`series` există doar pentru primele 150 de rânduri (sparkline în tabel).

### Evenimente

`GET /api/events?geo=RO&days=75` → `{ ok: true, events: [{ date, name, kind, kindLabel, keywords, why, approx, daysUntil }] }`

Alte rute: `GET /api/health`, `GET /api/countries` (include `terms` — numele țării, capitala, aliasurile, pentru filtrul „ascunde subiectele despre țară"), `GET /api/pulse?geo=RO&demo=1`.

---

## Structură

```
yt-country-pulse/
├── server.js            # HTTP server (node:http): static, API, rate limit, job-uri
├── cli.js               # CLI: o zi / perioadă, sumar, CSV, JSON
├── lib/
│   ├── pulse.js         # o zi: 3 surse în paralel, toleranță la erori parțiale
│   ├── trends.js        # Google Trends (dailytrends, explore, multiline, relatedsearches)
│   ├── youtube.js       # YouTube Data API v3 (chart=mostPopular)
│   ├── collect.js       # colectare zi cu zi, pauze politicoase, retry 429, cache 60 zile
│   ├── aggregate.js     # unificare interogări + metrici + serii
│   ├── classify.js      # categorii pe cuvinte-cheie (RO+EN), 17 categorii
│   ├── events.js        # evenimente recurente (Paște calculat, Black Friday, sărbători)
│   ├── text.js          # normalizare fără diacritice + potrivire pe cuvinte
│   ├── jobs.js          # job-uri în fundal, progres, anulare, salvare pe disc
│   ├── http.js          # fetch + cookie jar + retry/backoff + strip XSSI + probe rețea
│   ├── cache.js         # cache pe disc cu TTL
│   ├── countries.js     # 63 de țări
│   └── demo.js          # generator determinist de eșantioane
├── public/              # index.html + app.js (vanilla) + styles.css
└── data/collections/    # rezultatele colectărilor (gitignore)
```

## Limite cunoscute

- **Fereastră istorică:** trend-urile zilnice merg, în practică, doar pentru perioade recente; pentru zile prea vechi Google poate returna altă zi sau nimic. Tabelul îți arată exact câte zile au lipsit (`coverage`).
- **Fiabilitate Trends:** endpoint intern, se poate schimba. Restul aplicației continuă; erorile apar explicit.
- **Cotă YouTube:** 10.000 unități/zi → practic nelimitat pentru uz personal.
- **Rate limit local:** 40 cereri/minut/IP; cache-ul face refresh-urile ieftine.
- **Clasificare:** euristică, nu model. „românia", nume de oameni, branduri → „Altele". Filtrele de text și de zile compensează.
- **Estimarea:** e un multiplicator istoric, nu o predicție. O interogare poate urca din motive pe care datele nu le conțin (un meci, un deces, un trend pe TikTok).

## Deploy pe Vercel

`server.js` folosește `node:http` și ascultă pe `process.env.PORT`. Pentru Vercel trebuie un wrapper în `api/`; pentru colecții lungi (5–10 min) e mai potrivit un host care ține procesul viu (Railway/Fly/VPS). Pentru uz personal, local e cel mai simplu.

## Etică & termeni

Doar endpoint-uri publice, fără ocolirea restricțiilor, fără conturi false, fără scraping agresiv. Cache-ul, pauzele și rate limit-ul există exact ca să nu abuzeze de serviciile Google. Pentru volum mare/istoric comercial, ruta corectă e un contract cu un vendor de date, nu forțarea endpoint-urilor gratuite.
