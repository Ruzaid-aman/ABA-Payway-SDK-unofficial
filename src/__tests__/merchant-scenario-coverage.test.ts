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

  it('TC-001a forwards payment_gate=1 in the signed checkout form payload', () => {
    const fields = payway.checkout.createTransaction({
      transactionId: 'TC001a-CHECKOUT',
      amount: 15,
      paymentOption: 'abapay_khqr_deeplink',
      paymentGate: 1,
    });

    expect(fields).toMatchObject({ payment_gate: 1, payment_option: 'abapay_khqr_deeplink' });
    expect(fields).toHaveProperty('hash');
  });

  it('TC-001b omits payment_gate when not specified', () => {
    const fields = payway.checkout.createTransaction({
      transactionId: 'TC001b-CHECKOUT',
      amount: 20,
      paymentOption: 'abapay_khqr',
    });

    expect(fields).not.toHaveProperty('payment_gate');
    expect(fields).toHaveProperty('payment_option', 'abapay_khqr');
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

  it('TC-026 successfully generates QR code for abapay_khqr payment option', async () => {
    const mockResponse = {
      qrString: '00020101021226aba01kh0002ABA BANK KHQR0103000000000000102abaakhppxxx@abaa01151250212145328460208ABA Bank52048249530384054040.015802KH5925OLD ME 25 CHAR WINNER IP6009www.aba.com.kh62070703www.tlr.gov.kh63040D37',
      qrImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAACgCAYAAACLz2ctAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAOC0lEQVR4nO2deahV1RfHl6ZlaaZ',
      abapay_deeplink: 'abamobilebank://ababank.com?type=payway&qrcode=00020101021226aba01kh0002ABA BANK KHQR0103000000000000102abaakhppxxx@abaa01151250212145328460208ABA+Bank52048249530384054040.015802KH5925OLD ME 25 CHAR WINNER IP6009www.aba.com.kh62070703www.tlr.gov.kh63040D37',
      app_store: 'https://itunes.apple.com/al/app/aba-mobile-bank/id968860649?mt=8',
      play_store: 'https://play.google.com/store/apps/details?id=com.paygo24.ibank',
      amount: 0.01,
      currency: 'USD',
      status: { code: '0', message: 'Success.', trace_id: 'b9f93f45b49f08e26dfcfb8c2da396c6' },
    };
    
    fetchSpy.mockResolvedValueOnce(mockJsonResponse(mockResponse));
    
    const result = await payway.qr.generateQr({
      transactionId: 'TC026-QR-GEN',
      amount: 100,
      paymentOption: 'abapay_khqr',
      callbackUrl: 'https://merchant.example.com/callback',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockResponse);
    // Verify the request payload contains expected fields
    const requestBody = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(requestBody.merchant_id).toBe(TEST_CONFIG.merchantId);
    expect(requestBody.tran_id).toBe('TC026-QR-GEN');
    expect(requestBody.amount).toBe('100.00'); // FormatAmount converts to string with 2 decimal places
    expect(requestBody.payment_option).toBe('abapay_khqr');
    expect(requestBody.callback_url).toBeDefined(); // Should be base64 encoded
    expect(requestBody.currency).toBe('USD');
    expect(requestBody.qr_image_template).toBe('template2'); // Default value
  });
});
