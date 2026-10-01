/**
 * Forward-queue acceptance (audit WP03, REPORT.md §11 item 5):
 * - The callback ACK NEVER waits on forwarding: a receiver that hangs
   indefinitely cannot delay the acknowledgement past the durable capture.
 * - Every forward is bounded by a timeout budget and counted truthfully
 *   (delivered / failed / timedOut).
 * - The queue is bounded: saturation drops the FORWARD (never the capture)
 *   and counts the drop.
 * - Server stop() awaits the in-flight delivery instead of tearing the
 *   socket out from under it.
 */
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WebhookForwarder, WebhookForwardQueue } from '../webhook/forwarder.js';
import { createWebhookServer } from '../webhook/server.js';
import { JsonWebhookStorage } from '../webhook/storage-json.js';
import { signCallbackBody } from '../auth.js';

const tempRoot = mkdtempSync(path.join(tmpdir(), 'wp03-forward-'));
const storages: JsonWebhookStorage[] = [];
const httpServers: Server[] = [];

afterAll(() => {
  for (const storage of storages) storage.close();
  for (const server of httpServers) server.closeAllConnections?.();
  try {
    rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    // Windows can hold the temp dir briefly — harmless.
  }
});

function hangingFetch(name = 'TimeoutError'): typeof fetch {
  return ((_url: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = (init as { signal?: AbortSignal } | undefined)?.signal;
      if (signal) {
        signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('The operation was aborted due to timeout'), { name }));
        });
      }
      // Never resolves otherwise — the receiver never answers.
    })) as typeof fetch;
}

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

/** Stub receiver whose fetch-side behavior is fully controlled. */
function receiverBehavior(behavior: 'hang' | 'accept'): { url: string; fetchImpl: typeof fetch } {
  if (behavior === 'accept') {
    const fetchImpl = (async () => new Response('ok', { status: 200 })) as unknown as typeof fetch;
    return { url: 'http://receiver.test/callback', fetchImpl };
  }
  return { url: 'http://receiver.test/callback', fetchImpl: hangingFetch() };
}

describe('WebhookForwarder timeout budget', () => {
  it('aborts a receiver that never answers and counts it timedOut (not failed)', async () => {
    const { url, fetchImpl } = receiverBehavior('hang');
    const forwarder = new WebhookForwarder({ url, fetchImpl, timeoutMs: 100, quiet: true });
    const outcome = await forwarder.forward('{}', { label: 't' });
    expect(outcome).toMatchObject({ ok: false, error: 'timeout after 100ms' });
    expect(forwarder.statistics).toEqual({ delivered: 0, failed: 0, timedOut: 1 });
  });

  it('still counts a fast non-2xx as failed (distinct from timeout)', async () => {
    const fetchImpl = (async () => new Response('no', { status: 500 })) as unknown as typeof fetch;
    const forwarder = new WebhookForwarder({ url: 'http://receiver.test/x', fetchImpl, timeoutMs: 500, quiet: true });
    const outcome = await forwarder.forward('{}', { label: 't' });
    expect(outcome).toMatchObject({ ok: false, status: 500 });
    expect(forwarder.statistics).toEqual({ delivered: 0, failed: 1, timedOut: 0 });
  });
});

