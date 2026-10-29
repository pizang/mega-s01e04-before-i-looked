import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

type RunEvent = {
  at: string;
  time: number;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

type Job = {
  row: DigestRow;
  firstTime: number;
  lastTime: number;
  lastErrorTime: number;
};

function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date;
}

function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (
    typeof event.at !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(event.at) ||
    !validDate(event.at.slice(0, 10)) ||
    typeof event.job !== 'string' || event.job.trim() === '' ||
    (event.status !== 'ok' && event.status !== 'retry' && event.status !== 'fail') ||
    (event.owner !== null && typeof event.owner !== 'string') ||
    (event.error !== undefined && event.error !== null && typeof event.error !== 'string')
  ) return null;
  const time = Date.parse(event.at);
  if (!Number.isFinite(time)) return null;
  return {
    at: event.at,
    time,
    job: event.job,
    status: event.status,
    owner: event.owner,
    error: event.error ?? null,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!validDate(night)) return null;
  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const jobs = new Map<string, Job>();
  const counts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;
  for (const line of contents.split('\n')) {
    if (line.trim() === '') continue;
    const event = parseEvent(line);
    if (event === null) {
      badLines++;
      continue;
    }
    counts[event.status]++;
    const job = jobs.get(event.job);
    if (job === undefined) {
      jobs.set(event.job, {
        row: {
          job: event.job,
          owner: event.owner,
          runs: 1,
          retries: event.status === 'retry' ? 1 : 0,
          lastStatus: event.status,
          lastError: event.error,
          firstAt: event.at,
          lastAt: event.at,
        },
        firstTime: event.time,
        lastTime: event.time,
        lastErrorTime: event.error === null ? -Infinity : event.time,
      });
      continue;
    }
    job.row.runs++;
    if (event.status === 'retry') job.row.retries++;
    if (event.time < job.firstTime) {
      job.firstTime = event.time;
      job.row.firstAt = event.at;
    }
    // Equal-time events retain file order: first stays first, later lines win last.
    if (event.time >= job.lastTime) {
      job.lastTime = event.time;
      job.row.lastAt = event.at;
      job.row.lastStatus = event.status;
      job.row.owner = event.owner;
    }
    if (event.error !== null && event.time >= job.lastErrorTime) {
      job.lastErrorTime = event.time;
      job.row.lastError = event.error;
    }
  }

  const rows = Array.from(jobs.values(), (job) => job.row);
  rows.sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return { night, rows, badLines, counts };
};
