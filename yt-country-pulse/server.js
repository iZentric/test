// Server HTTP fara dependinte (node:http). Serveste UI-ul din /public si API-ul JSON.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPulse } from './lib/pulse.js';
import { COUNTRIES, countryTerms } from './lib/countries.js';
import { upcomingEvents } from './lib/events.js';
import {
  startHarvest,
  getHarvestJob,
  cancelHarvestJob,
  listHarvestJobs,
  harvestMeta,
  loadLatest,
} from './lib/harvest.js';
import { createJob, getJob, cancelJob, listJobs, jobMeta } from './lib/jobs.js';
import { MAX_DAYS, isValidDate } from './lib/collect.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

// Rate limit simplu in memorie: 40 cereri / minut / IP.
const RATE = { windowMs: 60_000, max: 40 };
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip) || [];
  const recent = entry.filter((t) => now - t < RATE.windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > RATE.max;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function serveStatic(req, res, pathname) {
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const filePath = path.join(PUBLIC_DIR, relative);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 — nu există');
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 64 * 1024) {
        reject(new Error('Body prea mare'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const ip = req.socket.remoteAddress || 'unknown';

  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type',
      }).end();
      return;
    }

    if (url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true, uptime: Math.round(process.uptime()), countries: COUNTRIES.length });
      return;
    }

    if (url.pathname === '/api/countries') {
      sendJson(res, 200, {
        countries: COUNTRIES.map((c) => ({ ...c, terms: countryTerms(c.code) })),
      });
      return;
    }

    if (url.pathname === '/api/events') {
      const geo = String(url.searchParams.get('geo') || 'RO').toUpperCase().slice(0, 2);
      const days = Number(url.searchParams.get('days') || 60);
      const from = url.searchParams.get('from') || undefined;
      const events = upcomingEvents({ geo, days: Number.isFinite(days) ? days : 60, from });
      sendJson(res, 200, { ok: true, geo, events });
      return;
    }

    if (url.pathname === '/api/pulse' && (req.method === 'GET' || req.method === 'POST')) {
      if (rateLimited(ip)) {
        sendJson(res, 429, { ok: false, error: 'Prea multe cereri. Așteaptă un minut.' });
        return;
      }

      const params = new URL(req.url, 'http://local').searchParams;
      let input = {};
      if (req.method === 'POST') {
        try {
          input = JSON.parse((await readBody(req)) || '{}');
        } catch {
          sendJson(res, 400, { ok: false, error: 'JSON invalid în body.' });
          return;
        }
      }

      const geo = String(input.geo || params.get('geo') || 'RO').toUpperCase().slice(0, 2);
      const date = input.date || params.get('date') || null;
      const seed = input.seed ?? params.get('seed') ?? '';
      const apiKey =
        input.apiKey ||
        params.get('apiKey') ||
        req.headers['x-youtube-key'] ||
        process.env.YOUTUBE_API_KEY ||
        '';
      const demo = String(input.demo ?? params.get('demo') ?? '') === '1' ||
        input.demo === true ||
        params.get('demo') === 'true';

      const payload = await buildPulse({
        geo,
        date: date ? String(date).slice(0, 10) : null,
        seed,
        apiKey: String(apiKey || ''),
        demo,
        videoLimit: Number(input.videoLimit || params.get('videoLimit') || 24),
      });

      res.setHeader('access-control-allow-origin', '*');
      sendJson(res, 200, payload);
      return;
    }

    // ---------- crawler de sugestii (autocomplete) ----------
    if (url.pathname === '/api/harvest/latest' && req.method === 'GET') {
      const geo = String(url.searchParams.get('geo') || 'RO').toUpperCase().slice(0, 2);
      const latest = await loadLatest(geo);
      sendJson(res, 200, {
        ok: true,
        geo,
        latest: latest
          ? {
              finishedAt: latest.finishedAt,
              stats: latest.stats,
              terms: latest.terms.slice(0, 500),
              total: latest.terms.length,
            }
          : null,
      });
      return;
    }

    if (url.pathname === '/api/harvest' && req.method === 'POST') {
      if (rateLimited(ip)) {
        sendJson(res, 429, { ok: false, error: 'Prea multe cereri. Așteaptă un minut.' });
        return;
      }
      let body;
      try {
        body = JSON.parse((await readBody(req)) || '{}');
      } catch {
        sendJson(res, 400, { ok: false, error: 'JSON invalid în body.' });
        return;
      }
      const geo = String(body.geo || 'RO').toUpperCase().slice(0, 2);
      const depth = Number(body.depth) >= 2 ? 2 : 1;
      const extraSeeds = Array.isArray(body.extraSeeds)
        ? body.extraSeeds.map((x) => String(x).trim()).filter(Boolean).slice(0, 30)
        : String(body.extraSeeds || '')
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
            .slice(0, 30);
      const job = startHarvest({
        geo,
        hl: String(body.hl || (geo === 'RO' ? 'ro' : 'en')).slice(0, 5),
        depth,
        extraSeeds,
        maxExpansion: Math.max(0, Math.min(Number(body.maxExpansion) || 40, 200)),
        demo: Boolean(body.demo),
      });
      sendJson(res, 202, { ok: true, jobId: job.id, job: harvestMeta(job) });
      return;
    }

    if (url.pathname === '/api/harvest' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, jobs: listHarvestJobs() });
      return;
    }

    const harvestMatch = url.pathname.match(/^\/api\/harvest\/([A-Za-z0-9-]+)(\/cancel)?$/);
    if (harvestMatch) {
      const job = getHarvestJob(harvestMatch[1]);
      if (!job) {
        sendJson(res, 404, { ok: false, error: 'Job inexistent (sau șters din memorie).' });
        return;
      }
      if (harvestMatch[2]) {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'Folosește POST pentru anulare.' });
          return;
        }
        cancelHarvestJob(job.id);
        sendJson(res, 200, { ok: true, job: harvestMeta(job) });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        job: harvestMeta(job),
        result: job.status === 'done' || job.status === 'cancelled' ? job.result : null,
      });
      return;
    }

    // ---------- colectare pe interval (job in fundal) ----------
    if (url.pathname === '/api/collect' && req.method === 'POST') {
      if (rateLimited(ip)) {
        sendJson(res, 429, { ok: false, error: 'Prea multe cereri. Așteaptă un minut.' });
        return;
      }

      let body;
      try {
        body = JSON.parse((await readBody(req)) || '{}');
      } catch {
        sendJson(res, 400, { ok: false, error: 'JSON invalid în body.' });
        return;
      }

      const geo = String(body.geo || 'RO').toUpperCase().slice(0, 2);
      const to = String(body.to || '').slice(0, 10) || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const from = String(body.from || '').slice(0, 10) || new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10);

      if (!isValidDate(from) || !isValidDate(to)) {
        sendJson(res, 400, { ok: false, error: 'Datele trebuie să fie în format YYYY-MM-DD.' });
        return;
      }
      if (Date.parse(from) > Date.parse(to)) {
        sendJson(res, 400, { ok: false, error: 'Data de început e după data de sfârșit.' });
        return;
      }
      const span = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
      if (span > MAX_DAYS) {
        sendJson(res, 400, { ok: false, error: `Intervalul maxim e ${MAX_DAYS} de zile (ai cerut ${span}).` });
        return;
      }

      const job = createJob({ geo, from, to, demo: Boolean(body.demo) });
      sendJson(res, 202, { ok: true, jobId: job.id, job: jobMeta(job) });
      return;
    }

    if (url.pathname === '/api/jobs' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, jobs: listJobs() });
      return;
    }

    const jobMatch = url.pathname.match(/^\/api\/jobs\/([A-Za-z0-9-]+)(\/cancel)?$/);
    if (jobMatch) {
      const job = getJob(jobMatch[1]);
      if (!job) {
        sendJson(res, 404, { ok: false, error: 'Job inexistent (sau a fost șters din memorie).' });
        return;
      }
      if (jobMatch[2]) {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'Folosește POST pentru anulare.' });
          return;
        }
        cancelJob(job.id);
        sendJson(res, 200, { ok: true, job: jobMeta(job) });
        return;
      }
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, error: 'Metodă nepermisă' });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        job: jobMeta(job),
        result: job.status === 'done' || job.status === 'cancelled' ? job.result : null,
      });
      return;
    }

    if (req.method === 'GET') {
      await serveStatic(req, res, url.pathname);
      return;
    }

    sendJson(res, 405, { ok: false, error: 'Metodă nepermisă' });
  } catch (err) {
    const message = err?.message || 'Eroare internă';
    console.error('[pulse] eroare:', message);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: message });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`YouTube Country Pulse rulează pe http://localhost:${PORT} (bind ${HOST})`);
  console.log(`Cheie YouTube Data API: ${process.env.YOUTUBE_API_KEY ? 'setată din env' : 'nu e setată (o poți da din UI)'}`);
});
