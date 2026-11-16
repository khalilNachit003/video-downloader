/**
 * In-memory registry of running download jobs.
 * Lets the frontend poll real progress (bytes / total) while the server
 * downloads and remuxes the media locally.
 */
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';

const jobs = new Map();
let cleanupTimer = null;

export function createJob(init) {
  const id = randomUUID();
  const job = {
    id,
    state: 'running', // running | done | error
    bytesDone: 0,
    totalBytes: 0,
    error: null,
    file: null,
    ext: 'mp4',
    title: 'video',
    createdAt: Date.now(),
    ...init,
  };
  jobs.set(id, job);
  scheduleCleanup();
  return job;
}

export function getJob(id) {
  return jobs.get(id) || null;
}

export function deleteJob(id) {
  const job = jobs.get(id);
  jobs.delete(id);
  return job;
}

function scheduleCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(async () => {
    const now = Date.now();
    for (const [id, job] of [...jobs]) {
      if (now - job.createdAt > 10 * 60 * 1000) {
        jobs.delete(id);
        if (job.dir) await rm(job.dir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }, 60_000);
  cleanupTimer.unref?.();
}
