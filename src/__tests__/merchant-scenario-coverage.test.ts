import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PayWay } from '../client.js';

const TEST_CONFIG = {
  merchantId: 'test-merchant-coverage',
  apiKey: 'test-api-key-secret',
  environment: 'sandbox' as const,
};

function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as Response;
}

describe('merchant scenario coverage', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let payway: PayWay;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(mockJsonResponse({ status: { code: '00' } }));
    vi.stubGlobal('fetch', fetchSpy);
    payway = new PayWay(TEST_CONFIG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('TC-001 forwards payment_gate=0 in the signed checkout form payload', () => {
    const fields = payway.checkout.createTransaction({
      transactionId: 'TC001-CHECKOUT',
      amount: 12,
      paymentOption: 'cards',
      paymentGate: 0,
    });

    expect(fields).toMatchObject({ payment_gate: 0, payment_option: 'cards' });
    expect(fields).toHaveProperty('hash');
    expect(fields).not.toHaveProperty('api_key');
  });

  it.each([0, -1, 1.5])('TC-008 rejects invalid checkout lifetime %s', (lifetime) => {
    expect(() => payway.checkout.createTransaction({ transactionId: 'TC008', amount: 1, lifetime })).toThrow(
      'lifetime must be a positive whole number of seconds',
    );
  });

  it.each([' https://merchant.example/callback', 'http://merchant.example/callback', 'not-a-url'])(
    'TC-025 rejects unsafe callback URL %s before calling PayWay',
    (callbackUrl) => {
      expect(() =>
        payway.qr.generateQr({
          transactionId: 'TC025',
          amount: 1,
          paymentOption: 'abapay_khqr',
          callbackUrl,
        }),
      ).toThrow('callbackUrl must be a public HTTPS URL without surrounding whitespace');
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it('TC-002 and TC-003 never include apiKey in request-hook payloads', async () => {
    const onRequest = vi.fn();
    const client = new PayWay({ ...TEST_CONFIG, onRequest });

    await client.checkout.checkTransaction('TC002');

    expect(onRequest).toHaveBeenCalledOnce();
    expect(onRequest.mock.calls[0][1]).not.toContain(TEST_CONFIG.apiKey);
  });
});
