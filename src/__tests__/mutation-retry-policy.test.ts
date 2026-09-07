import { afterEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { PayWay } from '../client.js';
import { MUTATION_ENDPOINTS } from '../constants.js';

/**
 * F01 acceptance: simulate "accepted then dropped" — the first fetch attempt
 * reaches the gateway but the response is lost (connection reset mid-response,
 * expressed as a rejected promise). Every mutation must be submitted exactly
 * ONCE and surface the unknown outcome; reads keep the bounded retry default.
 * Direct-SDK behavior is pinned here; facade/CLI/agent surfaces already pin
 * the same single-submit default (facade `retryPolicy ?? 'none'`, agent
 * `maxRetries: 0` for creates) — see sdk-facade tests and agent-context tests.
 *
 * Zero real network calls: globalThis.fetch is stubbed throughout.
 */

function generateTestKeyPair() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 1024,
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
}

const TEST_RSA = generateTestKeyPair();

const CONFIG = {
  merchantId: 'f01merchantid1',
  apiKey: 'f01-api-key-0000000000000000',
  environment: 'sandbox' as const,
  publicKeyPem: TEST_RSA.publicKey,
  retryDelayMs: 5,
};

function droppedResponseFetch(): ReturnType<typeof vi.fn> {
  // The gateway ACCEPTS the mutation (we count the send), but the response is
  // lost — fetch rejects like a connection reset mid-response.
  return vi.fn(async () => {
    throw new TypeError('fetch failed: response dropped');
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('F01 mutation single-submit policy (direct SDK)', () => {
  it('submits generate-qr exactly once when the response is dropped', async () => {
    const fetchMock = droppedResponseFetch();
    vi.stubGlobal('fetch', fetchMock);
    const payway = new PayWay(CONFIG);

    await expect(
      payway.qr.generateQr({
        transactionId: 'F01QRONE111111111',
        paymentOption: 'abapay_khqr',
        amount: 5,
        currency: 'USD',
        callbackUrl: 'https://merchant.example/callback',
      }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('submits purchase exactly once when the response is dropped (default retryPolicy omitted)', async () => {
    const fetchMock = droppedResponseFetch();
    vi.stubGlobal('fetch', fetchMock);
    const payway = new PayWay(CONFIG);

    await expect(
      payway.checkout.purchase({ transactionId: 'F01PURONE1111111', amount: 5, currency: 'USD' }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries purchase only when retryPolicy: "transient" is explicit', async () => {
    const fetchMock = droppedResponseFetch();
    vi.stubGlobal('fetch', fetchMock);
    const payway = new PayWay({ ...CONFIG, maxRetries: 2 });

    await expect(
      payway.checkout.purchase({
        transactionId: 'F01PURTWO11111111',
        amount: 5,
        currency: 'USD',
        retryPolicy: 'transient',
      }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('mutationRetryPolicy: "transient" restores retries globally for mutations', async () => {
    const fetchMock = droppedResponseFetch();
    vi.stubGlobal('fetch', fetchMock);
    const payway = new PayWay({ ...CONFIG, maxRetries: 1, mutationRetryPolicy: 'transient' });

    await expect(
      payway.qr.generateQr({
        transactionId: 'F01QRTWO111111111',
        paymentOption: 'abapay_khqr',
        amount: 5,
        currency: 'USD',
        callbackUrl: 'https://merchant.example/callback',
      }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  it('reads keep the bounded retry default (check-transaction retries)', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockImplementation(async () => jsonResponse({ status: { code: '0', message: 'Success' } }));
    vi.stubGlobal('fetch', fetchMock);
    const payway = new PayWay({ ...CONFIG, maxRetries: 2 });

    const result = await payway.checkout.checkTransaction('F01READONE1111111');
    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 fail + 1 retry success
    expect(result).toBeTruthy();
  });

  it('covers refund, close-transaction, and COF-charge mutations', async () => {
    const cases: [string, (p: PayWay) => Promise<unknown>][] = [
      ['refund', (p) => p.checkout.refund('F01REFONE111111111', 1, 'USD')],
      ['close', (p) => p.checkout.closeTransaction('F01CLOSEONE111111')],
      [
        'cof charge',
        (p) =>
          p.credentialsOnFile.payment({
            transactionId: 'F01CHARGEONE11111',
            amount: 1,
            currency: 'USD',
            ctid: 'customer123',
            paymentToken: 'pwttoken123456789',
            tokenFlag: 'MITU_FLEX',
          }),
      ],
    ];
    for (const [label, run] of cases) {
      const fetchMock = droppedResponseFetch();
      vi.stubGlobal('fetch', fetchMock);
      const payway = new PayWay(CONFIG);
      // Rejection (unknown outcome) is the expected path.
      await expect(run(payway), label).rejects.toThrow();
      expect(fetchMock, label).toHaveBeenCalledTimes(1);
    }
  });
});

describe('F01 policy registry shape', () => {
  it('classifies every money-moving endpoint as a mutation and every pure read as non-mutation', () => {
    const reads = [
      '/api/payment-gateway/v1/payments/check-transaction-2',
      '/api/payment-gateway/v1/payments/transaction-detail',
      '/api/payment-gateway/v1/payments/transaction-list-2',
      '/api/payment-gateway/v1/payments/get-transactions-by-mc-ref',
      '/api/payment-gateway/v1/exchange-rate',
      '/api/merchant-portal/merchant-access/payment-link/detail',
      '/api/payment-credential/v3/token-management/get-token-details',
    ];
    const mutations = [
      '/api/payment-gateway/v1/payments/generate-qr',
      '/api/payment-gateway/v1/payments/purchase',
      '/api/merchant-portal/merchant-access/online-transaction/refund',
      '/api/payment-gateway/v1/payments/close-transaction',
      '/api/payment-credential/v3/aof/link-account',
      '/api/payment-credential/v3/cof/link-card',
      '/api/payment-gateway/v3/purchase/payment-credential',
      '/api/payment-credential/v3/token-management/renew-expired-account-token',
      '/api/payment-credential/v3/token-management/remove-token',
      '/api/merchant-portal/merchant-access/payment-link/create',
      '/api/merchant-portal/merchant-access/online-transaction/pre-auth-completion',
      '/api/merchant-portal/merchant-access/online-transaction/pre-auth-cancellation',
      '/api/payment-gateway/v2/direct-payment/merchant/payout',
      '/api/merchant-portal/merchant-access/whitelist-account/update-whitelist-status',
      '/api/merchant-portal/merchant-access/whitelist-account/add-whitelist-payout',
    ];
    for (const endpoint of mutations) {
      expect(MUTATION_ENDPOINTS.has(endpoint), `mutation missing: ${endpoint}`).toBe(true);
    }
    for (const endpoint of reads) {
      expect(MUTATION_ENDPOINTS.has(endpoint), `read wrongly classified: ${endpoint}`).toBe(false);
    }
  });
});
