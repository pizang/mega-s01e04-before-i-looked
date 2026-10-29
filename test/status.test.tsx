import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';

describe('status board', () => {
  let runsDir: string;
  let config: RigConfig;

  beforeEach(async () => {
    runsDir = await mkdtemp(join(tmpdir(), 'rig-status-'));
    config = {
      adapter: 'shim',
      installed: '2026-10-29T14:06:00+01:00',
      beatEverySeconds: 60,
      runsDir,
    };
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(runsDir, { recursive: true, force: true });
  });

  it('shows the lane banner and links the nights in its configured directory', async () => {
    vi.stubEnv('LANE_MARKER', 'TEST-MARKER');
    await writeFile(join(runsDir, '2026-10-28.jsonl'), '');
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toMatch(/href=["']\/digest\/2026-10-28["']/);
  });

  it('health answers with the configured lane id', async () => {
    vi.stubEnv('LANE_ID', 'route-test-lane');
    const res = await createApp(config).request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, lane: 'route-test-lane' });
  });
});
