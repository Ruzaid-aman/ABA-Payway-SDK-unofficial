/**
 * Lifecycle tests for the first-payment reference app — Task 7 acceptance
 * criteria. Each test proves one integration safeguard from the DX overhaul
 * plan (§3.3 / Task 7 acceptance) end to end through the real HTTP surface:
 * real server, real fetch, real HMAC-signed callbacks.
 *
 * The engine runs in demo mode (local simulator) so the gateway side is
 * deterministic; the verification/reconciliation/store code under test is
 * IDENTICAL to what sandbox mode runs — only the transport differs.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { OrderStore } from '../../examples/first-payment/src/store.js';
import { createPaymentEngine, type PaymentEngine } from '../../examples/first-payment/src/payments.js';
import { startExampleServer, stopExampleServer } from '../../examples/first-payment/src/server.js';

const DEMO_KEY = 'test-demo-key';

let store: OrderStore;
let engine: PaymentEngine;
let baseUrl: string;
let serverHandle: Awaited<ReturnType<typeof startExampleServer>>;
let dataDir: string;
const callbackDeliveries: { transactionId: string; status: string }[] = [];

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'first-payment-test-'));
  store = new OrderStore(path.join(dataDir, 'store.json'));
  engine = createPaymentEngine({
    mode: 'demo',
    publicBaseUrl: 'http://127.0.0.1:0', // placeholder, re-pointed after bind
    store,
    demo: {
      apiKey: DEMO_KEY,
      onCallback: (delivery) => callbackDeliveries.push(delivery),
    },
  });
  serverHandle = await startExampleServer({ port: 0, host: '127.0.0.1', store, engine });
  baseUrl = `http://127.0.0.1:${serverHandle.port}`;
  // The simulator delivers callbacks to the app's own endpoint; point it at
  // the live server now that the ephemeral port is bound.
  engine.setCallbackBaseUrl(baseUrl);
});

afterAll(async () => {
  await stopExampleServer(serverHandle.server);
  rmSync(dataDir, { recursive: true, force: true });
});

async function api(pathname: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

const post = (pathname: string, body?: unknown) =>
  api(pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function createOrder(productId: string): Promise<string> {
  const { status, body } = await post('/api/orders', { productId });
  expect(status).toBe(201);
  return body.order.orderId as string;
}

function sign(body: Record<string, unknown>, key = DEMO_KEY): string {
  const sorted = Object.keys(body)
    .sort()
    .map((k) => body[k])
    .join('');
  return createHmac('sha512', key).update(sorted).digest('base64');
}

// ─────────────────────── acceptance criteria ───────────────────────

describe('Task 7 acceptance: the full payment lifecycle', () => {
  it('fulfills an order at most once across callback, replay, and poll', async () => {
    const orderId = await createOrder('approve');
    const { body } = await post('/api/orders/create-qr', { orderId });
    expect(body.simulated).toBe(true);
    const transactionId = body.transactionId as string;

    // The simulator approves after ~300ms and delivers ONE signed callback.
    await sleep(700);
    const paidOrder = store.get(orderId)!;
    expect(paidOrder.status).toBe('paid');
    expect(paidOrder.paidTotal).toBe(1);

    // Replay the same signed callback body 3 more times. The signature
    // covers the exact body — replaying it verbatim (header included) is
    // what a genuine duplicate delivery looks like.
    const replayBody = { tran_id: transactionId, status: '0', payway_amount: '1', payway_currency: 'USD', apex_mark: '000000' };
    for (let i = 0; i < 3; i++) {
      const replay = await api('/api/payway/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-payway-hmac-sha512': sign(replayBody) },
        body: JSON.stringify(replayBody),
      });
      // Valid signature → 200 even though it changes nothing.
      expect(replay.status).toBe(200);
    }

    // Poll after payment: status-check must also not double-apply.
    const poll = await post(`/api/orders/status/${transactionId}`);
    expect(poll.body.order.status).toBe('paid');

    // Exactly ONE payment_verified event, one fulfillment.
    const events = store.listEvents(orderId);
    expect(events.filter((e) => e.type === 'payment_verified').length).toBe(1);
    expect(poll.body.gatewayStatus).toBe('APPROVED');
  });

  it('rejects wrong amounts and currencies — no fulfillment', async () => {
    const orderId = await createOrder('no-callback');
    const { body } = await post('/api/orders/create-qr', { orderId });
    const transactionId = body.transactionId as string;

    // Force-verify a paid signal whose authoritative read disagrees with the
    // order price: simulate by direct store application (the store is the
    // gate under test — a verified pushback with a mismatched gateway read
    // must refuse fulfillment).
    const mismatch = store.applyVerifiedPayment({
      transactionId,
      source: 'webhook',
      amount: 0.5, // order is 1.00
      currency: 'USD',
    });
    expect(mismatch.applied).toBe(false);
    expect(mismatch.rejectedReason).toMatch(/amount mismatch/);
    expect(store.get(orderId)!.status).toBe('awaiting_payment');

    // Same for currency mismatch.
    const currencyMismatch = store.applyVerifiedPayment({
      transactionId,
      source: 'webhook',
      amount: 1,
      currency: 'KHR',
    });
    expect(currencyMismatch.applied).toBe(false);
    expect(currencyMismatch.rejectedReason).toMatch(/currency mismatch/);
    expect(store.get(orderId)!.status).toBe('awaiting_payment');
  });

  it('refuses unverified notifications — bad or missing signatures never mark an order paid', async () => {
    const orderId = await createOrder('approve');
    const { body } = await post('/api/orders/create-qr', { orderId });
    const transactionId = body.transactionId as string;

    // Missing signature header.
    const unsigned = await post('/api/payway/callback', { tran_id: transactionId, status: '0' });
    expect(unsigned.status).toBe(401);

    // Wrong key.
    const badSig = await api('/api/payway/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-payway-hmac-sha512': sign({ tran_id: transactionId, status: '0' }, 'wrong-key') },
      body: JSON.stringify({ tran_id: transactionId, status: '0' }),
    });
    expect(badSig.status).toBe(401);

    // Tampered body under a once-valid signature.
    const tampered = await api('/api/payway/callback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-payway-hmac-sha512': sign({ tran_id: transactionId, status: '0', payway_amount: '1', payway_currency: 'USD' }),
      },
      body: JSON.stringify({ tran_id: transactionId, status: '0', payway_amount: '999', payway_currency: 'USD' }),
    });
    expect(tampered.status).toBe(401);

    // The order never paid despite the "status 0" bodies.
    await sleep(50);
    expect(store.get(orderId)!.status).toBe('awaiting_payment');
    const events = store.listEvents(orderId);
    expect(events.some((e) => e.type === 'unverified_notification_rejected')).toBe(true);
  });

  it('never silently creates another payment: unknown create outcomes and paid orders refuse new attempts', async () => {
    // (a) A paid order cannot open a new attempt.
    const orderId = await createOrder('approve');
    await post('/api/orders/create-qr', { orderId });
    await sleep(700);
    expect(store.get(orderId)!.status).toBe('paid');
    const second = await post('/api/orders/create-qr', { orderId });
    expect(second.status).toBe(409); // HTTP-level refusal: never silently create another payment
    expect(second.body.error).toMatch(/order is paid/);
    // Still exactly one attempt.
    expect(store.listAttempts(orderId).length).toBe(1);

    // (b) Pending or ambiguous creation must reconcile the saved attempt.
    const orderId2 = await createOrder('coffee');
    const first = await post('/api/orders/create-qr', { orderId: orderId2 });
    const secondAttempt = await post('/api/orders/create-qr', { orderId: orderId2 });
    expect(secondAttempt.status).toBe(409);
    expect(store.listAttempts(orderId2).length).toBe(1);
    expect(store.listAttempts(orderId2)[0].transactionId).toBe(first.body.transactionId);
    const hosted = await post('/api/orders/create-hosted', { orderId: orderId2 });
    expect(hosted.status).toBe(409);
    const reopened = new OrderStore(path.join(dataDir, 'store.json'));
    expect(() => reopened.recordAttempt(orderId2, 'replacement-after-restart', 300)).toThrow(/existing transaction/);
  });

  it('recovers a lost creation response from the saved attempt without creating a replacement', async () => {
    const orderId = await createOrder('coffee');
    const original = engine.createQrPayment;
    engine.createQrPayment = async (input) => {
      await original(input);
      throw new Error('Simulated lost creation response');
    };
    try {
      expect((await post('/api/orders/create-qr', { orderId })).status).toBe(500);
    } finally {
      engine.createQrPayment = original;
    }
    const reopened = new OrderStore(path.join(dataDir, 'store.json'));
    const attempts = reopened.listAttempts(orderId);
    expect(attempts).toHaveLength(1);
    expect((await post('/api/orders/create-qr', { orderId })).status).toBe(409);
    expect((await post(`/api/orders/status/${attempts[0].transactionId}`)).status).toBe(200);
    expect(store.listAttempts(orderId)).toHaveLength(1);
    expect(store.get(orderId)!.status).toBe('awaiting_payment');
  });

  it('routes a late payment after local closure to merchant resolution — never auto-fulfills or auto-refunds', async () => {
    const orderId = await createOrder('late');
    const { body } = await post('/api/orders/create-qr', { orderId });
    const transactionId = body.transactionId as string;

    // Merchant closes the attempt (customer walked away; QR expired).
    await post(`/api/orders/close/${transactionId}`);
    expect(store.get(orderId)!.status).toBe('cancelled');

    // The "customer's" card session completes anyway (~200ms after close in
    // the simulator) and the gateway still pushes back a signed callback.
    await sleep(900);
    expect(store.get(orderId)!.status).toBe('needs_resolution');

    // Auto-poll must not have fulfilled it.
    expect(store.get(orderId)!.paidTotal).toBe(0);

    // Merchant decides to refund the late payment.
    const refundDecision = await post(`/api/orders/resolve/${orderId}`, { decision: 'refund' });
    expect(refundDecision.status).toBe(200);
    expect(refundDecision.body.order.status).toBe('refunded');
    const order = store.get(orderId)!;
    expect(order.status).toBe('refunded');
    expect(order.refundedTotal).toBe(order.amount);
  });

  it('reconciles a missed callback via server-side status reads (no-callback case)', async () => {
    const orderId = await createOrder('no-callback');
    const { body } = await post('/api/orders/create-qr', { orderId });
    const transactionId = body.transactionId as string;

    // The simulator approves WITHOUT delivering a callback.
    await sleep(700);
    expect(callbackDeliveries.find((d) => d.transactionId === transactionId)).toBeUndefined();
    expect(store.get(orderId)!.status).toBe('awaiting_payment'); // nobody told us

    // The browser's poll (what a real merchant dashboard does) discovers it.
    const poll = await post(`/api/orders/status/${transactionId}`);
    expect(poll.body.gatewayStatus).toBe('APPROVED');
    expect(poll.body.order.status).toBe('paid');
    // source: status-check — the reconciliation path, not the callback.
    const events = store.listEvents(orderId);
    expect(events.some((e) => e.type === 'payment_verified' && e.source === 'status-check')).toBe(true);
  });

  it('supports quantitative partial refunds (REFUNDED flag alone is not full-refund proof)', async () => {
    const orderId = await createOrder('approve');
    const { body } = await post('/api/orders/create-qr', { orderId });
    const transactionId = body.transactionId as string;
    await sleep(700);
    expect(store.get(orderId)!.status).toBe('paid');

    // Partial refund of 0.40 on a 1.00 order.
    const partial = await post(`/api/orders/refund/${transactionId}`, { amount: 0.4 });
    expect(partial.status).toBe(200);
    let order = store.get(orderId)!;
    expect(order.refundedTotal).toBe(0.4);
    expect(order.status).toBe('paid'); // still paid — not fully refunded

    // Refunding more than the paid remainder is refused.
    const over = await post(`/api/orders/refund/${transactionId}`, { amount: 5 });
    expect(over.status).toBe(400);

    // Refund the remainder → fully refunded.
    await post(`/api/orders/refund/${transactionId}`, { amount: 0.6 });
    order = store.get(orderId)!;
    expect(order.refundedTotal).toBeCloseTo(1.0, 2);
    expect(order.status).toBe('refunded');
  });

  it('serves the hosted-card tab as a signed, standalone form with a SIMULATED label in demo mode', async () => {
    const orderId = await createOrder('approve');
    const { body } = await post('/api/orders/create-hosted', { orderId });
    expect(body.simulated).toBe(true);
    expect(typeof body.html).toBe('string');
    expect(body.html).toContain('<form');
    expect(body.html).toContain('SIMULATED');
    expect(body.html).toContain('tran_id');
  });

  it('rejects tampered amounts: the browser cannot dictate prices', async () => {
    const missing = await post('/api/orders', { productId: 'does-not-exist' });
    expect(missing.status).toBe(400);
    // Orders are created from the server-side catalog only — there is no
    // client-supplied amount field at all on the POST /api/orders contract.
    const withAmount = await post('/api/orders', { productId: 'coffee', amount: 0.01 });
    const order = store.get(withAmount.body.order.orderId)!;
    expect(order.amount).toBe(3.5); // catalog price, not 0.01
  });

  it('declined payments mark the order declined and allow a fresh attempt with a new ID', async () => {
    const orderId = await createOrder('decline');
    const { body } = await post('/api/orders/create-qr', { orderId });
    const transactionId = body.transactionId as string;

    await sleep(700);
    expect(store.get(orderId)!.status).toBe('declined');

    // A retry is a NEW transaction ID (never reuse the declined one).
    const retry = await post('/api/orders/create-qr', { orderId });
    expect(retry.body.transactionId).not.toBe(transactionId);
    expect(store.get(orderId)!.status).toBe('awaiting_payment');
  });
});
