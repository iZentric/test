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

main().catch((err) => {
  console.error('Eroare:', err?.message || err);
  process.exitCode = 1;
});
