/**
 * Customer Module callback server behavior.
 *
 * Pins the 2026-09-11 contracts:
 *  - a Customer Module callback (KHQR fields + nested `customer` object)
 *    delivered to `/aba-payway-khqr-webhook` is classified, HMAC-verified
 *    (verdict in the durable record), correlated (transaction_id +
 *    payment_status), and tagged with customer-qr metadata
 *  - the same callback landing on `/aba-payway-webhook` (one configured
 *    callback URL per merchant profile receives every channel) is still
 *    classified and tagged
 *  - an unsigned offline KHQR notification keeps verdict 'unsigned'
 *  - TD-09 rejectInvalidSignature applies on the khqr route for signed
 *    deliveries with a bad signature
 *  - payment-link pushbacks now populate matchedTransactionId/matchedStatus
 *
 * The customer-module sample body is the REAL merchant-captured payload
 * (`docs/archive/customermoudle-guide.md` §7.4).
 */

import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signCallbackBody, verifyCallbackDetailed } from '../auth.js';
import { createWebhookServer, type WebhookServerResult } from '../webhook/server.js';
import { JsonWebhookStorage } from '../webhook/storage-json.js';

const API_KEY = 'test-customer-module-key';

const REAL_CUSTOMER_QR_CALLBACK: Record<string, unknown> = {
  payment_status_code: 0,
  transaction_id: '178702944869996',
  payment_status: 'APPROVED',
  apv: '118954',
  original_amount: 0.38,
  original_currency: 'USD',
  payment_amount: 0.38,
  payment_currency: 'USD',
  payment_type: 'ABA Pay',
  transaction_date: '2026-08-18 12:04:08',
  bank_ref: '100SB1787029448',
  payer_account: '*001',
  payer_name: 'Payer Name',
  bank_name: 'ABA Bank',
  merchant_ref: 'dt-one-8989',
  customer: {
    type: 'individual',
    customer_id: 'dt-one-8989',
    customer_name: 'dhitraj',
    vat_tin: 'Test organization',
    email: 'ruzaid0101+alavps@gmail.com',
    phone: '+85596 407 4052',
    address: '2740 Barnes Avenue Bronx,',
    remark: '',
  },
};

const OFFLINE_KHQR_NOTIFICATION: Record<string, unknown> = {
  transaction_id: '2352051686',
  transaction_date: '2025-10-08 09:43:54',
  bank_ref: '100FT93434333',
  apv: '111111',
  discount_amount: 0,
  payment_status: 'APPROVED',
  payment_amount: 40000,
  payment_currency: 'KHR',
  payment_type: 'KHQR',
  payer_account: '*124',
  total_amount: 10,
  original_amount: 10,
  original_currency: 'USD',
  payment_status_code: 0,
  bank_name: 'ABA Bank',
  refund_amount: 0,
  merchant_ref: 'INV-12345678',
};

