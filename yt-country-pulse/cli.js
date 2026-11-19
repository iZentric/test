#!/usr/bin/env node
// CLI: aceleași date ca UI-ul, direct în terminal.
//
// Exemple:
//   node cli.js --geo RO --date 2026-11-18
//   node cli.js --geo RO --seed "vremea" --key AIza...
//   node cli.js --geo US --demo --json out.json
//   node cli.js --geo RO --csv > pulse.csv

import { writeFile } from 'node:fs/promises';
import { buildPulse } from './lib/pulse.js';
import { COUNTRIES, countryOf } from './lib/countries.js';
import { collectRange, dateRange } from './lib/collect.js';
import { aggregate } from './lib/aggregate.js';
import { CATEGORIES, categoryLabel } from './lib/classify.js';
import { harvest } from './lib/harvest.js';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function help() {
  console.log(`
YouTube Country Pulse — CLI

  --geo <cod>       Codul țării (RO, US, DE, ...)         [default: RO]
  --date <YYYY-MM-DD>  Ziua dorită                        [default: ultima zi disponibilă]
  --seed <cuvânt>   Cuvânt de urmărit în YouTube Search
  --key <cheie>     Cheie YouTube Data API v3 (sau env YOUTUBE_API_KEY)
  --limit <n>       Câte videoclipuri în trend            [default: 24]
  --demo            Date eșantion, fără cereri către Google
  --json <fișier>   Scrie răspunsul complet în fișier JSON
  --csv             Afișează CSV în loc de sumar

  --harvest         Crawler de sugestii (autocomplete) — listă ordonată de termeni
  --depth <1|2>     Niveluri de expandare pentru --harvest          [default: 2]
  --expand <n>      Câți termeni reinterogați la nivelul 2           [default: 40]
  --seeds <listă>   Prefixe suplimentare (virgulă) pentru --harvest

  --range <zile>    Colectează ultimele N zile (ex. 30, 365) și agregă tabelul
  --from <data>     Începutul intervalului (YYYY-MM-DD)
  --to <data>       Sfârșitul intervalului (YYYY-MM-DD, implicit ieri)
  --exclude <listă> Scurtături de categorii de exclus (ex. news,sport)
  --top <n>         Câte rânduri să afișezi în tabel (implicit 40)
  --list            Afișează țările suportate
  --help            Acest mesaj

Țări suportate: ${COUNTRIES.length}
`);
}

const nf = new Intl.NumberFormat('ro-RO');
const nfCompact = new Intl.NumberFormat('ro-RO', { notation: 'compact', maximumFractionDigits: 1 });

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function toCsv(p) {
  const rows = [['sectiune', 'rank', 'nume', 'valoare', 'detalii', 'url']];
  (p.trendingSearches?.items || []).forEach((s) =>
    rows.push(['cautare_trend', s.rank, s.query, s.trafficValue, (s.relatedQueries || []).join(' | '), s.shareUrl || '']),
  );
  (p.trendingVideos || []).forEach((v) => rows.push(['video_trend', v.rank, v.title, v.views, v.channel, v.url]));
  (p.seed?.top || []).forEach((q, i) => rows.push(['interes_top', i + 1, q.query, q.value, q.formattedValue || '', q.link || '']));
  (p.seed?.rising || []).forEach((q, i) => rows.push(['interes_rising', i + 1, q.query, q.value, q.formattedValue || '', q.link || '']));
  (p.seed?.points || []).forEach((pt, i) => rows.push(['serie_interes', i + 1, pt.time, pt.value, '', '']));
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) return help();
  if (args.list) {
    for (const c of COUNTRIES) console.log(`${c.code}  ${c.flag}  ${c.name}`);
    return;
  }

  if (args.harvest) {
    await runHarvestCli(args);
    return;
  }

  if (args.range || args.from) {
    await runRange(args);
    return;
  }

  const geo = String(args.geo || 'RO').toUpperCase();
  const date = typeof args.date === 'string' ? args.date : null;
  const seed = typeof args.seed === 'string' ? args.seed : '';
  const apiKey = String(args.key || process.env.YOUTUBE_API_KEY || '');
  const demo = Boolean(args.demo);

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('Data trebuie să fie în format YYYY-MM-DD (ex. 2026-11-18).');
    process.exitCode = 1;
    return;
  }

  const payload = await buildPulse({ geo, date, seed, apiKey, demo, videoLimit: Number(args.limit) || 24 });

  if (args.json) {
    await writeFile(String(args.json), JSON.stringify(payload, null, 2), 'utf8');
    console.error(`JSON scris în ${args.json}`);
  }

  if (args.csv) {
    process.stdout.write(toCsv(payload));
    return;
  }

  const { country } = payload;
  console.log('');
  console.log(`  ${country.flag}  ${country.name} (${country.code})  ·  ${payload.date || 'ultima zi disponibilă'}  ·  mod: ${payload.mode}${payload.demo ? ' (DEMO)' : ''}`);
  console.log('  ' + '─'.repeat(64));

  if (payload.warnings?.length) {
    for (const w of payload.warnings) console.log(`  ⚠ ${w}`);
    console.log('');
  }

  const searches = payload.trendingSearches?.items || [];
  console.log(`  CĂUTĂRI ÎN TREND${payload.trendingSearches?.dayDate ? ` (${payload.trendingSearches.dayDate})` : ''}`);
  if (!searches.length) console.log('    — nicio dată');
  searches.slice(0, 15).forEach((s) => {
    console.log(`    ${String(s.rank).padStart(2)}. ${s.query.padEnd(38).slice(0, 38)} ${String(s.trafficLabel).padStart(7)}`);
    if (s.relatedQueries?.length) console.log(`        ↳ ${s.relatedQueries.slice(0, 4).join(', ')}`);
  });

  console.log('');
  const videos = payload.trendingVideos || [];
  console.log('  VIDEOCLIPURI ÎN TREND');
  if (!videos.length) console.log('    — necesită cheie YouTube Data API (--key)');
  videos.slice(0, 12).forEach((v) => {
    console.log(`    ${String(v.rank).padStart(2)}. ${v.title.slice(0, 52)}`);
    console.log(`        ${v.channel} · ${nfCompact.format(v.views)} viz. · ${v.url}`);
  });

  if (payload.seed) {
    const s = payload.seed;
    const peak = Math.max(0, ...(s.points || []).map((p) => p.value));
    console.log('');
    console.log(`  INTERES YOUTUBE SEARCH: „${s.keyword}”  ·  vârf ${peak}/100  ·  ${s.range.start}`);
    if (s.top?.length) console.log(`    top:    ${s.top.slice(0, 6).map((q) => q.query).join(' · ')}`);
    if (s.rising?.length) {
      console.log(`    rising: ${s.rising.slice(0, 6).map((q) => `${q.query}${q.formattedValue ? ` (${q.formattedValue})` : ''}`).join(' · ')}`);
    }
    const spark = (s.points || []).map((p) => '▁▂▃▄▅▆▇█'[Math.min(7, Math.floor((p.value / 100) * 7))]).join('');
    console.log(`    serie:  ${spark}`);
  }

  console.log('');
  console.log('  SURSE');
  (payload.sources || []).forEach((s) => console.log(`    [${s.status}] ${s.label} — ${s.provider}${s.error ? ` (${s.error})` : ''}`));
  console.log('');
}


