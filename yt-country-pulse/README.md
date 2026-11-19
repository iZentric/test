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

### 🚫 „Fără stat & dezastre" — varianta strictă

Al doilea preset taie tot ce e influențat de stat, de prețuri sau de evenimente negative:

- **categorii**: Știri, Politică, Educație, Lifestyle, Tehnologie, TV, **Film & Serial**, **Sport**, **Bani & Afaceri**;
- **subiecte despre țară** (nume, capitală, orașe mari);
- **cuvinte**: dezastre și accidente (`cutremur, seism, inundații, incendiu, explozie, accident, deces, victime`), instituții și legi (`guvern, minister, parlament, lege, taxă, impozit, buget, ANAF, subvenție, ajutor social, șomaj, rovinietă, amendă`), alegeri (`vot, președinte, ministru, primar, partid, coaliție`), bani și utilități (`preț, benzină, motorină, factură, energie, gaze, pensie, salariu, inflație, curs BNR, bursă, credit, criză`), plus `film, serial, meci, fotbal`.

Rămân: **muzică, gaming, auto, vremea, sănătate, vedete, loto, altele** — adică subiectele pentru care lumea chiar intră pe YouTube, fără „breaking news", fără prețuri, fără politică.

### 📅 Top pe fiecare zi

Panel nou: fiecare zi din interval, cu interogările care au intrat în topul ei, **în ordine după volum**.
Alege câte afișezi pe zi (5 / 10 / 20), deschide toate zilele dintr-un click, iar lista respectă **exact filtrele active**
(categorii, subiecte de țară, cuvinte excluse) — deci poți avea „topul zilei" curat, fără știri, fără meciuri, fără prețuri.

### Ce urmează — estimare, nu ghicit

Două panouri, ambele marcate clar ca estimări:

1. **Estimare: ce urcă** — pentru fiecare interogare compară media traficului din **ultimele 7 zile** cu media din **cele 14 zile dinainte** (cu netezire, ca să nu iasă valori absurde din 1–2 apariții). Rezultatul e un multiplicator (×1,4 = trafic cu 40% mai mare în ultima săptămână). Cere minim ~21 de zile colectate.
2. **Ce urmează: evenimente recurente** — sărbători legale, **Paște ortodox/catolic** (calculat corect), Floriile, Rusaliile, **Black Friday** (a 4-a vineri din noiembrie), Cyber Monday, Crăciun, Revelion, Super Bowl, Eurovision, Oscar. Fiecare cu cuvintele pe care le caută lumea în jurul lui. Evenimentele specifice României apar doar pentru RO.

Asta e tot ce se poate spune onest despre „ce se va căuta luna viitoare": **momentum** din date reale + **calendar** de evenimente care se repetă. Nimeni nu poate ști căutările viitoare — dar poți ști ce urcă acum și ce se apropie.

---

## Sugestii (autocomplete) — „lista fără să scriu eu cuvinte"

Tab nou care întoarce **lista de sugestii reale** pe care le dă bara de căutare YouTube, ordonată, fără să introduci tu termeni:

- **93 de prefixe** interogate automat: `a–z`, `0–9`, `ă â î ș ț` și întrebări de tipul `cum`, `ce`, `cine`, `unde`, `când`, `cât`, `care`, `de ce`, `pentru`, `cel mai`, `top`;
- **nivelul 2 (expandare)**: cei mai promițători ~40 de termeni descoperiți sunt reinterogați, ceea ce face ca același termen să apară din mai multe direcții — abia atunci se poate calcula un clasament;
- **scor** = 0,65 × (pondere poziție) + 0,35 × (din câte prefixe diferite apare). Poziția 0 (prima sugestie) cântărește cel mai mult; contribuțiile din nivelul 2 sunt subponderate, iar extensiile directe ale prefixului (`gta 6` → `gta 6 2026`) sunt penalizate;
- **diferență între rulări**: termenii care nu erau în rularea anterioară primesc badge **NOU** — așa vezi ce a apărut în peisaj;
- filtre: căutare text, sortare (scor / apariții / alfabetic / noi întâi), „doar termeni noi", export **CSV/JSON**.

Rulare: ~50–100 de cereri, 40–90 de secunde. Pauze între cereri (220 ms + jitter), cache 6 h, retry pe 429, anulare, progres în timp real.

### Ce NU e (ca să fim drepți)

- **Nu e volum de căutări.** Autocomplete-ul nu publică cifre. Scorul e un proxy (poziție × acoperire între prefixe), bun pentru ordonare relativă, nu pentru „X căutări/lună".
- **Nu e lista completă.** Google nu expune nicio listă cu toate căutările — nici oficial, nici prin acest endpoint. Ce vezi e universul de sugestii pentru prefixele cerute.
- **`q=` gol nu întoarce nimic.** Ideea că un query gol îți dă „top 10 căutări" e falsă; se vede și în dump-ul de referință (`[GLOBAL_EMPTY_Q] -> ` gol).
- Endpoint public, neoficial, fără autentificare. Uz personal / cercetare, cu pauze. Nu e „hack", dar nici garantat stabil.

## Analiză canal din export vidIQ (CSV)

