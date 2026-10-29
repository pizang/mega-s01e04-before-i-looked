import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const night = '2026-10-28';
const temporaryDirs: string[] = [];

function runsDir(contents?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-reader-'));
  temporaryDirs.push(dir);
  if (contents !== undefined) writeFileSync(join(dir, `${night}.jsonl`), contents);
  return dir;
}

afterEach(() => {
  for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
  temporaryDirs.length = 0;
});

describe('readNight', () => {
  it('reads the sample as exactly five sorted jobs and one bad line', () => {
    expect(readNight('runs', night)).toEqual({
      night,
      rows: [
        {
          job: 'digest/render', owner: null, runs: 1, retries: 0,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3,
          lastStatus: 'ok', lastError: 'upstream 503',
          firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
        },
        {
          job: 'lane/sync', owner: 'rook', runs: 8, retries: 1,
          lastStatus: 'ok', lastError: 'lock held',
          firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0,
          lastStatus: 'fail', lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00',
        },
      ],
      badLines: 1,
      counts: { ok: 10, retry: 4, fail: 1 },
    });
  });

  it('keeps a recovered job, its null owner, and its last error', () => {
    const dir = runsDir([
      { at: '2026-10-28T01:00:00+01:00', job: 'recover', status: 'retry', owner: 'rook', error: 'locked' },
      { at: '2026-10-28T01:01:00+01:00', job: 'recover', status: 'fail', owner: 'rook', error: 'unavailable' },
      { at: '2026-10-28T01:02:00+01:00', job: 'recover', status: 'ok', owner: null, error: null },
    ].map((event) => JSON.stringify(event)).join('\n'));
    expect(readNight(dir, night)).toEqual({
      night,
      rows: [{
        job: 'recover', owner: null, runs: 3, retries: 1,
        lastStatus: 'ok', lastError: 'unavailable',
        firstAt: '2026-10-28T01:00:00+01:00', lastAt: '2026-10-28T01:02:00+01:00',
      }],
      badLines: 0,
      counts: { ok: 1, retry: 1, fail: 1 },
    });
  });

  it('uses chronological instants, not line order or offset-string order', () => {
    const dir = runsDir([
      { at: '2026-10-28T01:00:00-02:00', job: 'unordered', status: 'ok', owner: 'latest' },
      { at: '2026-10-28T00:00:00Z', job: 'unordered', status: 'retry', owner: 'first', error: 'oldest' },
      { at: '2026-10-28T02:00:00+01:00', job: 'unordered', status: 'retry', owner: 'middle', error: 'newest error' },
      { at: '2026-10-28T00:30:00Z', job: 'unordered', status: 'fail', owner: 'earlier', error: 'older error' },
    ].map((event) => JSON.stringify(event)).join('\n'));
    expect(readNight(dir, night)).toEqual({
      night,
      rows: [{
        job: 'unordered', owner: 'latest', runs: 4, retries: 2,
        lastStatus: 'ok', lastError: 'newest error',
        firstAt: '2026-10-28T00:00:00Z', lastAt: '2026-10-28T01:00:00-02:00',
      }],
      badLines: 0,
      counts: { ok: 1, retry: 2, fail: 1 },
    });
  });

  it('resolves equal timestamps in file order while preserving each original offset', () => {
    const dir = runsDir([
      { at: '2026-10-28T01:00:00+01:00', job: 'tied', status: 'retry', owner: 'first', error: 'first error' },
      { at: '2026-10-28T00:00:00Z', job: 'tied', status: 'fail', owner: 'second', error: 'last error' },
      { at: '2026-10-28T02:00:00+02:00', job: 'tied', status: 'ok', owner: null },
    ].map((event) => JSON.stringify(event)).join('\n'));
    expect(readNight(dir, night)).toEqual({
      night,
      rows: [{
        job: 'tied', owner: null, runs: 3, retries: 1,
        lastStatus: 'ok', lastError: 'last error',
        firstAt: '2026-10-28T01:00:00+01:00', lastAt: '2026-10-28T02:00:00+02:00',
      }],
      badLines: 0,
      counts: { ok: 1, retry: 1, fail: 1 },
    });
  });

  it('counts malformed JSON and invalid records without losing subsequent valid events', () => {
    const valid = { at: '2026-10-28T01:00:00+01:00', job: 'valid', status: 'ok', owner: null };
    const invalid = [
      null, [], true, 42, 'text', {},
      { ...valid, at: undefined },
      { ...valid, at: 123 },
      { ...valid, at: 'not a time' },
      { ...valid, at: '2026-10-28' },
      { ...valid, at: '2026-10-28T01:00:00' },
      { ...valid, at: '2026-02-30T01:00:00Z' },
      { ...valid, at: '2026-10-28T24:00:00Z' },
      { ...valid, at: '2026-10-28T01:00:00+25:00' },
      { ...valid, job: undefined },
      { ...valid, job: 123 },
      { ...valid, job: '  ' },
      { ...valid, status: undefined },
      { ...valid, status: 'pending' },
      { ...valid, owner: undefined },
      { ...valid, owner: 123 },
      { ...valid, error: false },
      { ...valid, error: {} },
    ];
    const lines = [
      JSON.stringify(valid),
      '{"unfinished":',
      'not json',
      ...invalid.map((event) => JSON.stringify(event)),
      JSON.stringify({ ...valid, job: 'after', error: '' }),
    ];
    expect(readNight(runsDir(lines.join('\n')), night)).toEqual({
      night,
      rows: [
        {
          job: 'after', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: '',
          firstAt: valid.at, lastAt: valid.at,
        },
        {
          job: 'valid', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
          firstAt: valid.at, lastAt: valid.at,
        },
      ],
      badLines: invalid.length + 2,
      counts: { ok: 2, retry: 0, fail: 0 },
    });
  });

  it('ignores whitespace, blank lines, CRLF separators, and a trailing newline', () => {
    const event = { at: '2026-10-28T01:00:00.123+01:00', job: 'only', status: 'ok', owner: null };
    const result = readNight(runsDir(`\r\n  \t\r\n${JSON.stringify(event)}\r\n\r\n`), night);
    expect(result).toEqual({
      night,
      rows: [{
        job: 'only', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
        firstAt: event.at, lastAt: event.at,
      }],
      badLines: 0,
      counts: { ok: 1, retry: 0, fail: 0 },
    });
  });

  it.each(['', ' \t\r\n\n'])('returns an empty digest for an existing empty night (%j)', (contents) => {
    expect(readNight(runsDir(contents), night)).toEqual({
      night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('keeps a night containing only invalid records distinct from a missing night', () => {
    expect(readNight(runsDir('null\nnot json\n'), night)).toEqual({
      night, rows: [], badLines: 2, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('returns null for a missing file or runs directory', () => {
    const dir = runsDir();
    expect(readNight(dir, night)).toBeNull();
    expect(readNight(join(dir, 'missing'), night)).toBeNull();
  });

  it.each(['', '../2026-10-28', '2026-1-28', '2026-10-28.jsonl', '2026-02-30', '2026-13-01'])(
    'returns null for invalid night %j even when a matching filename exists', (invalidNight) => {
      const dir = runsDir();
      if (invalidNight && !invalidNight.includes('/')) {
        writeFileSync(join(dir, `${invalidNight}.jsonl`), 'not json');
      }
      expect(readNight(dir, invalidNight)).toBeNull();
    },
  );

  it('does not hide filesystem errors other than a missing file', () => {
    const dir = runsDir();
    mkdirSync(join(dir, `${night}.jsonl`));
    expect(() => readNight(dir, night)).toThrow();
  });
});