function csvOfRows(rows) {
  const header = ['rank', 'query', 'categorie', 'zile_aparitie', 'trafic_cumulat_estimat', 'cel_mai_bun_loc', 'prima_zi', 'ultima_zi', 'consistenta'];
  const lines = [header.join(',')];
  rows.forEach((r, i) => {
    lines.push(
      [i + 1, r.query, categoryLabel(r.category), r.days, r.totalTraffic, r.bestRank, r.firstSeen, r.lastSeen, r.consistency]
        .map(csvCell)
        .join(','),
    );
  });
  return lines.join('\n');
}

async function runRange(args) {
  const geo = String(args.geo || 'RO').toUpperCase();
  const today = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const to = typeof args.to === 'string' ? args.to : today;
  let from;
  if (typeof args.from === 'string') from = args.from;
  else {
    const days = Math.max(1, Math.min(Number(args.range) || 30, 400));
    from = new Date(Date.parse(`${to}T00:00:00Z`) - (days - 1) * 86400000).toISOString().slice(0, 10);
  }
  const demo = Boolean(args.demo);
  const exclude = String(args.exclude || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const top = Number(args.top) || 40;

  const total = dateRange(from, to).length;
  console.error(`Colectez ${total} zile pentru ${geo} (${from} → ${to})${demo ? ' [DEMO]' : ''}…`);

  const collected = await collectRange({
    geo,
    from,
    to,
    demo,
    onProgress: (p) => {
      if (p.index % 10 === 0 || p.index === p.total) {
        process.stderr.write(`\r  ${p.index}/${p.total} zile · ${p.done} cu date · ${p.empty} goale · ${p.failed} erori   `);
      }
    },
  });
  process.stderr.write('\n');

  const agg = aggregate(collected.days);
  const rows = agg.rows.filter((r) => !exclude.includes(r.category));
  const shown = rows.slice(0, top);

  if (args.csv) {
    process.stdout.write(`\uFEFF${csvOfRows(rows)}`);
    return;
  }

  console.log('');
  console.log(`  ${geo}  ·  ${from} → ${to}  ·  ${collected.days.length}/${total} zile cu date${demo ? '  [DEMO]' : ''}`);
  console.log(`  ${agg.totals.uniqueQueries} interogări unice · ${agg.totals.listedQueries} în tabel · trafic cumulat estimat ${nf.format(agg.totals.totalTraffic)}`);
  if (exclude.length) console.log(`  categorii excluse: ${exclude.map(categoryLabel).join(', ')}`);
  console.log('  ' + '─'.repeat(78));
  console.log(`  ${'#'.padStart(4)}  ${'interogare'.padEnd(34)} ${'categorie'.padEnd(22)} ${'zile'.padStart(5)} ${'trafic'.padStart(10)}`);
  console.log('  ' + '─'.repeat(78));
  shown.forEach((r, i) => {
    console.log(
      `  ${String(i + 1).padStart(4)}  ${r.query.slice(0, 34).padEnd(34)} ${categoryLabel(r.category).slice(0, 22).padEnd(22)} ${String(r.days).padStart(5)} ${nfCompact.format(r.totalTraffic).padStart(10)}`,
    );
  });

  if (agg.categories.length) {
    console.log('');
    console.log('  CATEGORII');
    agg.categories.forEach((c) => {
      const excluded = exclude.includes(c.id) ? ' (exclus)' : '';
      console.log(`    ${c.label.padEnd(26)} ${String(c.queries).padStart(5)} interogări  ${nfCompact.format(c.totalTraffic).padStart(9)}${excluded}`);
    });
  }

  if (collected.empty.length) {
    console.log('');
    console.log(`  Zile fără date de la Google: ${collected.empty.length}${collected.empty.length <= 8 ? ` (${collected.empty.join(', ')})` : ''}`);
  }
  if (collected.failed.length) {
    console.log(`  Zile cu erori: ${collected.failed.length}`);
  }
  console.log('');

  if (args.json) {
    await writeFile(String(args.json), JSON.stringify({ geo, from, to, demo, exclude, coverage: {
      daysWithData: collected.days.length,
      daysRequested: total,
      empty: collected.empty,
      failed: collected.failed,
    }, ...agg }, null, 2), 'utf8');
    console.error(`JSON scris în ${args.json}`);
  }
  if (args.out) {
    await writeFile(String(args.out), `\uFEFF${csvOfRows(rows)}`, 'utf8');
    console.error(`CSV scris în ${args.out}`);
  }
}


function csvOfHarvest(terms) {
  const lines = ['loc,termen,scor,aparitiI,cel_mai_bun_loc,medie_loc,surse,nou'];
  terms.forEach((t, i) => {
    lines.push(
      [i + 1, t.term, t.score, t.appearances, t.bestRank, t.avgRank, (t.seeds || []).join(' | '), t.isNew ? 'da' : 'nu']
        .map(csvCell)
        .join(','),
    );
  });
  return lines.join('\n');
}

async function runHarvestCli(args) {
  const geo = String(args.geo || 'RO').toUpperCase();
  const depth = Number(args.depth) === 1 ? 1 : 2;
  const demo = Boolean(args.demo);
  const maxExpansion = Number(args.expand) || 40;
  const top = Number(args.top) || 50;
  const extraSeeds = String(args.seeds || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  console.error(`Crawler sugestii pentru ${geo} (adâncime ${depth}${demo ? ', DEMO' : ''})…`);

  const result = await harvest({
    geo,
    depth,
    demo,
    extraSeeds,
    maxExpansion,
    onProgress: (p) => {
      if (p.index % 5 === 0 || p.index === p.total) {
        process.stderr.write(`\r  ${p.index}/${p.total} cereri · ${p.terms} termeni   `);
      }
    },
  });
  process.stderr.write('\n');

  if (args.csv) {
    process.stdout.write(`\uFEFF${csvOfHarvest(result.terms)}`);
    return;
  }

  console.log('');
  console.log(`  SUGESTII ${geo}  ·  ${result.stats.uniqueTerms} termeni  ·  ${result.stats.seedsQueried} prefixe  ·  ${result.stats.newTerms} noi  ·  ${Math.round((result.stats.durationMs || 0) / 1000)}s`);
  console.log('  ' + '─'.repeat(74));
  console.log(`  ${'#'.padStart(4)}  ${'termen'.padEnd(36)} ${'scor'.padStart(6)} ${'apariții'.padStart(9)} ${'loc'.padStart(5)}`);
  console.log('  ' + '─'.repeat(74));
  result.terms.slice(0, top).forEach((t, i) => {
    console.log(
      `  ${String(i + 1).padStart(4)}  ${t.term.slice(0, 36).padEnd(36)} ${String(t.score).padStart(6)} ${String(t.appearances).padStart(9)} ${('#' + t.bestRank).padStart(5)}${t.isNew ? '  NOU' : ''}`,
    );
  });
  if (result.errors?.length) {
    console.log('');
    console.log(`  ${result.errors.length} erori (ex. ${result.errors[0].seed}: ${result.errors[0].error})`);
  }
  console.log('');

  if (args.json) {
    await writeFile(String(args.json), JSON.stringify(result, null, 2), 'utf8');
    console.error(`JSON scris în ${args.json}`);
  }
  if (args.out) {
    await writeFile(String(args.out), `\uFEFF${csvOfHarvest(result.terms)}`, 'utf8');
    console.error(`CSV scris în ${args.out}`);
  }
}

main().catch((err) => {
  console.error('Eroare:', err?.message || err);
  process.exitCode = 1;
});