describe('WebhookForwardQueue bounds', () => {
  it('enqueue returns without awaiting the network; deliveries drain in the background', async () => {
    const { url, fetchImpl } = receiverBehavior('accept');
    const forwarder = new WebhookForwarder({ url, fetchImpl, quiet: true });
    const queue = new WebhookForwardQueue(forwarder, { quiet: true });
    const started = Date.now();
    const accepted = queue.enqueue('{}', { label: 'q1' });
    expect(accepted).toBe(true);
    expect(Date.now() - started).toBeLessThan(50); // no network await
    await queue.idle();
    expect(queue.statistics.delivered).toBe(1);
  });

  it('drops the FORWARD (not the capture) when saturated, and counts the drop', async () => {
    const { url, fetchImpl } = receiverBehavior('hang');
    const forwarder = new WebhookForwarder({ url, fetchImpl, timeoutMs: 5_000, quiet: true });
    const queue = new WebhookForwardQueue(forwarder, { maxQueue: 2, quiet: true });
    // 1 = in-flight (hangs), 2 and 3 fill the pending slots, 4 is dropped.
    expect(queue.enqueue('a', { label: 'a' })).toBe(true);
    expect(queue.enqueue('b', { label: 'b' })).toBe(true);
    expect(queue.enqueue('c', { label: 'c' })).toBe(true);
    expect(queue.enqueue('d', { label: 'd' })).toBe(false);
    const stats = queue.statistics;
    expect(stats.dropped).toBe(1);
    expect(stats.queued).toBe(3);
    // Pending deliveries never vanish silently: the two queued items remain
    // (a is in-flight, b and c retained) — resend covers the dropped one.
    expect(queue.depth).toBe(2);
    queue.stopAccepting();
  });

  it('stopAccepting rejects further enqueues (shutdown path)', async () => {
    const { url, fetchImpl } = receiverBehavior('accept');
    const forwarder = new WebhookForwarder({ url, fetchImpl, quiet: true });
    const queue = new WebhookForwardQueue(forwarder, { quiet: true });
    queue.stopAccepting();
    expect(queue.enqueue('{}', {})).toBe(false);
  });
});

describe('server-level ACK isolation (WP03 core acceptance)', () => {
  it('a receiver that hangs cannot delay the callback ACK; the forward times out and is counted', async () => {
    // The stub RECEIVER hangs forever; the webhook server must ACK fast.
    const hungReceiver = createServer((_req, res) => {
      // never respond
      void res;
    });
    httpServers.push(hungReceiver);
    await new Promise<void>((resolve) => hungReceiver.listen(0, '127.0.0.1', resolve));
    const receiverPort = (hungReceiver.address() as { port: number }).port;
    const freePort = await getFreePort();

    const storage = new JsonWebhookStorage(path.join(tempRoot, 'ack.jsonl'));
    storages.push(storage);
    const server = createWebhookServer(storage, {
      port: freePort,
      quiet: true,
      forwardTo: `http://127.0.0.1:${receiverPort}/cb`,
      forwardTimeoutMs: 250,
    });
    await server.start();
    try {
      const body = JSON.stringify(signCallbackBody({ tran_id: 'acktest1', status: '0' }, 'k'));
      const started = Date.now();
      const res = await fetch(`http://127.0.0.1:${freePort}/aba-payway-webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(5_000),
      });
      const ackMs = Date.now() - started;
      expect(res.status).toBe(200);
      // The ACK arrived while the forward was still hanging (250ms budget,
      // hung receiver would never answer): the ACK must be far faster than
      // any forward resolution.
      expect(ackMs).toBeLessThan(1_000);
      // The forward eventually times out and is counted truthfully.
      await new Promise((resolve) => setTimeout(resolve, 600));
      const stats = server.forwardStats;
      expect(stats).toMatchObject({ timedOut: 1 });
    } finally {
      await server.stop();
    }
  });

  it('stop() awaits the in-flight forward instead of tearing the socket down', async () => {
    let resolveFirst: ((response: Response) => void) | undefined;
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      const signal = (init as { signal?: AbortSignal } | undefined)?.signal;
      return new Promise<Response>((resolve, reject) => {
        resolveFirst = resolve;
        signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' })));
      });
    }) as unknown as typeof fetch;
    const forwarder = new WebhookForwarder({ url: 'http://receiver.test/x', fetchImpl, timeoutMs: 5_000, quiet: true });
    const queue = new WebhookForwardQueue(forwarder, { quiet: true });
    queue.enqueue('{}', { label: 'inflight' });
    await new Promise((resolve) => setTimeout(resolve, 20)); // let drain start
    const stopping = queue.idle();
    // The in-flight delivery is still pending — idle() must NOT resolve yet.
    let resolved = false;
    void stopping.then(() => {
      resolved = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(resolved).toBe(false);
    resolveFirst?.(new Response('ok', { status: 200 }));
    await stopping;
    expect(resolved).toBe(true);
  });
});