Tab nou, 100% local (nimic nu pleacă pe server): tragi în pagină un export CSV din vidIQ — de canal, de „top videos", sau orice tabel cu coloanele `TITLE`, `VIEWS`, `KEYWORDS`, `DURATION`, `DATE PUBLISHED`, `VIDIQ SCORE` — și primești pe loc:

- **sumar**: videoclipuri, views total / medie / mediană, like rate, comment rate, interval de date, ritm de publicare (clipuri/zi), scor vidIQ mediu;
- **shorts vs. video lung** (short = ≤ 60 s): câte sunt din fiecare și views medii pe fiecare tip;
- **corelația scor vidIQ ↔ views** (Pearson, log-views) — ca să vezi dacă scorul chiar prezice ceva pe canalul respectiv;
- **keywords**: împărțite în *comune* (apar în peste 70% din videoclipuri — de obicei tag-uri copiate pe tot canalul) și *distinctive* (apar în puține — acolo e subiectul real). Dacă toate tag-urile sunt identice, pagina o spune direct în loc să inventeze o separare;
- **cuvinte și expresii (2 cuvinte) din titluri**, cu stopwords RO+EN scoase și views medii pe termen — așa iese la iveală o temă repetată (ex. „pam pam", „hot dog");
- **publicare pe zile** cu bare proportionale cu views-urile;
- sortare a tabelului după views / scor / dată / engagement / durată, export **JSON** și „copiază keywords".

CSV-ul se salvează în `localStorage` (până la ~2 MB), deci după refresh analiza e tot acolo. Parserul e propriu (RFC 4180: ghilimele, `""`, diacritice, BOM, CRLF), fără dependințe.

**Ce nu e:** keywords-urile sunt tag-urile videoclipului, nu ce a căutat lumea; scorul vidIQ nu e volum de căutări; views-urile sunt cumulate pe viața videoclipului, deci un clip vechi are avantaj față de unul de ieri.

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

Sugestii (autocomplete):

```bash
node cli.js --geo RO --harvest --top 50
node cli.js --geo RO --harvest --depth 2 --expand 40 --seeds "gta,insula,colinde"
node cli.js --geo RO --harvest --csv > sugestii.csv
```

Flag-uri: `--range`, `--from`, `--to`, `--exclude` (id-uri de categorii), `--top`, `--out` (CSV), `--json`, `--demo`, `--limit`, `--list`,
`--harvest`, `--depth`, `--expand`, `--seeds`.

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

### Sugestii (autocomplete)

`POST /api/harvest` → `{ geo, hl, depth, extraSeeds[], demo }` → `202 { jobId }`
`GET /api/harvest/:id` → `{ job: { status, progress, stats }, result: { terms: [{ term, score, appearances, bestRank, avgRank, seeds, isNew }] } }`
`GET /api/harvest/latest?geo=RO` → ultima rulare salvată (pentru diff și afișare)
`POST /api/harvest/:id/cancel`

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
│   ├── suggest.js       # client autocomplete YouTube (JSONP, encoding tolerant)
│   ├── harvest.js       # crawler 2 niveluri + scor + diff între rulări
│   ├── text.js          # normalizare fără diacritice + potrivire pe cuvinte
│   ├── jobs.js          # job-uri în fundal, progres, anulare, salvare pe disc
│   ├── http.js          # fetch + cookie jar + retry/backoff + strip XSSI + probe rețea
│   ├── cache.js         # cache pe disc cu TTL
│   ├── countries.js     # 63 de țări
│   └── demo.js          # generator determinist de eșantioane
├── public/              # index.html + app.js (vanilla) + vidiq.js (analiză CSV) + styles.css
└── data/collections/    # rezultatele colectărilor (gitignore)
```

## Limite cunoscute

- **Fereastră istorică:** trend-urile zilnice merg, în practică, doar pentru perioade recente; pentru zile prea vechi Google poate returna altă zi sau nimic. Tabelul îți arată exact câte zile au lipsit (`coverage`).
- **Fiabilitate Trends:** endpoint intern, se poate schimba. Restul aplicației continuă; erorile apar explicit.
- **Cotă YouTube:** 10.000 unități/zi → practic nelimitat pentru uz personal.
- **Rate limit local:** 40 cereri/minut/IP; cache-ul face refresh-urile ieftine.
- **Clasificare:** euristică, nu model. „românia", nume de oameni, branduri → „Altele". Filtrele de text și de zile compensează.
- **Autocomplete:** 13–15 sugestii per prefix, fără volum; clasamentul e al nostru, statistic, nu al Google. Poate răspunde 429 dacă insiști.
- **Estimarea:** e un multiplicator istoric, nu o predicție. O interogare poate urca din motive pe care datele nu le conțin (un meci, un deces, un trend pe TikTok).

## Deploy pe Vercel

`server.js` folosește `node:http` și ascultă pe `process.env.PORT`. Pentru Vercel trebuie un wrapper în `api/`; pentru colecții lungi (5–10 min) e mai potrivit un host care ține procesul viu (Railway/Fly/VPS). Pentru uz personal, local e cel mai simplu.

## Etică & termeni

Doar endpoint-uri publice, fără ocolirea restricțiilor, fără conturi false, fără scraping agresiv. Cache-ul, pauzele și rate limit-ul există exact ca să nu abuzeze de serviciile Google. Pentru volum mare/istoric comercial, ruta corectă e un contract cu un vendor de date, nu forțarea endpoint-urilor gratuite.
