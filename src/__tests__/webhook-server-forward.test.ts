/**
 * W-1 server wiring: `forwardTo` on the webhook server re-POSTs captured
 * deliveries to the developer's receiver — after capture, before the 200 —
 * and capture ALWAYS survives forward failure (P0 Wave 1,
 * docs/strategy/competitive-analysis-cli-stripe-razorpay.md).
 *
 * Uses real HTTP for both sides (webhook server + a receiver stub) so the
 * full request path is exercised, including the re-attached signature header.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signCallbackBody } from '../auth.js';
import { createWebhookServer, type WebhookServerResult } from '../webhook/server.js';
import { JsonWebhookStorage } from '../webhook/storage-json.js';

const API_KEY = 'forwarder-test-key';

interface ReceivedRequest {
  body: string;
  headers: Record<string, string | string[] | undefined>;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('no port')));
      }
    });
  });
}

function startReceiver(captured: ReceivedRequest[], status = 200): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const portPromise = getFreePort().then((port) => {
      const srv = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          captured.push({ body: Buffer.concat(chunks).toString('utf-8'), headers: req.headers });
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ received: true }));
        });
      });
      srv.listen(port, () => resolve({ port, close: () => new Promise<void>((done) => srv.close(() => done())) }));
    });
    void portPromise;
  });
}

function postJson(port: number, path: string, body: string, headers?: Record<string, string>): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method: 'POST',
        path,
        headers: { 'Content-Type': 'application/json', ...headers },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

describe('WebhookServer forwardTo (W-1)', () => {
  let tempDir: string;
  let storage: JsonWebhookStorage;
  let server: WebhookServerResult;
  let serverPort: number;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'webhook-forward-test-'));
    storage = new JsonWebhookStorage(join(tempDir, 'callbacks.jsonl'));
    serverPort = await getFreePort();
  });

  afterEach(async () => {
    await server.stop();
    storage.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('forwards a captured online callback to the receiver with the original signature header', async () => {
    const captured: ReceivedRequest[] = [];
    const receiver = await startReceiver(captured);
    server = createWebhookServer(storage, { port: serverPort, quiet: true, forwardTo: `http://127.0.0.1:${receiver.port}/webhooks/aba`, apiKey: API_KEY });
    await server.start();

    const body = JSON.stringify({ tran_id: 'fwd-1', status: 'APPROVED' });
    const signature = signCallbackBody({ tran_id: 'fwd-1', status: 'APPROVED' }, API_KEY);
    const res = await postJson(serverPort, '/aba-payway-webhook', body, { 'X-PAYWAY-HMAC-SHA512': signature });

    // The forward is awaited before the 200 goes out; give the receiver loop a tick.
    expect(res.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(captured.length).toBe(1);
    expect(captured[0].body).toBe(body);
    expect(captured[0].headers['x-payway-hmac-sha512']).toBe(signature);

    // Capture happened too.
    expect(storage.getAll()).toHaveLength(1);
    await receiver.close();
  });

  it('still captures and answers 200 when the forward receiver is unreachable', async () => {
    // Reserve then close a port so nothing is listening on it.
    const deadPort = await getFreePort();
    server = createWebhookServer(storage, { port: serverPort, quiet: true, forwardTo: `http://127.0.0.1:${deadPort}/cb` });
    await server.start();

    const res = await postJson(serverPort, '/aba-payway-webhook', JSON.stringify({ tran_id: 'fwd-2', status: 'PENDING' }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ acknowledged: true });
    expect(storage.getAll()).toHaveLength(1);
    expect(storage.getAll()[0].matchedTransactionId).toBe('fwd-2');
  });

  it('forwards payment-link pushbacks (no-hash contract) to the receiver', async () => {
    const captured: ReceivedRequest[] = [];
    const receiver = await startReceiver(captured);
    server = createWebhookServer(storage, { port: serverPort, quiet: true, forwardTo: `http://127.0.0.1:${receiver.port}/pl` });
    await server.start();

    const body = JSON.stringify({ tran_id: 'pl-1', status: 0, merchant_ref_no: 'ref-1' });
    const res = await postJson(serverPort, '/aba-payway-pushback', body);

    expect(res.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(captured.length).toBe(1);
    expect(JSON.parse(captured[0].body)).toEqual({ tran_id: 'pl-1', status: 0, merchant_ref_no: 'ref-1' });
    expect(captured[0].headers['x-payway-hmac-sha512']).toBeUndefined();
    await receiver.close();
  });

  it('forwards offline KHQR notifications after raw capture', async () => {
    const captured: ReceivedRequest[] = [];
    const receiver = await startReceiver(captured);
    server = createWebhookServer(storage, { port: serverPort, quiet: true, forwardTo: `http://127.0.0.1:${receiver.port}/khqr` });
    await server.start();

    const body = JSON.stringify({
      transaction_id: 'KHQR-9',
      transaction_date: '2026-09-08 10:15:30',
      original_currency: 'USD',
      original_amount: 12.5,
      bank_ref: 'BANK-9',
      apv: '123456',
      payment_status_code: 0,
      payment_status: 'APPROVED',
      payment_currency: 'USD',
      payment_amount: 12.5,
      payment_type: 'KHQR',
      payer_account: 'payer@example.com',
      bank_name: 'ABA Bank',
      merchant_ref: 'ORDER-9',
    });
    const res = await postJson(serverPort, '/aba-payway-khqr-webhook', body);

    expect(res.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(captured.length).toBe(1);
    expect(captured[0].body).toBe(body);
    await receiver.close();
  });
});
