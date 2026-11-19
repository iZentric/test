// Server minimal pentru site-ul de căutări reale (fără dependințe).
// Servește public/ + un singur endpoint cu datele reale adunate de crawler.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'yt-country-pulse', 'data');
const PUBLIC = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3001;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(text);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const geo = String(url.searchParams.get('geo') || 'RO').toUpperCase().slice(0, 2);

  if (url.pathname === '/api/data') {
    const [harvest, channel] = await Promise.all([
      readJson(path.join(ROOT, 'harvest', `latest-${geo}.json`)),
      readJson(path.join(ROOT, 'channel', `latest-${geo}.json`)),
    ]);
    sendJson(res, 200, {
      ok: true,
      geo,
      harvest: harvest
        ? { finishedAt: harvest.finishedAt, depth: harvest.depth, stats: harvest.stats, terms: harvest.terms }
        : null,
      channel: channel
        ? { finishedAt: channel.finishedAt, target: channel.target, stats: channel.stats, matches: channel.matches, tested: channel.tested }
        : null,
    });
    return;
  }

  if (url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, geo, root: ROOT });
    return;
  }

  // fișiere statice
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403).end('interzis');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Site căutări reale: http://localhost:${PORT} (bind 0.0.0.0)`);
  console.log(`Date din: ${ROOT}`);
});
