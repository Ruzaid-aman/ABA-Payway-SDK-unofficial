import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ActivePaymentAttemptError, JsonOrderStore } from './order-store.js';

const temporaryDirectories: string[] = [];

function createStore(): JsonOrderStore {
  const directory = mkdtempSync(path.join(tmpdir(), 'payway-first-payment-'));
  temporaryDirectories.push(directory);
  return new JsonOrderStore(path.join(directory, 'orders.json'));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('first-payment lifecycle store', () => {
  it('fulfills at most once when a callback is replayed and reconciliation repeats it', () => {
    const store = createStore();
    const order = store.createOrder('coffee', 'order-1');
    store.beginPayment(order.id, 'qr', 'tx-1');
    store.markAttemptAccepted('tx-1');

    expect(
      store.applyVerification({
        verificationId: 'callback-1',
        transactionId: 'tx-1',
        source: 'signed-online-callback',
        authenticity: 'verified',
        paymentStatus: 'APPROVED',
        amountCents: 300,
        currency: 'USD',
      }),
    ).toMatchObject({ applied: true, fulfilled: true });
    expect(
      store.applyVerification({
        verificationId: 'callback-1',
        transactionId: 'tx-1',
        source: 'signed-online-callback',
        authenticity: 'verified',
        paymentStatus: 'APPROVED',
        amountCents: 300,
        currency: 'USD',
      }),
    ).toMatchObject({ applied: false, reason: 'replay' });
    expect(
      store.applyVerification({
        verificationId: 'status-1',
        transactionId: 'tx-1',
        source: 'status-check',
        authenticity: 'verified',
        paymentStatus: 'APPROVED',
        amountCents: 300,
        currency: 'USD',
      }),
    ).toMatchObject({ applied: false, reason: 'already-fulfilled' });
    expect(store.get(order.id)).toMatchObject({ state: 'FULFILLED', fulfillmentCount: 1 });
  });

  it.each([
    { amountCents: 299, currency: 'USD' as const },
    { amountCents: 300, currency: 'KHR' as const },
  ])('routes an approved payment with mismatched value to merchant resolution', ({ amountCents, currency }) => {
    const store = createStore();
    const order = store.createOrder('coffee', 'order-mismatch');
    store.beginPayment(order.id, 'qr', 'tx-mismatch');

    const result = store.applyVerification({
      verificationId: `mismatch-${currency}-${amountCents}`,
      transactionId: 'tx-mismatch',
      source: 'status-check',
      authenticity: 'verified',
      paymentStatus: 'APPROVED',
      amountCents,
      currency,
    });

    expect(result).toMatchObject({ applied: true, fulfilled: false, reason: 'amount-or-currency-mismatch' });
    expect(store.get(order.id)).toMatchObject({ state: 'RESOLUTION_REQUIRED', fulfillmentCount: 0 });
  });

  it('does not let an unverified notification mark an order paid', () => {
    const store = createStore();
    const order = store.createOrder('coffee', 'order-unverified');
    store.beginPayment(order.id, 'qr', 'tx-unverified');

    const result = store.applyVerification({
      verificationId: 'offline-notification-1',
      transactionId: 'tx-unverified',
      source: 'unverified-notification',
      authenticity: 'unverified',
      paymentStatus: 'APPROVED',
      amountCents: 300,
      currency: 'USD',
    });

    expect(result).toMatchObject({ applied: false, fulfilled: false, reason: 'unverified' });
    expect(store.get(order.id)).toMatchObject({ state: 'PAYMENT_PENDING', fulfillmentCount: 0 });
  });

  it('blocks a second submission while the first create outcome is unknown', () => {
    const store = createStore();
    const order = store.createOrder('coffee', 'order-unknown');
    store.beginPayment(order.id, 'qr', 'tx-unknown');
    store.markAttemptUnknown('tx-unknown');

    expect(() => store.beginPayment(order.id, 'hosted', 'tx-replay')).toThrow(ActivePaymentAttemptError);
    expect(store.get(order.id)?.attempts).toHaveLength(1);
  });

  it('routes a late approval after local closure to merchant resolution', () => {
    const store = createStore();
    const order = store.createOrder('coffee', 'order-closed');
    store.beginPayment(order.id, 'hosted', 'tx-closed');
    store.markAttemptAccepted('tx-closed');
    store.closeOrder(order.id);

    const result = store.applyVerification({
      verificationId: 'late-status-1',
      transactionId: 'tx-closed',
      source: 'status-check',
      authenticity: 'verified',
      paymentStatus: 'APPROVED',
      amountCents: 300,
      currency: 'USD',
    });

    expect(result).toMatchObject({ applied: true, fulfilled: false, reason: 'approved-after-local-close' });
    expect(store.get(order.id)).toMatchObject({ state: 'RESOLUTION_REQUIRED', fulfillmentCount: 0 });
  });

  it('records partial and full refunds idempotently without repeating fulfillment', () => {
    const store = createStore();
    const order = store.createOrder('coffee', 'order-refund');
    store.beginPayment(order.id, 'qr', 'tx-refund');
    store.applyVerification({
      verificationId: 'paid-1',
      transactionId: 'tx-refund',
      source: 'status-check',
      authenticity: 'verified',
      paymentStatus: 'APPROVED',
      amountCents: 300,
      currency: 'USD',
    });

    expect(store.recordRefund(order.id, 'refund-1', 100)).toMatchObject({ applied: true });
    expect(store.get(order.id)).toMatchObject({ state: 'PARTIALLY_REFUNDED', refundedCents: 100 });
    expect(store.recordRefund(order.id, 'refund-1', 100)).toMatchObject({ applied: false });
    expect(store.recordRefund(order.id, 'refund-2', 200)).toMatchObject({ applied: true });
    expect(store.get(order.id)).toMatchObject({ state: 'REFUNDED', refundedCents: 300, fulfillmentCount: 1 });
  });

  it('reloads durable order and attempt state from disk', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'payway-first-payment-reload-'));
    temporaryDirectories.push(directory);
    const file = path.join(directory, 'orders.json');
    const first = new JsonOrderStore(file);
    first.createOrder('coffee', 'order-durable');
    first.beginPayment('order-durable', 'qr', 'tx-durable');
    first.markAttemptUnknown('tx-durable');

    expect(new JsonOrderStore(file).get('order-durable')).toMatchObject({
      state: 'PAYMENT_OUTCOME_UNKNOWN',
      attempts: [{ transactionId: 'tx-durable', state: 'UNKNOWN' }],
    });
  });
});