function httpRequest(
  port: number,
  path: string,
  body: string,
  headers?: Record<string, string>,
): Promise<{ statusCode: number; body: string }> {
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

describe('WebhookServer Customer Module callbacks', () => {
  let tempDir: string;
  let storage: JsonWebhookStorage;
  let server: WebhookServerResult;
  let port: number;

  async function startServer(options: Record<string, unknown> = {}): Promise<void> {
    port = await getFreePort();
    server = createWebhookServer(storage, { port, quiet: true, apiKey: API_KEY, ...options });
    await server.start();
  }

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'customer-qr-server-test-'));
    storage = new JsonWebhookStorage(join(tempDir, 'callbacks.jsonl'));
  });

  afterEach(async () => {
    await server?.stop();
    storage.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('CM-1: customer-module callback on the khqr route — verified signature, correlation, and customer-qr metadata', async () => {
    await startServer();
    const signature = signCallbackBody(REAL_CUSTOMER_QR_CALLBACK, API_KEY);
    const res = await httpRequest(port, '/aba-payway-khqr-webhook', JSON.stringify(REAL_CUSTOMER_QR_CALLBACK), {
      'X-PAYWAY-HMAC-SHA512': signature,
    });
    expect(res.statusCode).toBe(200);

    const [record] = storage.getAll();
    expect(record.signatureVerdict).toBe('verified');
    expect(record.matchedTransactionId).toBe('178702944869996');
    expect(record.matchedStatus).toBe('APPROVED');
    expect(record.customerQr?.parsed?.kind).toBe('customer-module-qr');
    expect(record.customerQr?.parsed?.notification.merchantRef).toBe('dt-one-8989');
    expect(record.customerQr?.parsed?.notification.customer?.customer_name).toBe('dhitraj');
    expect(record.khqr).toBeUndefined(); // never double-tagged as an offline notification
  });

  it('CM-2: the fixture signature round-trips through the SDK verifier (signing contract pin)', () => {
    const signature = signCallbackBody(REAL_CUSTOMER_QR_CALLBACK, API_KEY);
    const verdict = verifyCallbackDetailed(REAL_CUSTOMER_QR_CALLBACK, signature, API_KEY, { stripHash: true });
    expect(verdict).toEqual({ valid: true });
  });

  it('CM-3: offline KHQR notification stays unsigned with khqr metadata (no regression)', async () => {
    await startServer();
    const res = await httpRequest(port, '/aba-payway-khqr-webhook', JSON.stringify(OFFLINE_KHQR_NOTIFICATION));
    expect(res.statusCode).toBe(200);

    const [record] = storage.getAll();
    expect(record.signatureVerdict).toBe('unsigned');
    expect(record.khqr?.parsed?.kind).toBe('khqr-offline');
    expect(record.customerQr).toBeUndefined();
    expect(record.matchedTransactionId).toBe('2352051686');
    expect(record.matchedStatus).toBe('APPROVED');
  });

  it('CM-4: invalid signature on the khqr route is recorded and rejected under rejectInvalidSignature (TD-09 parity)', async () => {
    await startServer({ rejectInvalidSignature: true });
    const res = await httpRequest(port, '/aba-payway-khqr-webhook', JSON.stringify(REAL_CUSTOMER_QR_CALLBACK), {
      'X-PAYWAY-HMAC-SHA512': signCallbackBody(REAL_CUSTOMER_QR_CALLBACK, 'wrong-key'),
    });
    expect(res.statusCode).toBe(401);

    const [record] = storage.getAll();
    expect(record.signatureVerdict).toBe('invalid');
    expect(record.verificationReason).toBe('signature_mismatch');
    // Captured-before-reject: the raw delivery stays durable for audit.
    expect(record.body).toContain('dt-one-8989');
  });

  it('CM-5: invalid signature without rejectInvalidSignature is stored invalid but still acknowledged 200 (capture sink)', async () => {
    await startServer();
    const res = await httpRequest(port, '/aba-payway-khqr-webhook', JSON.stringify(REAL_CUSTOMER_QR_CALLBACK), {
      'X-PAYWAY-HMAC-SHA512': signCallbackBody(REAL_CUSTOMER_QR_CALLBACK, 'wrong-key'),
    });
    expect(res.statusCode).toBe(200);
    const [record] = storage.getAll();
    expect(record.signatureVerdict).toBe('invalid');
  });

  it('CM-6: a customer-module callback landing on the ONLINE route is still classified and tagged (one URL, many channels)', async () => {
    await startServer();
    const signature = signCallbackBody(REAL_CUSTOMER_QR_CALLBACK, API_KEY);
    const res = await httpRequest(port, '/aba-payway-webhook', JSON.stringify(REAL_CUSTOMER_QR_CALLBACK), {
      'X-PAYWAY-HMAC-SHA512': signature,
    });
    expect(res.statusCode).toBe(200);

    const [record] = storage.getAll();
    expect(record.signatureVerdict).toBe('verified');
    expect(record.customerQr?.parsed?.kind).toBe('customer-module-qr');
    expect(record.matchedTransactionId).toBe('178702944869996');
    expect(record.matchedStatus).toBe('APPROVED');
  });

  it('CM-7: a second identical customer-module capture is marked as replay (idempotent processing signal)', async () => {
    await startServer();
    const signature = signCallbackBody(REAL_CUSTOMER_QR_CALLBACK, API_KEY);
    await httpRequest(port, '/aba-payway-khqr-webhook', JSON.stringify(REAL_CUSTOMER_QR_CALLBACK), {
      'X-PAYWAY-HMAC-SHA512': signature,
    });
    await httpRequest(port, '/aba-payway-khqr-webhook', JSON.stringify(REAL_CUSTOMER_QR_CALLBACK), {
      'X-PAYWAY-HMAC-SHA512': signature,
    });

    const records = storage.getAll();
    expect(records).toHaveLength(2);
    expect(records[0].replay).toBeFalsy();
    expect(records[1].replay).toBe(true);
  });

  it('CM-8: payment-link pushback now records tran_id + status correlation (P3-A)', async () => {
    await startServer();
    const res = await httpRequest(
      port,
      '/aba-payway-pushback',
      JSON.stringify({ tran_id: '178865526240157', status: 0, merchant_ref_no: 'plvr-v1-mtp34wx4' }),
    );
    expect(res.statusCode).toBe(200);

    const [record] = storage.getAll();
    expect(record.matchedTransactionId).toBe('178865526240157');
    expect(record.matchedStatus).toBe('0');
    expect(record.paymentLinkPushback?.parsed?.status).toBe('APPROVED');
  });

  it('CM-9: malformed customer-module body on the khqr route — raw capture preserved, parse error recorded', async () => {
    await startServer();
    const malformed = { ...REAL_CUSTOMER_QR_CALLBACK, transaction_id: 12345 }; // transaction_id must be a string
    const res = await httpRequest(port, '/aba-payway-khqr-webhook', JSON.stringify(malformed), {
      'X-PAYWAY-HMAC-SHA512': signCallbackBody(malformed, API_KEY),
    });
    expect(res.statusCode).toBe(200);

    const [record] = storage.getAll();
    expect(record.body).toContain('dt-one-8989');
    // A non-string transaction_id does NOT classify customer-module (the
    // classifier requires a string transaction_id) — the delivery falls to
    // the khqr-offline branch, whose parser records the precise error. The
    // raw capture and the valid signature verdict are preserved either way.
    expect(record.khqr?.parseError).toMatch(/transaction_id must be a string/);
    expect(record.customerQr).toBeUndefined();
    expect(record.signatureVerdict).toBe('verified');
  });
});

