/**
 * Receiver lifecycle acceptance (audit WP02, REPORT.md §11 item 5):
 * - `stopReceiver` is identity-first and graceful-first: a reused PID or a
 *   foreign receiver can never be signalled (it cannot answer with OUR
 *   random instance id), outcomes are honest
 *   (stopped/stale/pid-reused/unreachable/unauthorized/shutdown-not-confirmed),
 *   and the state file is only cleared when our receiver is confirmed gone.
 * - The receiver's control route: `identify` reveals the instance id,
 *   `shutdown` requires a timing-safe token match and triggers the owner's
 *   graceful handler; without control wiring the route answers 404.
 * - No OS signal is ever sent to any PID — the liveness probe seam
 *   (`process.kill(pid, 0)`) is signal 0 by definition, and the injected
 *   seam in these tests never touches a real process.
 */
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWebhookServer } from '../webhook/server.js';
import { CONTROL_PATH, stopReceiver } from '../webhook/receiver-control.js';
import { createLifecycleState, type WebhookLifecycleState } from '../webhook/lifecycle.js';
import { JsonWebhookStorage } from '../webhook/storage-json.js';

const STATE = (overrides: Partial<WebhookLifecycleState> = {}): WebhookLifecycleState =>
  createLifecycleState({
    pid: 4242,
    port: 8443,
    host: '127.0.0.1',
    publicBaseUrl: null,
    callbackUrl: null,
    previousCallbackUrl: null,
    ...overrides,
  });

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

describe('stopReceiver (identity-first stop, WP02)', () => {
  it('stops OUR receiver: identify matches, shutdown accepted, process exits → stopped, state cleared', async () => {
    const state = STATE();
    const calls: string[] = [];
    let shutdownSeen = false;
    let livenessProbes = 0;
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { action?: string };
      calls.push(body.action ?? '?');
      if (body.action === 'identify') return jsonResponse(200, { instanceId: state.instanceId });
      if (body.action === 'shutdown') {
        shutdownSeen = true;
        return jsonResponse(200, { acknowledged: true });
      }
      return jsonResponse(400, { error: 'unknown action' });
    }) as typeof fetch;
    const outcome = await stopReceiver({
      state,
      fetchImpl,
      // The process exits shortly after the accepted shutdown: first probe
      // still alive, subsequent probes report gone.
      isProcessAlive: () => {
        if (!shutdownSeen) return true;
        livenessProbes += 1;
        return livenessProbes <= 1;
      },
      exitWaitMs: 500,
      quiet: true,
    });
    expect(outcome).toMatchObject({ stopped: true, reason: 'stopped', pid: state.pid, stateCleared: true });
    // Identity check happened BEFORE the shutdown request.
    expect(calls[0]).toBe('identify');
    expect(calls).toContain('shutdown');
  });

  it('REFUSES to act when the port is served by a different process (reused PID / foreign receiver)', async () => {
    const state = STATE();
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { action?: string };
      if (body.action === 'identify') return jsonResponse(200, { instanceId: 'somebody-elses-receiver' });
      throw new Error('shutdown must never be attempted after an identity mismatch');
    }) as typeof fetch;
    const outcome = await stopReceiver({ state, fetchImpl, isProcessAlive: () => true, quiet: true });
    expect(outcome).toMatchObject({ stopped: false, reason: 'pid-reused', stateCleared: false });
    expect(outcome.detail).toContain('Nothing was signalled');
  });

  it('reports a stale record when nothing answers and the PID is dead (state cleared)', async () => {
    const state = STATE();
    const fetchImpl = (async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    }) as typeof fetch;
    const outcome = await stopReceiver({ state, fetchImpl, isProcessAlive: () => false, quiet: true });
    expect(outcome).toMatchObject({ stopped: false, reason: 'stale', stateCleared: true });
  });

  it('never signals a live-but-foreign process when nothing answers on the port (unreachable)', async () => {
    const state = STATE();
    const fetchImpl = (async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    }) as typeof fetch;
    const outcome = await stopReceiver({ state, fetchImpl, isProcessAlive: () => true, quiet: true });
    expect(outcome).toMatchObject({ stopped: false, reason: 'unreachable', stateCleared: false });
    expect(outcome.detail).toContain('reused PID');
  });

  it('reports shutdown-not-confirmed when the receiver accepts but the process does not exit', async () => {
    const state = STATE();
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { action?: string };
      if (body.action === 'identify') return jsonResponse(200, { instanceId: state.instanceId });
      return jsonResponse(200, { acknowledged: true }); // accepts, then does nothing
    }) as typeof fetch;
    const outcome = await stopReceiver({
      state,
      fetchImpl,
      isProcessAlive: () => true, // wedged receiver
      exitWaitMs: 200,
      quiet: true,
    });
    expect(outcome).toMatchObject({ stopped: false, reason: 'shutdown-not-confirmed', stateCleared: false });
    expect(outcome.detail).toContain('not reporting success');
  });

  it('surfaces an unauthorized shutdown (state file does not belong to the running receiver)', async () => {
    const state = STATE();
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { action?: string };
      if (body.action === 'identify') return jsonResponse(200, { instanceId: state.instanceId });
      return jsonResponse(403, { error: 'unauthorized' });
    }) as typeof fetch;
    const outcome = await stopReceiver({ state, fetchImpl, isProcessAlive: () => true, quiet: true });
    expect(outcome).toMatchObject({ stopped: false, reason: 'unauthorized', stateCleared: false });
  });

  it('reports unreachable when identify answered but shutdown transport failed', async () => {
    const state = STATE();
    let identifySeen = false;
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { action?: string };
      if (body.action === 'identify' && !identifySeen) {
        identifySeen = true;
        return jsonResponse(200, { instanceId: state.instanceId });
      }
      throw new TypeError('socket hang up');
    }) as typeof fetch;
    const outcome = await stopReceiver({ state, fetchImpl, isProcessAlive: () => true, quiet: true });
    expect(outcome).toMatchObject({ stopped: false, reason: 'unreachable', stateCleared: false });
  });
});

