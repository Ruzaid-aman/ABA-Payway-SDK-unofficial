/**
 * Tests for the webhook HTTP server.
 *
 * Covers WH-TC-03 (receive and store callback), WH-TC-05 (no validation),
 * WH-TC-08 (port conflict), and general server behavior.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import crypto from 'node:crypto';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createJournalEmitter } from '../journal/writer.js';
import { createWebhookServer, type WebhookServerResult } from '../webhook/server.js';
import type { WebhookRecord, WebhookStorage } from '../webhook/storage.js';
import { JsonWebhookStorage } from '../webhook/storage-json.js';

function httpRequest(
  port: number,
  method: string,
  path: string,
  body?: string,
  headers?: Record<string, string>,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, method, path, headers: { 'Content-Type': 'application/json', ...headers } },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

describe('WebhookServer', () => {
  let tempDir: string;
  let storage: JsonWebhookStorage;
  let server: WebhookServerResult;
  let port: number;

  // Find a free port
  function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = http.createServer();
      srv.listen(0, () => {
        const addr = srv.address();
        if (addr && typeof addr === 'object') {
          const p = addr.port;
          srv.close(() => resolve(p));
        } else {
          srv.close(() => reject(new Error('Could not get free port')));
        }
      });
    });
  }

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'webhook-server-test-'));
    storage = new JsonWebhookStorage(join(tempDir, 'callbacks.jsonl'));
    port = await getFreePort();
    server = createWebhookServer(storage, { port, quiet: true });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    storage.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('WH-TC-03: receives and stores a valid callback', async () => {
    const payload = JSON.stringify({ status: 'COMPLETED', tran_id: '123' });

    const res = await httpRequest(port, 'POST', '/aba-payway-webhook', payload, {
      'x-payway-hmac-sha512': 'test-signature',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { acknowledged: boolean; id: string };
    expect(body.acknowledged).toBe(true);
    expect(body.id).toMatch(/^wh_/);

    // Verify stored
    const records = storage.getAll();
    expect(records).toHaveLength(1);
    expect(records[0].body).toBe(payload);
  });

  it('WH-TC-05: accepts malformed JSON without rejecting', async () => {
    const malformedPayload = '{invalid json content';

    const res = await httpRequest(port, 'POST', '/aba-payway-webhook', malformedPayload);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { acknowledged: boolean };
    expect(body.acknowledged).toBe(true);

    // Raw string stored as-is
    const records = storage.getAll();
    expect(records).toHaveLength(1);
    expect(records[0].body).toBe(malformedPayload);
  });

  it('receives an offline KHQR notification without an online HMAC and stores parsed metadata', async () => {
    const payload = JSON.stringify({
      transaction_id: 'KHQR-001',
      transaction_date: '2026-08-21 10:15:30',
      original_currency: 'USD',
      original_amount: 12.5,
      bank_ref: 'BANK-REF-1',
      apv: '123456',
      payment_status_code: 0,
      payment_status: 'APPROVED',
      payment_currency: 'USD',
      payment_amount: 12.5,
      payment_type: 'KHQR',
      payer_account: 'payer@example.com',
      bank_name: 'Example Bank',
      merchant_ref: 'ORDER-100',
      future_field: 'retained',
    });

    const res = await httpRequest(port, 'POST', '/aba-payway-khqr-webhook', payload);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ acknowledged: true });
    const [record] = storage.getAll();
    expect(record.body).toBe(payload);
    expect(record.khqr?.parsed?.kind).toBe('khqr-offline');
    expect(record.khqr?.parsed?.verification).toBe('unverified');
    expect(record.khqr?.parsed?.unknownFields).toEqual({ future_field: 'retained' });
  });

  // Codification C2 (2026-09-06): payment-link pushbacks get a first-class
  // route. Live-captured contract (SANDBOX-FINDINGS §22): NO hash, numeric
  // status 0 — raw is stored, parse metadata is attached, always 200.
  it('receives a payment-link pushback, stores raw + parsed metadata, ACKs 200', async () => {
    const payload = JSON.stringify({
      tran_id: '178865526240157',
      status: 0,
      merchant_ref_no: 'plvr-v1-mtp34wx4',
    });

    const res = await httpRequest(port, 'POST', '/aba-payway-pushback', payload);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ acknowledged: true });
    const [record] = storage.getAll();
    expect(record.body).toBe(payload);
    expect(record.paymentLinkPushback?.parsed?.tranId).toBe('178865526240157');
    expect(record.paymentLinkPushback?.parsed?.status).toBe('APPROVED');
    expect(record.paymentLinkPushback?.parsed?.merchantRefNo).toBe('plvr-v1-mtp34wx4');
    expect(record.paymentLinkPushback?.parsed?.raw).toEqual({
      tran_id: '178865526240157',
      status: 0,
      merchant_ref_no: 'plvr-v1-mtp34wx4',
    });
  });

  it('stores a pushback parse error without discarding the raw body', async () => {
    const res = await httpRequest(port, 'POST', '/aba-payway-pushback', 'not-json');

    expect(res.statusCode).toBe(200);
    const [record] = storage.getAll();
    expect(record.body).toBe('not-json');
    expect(record.paymentLinkPushback?.parseError).toContain('not valid JSON');
  });

  it('404s unknown routes and 405s non-POST pushbacks', async () => {
    const missing = await httpRequest(port, 'POST', '/nowhere', '{}');
    expect(missing.statusCode).toBe(404);
    const wrongMethod = await httpRequest(port, 'GET', '/aba-payway-pushback');
    expect(wrongMethod.statusCode).toBe(405);
  });

  it('stores an offline KHQR parse error and marks duplicate transaction metadata', async () => {
    const validPayload = JSON.stringify({
      transaction_id: 'KHQR-duplicate',
      transaction_date: '2026-08-21 10:15:30',
      original_currency: 'USD',
      original_amount: 12.5,
      bank_ref: 'BANK-REF-1',
      apv: '123456',
      payment_status_code: 0,
      payment_status: 'APPROVED',
      payment_currency: 'USD',
      payment_amount: 12.5,
      payment_type: 'KHQR',
      payer_account: 'payer@example.com',
      bank_name: 'Example Bank',
      merchant_ref: 'ORDER-100',
    });

    await httpRequest(port, 'POST', '/aba-payway-khqr-webhook', validPayload);
    await httpRequest(port, 'POST', '/aba-payway-khqr-webhook', validPayload);
    await httpRequest(port, 'POST', '/aba-payway-khqr-webhook', '{not json');

    const records = storage.getAll();
    expect(records[1].khqr?.duplicateTransactionId).toBe(true);
    expect(records[2].body).toBe('{not json');
    expect(records[2].khqr?.parseError).toBeTruthy();
  });

  it('acknowledges KHQR notifications with a legacy custom storage implementation', async () => {
    const records: WebhookRecord[] = [];
    const legacyStorage: WebhookStorage = {
      save(record) {
        const saved = { ...record, id: `legacy-${records.length + 1}`, receivedAt: new Date().toISOString() };
        records.push(saved);
        return saved;
      },
      getAll: () => records,
      count: () => records.length,
      close: () => undefined,
    };
    const legacyPort = await getFreePort();
    const legacyServer = createWebhookServer(legacyStorage, { port: legacyPort, quiet: true });
    await legacyServer.start();

    try {
      const payload = JSON.stringify({ transaction_id: 'legacy-store' });
      const response = await httpRequest(legacyPort, 'POST', '/aba-payway-khqr-webhook', payload);

      expect(response.statusCode).toBe(200);
      expect(records).toHaveLength(1);
      expect(records[0].body).toBe(payload);
    } finally {
      await legacyServer.stop();
    }
  });

  it('returns 404 for non-webhook paths', async () => {
    const res = await httpRequest(port, 'POST', '/other-path', '{}');
    expect(res.statusCode).toBe(404);
  });

  it('returns 405 for GET on webhook path', async () => {
    const res = await httpRequest(port, 'GET', '/aba-payway-webhook');
    expect(res.statusCode).toBe(405);
  });

  it('logs signature verification result but never rejects', async () => {
    const payload = JSON.stringify({ status: 'COMPLETED' });
    const res = await httpRequest(port, 'POST', '/aba-payway-webhook', payload, {
      'x-payway-hmac-sha512': 'invalid-signature',
    });

    expect(res.statusCode).toBe(200);
    expect(storage.count()).toBe(1);
  });

  it('stores request headers', async () => {
    const payload = JSON.stringify({ test: true });
    await httpRequest(port, 'POST', '/aba-payway-webhook', payload, {
      'x-custom-header': 'custom-value',
    });

    const records = storage.getAll();
    expect(records).toHaveLength(1);
    expect(records[0].headers['x-custom-header']).toBe('custom-value');
    expect(records[0].headers['content-type']).toBe('application/json');
  });

  it('reports isRunning correctly', async () => {
    expect(server.isRunning).toBe(true);
    await server.stop();
    expect(server.isRunning).toBe(false);
  });

  it('is idempotent on stop', async () => {
    await server.stop();
    // Second stop should not throw
    await server.stop();
    expect(server.isRunning).toBe(false);
  });
});

describe('WebhookServer port conflict (WH-TC-08)', () => {
  it('rejects with helpful error when port is busy', async () => {
    // Create a server that occupies a port — on the SAME interface the
    // webhook server binds (loopback since audit WP07; Windows treats a
    // wildcard bind and a loopback bind as distinct endpoints, so the
    // occupier must bind 127.0.0.1 to actually conflict).
    const occupyingSrv = http.createServer();
    await new Promise<void>((resolve) => occupyingSrv.listen(0, '127.0.0.1', resolve));
    const addr = occupyingSrv.address();
    const port = addr && typeof addr === 'object' ? addr.port : 0;

    const tempDir = mkdtempSync(join(tmpdir(), 'webhook-port-test-'));
    const storage = new JsonWebhookStorage(join(tempDir, 'callbacks.jsonl'));
    const server = createWebhookServer(storage, { port, quiet: true });

    try {
      await expect(server.start()).rejects.toThrow('already in use');
    } finally {
      storage.close();
      // Release the occupying server
      await new Promise<void>((resolve) => occupyingSrv.close(() => resolve()));
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('WebhookServer KHQR route configuration', () => {
  it('rejects configuring the KHQR listener on the legacy online webhook route', () => {
    const storage = new JsonWebhookStorage(join(mkdtempSync(join(tmpdir(), 'webhook-route-test-')), 'callbacks.jsonl'));

    try {
      expect(() => createWebhookServer(storage, { khqr: { path: '/aba-payway-webhook' } })).toThrow('must differ');
    } finally {
      storage.close();
    }
  });
});

// ─── TD-09: rejectInvalidSignature hardening mode ─────────────────────────
describe('WebhookServer rejectInvalidSignature (TD-09)', () => {
  let tempDir: string;
  let storage: JsonWebhookStorage;
  let server: WebhookServerResult;
  let port: number;

  function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = http.createServer();
      srv.listen(0, () => {
        const addr = srv.address();
        if (addr && typeof addr === 'object') srv.close(() => resolve(addr.port));
        else srv.close(() => reject(new Error('no port')));
      });
    });
  }

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'webhook-reject-test-'));
    storage = new JsonWebhookStorage(join(tempDir, 'callbacks.jsonl'));
    port = await getFreePort();
    // Deterministic invalid signature: verification key differs from signer key.
    server = createWebhookServer(storage, {
      port,
      quiet: true,
      apiKey: 'verification-key',
      rejectInvalidSignature: true,
    });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    storage.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('responds 401 and still stores a delivery with an INVALID signature', async () => {
    const payload = JSON.stringify({ tran_id: 'TX-BAD', status: 'COMPLETED' });
    const res = await httpRequest(port, 'POST', '/aba-payway-webhook', payload, {
      'x-payway-hmac-sha512': 'definitely-not-valid',
    });
    expect(res.statusCode).toBe(401);
    const fileContent = readFileSync(join(tempDir, 'callbacks.jsonl'), 'utf-8');
    expect(fileContent).toContain('TX-BAD');
  });

  it('still responds 200 for deliveries without any signature header', async () => {
    const res = await httpRequest(port, 'POST', '/aba-payway-webhook', JSON.stringify({ tran_id: 'TX-NOSIG' }));
    expect(res.statusCode).toBe(200);
  });
});

// ─── Phase 3: callback correlation, verdict persistence, replay marker ─────
describe('WebhookServer callback correlation (Phase 3)', () => {
  let tempDir: string;
  let journalDir: string;
  let storage: JsonWebhookStorage;
  let server: WebhookServerResult;
  let port: number;

  function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = http.createServer();
      srv.listen(0, () => {
        const addr = srv.address();
        if (addr && typeof addr === 'object') srv.close(() => resolve(addr.port));
        else srv.close(() => reject(new Error('no port')));
      });
    });
  }

  // Replicates the gateway's sorted-key callback signature algorithm.
  function signCallbackBody(body: Record<string, unknown>, apiKey: string): string {
    const concatenated = Object.keys(body)
      .sort()
      .map((key) => {
        const value = body[key];
        if (value === undefined || value === null) return '';
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
      })
      .join('');
    return crypto.createHmac('sha512', apiKey).update(concatenated).digest('base64');
  }

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'webhook-correlate-test-'));
    journalDir = mkdtempSync(join(tmpdir(), 'webhook-correlate-journal-'));
    storage = new JsonWebhookStorage(join(tempDir, 'callbacks.jsonl'));
    port = await getFreePort();
    const journal = createJournalEmitter({ dir: journalDir });
    server = createWebhookServer(storage, { port, quiet: true, apiKey: 'verify-key', journal });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    storage.close();
    rmSync(tempDir, { recursive: true, force: true });
    rmSync(journalDir, { recursive: true, force: true });
  });

  it('stores a VERIFIED verdict when the signature validates', async () => {
    const body = { tran_id: 'TX-OK', status: 'APPROVED', apv: 'apv-1' };
    const signature = signCallbackBody(body, 'verify-key');
    const res = await httpRequest(port, 'POST', '/aba-payway-webhook', JSON.stringify(body), {
      'x-payway-hmac-sha512': signature,
    });

    expect(res.statusCode).toBe(200);
    const [record] = storage.getAll();
    expect(record.signatureVerdict).toBe('verified');
    expect(record.verificationReason).toBeUndefined();
    expect(record.matchedTransactionId).toBe('TX-OK');
    expect(record.matchedStatus).toBe('APPROVED');
  });

  it('stores an INVALID verdict with the failure reason and still responds 200', async () => {
    const payload = JSON.stringify({ tran_id: 'TX-BAD', status: 'APPROVED' });
    const res = await httpRequest(port, 'POST', '/aba-payway-webhook', payload, {
      'x-payway-hmac-sha512': 'not-the-right-signature',
    });

    expect(res.statusCode).toBe(200);
    const [record] = storage.getAll();
    expect(record.signatureVerdict).toBe('invalid');
    expect(record.verificationReason).toBe('signature_mismatch');
    expect(record.matchedTransactionId).toBe('TX-BAD');
  });

  it('stores UNSIGNED for deliveries without a signature header and flags replays', async () => {
    const payload = JSON.stringify({ tran_id: 'TX-REPLAY', status: 'APPROVED' });
    await httpRequest(port, 'POST', '/aba-payway-webhook', payload);
    await httpRequest(port, 'POST', '/aba-payway-webhook', payload);

    const records = storage.getAll();
    expect(records).toHaveLength(2);
    expect(records[0].signatureVerdict).toBe('unsigned');
    expect(records[0].replay).toBe(false);
    expect(records[1].replay).toBe(true);
    expect(records[1].matchedTransactionId).toBe('TX-REPLAY');
  });

  it('emits callback.received journal events joined to the webhook record id', async () => {
    const payload = JSON.stringify({ tran_id: 'TX-J', status: 'APPROVED' });
    await httpRequest(port, 'POST', '/aba-payway-webhook', payload);

    const events = readFileSync(join(journalDir, 'journal.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(
        (line) => JSON.parse(line) as { kind: string; correlationId: string; transactionId?: string; status?: string },
      );
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('callback.received');
    expect(events[0].transactionId).toBe('TX-J');
    expect(events[0].status).toBe('APPROVED');
    expect(events[0].correlationId).toBe(storage.getAll()[0].id);
  });

  it('emits callback.received for the KHQR route with the parsed notification id', async () => {
    const payload = JSON.stringify({
      transaction_id: 'KHQR-J-1',
      transaction_date: '2026-09-06 10:00:00',
      original_currency: 'USD',
      original_amount: 2,
      bank_ref: 'BR-1',
      apv: 'apv-x',
      payment_status_code: 0,
      payment_status: 'SUCCESS',
      payment_currency: 'USD',
      payment_amount: 2,
      payment_type: 'KHQR',
      payer_account: 'payer',
      bank_name: 'ABA',
      merchant_ref: 'mref-1',
    });
    const res = await httpRequest(port, 'POST', '/aba-payway-khqr-webhook', payload);
    expect(res.statusCode).toBe(200);

    const events = readFileSync(join(journalDir, 'journal.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { kind: string; transactionId?: string; status?: string });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('callback.received');
    expect(events[0].transactionId).toBe('KHQR-J-1');
    expect(events[0].status).toBe('SUCCESS');
  });
});
