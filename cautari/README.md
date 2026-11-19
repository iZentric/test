# Căutări reale pe YouTube · România

Site separat, minimal: o singură pagină, două liste, zero demo.

```bash
cd cautari
npm start          # → http://localhost:3001
```

Nu are dependințe. Nu are build. Nu are date inventate.

## Ce arată

1. **Căutările care aduc canalul în rezultate** — pentru fiecare interogare relevantă s-a întrebat
   YouTube ce rezultate dă, apoi s-a verificat dacă un videoclip al canalului apare în primele 20.
   Poziția afișată e cea reală, la data rulării.
2. **Top căutări în România** — termenii scoși din autocomplete-ul YouTube (93 de prefixe + nivelul 2),
   ordonați după scor, cu filtru de text și bifă „doar cele care aduc canalul".
3. **Testate, dar care nu aduc canalul** — ca să se vadă și ce nu funcționează.

## De unde vin datele

Din `../yt-country-pulse/data/`:

- `harvest/latest-RO.json` — termenii din autocomplete;
- `channel/latest-RO.json` — potrivirile canalului în căutare.

Ambele sunt produse de crawlerul care rulează pe **GitHub Actions** (are acces la Google) și sunt
actualizate automat, zilnic. Serverul le citește la fiecare cerere, deci după un `git pull` pagina e la zi.

Endpoint: `GET /api/data` → `{ harvest, channel }`.
