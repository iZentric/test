// Cache pe disc, cu TTL. Fiecare intrare e un fisier JSON in .cache/yt-country-pulse.
// Scop: sa nu lovim Google la fiecare refresh si sa respectam rate limits.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = path.resolve(process.cwd(), '.cache', 'yt-country-pulse');

function keyToFile(key) {
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 32);
  return path.join(CACHE_DIR, `${hash}.json`);
}

export async function cacheRead(key, ttlMs) {
  try {
    const raw = await readFile(keyToFile(key), 'utf8');
    const entry = JSON.parse(raw);
    if (!entry || typeof entry.expiresAt !== 'number') return null;
    if (Date.now() > entry.expiresAt) return null;
    return { data: entry.data, fetchedAt: entry.fetchedAt, stale: false };
  } catch {
    return null;
  }
}

export async function cacheWrite(key, data, ttlMs) {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const entry = { fetchedAt: new Date().toISOString(), expiresAt: Date.now() + ttlMs, data };
    await writeFile(keyToFile(key), JSON.stringify(entry), 'utf8');
  } catch {
    /* cache-ul e optional: nu blocam requestul daca nu putem scrie */
  }
}

export async function cached(key, ttlMs, producer) {
  const hit = await cacheRead(key, ttlMs);
  if (hit) return { value: hit.data, cached: true, fetchedAt: hit.fetchedAt };
  const value = await producer();
  await cacheWrite(key, value, ttlMs);
  return { value, cached: false, fetchedAt: new Date().toISOString() };
}
