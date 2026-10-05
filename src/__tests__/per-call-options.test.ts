/**
 * Per-call `RequestCallOptions` (timeoutMs / signal) — DX review 2026-08-30.
 *
 * Drives the real fetch pipeline against a loopback HTTP server whose
 * responses are delayed, so per-call timeout overrides and caller-side
 * AbortSignals are exercised end-to-end. Clients are constructed with
 * `maxRetries: 0` to keep failures fast and non-retried.
 */
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PayWay } from '../client.js';

const DELAY_MS = 400;

let server: http.Server;
let url: string;
let requestCount = 0;

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    requestCount += 1;
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: { code: '00', message: 'Success' }, data: { payment_status_code: 2 } }));
    }, DELAY_MS);
  });
  server.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function makeClient(timeout?: number): PayWay {
  return new PayWay({
    merchantId: 'e2e-merchant',
    apiKey: 'e2e-api-key-0123456789abcdef0123',
    environment: 'sandbox',
    baseUrl: url,
    maxRetries: 0,
    ...(timeout !== undefined ? { timeout } : {}),
  });
}

describe('RequestCallOptions (per-call timeout / abort)', () => {
  it('timeoutMs overrides the client-wide timeout for a single call', async () => {
    const client = makeClient(30_000);
    // The 400 ms server delay trips the 80 ms per-call override…
    await expect(client.checkout.checkTransaction('T001', undefined, { timeoutMs: 80 })).rejects.toThrow(/timed out/);
    // …while a call without overrides succeeds under the 30 s client default.
    await expect(client.checkout.checkTransaction('T001')).resolves.toMatchObject({
      status: { code: '00' },
    });
  });

  it('without callOptions the client-wide timeout still applies', async () => {
    const client = makeClient(80);
    await expect(client.checkout.checkTransaction('T001')).rejects.toThrow(/timed out/);
  });

  it('a caller AbortSignal cancels the in-flight request and is never retried', async () => {
    const client = makeClient(30_000);
    const controller = new AbortController();
    const before = requestCount;
    setTimeout(() => controller.abort(), 50);
    await expect(client.checkout.checkTransaction('T001', undefined, { signal: controller.signal })).rejects.toThrow(
      'Request aborted by caller signal',
    );
    expect(requestCount).toBe(before + 1); // exactly one attempt — aborts do not retry
  });

  it('a pre-aborted signal fails immediately without hitting the network', async () => {
    const client = makeClient();
    const controller = new AbortController();
    controller.abort();
    const before = requestCount;
    await expect(client.checkout.checkTransaction('T001', undefined, { signal: controller.signal })).rejects.toThrow(
      'Request aborted by caller signal',
    );
    expect(requestCount).toBe(before);
  });
});
