/**
 * Coverage for the zero-boilerplate facade (`src/sdk.ts`) and the Cloudflare
 * tunnel manager (`src/webhook/tunnel.ts`) — no network, no real cloudflared.
 */
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sdk } from '../sdk.js';
import { createTunnelManager, findCloudflared } from '../webhook/tunnel.js';

const tempDirs: string[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('sdk facade', () => {
  const payload = {
    transactionId: 'SDK-FACADE-1',
    amount: 5,
    paymentOption: 'abapay_khqr' as const,
  };
  const config = { merchantId: 'sdk-m', apiKey: 'sdk-key', environment: 'sandbox' as const };

  it('test() generates a mock session for every response type without any HTTP call', () => {
    for (const responseType of ['qr_string', 'qr_image', 'checkout_qr_url', 'deeplink', 'url', 'html'] as const) {
      const session = sdk.test(responseType, payload);
      expect(session.responseType).toBe(responseType);
      expect(session.sessionId).toContain('SDK-FACADE-1');
      expect(session.status).toBe('pending');
    }
  });

  it('initiate() runs the real Module 1 pipeline against a stubbed gateway', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({
              status: { code: '00', message: 'Success!' },
              qrString: '000201010212',
              qrImage: 'aW1n',
            }),
        };
      }),
    );
    const session = await sdk.initiate(payload, config);
    expect(session.sessionId).toContain('SDK-FACADE-1');
    expect(session.responseType).toBe('qr_string');
    expect(session.responsePayload).toBe('000201010212');
  });

  it('client.handleResponse() delegates to the Module 2 handler', async () => {
    const session = sdk.test('qr_image', payload);
    // No DOM in this environment → the handler reports the skip outcome.
    const result = await sdk.client.handleResponse(session);
    expect(result.action).toBe('qr_image_skipped_no_dom');
    expect(result.success).toBe(true);
  });

  it('runTestSuiteAndPrint() prints the formatted report and returns it', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const report = await sdk.runTestSuiteAndPrint();
      expect(report.total).toBeGreaterThan(0);
      expect(report.passed).toBe(report.total);
      const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(printed).toContain('Total');
      expect(printed).toContain('PASS');
    } finally {
      logSpy.mockRestore();
    }
  }, 60_000);
});

describe('tunnel manager', () => {
  it('reports not-running and stop() resolves immediately before start', async () => {
    const manager = createTunnelManager('definitely-not-running.exe');
    expect(manager.isRunning).toBe(false);
    await expect(manager.stop()).resolves.toBeUndefined();
  });

  it('start() rejects with install guidance when the binary is missing (ENOENT)', async () => {
    const manager = createTunnelManager('definitely-missing-cloudflared-xyz.exe');
    await expect(manager.start(4599)).rejects.toThrow(/cloudflared not found/);
    expect(manager.isRunning).toBe(false);
  });

  // DX-BUILD-003: the spawn-based fixture is platform-specific. The `.cmd`
  // batch shim only executes under cmd.exe (Windows `needsShell` spawn path);
  // on POSIX, spawning a batch file fails with EACCES/ENOENT before any
  // tunnel logic runs. Each variant is gated to its platform and both
  // exercise the same contract: spawn → parse stdout URL → stop() cleanup.
  it('start() resolves the public URL from a fake cloudflared (.cmd shim) and stop() cleans up', {
    skip: process.platform !== 'win32',
    timeout: 20_000,
  }, async () => {
    // Windows batch shim: print a tunnel URL on stdout, then idle.
    const dir = mkdtempSync(path.join(tmpdir(), 'payway-tunnel-'));
    tempDirs.push(dir);
    const scriptPath = path.join(dir, 'fake-cloudflared.cmd');
    writeFileSync(
      scriptPath,
      [
        '@echo off',
        'echo INF Starting tunnel https://fake-tunnel-abc123.trycloudflare.com',
        'ping -n 20 127.0.0.1 > nul',
        '',
      ].join('\r\n'),
    );
    const manager = createTunnelManager(scriptPath);
    const url = await manager.start(4598);
    expect(url).toBe('https://fake-tunnel-abc123.trycloudflare.com');
    expect(manager.isRunning).toBe(true);
    await manager.stop();
    expect(manager.isRunning).toBe(false);
  });

  it('start() resolves the public URL from a fake cloudflared (POSIX sh shim) and stop() cleans up', {
    skip: process.platform === 'win32',
    timeout: 20_000,
  }, async () => {
    // POSIX shim: executable shebang script (spawned directly, no shell).
    // print a tunnel URL on stdout, then idle.
    const dir = mkdtempSync(path.join(tmpdir(), 'payway-tunnel-'));
    tempDirs.push(dir);
    const scriptPath = path.join(dir, 'fake-cloudflared.sh');
    writeFileSync(
      scriptPath,
      ['#!/bin/sh', 'echo INF Starting tunnel https://fake-tunnel-posix9.trycloudflare.com', 'sleep 15', ''].join('\n'),
    );
    chmodSync(scriptPath, 0o755);
    const manager = createTunnelManager(scriptPath);
    const url = await manager.start(4598);
    expect(url).toBe('https://fake-tunnel-posix9.trycloudflare.com');
    expect(manager.isRunning).toBe(true);
    await manager.stop();
    expect(manager.isRunning).toBe(false);
  });

  it('findCloudflared returns null or a path without throwing', async () => {
    const result = await findCloudflared();
    expect(result === null || typeof result === 'string').toBe(true);
  });
});