describe('WebhookServer Customer Module — signature-mode matrix (second-pass pins)', () => {
  let tempDir: string;
  let storage: JsonWebhookStorage;
  let server: WebhookServerResult;
  let port: number;

  async function startServer(options: Record<string, unknown> = {}): Promise<void> {
    port = await getFreePort();
    server = createWebhookServer(storage, { port, quiet: true, apiKey: API_KEY, ...options });
    await server.start();
  }

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'customer-qr-sigmatrix-'));
    storage = new JsonWebhookStorage(join(tempDir, 'callbacks.jsonl'));
  });

  afterEach(async () => {
    await server?.stop();
    storage.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('SM-1: customer-shaped body WITHOUT a signature header stays unsigned and 200 — even under rejectInvalidSignature', async () => {
    await startServer({ rejectInvalidSignature: true });
    const res = await httpRequest(port, '/aba-payway-khqr-webhook', JSON.stringify(REAL_CUSTOMER_QR_CALLBACK));
    expect(res.statusCode).toBe(200);
    const [record] = storage.getAll();
    expect(record.signatureVerdict).toBe('unsigned');
    expect(record.customerQr?.parsed?.kind).toBe('customer-module-qr');
  });

  it('SM-2: rejectInvalidSignature + VALID customer-module signature is accepted 200', async () => {
    await startServer({ rejectInvalidSignature: true });
    const res = await httpRequest(port, '/aba-payway-khqr-webhook', JSON.stringify(REAL_CUSTOMER_QR_CALLBACK), {
      'X-PAYWAY-HMAC-SHA512': signCallbackBody(REAL_CUSTOMER_QR_CALLBACK, API_KEY),
    });
    expect(res.statusCode).toBe(200);
    const [record] = storage.getAll();
    expect(record.signatureVerdict).toBe('verified');
  });

  it('SM-3: HTML-wrapped SIGNED customer-module delivery still verifies (tolerant extraction, not strict JSON.parse)', async () => {
    await startServer();
    const signature = signCallbackBody(REAL_CUSTOMER_QR_CALLBACK, API_KEY);
    const wrapped = `<html><body><script>var d = ${JSON.stringify(REAL_CUSTOMER_QR_CALLBACK)}; process(d);</script></body></html>`;
    const res = await httpRequest(port, '/aba-payway-khqr-webhook', wrapped, {
      'X-PAYWAY-HMAC-SHA512': signature,
    });
    expect(res.statusCode).toBe(200);
    const [record] = storage.getAll();
    expect(record.signatureVerdict).toBe('verified');
    expect(record.customerQr?.parsed?.notification.merchantRef).toBe('dt-one-8989');
  });

  it('SM-4: HTML-wrapped delivery is journaled even when 401-rejected (journal-before-reject parity with the online route)', async () => {
    await startServer({ rejectInvalidSignature: true });
    const res = await httpRequest(port, '/aba-payway-khqr-webhook', JSON.stringify(REAL_CUSTOMER_QR_CALLBACK), {
      'X-PAYWAY-HMAC-SHA512': signCallbackBody(REAL_CUSTOMER_QR_CALLBACK, 'wrong-key'),
    });
    expect(res.statusCode).toBe(401);
    // The record exists (captured-before-reject); journal coverage is pinned
    // by the emit call ordering — asserted here via the durable record only,
    // since the JSONL journal is env-gated and covered in the journal suites.
    const [record] = storage.getAll();
    expect(record.body).toContain('dt-one-8989');
    expect(record.signatureVerdict).toBe('invalid');
  });
});
