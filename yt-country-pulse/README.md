# YouTube Country Pulse

**Ce a căutat o țară pe YouTube într-o zi.** UI web + CLI, zero dependințe, Node 18+.

Aplicația ia o țară și o zi și îți arată, într-un singur ecran:

1. **Căutările în trend** din acea țară în ziua respectivă (Google Trends — trend-uri zilnice, cu volum estimat, interogări asociate și articole).
2. **Videoclipurile în trend** din țara respectivă (YouTube Data API v3, `chart=mostPopular&regionCode=XX`) — official, ca pagina „Trending".
3. **Interesul pe un cuvânt anume** în filtrul *YouTube Search* (Google Trends, `property=youtube`): serie 0–100 plus interogările **top** și **în creștere** din jurul lui.

---

## Ce e posibil și ce nu (important)

Google **nu** publică o listă completă de tipul „toate căutările făcute pe YouTube în România pe 18 noiembrie". Nu există API, dataset sau endpoint public pentru asta — nici oficial, nici pe undeva „pe sub masă". Cine promite așa ceva îți vinde fie date inventate, fie trafic estimat din panouri de tip Similarweb.

Ce există real și e folosit aici:

| Sursă | Ce dă | Statut |
|---|---|---|
| Google Trends — trend-uri zilnice (`/trends/api/dailytrends`) | top căutări ale zilei pe țară, cu volum și știri asociate | endpoint public, folosit de site-ul Google Trends; **neoficial** (fără contract de stabilitate) |
| Google Trends — `property=youtube` | interes relativ 0–100 pentru un cuvânt, în YouTube Search, pe țară și interval | tot **neoficial**, dar e exact filtrul „YouTube Search" din interfața Trends |
| YouTube Data API v3 — `videos.list?chart=mostPopular` | top videoclipuri în trend pe țară | **oficial**, cheie gratuită, cotă 10.000 unități/zi |

Consecințe practice:

- Nu există „toate căutările"; ai **top-ul zilei** + semnale per cuvânt. E ce se poate obține legitim.
- Endpoint-urile Google Trends pot răspunde cu **429** dacă insiști. De aceea: cache 15–30 min, retry cu backoff, rate limit per IP (40 req/min) și mod demo.
- Datele YouTube „trending" sunt un **snapshot al momentului**, nu istoric. Google nu ține un istoric public al trending-ului pe zile.
- Google Trends cere cookie de sesiune; tool-ul îl obține automat (`lib/http.js`).
- Nu se face scraping de pagini HTML, nu se ocolește nicio autentificare, nu se folosesc conturi — doar endpoint-uri publice JSON, cu politeness (cache + limite).

---

## Pornire

```bash
cd yt-country-pulse
npm start                 # → http://localhost:3000
```

Fără `npm install` — nu are nicio dependință.

Cheia YouTube (opțională, doar pentru videoclipuri):

1. Google Cloud Console → creezi un proiect → **APIs & Services → Library → YouTube Data API v3 → Enable**.
2. **Credentials → Create credentials → API key**.
3. O pui fie în UI (Setări avansate — rămâne în `localStorage`, în browserul tău), fie ca env:

```bash
YOUTUBE_API_KEY=AIza... npm start
```

Fără cheie, aplicația funcționează la fel pentru căutări și interes; doar cardul de videoclipuri rămâne gol (cu explicație).

### Mod demo

Bifează **„Mod demo"** sau rulează cu `--demo`. Generează eșantioane deterministe (aceeași țară + zi = aceleași cifre), ca să vezi UI-ul fără nicio cerere către Google. Sunt marcate peste tot ca `demo` — nu sunt date reale.

---

## CLI

```bash
node cli.js --geo RO --date 2026-11-18
node cli.js --geo RO --seed "vremea" --key AIza...
node cli.js --geo US --demo
node cli.js --geo DE --csv > germania.csv
node cli.js --geo RO --json out.json
node cli.js --list
```

Exemplu de ieșire (mod demo):

```
  🇷🇴  România (RO)  ·  2026-11-18  ·  mod: demo (DEMO)
  ────────────────────────────────────────────────────────────────
  CĂUTĂRI ÎN TREND (2026-11-18)
     1. vremea mâine                            1.5M+
        ↳ starea vremii, prognoza, ...
  ...
```

---

## API

`POST /api/pulse`

