/**
 * Tests for the Cloudflare Tunnel manager.
 *
 * Covers WH-TC-07 (missing cloudflared), URL extraction, and stop behavior.
 * The actual `cloudflared` binary is NOT required — we mock spawn behavior.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock child_process before importing the tunnel module
vi.mock('node:child_process', () => {
  const actual = vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    exec: vi.fn(),
  };
});

import { exec } from 'node:child_process';
import { createTunnelManager, findCloudflared } from '../webhook/tunnel.js';

const mockExec = vi.mocked(exec);

describe('findCloudflared', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('WH-TC-07: returns null when cloudflared is not installed', async () => {
    // promisify(exec) falls back to generic (err, result) when the mock replaces exec.
    // So we return { stdout, stderr } as the "result" object.
    mockExec.mockImplementation(((_cmd: string, _optsOrCb: unknown, maybeCb?: unknown) => {
      const cb = typeof _optsOrCb === 'function' ? _optsOrCb : maybeCb;
      if (typeof cb === 'function') (cb as (err: Error) => void)(new Error('command not found'));
      return {} as ReturnType<typeof exec>;
    }) as unknown as typeof exec);

    const result = await findCloudflared();
    expect(result).toBeNull();
  });

  it('returns path when cloudflared is found', async () => {
    // Return { stdout, stderr } as a single "result" so destructuring works after generic promisify
    mockExec.mockImplementation(((_cmd: string, _optsOrCb: unknown, maybeCb?: unknown) => {
      const cb = typeof _optsOrCb === 'function' ? _optsOrCb : maybeCb;
      if (typeof cb === 'function') {
        (cb as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
          stdout: '/usr/local/bin/cloudflared\n',
          stderr: '',
        });
      }
      return {} as ReturnType<typeof exec>;
    }) as unknown as typeof exec);

    const result = await findCloudflared();
    expect(result).toBe('/usr/local/bin/cloudflared');
  });
});

describe('TunnelManager', () => {
  let tunnel: ReturnType<typeof createTunnelManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    tunnel = createTunnelManager();
  });

  it('starts as not running', () => {
    expect(tunnel.isRunning).toBe(false);
  });

  it('stop is safe to call when not running', async () => {
    await tunnel.stop();
    expect(tunnel.isRunning).toBe(false);
  });
});
