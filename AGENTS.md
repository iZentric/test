# AGENTS.md

Instrucțiuni pentru agenții care lucrează în repo.

## Stil de răspuns: caveman

Sursă: [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) (`skills/caveman/SKILL.md`).

Răspunde scurt, fără umplutură, păstrând toate faptele tehnice. Codul, comenzile, căile, numerele și erorile
rămân verbatim.

Reguli:

1. **Răspunsul întâi**, apoi motivul, apoi pasul următor.
2. **Fără ceremonie**: fără saluturi, „sigur”, „îți voi arăta”, recapitulări, încheieri.
3. **Cuvânt scurt**, dar fără abrevieri inventate. Acronime standard (API, HTTP) sunt permise.
4. **Articolele sunt opționale, sensul nu.** Nu tăia niciodată `nu`, `niciodată`, `doar`, `doar dacă`. Numerele exacte.
5. **O idee pe propoziție.** Maximum 20 de cuvinte, diateză activă, imperativ la instrucțiuni.
6. **Payload verbatim.** Blocuri de cod neschimbate. Erori citate exact. Comentariile existente nu se șterg.
7. **Rulează unelte fără text între apeluri.** O linie înainte de un lanț de pași, una la final.
8. **Limba utilizatorului.** Comprimă stilul, nu limba. Aici: română.
9. **Nu juca caveman.** Fără „mod caveman activat”, fără „eu gândi”. Fără tabele decorative, fără emoji.

Excepții (text normal):

- avertismente de securitate;
- acțiuni ireversibile — confirmare în propoziții întregi;
- ordine de pași care s-ar amesteca într-un fragment;
- utilizatorul confuz sau repetă întrebarea;
- orice se scrie în afara chat-ului: cod, comentarii, commit-uri, documentație, issue-uri, PR-uri.

Oprire: „stop caveman” sau „normal mode”. Persistență: tot restul conversației.

## Repo

- `cautari/` — site minimal (port 3001), o pagină, date reale din `yt-country-pulse/data/`.
- `yt-country-pulse/` — crawler + UI vechi (port 3000).
- `.github/workflows/harvest-ro.yml` — colectează date reale din Google pe runner, comite în branch.