```json
{
  "geo": "RO",
  "date": "2026-11-18",
  "seed": "vremea",
  "apiKey": "AIza...",
  "demo": false
}
```

Răspuns (prescurtat):

```json
{
  "ok": true,
  "mode": "live",
  "geo": "RO",
  "country": { "code": "RO", "name": "România", "flag": "🇷🇴" },
  "date": "2026-11-18",
  "generatedAt": "2026-11-19T09:12:03.441Z",
  "sources": [
    { "id": "trends-trending", "status": "ok", "provider": "Google Trends", "cached": false },
    { "id": "youtube-trending", "status": "ok", "provider": "YouTube Data API v3" },
    { "id": "youtube-search-interest", "status": "ok", "provider": "Google Trends" }
  ],
  "warnings": [],
  "trendingSearches": {
    "requestedDate": "2026-11-18",
    "dayDate": "2026-11-18",
    "items": [
      { "rank": 1, "query": "...", "trafficLabel": "1.5M+", "trafficValue": 1500000,
        "relatedQueries": ["..."], "articles": [{ "title": "...", "url": "...", "source": "..." }] }
    ]
  },
  "trendingVideos": [
    { "rank": 1, "videoId": "...", "title": "...", "channel": "...", "views": 1200000,
      "publishedAt": "2026-11-18T07:00:00Z", "thumbnail": "https://i.ytimg.com/...", "url": "https://youtube.com/watch?v=..." }
  ],
  "seed": {
    "keyword": "vremea", "property": "youtube",
    "range": { "start": "2026-11-18", "end": "2026-11-19" },
    "points": [{ "time": "18 Nov, 13:00", "value": 42 }],
    "top": [{ "query": "vremea mâine", "value": 100 }],
    "rising": [{ "query": "vremea mâine bucuresti", "formattedValue": "+3200%", "isBreakout": false }]
  }
}
```

Alte rute: `GET /api/health`, `GET /api/countries`, `GET /api/pulse?geo=RO&demo=1`.

`mode` poate fi `live` (toate sursele au răspuns), `partial` (unele), `error` (niciuna), `demo`.
Fiecare sursă are `status`: `ok` / `error` / `skipped` / `empty`. UI-ul și CLI-ul afișează erorile explicite, nu le ascund.

---

## Structură

```
yt-country-pulse/
├── server.js            # HTTP server (node:http), static + API, rate limit
├── cli.js               # CLI cu sumar / CSV / JSON
├── lib/
│   ├── pulse.js         # orchestrator: 3 surse în paralel, toleranță la erori parțiale
│   ├── trends.js        # Google Trends (dailytrends, explore, multiline, relatedsearches)
│   ├── youtube.js       # YouTube Data API v3 (chart=mostPopular) + mesaje de eroare prietenoase
│   ├── http.js          # fetch + cookie jar + retry/backoff + strip XSSI
│   ├── cache.js         # cache pe disc cu TTL
│   ├── countries.js     # 63 de țări (cod, nume RO, steag)
│   └── demo.js          # generator determinist de eșantioane
└── public/              # index.html + app.js (vanilla) + styles.css
```

## Limite cunoscute

- **Fereastră istorică:** trend-urile zilnice merg, în practică, doar pentru zile recente; pentru date vechi Google poate returna altă zi. Aplicația te avertizează când `dayDate ≠ date`.
- **Fiabilitate Trends:** e un endpoint intern; se schimbă fără anunț. Dacă pică, restul aplicației continuă (vezi `sources`).
- **Cotă YouTube:** 10.000 unități/zi, 1 unitate/apel → practic nelimitat pentru uz personal.
- **Rate limit local:** 40 cereri/minut/IP; cache-ul face ca refresh-urile să nu lovească Google.

## Deploy pe Vercel

`server.js` folosește `node:http` și ascultă pe `process.env.PORT`; pentru Vercel e nevoie de un wrapper în `api/` (sau rulezi pe Railway/Fly/VPS cu `npm start`). Pentru uz personal, local sau un VPS mic e cel mai simplu.

## Etică & termeni

Se folosesc doar endpoint-uri publice, fără ocolirea unor restricții, fără conturi false, fără scraping agresiv. Cache-ul și rate limit-ul există exact ca să nu abuzeze de serviciile Google. Dacă vrei volum mare/istoric/automatizări comerciale, ruta corectă e un contract cu un vendor de date (Similarweb, Semrush, Glimpse), nu forțarea endpoint-urilor gratuite.
