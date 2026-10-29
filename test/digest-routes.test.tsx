import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { NightDigest } from '../src/digest/types.js';

const night = '2026-10-28';

function text(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tableRows(html: string) {
  return [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)]
    .map(([markup]) => ({
      markup,
      cells: [...markup.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
        .map(([, cell]) => text(cell)),
    }))
    .filter(({ cells }) => cells.length > 0);
}

const warningClass = /class=["'][^"']*\bwarn\b[^"']*["']/;

describe('digest routes', () => {
  let root: string;
  let runsDir: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'rig-digest-routes-'));
    runsDir = join(root, 'runs');
    await mkdir(runsDir);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function app() {
    return createApp({
      adapter: 'shim',
      installed: '2026-10-29T14:06:00+01:00',
      beatEverySeconds: 60,
      runsDir,
    });
  }

  it('serves matching sorted rows, event counts, warnings and offsets despite malformed lines', async () => {
    const firstAt = '2026-10-28T23:00:00-04:00';
    const lastAt = '2026-10-28T23:04:00-04:00';
    const events = [
      { at: firstAt, job: 'zeta/failed', owner: 'ops', status: 'fail', error: 'quota exhausted' },
      { at: firstAt, job: 'alpha/recovered', owner: 'rook', status: 'retry', error: 'first error' },
      { at: firstAt, job: 'middle/unowned', owner: null, status: 'ok' },
      { at: '2026-10-28T23:01:00-04:00', job: 'alpha/recovered', owner: 'rook', status: 'retry', error: 'latest error' },
      { at: '2026-10-28T23:02:00-04:00', job: 'alpha/recovered', owner: 'rook', status: 'retry' },
      { at: lastAt, job: 'alpha/recovered', owner: 'rook', status: 'ok' },
    ];
    await writeFile(join(runsDir, `${night}.jsonl`), [
      JSON.stringify(events[0]),
      '{broken json',
      ...events.slice(1).map((event) => JSON.stringify(event)),
      'not json either',
      '',
    ].join('\n'));

    const instance = app();
    const [page, api] = await Promise.all([
      instance.request(`/digest/${night}`),
      instance.request(`/api/digest/${night}`),
    ]);
    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(api.headers.get('content-type')).toContain('application/json');

    const digest: NightDigest = await api.json();
    expect(digest).toEqual({
      night,
      badLines: 2,
      counts: { ok: 2, retry: 3, fail: 1 },
      rows: [
        { job: 'alpha/recovered', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok', lastError: 'latest error', firstAt, lastAt },
        { job: 'middle/unowned', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null, firstAt, lastAt: firstAt },
        { job: 'zeta/failed', owner: 'ops', runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exhausted', firstAt, lastAt: firstAt },
      ],
    });

    const html = await page.text();
    const rows = tableRows(html);
    expect(rows.map(({ cells }) => cells[0])).toEqual(digest.rows.map(({ job }) => job));
    expect(rows.map(({ cells }) => cells)).toEqual(digest.rows.map((row) => [
      row.job,
      row.owner ?? '—',
      String(row.runs),
      String(row.retries),
      row.lastStatus,
      row.lastError ?? '—',
      row.firstAt,
      row.lastAt,
    ]));
    expect(rows[0].markup).toMatch(warningClass);
    expect(rows[2].markup).toMatch(warningClass);
    expect(rows[1].markup).not.toMatch(warningClass);
  });

  it('returns 404 for both representations of a missing night', async () => {
    const instance = app();
    for (const prefix of ['/digest', '/api/digest']) {
      const response = await instance.request(`${prefix}/${night}`);
      expect(response.status).toBe(404);
    }
  });

  it('serves an existing empty night as 200 with no rows or events', async () => {
    await writeFile(join(runsDir, `${night}.jsonl`), '');
    const instance = app();
    const page = await instance.request(`/digest/${night}`);
    const api = await instance.request(`/api/digest/${night}`);
    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    const html = await page.text();
    expect(text(html)).toMatch(/nothing ran/i);
    expect(tableRows(html)).toEqual([]);
    expect(await api.json()).toEqual({
      night,
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('does not read a sibling file through an encoded slash in the night parameter', async () => {
    await writeFile(join(root, 'outside.jsonl'), JSON.stringify({
      at: '2026-10-28T23:00:00+01:00',
      job: 'outside-secret-job',
      owner: 'ops',
      status: 'ok',
    }));
    const instance = app();
    for (const prefix of ['/digest', '/api/digest']) {
      const response = await instance.request(`${prefix}/..%2Foutside`);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('outside-secret-job');
    }
  });
});
