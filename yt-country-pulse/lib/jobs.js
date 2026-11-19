// Manager de job-uri pentru colectari pe interval.
// O colectare pe un an = ~365 de cereri, deci ruleaza in fundal;
// UI-ul urmareste progresul prin GET /api/jobs/:id.

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { aggregate } from './aggregate.js';
import { collectRange, dateRange } from './collect.js';
import { countryOf } from './countries.js';

const jobs = new Map();
const MAX_JOBS = 6; // pastram putine in memorie; rezultatele complete se scriu pe disc
const DATA_DIR = path.resolve(process.cwd(), 'data', 'collections');

function prune() {
  if (jobs.size <= MAX_JOBS) return;
  const finished = [...jobs.values()]
    .filter((j) => j.status !== 'running' && j.status !== 'queued')
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  while (jobs.size > MAX_JOBS && finished.length) {
    const victim = finished.shift();
    jobs.delete(victim.id);
  }
}

export function getJob(id) {
  return jobs.get(String(id)) || null;
}

export function cancelJob(id) {
  const job = jobs.get(String(id));
  if (!job) return null;
  if (job.status === 'running' || job.status === 'queued') {
    job.cancelRequested = true;
    job.status = 'cancelling';
  }
  return job;
}

export function createJob({ geo, from, to, demo = false }) {
  const code = String(geo || 'RO').toUpperCase();
  const dates = dateRange(from, to); // arunca daca intervalul e invalid
  const id = randomUUID().slice(0, 8);

  const job = {
    id,
    status: 'queued',
    geo: code,
    country: countryOf(code),
    from,
    to,
    demo: Boolean(demo),
    totalDays: dates.length,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    cancelRequested: false,
    progress: { index: 0, total: dates.length, done: 0, empty: 0, failed: 0, pct: 0, currentDate: null },
    coverage: null,
    result: null,
    error: null,
    file: null,
  };

  jobs.set(id, job);
  prune();
  run(job).catch((err) => {
    job.status = 'error';
    job.error = err?.message || 'eroare necunoscută';
    job.finishedAt = new Date().toISOString();
  });

  return job;
}

async function run(job) {
  job.status = 'running';
  job.startedAt = new Date().toISOString();

  const collected = await collectRange({
    geo: job.geo,
    from: job.from,
    to: job.to,
    demo: job.demo,
    isCancelled: () => job.cancelRequested,
    onProgress: (p) => {
      job.progress = { ...p, pct: Math.round((p.index / Math.max(p.total, 1)) * 100) };
    },
  });

  const agg = aggregate(collected.days);

  job.coverage = {
    daysWithData: collected.days.length,
    daysRequested: collected.requested,
    emptyDays: collected.empty,
    failedDays: collected.failed,
    mismatchedDays: collected.mismatched.slice(0, 30),
  };
  job.result = {
    ...agg,
    days: collected.days,
    geo: job.geo,
    country: job.country,
    from: job.from,
    to: job.to,
    demo: job.demo,
    generatedAt: new Date().toISOString(),
    coverage: job.coverage,
  };

  job.finishedAt = new Date().toISOString();
  job.status = collected.cancelled ? 'cancelled' : 'done';

  // scriem rezultatul pe disc ca sa poata fi pastrat/redeschis
  try {
    await mkdir(DATA_DIR, { recursive: true });
    const file = path.join(DATA_DIR, `${job.geo}-${job.from}_${job.to}-${job.id}.json`);
    await writeFile(file, JSON.stringify({ meta: jobMeta(job), result: job.result }), 'utf8');
    job.file = file;
  } catch {
    /* discul e optional: rezultatul rămâne in memorie */
  }
}

export function jobMeta(job) {
  return {
    id: job.id,
    status: job.status,
    geo: job.geo,
    country: job.country,
    from: job.from,
    to: job.to,
    demo: job.demo,
    totalDays: job.totalDays,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    progress: job.progress,
    coverage: job.coverage,
    error: job.error,
  };
}

export function listJobs() {
  return [...jobs.values()].map(jobMeta).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