describe('receiver control route (real server, WP02)', () => {
  let stopReceiver_: (() => Promise<void>) | null = null;
  let port = 0;
  let shutdownInvoked = 0;
  const instanceId = '11111111-2222-3333-4444-555555555555';
  const controlToken = 'a'.repeat(64);

  function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const probe = createServer();
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address();
        if (address && typeof address === 'object') {
          const found = address.port;
          probe.close(() => resolve(found));
        } else {
          probe.close(() => reject(new Error('no address')));
        }
      });
      probe.on('error', reject);
    });
  }

  beforeAll(async () => {
    port = await getFreePort();
    const storage = new JsonWebhookStorage(path.join(mkdtempSync(path.join(tmpdir(), 'wp02-control-')), 'cb.jsonl'));
    const receiver = createWebhookServer(storage, {
      port,
      quiet: true,
      control: {
        instanceId,
        controlToken,
        onShutdown: () => {
          shutdownInvoked += 1;
        },
      },
    });
    await receiver.start();
    stopReceiver_ = async () => {
      await receiver.stop();
      storage.close();
    };
  });

  afterAll(async () => {
    await stopReceiver_?.();
  });

  const control = (body: unknown): Promise<Response> =>
    fetch(`http://127.0.0.1:${port}${CONTROL_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(2_000),
    });

  it('identify reveals the instance id of THIS receiver instance', async () => {
    const res = await control({ action: 'identify' });
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { instanceId?: string };
    expect(payload.instanceId).toBe(instanceId);
  });

  it('shutdown with a wrong token is refused (403) and the handler never runs', async () => {
    const res = await control({ action: 'shutdown', token: 'f'.repeat(64) });
    expect(res.status).toBe(403);
    expect(shutdownInvoked).toBe(0);
  });

  it('shutdown with the control token ACKs and invokes the graceful handler', async () => {
    const res = await control({ action: 'shutdown', token: controlToken });
    expect(res.status).toBe(200);
    // The handler runs after the ACK flushes.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(shutdownInvoked).toBe(1);
  });

  it('answers 404 when no control plane is wired (SDK embedders keep the old surface)', async () => {
    const freePort = await getFreePort();
    const storage = new JsonWebhookStorage(path.join(mkdtempSync(path.join(tmpdir(), 'wp02-noctrl-')), 'cb.jsonl'));
    const receiver = createWebhookServer(storage, { port: freePort, quiet: true });
    await receiver.start();
    try {
      const res = await fetch(`http://127.0.0.1:${freePort}${CONTROL_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'identify' }),
        signal: AbortSignal.timeout(2_000),
      });
      expect(res.status).toBe(404);
    } finally {
      await receiver.stop();
      storage.close();
    }
  });
});
