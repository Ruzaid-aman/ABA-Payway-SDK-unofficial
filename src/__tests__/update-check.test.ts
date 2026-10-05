import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isNewerVersion, isTopLevelHelpArgv, maybeNoticeUpdate } from '../cli/update-check.js';

function ttyStreams(): {
  streams: { stdout: { isTTY: boolean }; stderr: { write: (chunk: string) => unknown } };
  stderrText: () => string;
} {
  const chunks: string[] = [];
  return {
    streams: { stdout: { isTTY: true }, stderr: { write: (chunk: string) => chunks.push(chunk) } },
    stderrText: () => chunks.join(''),
  };
}

const BASE = {
  currentVersion: '1.5.0',
  env: {} as NodeJS.ProcessEnv,
  fetchImpl: (async () => {
    throw new Error('unexpected fetch');
  }) as typeof fetch,
  now: () => 1_000_000,
  timeoutMs: 50,
};

describe('isNewerVersion', () => {
  it('compares numerically and handles equal/older', () => {
    expect(isNewerVersion('1.5.0', '1.6.0')).toBe(true);
    expect(isNewerVersion('1.5.0', '1.5.10')).toBe(true);
    expect(isNewerVersion('1.10.0', '1.9.0')).toBe(false);
    expect(isNewerVersion('1.5.0', '1.5.0')).toBe(false);
    expect(isNewerVersion('1.5.0', 'v1.6.0')).toBe(true);
  });
});

describe('isTopLevelHelpArgv', () => {
  it('matches only pure help invocations', () => {
    expect(isTopLevelHelpArgv(['--help'])).toBe(true);
    expect(isTopLevelHelpArgv(['-h'])).toBe(true);
    expect(isTopLevelHelpArgv(['help'])).toBe(true);
    expect(isTopLevelHelpArgv([])).toBe(false);
    expect(isTopLevelHelpArgv(['--help', '--json'])).toBe(false);
    expect(isTopLevelHelpArgv(['generate-qr'])).toBe(false);
  });
});

describe('maybeNoticeUpdate', () => {
  let tempDir: string;
  let cachePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'payway-update-check-'));
    cachePath = path.join(tempDir, 'update-check.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('notices from a fresh cache without fetching', async () => {
    writeFileSync(cachePath, `${JSON.stringify({ lastCheck: 0, latestVersion: '2.0.0' })}\n`);
    const { streams, stderrText } = ttyStreams();
    let fetched = false;
    const fetchImpl = (async () => {
      fetched = true;
      throw new Error('no');
    }) as typeof fetch;
    await maybeNoticeUpdate({ ...BASE, argv: [], cachePath, streams, fetchImpl });
    expect(fetched).toBe(false);
    expect(stderrText()).toContain('v1.5.0');
    expect(stderrText()).toContain('v2.0.0');
  });

  it('fetches when stale, persists the cache, and notices', async () => {
    const { streams, stderrText } = ttyStreams();
    const fetchImpl = (async () => ({ ok: true, json: async () => ({ version: '1.6.0' }) })) as unknown as typeof fetch;
    await maybeNoticeUpdate({ ...BASE, argv: [], cachePath, streams, fetchImpl });
    expect(stderrText()).toContain('v1.6.0');
    const cache = JSON.parse(readFileSync(cachePath, 'utf8')) as { latestVersion: string; lastCheck: number };
    expect(cache.latestVersion).toBe('1.6.0');
    expect(cache.lastCheck).toBe(1_000_000);
  });

  it('stays silent when the fetch fails (no notice, no cache write)', async () => {
    const { streams, stderrText } = ttyStreams();
    const fetchImpl = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await maybeNoticeUpdate({ ...BASE, argv: [], cachePath, streams, fetchImpl });
    expect(stderrText()).toBe('');
    expect(() => readFileSync(cachePath, 'utf8')).toThrow();
  });

  it('stays silent for non-TTY stdout', async () => {
    const chunks: string[] = [];
    const streams = { stdout: { isTTY: false }, stderr: { write: (chunk: string) => chunks.push(chunk) } };
    await maybeNoticeUpdate({ ...BASE, argv: [], cachePath, streams });
    expect(chunks.join('')).toBe('');
  });

  it('stays silent when PAYWAY_NO_UPDATE_CHECK=1', async () => {
    const { streams, stderrText } = ttyStreams();
    await maybeNoticeUpdate({
      ...BASE,
      argv: [],
      cachePath,
      streams,
      env: { PAYWAY_NO_UPDATE_CHECK: '1' } as NodeJS.ProcessEnv,
    });
    expect(stderrText()).toBe('');
  });

  it('never fires on real commands', async () => {
    const { streams, stderrText } = ttyStreams();
    await maybeNoticeUpdate({ ...BASE, argv: ['generate-qr', '-a', '5.00'], cachePath, streams });
    expect(stderrText()).toBe('');
  });

  it('fires on a top-level --help invocation', async () => {
    const { streams, stderrText } = ttyStreams();
    const fetchImpl = (async () => ({ ok: true, json: async () => ({ version: '1.6.0' }) })) as unknown as typeof fetch;
    await maybeNoticeUpdate({ ...BASE, argv: ['--help'], cachePath, streams, fetchImpl });
    expect(stderrText()).toContain('v1.6.0');
  });

  it('does not downgrade when latest is older than current', async () => {
    const { streams, stderrText } = ttyStreams();
    const fetchImpl = (async () => ({ ok: true, json: async () => ({ version: '1.4.0' }) })) as unknown as typeof fetch;
    await maybeNoticeUpdate({ ...BASE, argv: [], cachePath, streams, fetchImpl });
    expect(stderrText()).toBe('');
  });
});
