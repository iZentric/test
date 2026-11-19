// Server HTTP fara dependinte (node:http). Serveste UI-ul din /public si API-ul JSON.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPulse } from './lib/pulse.js';
import { COUNTRIES } from './lib/countries.js';

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
      sendJson(res, 200, { countries: COUNTRIES });
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
