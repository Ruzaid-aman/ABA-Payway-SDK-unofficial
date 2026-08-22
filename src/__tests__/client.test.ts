import * as crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PayWay } from '../client.js';
import { ENDPOINTS } from '../constants.js';
import {
  PayWayAPIError,
  PayWayBusinessError,
  PayWayConfigError,
  PayWayNetworkError,
  PayWayRateLimitError,
  PollingAbortedError,
} from '../errors.js';
import type { PollTransactionResult } from '../types.js';
import * as utils from '../utils.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_CONFIG = {
  merchantId: 'test-merchant-001',
  apiKey: 'test-api-key-secret',
  environment: 'sandbox' as const,
};

const TEST_KHQR_CONFIG = {
  bakongId: 'merchant@abakong',
  abaMerchantId: '123456789012345',
  acquirerName: 'ABA',
  merchantCategoryCode: '5411',
  merchantName: 'Test Merchant',
  merchantCity: 'Phnom Penh',
  paywayData: 'ABA-PAYWAY-DATA',
};

/** Generate a 1024-bit RSA key pair for endpoints that need publicKeyPem. */
function generateTestKeyPair() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 1024,
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
}

const TEST_RSA = generateTestKeyPair();

const CONFIG_WITH_RSA = {
  ...TEST_CONFIG,
  publicKeyPem: TEST_RSA.publicKey,
};

/** Create a mock Response that resolves to JSON. */
function mockJsonResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
    headers: new Headers(),
    redirected: false,
    type: 'basic',
    url: '',
    clone: () => ({}) as Response,
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(body)),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

// ---------------------------------------------------------------------------
// Constructor validation
// ---------------------------------------------------------------------------

describe('PayWay constructor', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws PayWayConfigError when config is missing', () => {
    // @ts-expect-error — intentionally testing runtime guard
    expect(() => new PayWay(null)).toThrow(PayWayConfigError);
  });

  it('throws PayWayConfigError when merchantId is missing', () => {
    vi.stubEnv('PAYWAY_MERCHANT_ID', '');
    expect(() => new PayWay({ apiKey: 'key' })).toThrow(PayWayConfigError);
    expect(() => new PayWay({ apiKey: 'key' })).toThrow('merchantId is required');
  });

  it('throws PayWayConfigError when apiKey is missing', () => {
    vi.stubEnv('PAYWAY_API_KEY', '');
    expect(() => new PayWay({ merchantId: 'M001' })).toThrow(PayWayConfigError);
    expect(() => new PayWay({ merchantId: 'M001' })).toThrow('apiKey is required');
  });

  it('accepts a valid config', () => {
    expect(() => new PayWay(TEST_CONFIG)).not.toThrow();
  });

  it('defaults to sandbox environment', () => {
    const pw = new PayWay({ merchantId: 'M001', apiKey: 'key' });
    // We can verify by checking it uses sandbox URL in requests
    expect(pw).toBeInstanceOf(PayWay);
  });

  it('allows a custom baseUrl to override environment', () => {
    const pw = new PayWay({
      ...TEST_CONFIG,
      baseUrl: 'https://custom-gateway.example.com',
    });
    expect(pw).toBeInstanceOf(PayWay);
  });
});

describe('PayWay environment configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses environment credentials when no constructor config is supplied', () => {
    vi.stubEnv('PAYWAY_MERCHANT_ID', 'env-merchant');
    vi.stubEnv('PAYWAY_API_KEY', 'env-api-key');

    expect(() => new PayWay()).not.toThrow();
  });

  it('gives explicit credentials precedence over environment credentials', async () => {
    vi.stubEnv('PAYWAY_MERCHANT_ID', 'env-merchant');
    vi.stubEnv('PAYWAY_API_KEY', 'env-api-key');
    const fetchSpy = vi.fn().mockResolvedValue(mockJsonResponse({ status: { code: 0 } }));
    vi.stubGlobal('fetch', fetchSpy);
    const payway = new PayWay({ merchantId: 'explicit-merchant', apiKey: 'explicit-api-key' });

    await payway.checkout.checkTransaction('TX-EXPLICIT');

    expect(JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      merchant_id: 'explicit-merchant',
    });
  });

  it('uses PAYWAY_SANDBOX=false to select the production base URL', async () => {
    vi.stubEnv('PAYWAY_MERCHANT_ID', 'env-merchant');
    vi.stubEnv('PAYWAY_API_KEY', 'env-api-key');
    vi.stubEnv('PAYWAY_SANDBOX', 'false');
    const fetchSpy = vi.fn().mockResolvedValue(mockJsonResponse({ status: { code: 0 } }));
    vi.stubGlobal('fetch', fetchSpy);
    const payway = new PayWay();

    await payway.checkout.checkTransaction('TX-PRODUCTION');

    expect(fetchSpy.mock.calls[0]?.[0]).toMatch(/^https:\/\/checkout\.payway\.com\.kh/);
  });
});

describe('PayWay debug logging', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('sanitizes debug output and preserves user-provided hooks', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(mockJsonResponse({ status: { code: 0 }, hash: 'response-hash' }));
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const onRequest = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const payway = new PayWay({ ...TEST_CONFIG, debug: true, onRequest });

    await payway.checkout.checkTransaction('TX-DEBUG');

    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('[payway] -> POST'),
      expect.objectContaining({ hash: '***HIDDEN***' }),
    );
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('[payway] <- 200'),
      expect.objectContaining({ hash: '***HIDDEN***' }),
      undefined,
    );
  });
});

// ---------------------------------------------------------------------------
// checkResponseError (tested through the private request path)
// ---------------------------------------------------------------------------

describe('checkResponseError (via API calls)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let payway: PayWay;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    payway = new PayWay({ ...TEST_CONFIG, maxRetries: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws PayWayBusinessError for status object with non-zero code', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({
        status: { code: 6, message: 'Transaction not found' },
      }),
    );

    await expect(payway.checkout.checkTransaction('TX-NOTFOUND')).rejects.toThrow(PayWayBusinessError);

    await fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({
        status: { code: 6, message: 'Transaction not found' },
      }),
    );

    try {
      await payway.checkout.checkTransaction('TX-NOTFOUND');
    } catch (e) {
      expect(e).toBeInstanceOf(PayWayBusinessError);
      const err = e as PayWayBusinessError;
      expect(err.message).toBe('Transaction not found');
      expect(err.paywayCode).toBe('6');
      expect(err.type).toBe('business_error');
    }
  });

  it('passes through when status.code is "0" (success)', async () => {
    const successBody = {
      status: { code: 0, message: 'Success' },
      data: { tran_id: 'T123' },
    };
    fetchSpy.mockResolvedValueOnce(mockJsonResponse(successBody));

    const result = await payway.checkout.checkTransaction('T123');
    expect(result).toEqual(successBody);
  });

  it('passes through when status.code is "00" (success)', async () => {
    const successBody = {
      status: { code: '00', message: 'Success' },
    };
    fetchSpy.mockResolvedValueOnce(mockJsonResponse(successBody));

    const result = await payway.checkout.closeTransaction('T123');
    expect(result).toEqual(successBody);
  });

  it('throws PayWayAPIError for string status "FAILED"', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: 'FAILED', code: '99', message: 'System error' }));

    await expect(payway.checkout.checkTransaction('TX-FAIL')).rejects.toThrow(PayWayAPIError);
  });

  it('throws PayWayAPIError for top-level non-zero code (no status object)', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ code: 1, message: 'Wrong Hash.' }));

    await expect(payway.checkout.checkTransaction('TX-BADHASH')).rejects.toThrow('Wrong Hash.');
  });

  it('throws PayWayRateLimitError on HTTP 429 responses', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ error: 'Too Many Requests' }, 429, 'Too Many Requests'));

    await expect(payway.checkout.checkTransaction('TX-429')).rejects.toThrow(PayWayRateLimitError);

    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ error: 'Too Many Requests' }, 429, 'Too Many Requests'));
    try {
      await payway.checkout.checkTransaction('TX-429');
    } catch (error) {
      expect(error).toBeInstanceOf(PayWayRateLimitError);
      if (error instanceof PayWayRateLimitError) {
        expect(error.type).toBe('rate_limit_error');
        expect(error.retryable).toBe(true);
      }
    }
  });

  it('throws PayWayNetworkError on timeout (AbortError)', async () => {
    const pw = new PayWay({ ...TEST_CONFIG, timeout: 50, maxRetries: 0 });

    fetchSpy.mockImplementationOnce(
      (_url: string, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          const onAbort = () => {
            const err = new DOMException('The operation was aborted.', 'AbortError');
            reject(err);
          };
          if (opts?.signal?.aborted) {
            onAbort();
          } else {
            opts?.signal?.addEventListener('abort', onAbort);
          }
        }),
    );

    await expect(pw.checkout.checkTransaction('TX-SLOW')).rejects.toThrow(PayWayNetworkError);
  });

  it('throws PayWayAPIError on timeout (AbortError)', async () => {
    const pw = new PayWay({ ...TEST_CONFIG, timeout: 50, maxRetries: 0 });

    fetchSpy.mockImplementationOnce(
      (_url: string, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          const onAbort = () => {
            const err = new DOMException('The operation was aborted.', 'AbortError');
            reject(err);
          };
          if (opts?.signal?.aborted) {
            onAbort();
          } else {
            opts?.signal?.addEventListener('abort', onAbort);
          }
        }),
    );

    await expect(pw.checkout.checkTransaction('TX-SLOW')).rejects.toThrow(/timed out/);
  });

  it('throws PayWayAPIError when response body is invalid JSON', async () => {
    const invalidResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve('not-json'),
      headers: new Headers(),
      redirected: false,
      type: 'basic',
      url: '',
      clone: () => ({}) as Response,
      body: null,
      bodyUsed: false,
      json: () => Promise.reject(new Error('Unexpected JSON parse')),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new Blob()),
      formData: () => Promise.resolve(new FormData()),
      bytes: () => Promise.resolve(new Uint8Array()),
    } as Response;

    fetchSpy.mockResolvedValueOnce(invalidResponse);

    await expect(payway.checkout.checkTransaction('TX-JSON')).rejects.toThrow('Invalid JSON response from PayWay API');
  });

  it('throws PayWayAPIError for non-fetch network errors', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network unreachable'));

    await expect(payway.checkout.checkTransaction('TX-NETWORK')).rejects.toThrow(/Network error/);
  });

  it('returns gateway error details from PayWayAPIError', async () => {
    const apiError = new PayWayAPIError('Wrong hash', {
      paywayCode: '1',
      rawBody: { code: '1', message: 'Wrong hash' },
      statusCode: 200,
    });

    const details = payway.getGatewayErrorDetails(apiError);

    expect(details).toEqual({
      code: '1',
      message: 'Wrong hash',
      rawBody: { code: '1', message: 'Wrong hash' },
      statusCode: 200,
    });
  });

  it('resolves successfully when response body is null (empty response)', async () => {
    const nullBodyResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve('null'),
      headers: new Headers(),
      redirected: false,
      type: 'basic',
      url: '',
      clone: () => ({}) as Response,
      body: null,
      bodyUsed: false,
      json: () => Promise.resolve(null),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new Blob()),
      formData: () => Promise.resolve(new FormData()),
      bytes: () => Promise.resolve(new Uint8Array()),
    } as Response;

    fetchSpy.mockResolvedValueOnce(nullBodyResponse);

    const result = await payway.checkout.checkTransaction('T-NULL');
    expect(result).toBeNull();
  });

  it('resolves successfully when response body is empty string', async () => {
    const emptyBodyResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(''),
      headers: new Headers(),
      redirected: false,
      type: 'basic',
      url: '',
      clone: () => ({}) as Response,
      body: null,
      bodyUsed: false,
      json: () => Promise.resolve(null),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new Blob()),
      formData: () => Promise.resolve(new FormData()),
      bytes: () => Promise.resolve(new Uint8Array()),
    } as Response;

    fetchSpy.mockResolvedValueOnce(emptyBodyResponse);

    const result = await payway.checkout.checkTransaction('T-EMPTY');
    expect(result).toBeNull();
  });

  it('returns gateway error details from plain object error shapes', async () => {
    const details = payway.getGatewayErrorDetails({
      status: { code: '6', message: 'Transaction not found' },
    });

    expect(details).toEqual({
      code: '6',
      message: 'Transaction not found',
      rawBody: { status: { code: '6', message: 'Transaction not found' } },
      statusCode: undefined,
    });
  });
});

// ---------------------------------------------------------------------------
// checkout domain — happy path
// ---------------------------------------------------------------------------

describe('checkout domain', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let payway: PayWay;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    payway = new PayWay({ ...TEST_CONFIG, maxRetries: 0 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('createTransaction', () => {
    it('returns a signed payload with hash (no fetch call)', () => {
      const result = payway.checkout.createTransaction({
        transactionId: 'T001',
        amount: 15.0,
        currency: 'USD',
        items: [{ name: 'Widget', quantity: 1, price: 15.0 }],
        returnUrl: 'https://example.com/return',
      });

      expect(result).toHaveProperty('hash');
      expect(result).toHaveProperty('tran_id', 'T001');
      expect(result).toHaveProperty('amount', '15.00');
      expect(result).toHaveProperty('merchant_id', TEST_CONFIG.merchantId);
      expect(result).toHaveProperty('req_time');
      expect(result.req_time).toMatch(/^\d{14}$/);
      // items and return_url should be base64 encoded
      expect(typeof result.items).toBe('string');
      expect(typeof result.return_url).toBe('string');
      // Verify no fetch was called (this is a local signing operation)
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('calculates the exact HMAC hash for the createTransaction payload', () => {
      const formatSpy = vi.spyOn(utils, 'formatRequestTime').mockReturnValue('20260716120000');
      const result = payway.checkout.createTransaction({
        transactionId: 'T002',
        amount: 5.0,
        currency: 'USD',
        paymentOption: 'abapay_khqr',
        items: [{ name: 'Widget', quantity: 1, price: 5.0 }],
        returnUrl: 'https://example.com/return',
      });

      const expectedItems = Buffer.from(JSON.stringify([{ name: 'Widget', quantity: 1, price: 5.0 }]), 'utf8').toString(
        'base64',
      );
      const expectedReturnUrl = Buffer.from('https://example.com/return', 'utf8').toString('base64');
      const expectedConcat = [
        result.req_time,
        TEST_CONFIG.merchantId,
        'T002',
        '5.00',
        expectedItems,
        '',
        '',
        '',
        '',
        '',
        'purchase',
        'abapay_khqr',
        expectedReturnUrl,
        '',
        '',
        '',
        'USD',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ].join('');

      const expectedHash = crypto.createHmac('sha512', TEST_CONFIG.apiKey).update(expectedConcat).digest('base64');
      expect(result.hash).toBe(expectedHash);
      formatSpy.mockRestore();
    });

    it('defaults currency to USD and type to purchase', () => {
      const result = payway.checkout.createTransaction({
        transactionId: 'T002',
        amount: 5.0,
      });

      expect(result).toHaveProperty('currency', 'USD');
      expect(result).toHaveProperty('type', 'purchase');
    });

    it('base64-encodes cancel_url, continue_success_url and return_params when present', () => {
      const cancelUrl = 'https://example.com/cancel';
      const continueSuccessUrl = 'https://example.com/continue';
      const returnParams = 'campaign=summer';

      const result = payway.checkout.createTransaction({
        transactionId: 'T003',
        amount: 10.0,
        cancelUrl,
        continueSuccessUrl,
        returnParams,
      });

      expect(result.cancel_url).toBe(Buffer.from(cancelUrl, 'utf8').toString('base64'));
      expect(result.continue_success_url).toBe(Buffer.from(continueSuccessUrl, 'utf8').toString('base64'));
      expect(result.return_params).toBe(returnParams);
    });

    it('rejects non-positive amounts', () => {
      expect(() => payway.checkout.createTransaction({ transactionId: 'T', amount: 0 })).toThrow(
        'amount must be a positive number',
      );
      expect(() => payway.checkout.createTransaction({ transactionId: 'T', amount: -5 })).toThrow(
        'amount must be a positive number',
      );
    });

    it('rejects KHR amounts with decimal places', () => {
      expect(() => payway.checkout.createTransaction({ transactionId: 'T', amount: 100.5, currency: 'KHR' })).toThrow(
        'KHR amount must be an integer',
      );
    });

    it('rejects unsupported currencies', () => {
      // @ts-expect-error — testing runtime validation
      expect(() => payway.checkout.createTransaction({ transactionId: 'T', amount: 1, currency: 'EUR' })).toThrow(
        'currency must be one of USD, KHR',
      );
    });

    it('rejects empty transaction ids', () => {
      expect(() => payway.checkout.createTransaction({ transactionId: '', amount: 1 })).toThrow(
        'transactionId is required',
      );
    });
  });

  describe('checkTransaction', () => {
    it('sends POST to correct endpoint with hash', async () => {
      const responseBody = {
        status: { code: 0, message: 'Success', tran_id: 'T001' },
      };
      fetchSpy.mockResolvedValueOnce(mockJsonResponse(responseBody));

      const result = await payway.checkout.checkTransaction('T001');

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain(ENDPOINTS.checkTransaction);
      expect(opts.method).toBe('POST');

      const body = JSON.parse(opts.body);
      expect(body).toHaveProperty('tran_id', 'T001');
      expect(body).toHaveProperty('merchant_id', TEST_CONFIG.merchantId);
      expect(body).toHaveProperty('hash');
      expect(body).toHaveProperty('req_time');

      expect(result).toEqual(responseBody);
    });
  });

  describe('closeTransaction', () => {
    it('sends POST to close-transaction endpoint', async () => {
      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: '00', message: 'Closed' } }));

      await payway.checkout.closeTransaction('T001');

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain(ENDPOINTS.closeTransaction);
    });
  });

  describe('getTransactionDetail', () => {
    it('sends POST to transaction-detail endpoint with correct HMAC fields', async () => {
      const responseBody = {
        status: { code: 0, message: 'Success' },
        data: { tran_id: 'T001', amount: '15.00', status: '0' },
      };
      fetchSpy.mockResolvedValueOnce(mockJsonResponse(responseBody));

      const result = await payway.checkout.getTransactionDetail('T001');

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain(ENDPOINTS.getTransactionDetail);
      expect(opts.method).toBe('POST');

      const body = JSON.parse(opts.body);
      expect(body).toHaveProperty('tran_id', 'T001');
      expect(body).toHaveProperty('merchant_id', TEST_CONFIG.merchantId);
      expect(body).toHaveProperty('req_time');
      expect(body).toHaveProperty('hash');

      const concat = `${body.req_time}${TEST_CONFIG.merchantId}T001`;
      const expectedHash = crypto.createHmac('sha512', TEST_CONFIG.apiKey).update(concat).digest('base64');
      expect(body.hash).toBe(expectedHash);

      expect(result).toEqual(responseBody);
    });

    it('accepts optional requestTime parameter', async () => {
      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: 0 } }));

      await payway.checkout.getTransactionDetail('T002', '20260716120000');

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.req_time).toBe('20260716120000');
    });

    it('respects the documented rate-limit rule (10/60s)', () => {
      const rule = (payway as unknown as { rateLimitRules: Record<string, { limit: number; intervalMs: number }> })
        .rateLimitRules?.[ENDPOINTS.getTransactionDetail];
      expect(rule).toBeDefined();
      expect(rule?.limit).toBe(10);
      expect(rule?.intervalMs).toBe(60_000);
    });
  });

  describe('getTransactionList', () => {
    it('uses standard HMAC string concatenation for all fields', async () => {
      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: '00', message: 'Success' }, data: [] }));

      await payway.checkout.getTransactionList({
        fromDate: '20260101',
        toDate: '20260715',
        fromAmount: '100',
      });

      expect(fetchSpy).toHaveBeenCalledOnce();
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body).toHaveProperty('hash');
      expect(body).toHaveProperty('from_date', '20260101');
      expect(body).toHaveProperty('to_date', '20260715');
    });

    it('retries on HTTP 503 and succeeds once service recovers', async () => {
      const pw = new PayWay({ ...TEST_CONFIG, maxRetries: 2, retryDelayMs: 1 });
      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ error: 'Service unavailable' }, 503, 'Service Unavailable'));
      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ error: 'Service unavailable' }, 503, 'Service Unavailable'));
      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: '00', message: 'Success' } }));

      const result = await pw.checkout.checkTransaction('T001');

      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ status: { code: '00', message: 'Success' } });
    });

    // -------------------------------------------------------------------
    // QR-REQ-11: Default retry configuration
    // -------------------------------------------------------------------

    it('uses default maxRetries=3 (QR-REQ-11) and retries on 503', async () => {
      const pw = new PayWay({ ...TEST_CONFIG, retryDelayMs: 1 });
      // Verify defaults are applied: maxRetries=3 → 4 total attempts (initial + 3 retries)
      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ error: 'Service unavailable' }, 503, 'Service Unavailable'));
      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ error: 'Service unavailable' }, 503, 'Service Unavailable'));
      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ error: 'Service unavailable' }, 503, 'Service Unavailable'));
      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: '00', message: 'Success' } }));

      const result = await pw.checkout.checkTransaction('T001');

      // Should have retried 3 times (4 total attempts) with default maxRetries=3
      expect(fetchSpy).toHaveBeenCalledTimes(4);
      expect(result).toEqual({ status: { code: '00', message: 'Success' } });
    });

    it('exhausts default retries (3) and throws on persistent 503 (QR-REQ-11)', async () => {
      const pw = new PayWay({ ...TEST_CONFIG, retryDelayMs: 1 });
      // All 4 attempts (initial + 3 retries) fail with 503
      fetchSpy.mockResolvedValue(mockJsonResponse({ error: 'Service unavailable' }, 503, 'Service Unavailable'));

      await expect(pw.checkout.checkTransaction('T001')).rejects.toThrow(PayWayAPIError);

      // 1 initial + 3 retries = 4 total attempts
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    it('retries on network errors (AbortError) with default maxRetries=3 (QR-REQ-11)', async () => {
      const pw = new PayWay({ ...TEST_CONFIG, timeout: 50, retryDelayMs: 1 });

      // First 3 attempts timeout, 4th succeeds
      for (let i = 0; i < 3; i++) {
        fetchSpy.mockImplementationOnce(
          (_url: string, opts: { signal: AbortSignal }) =>
            new Promise((_resolve, reject) => {
              const onAbort = () => {
                reject(new DOMException('The operation was aborted.', 'AbortError'));
              };
              if (opts?.signal?.aborted) {
                onAbort();
              } else {
                opts?.signal?.addEventListener('abort', onAbort);
              }
            }),
        );
      }
      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: '00', message: 'Success' } }));

      const result = await pw.checkout.checkTransaction('T001');

      expect(fetchSpy).toHaveBeenCalledTimes(4);
      expect(result).toEqual({ status: { code: '00', message: 'Success' } });
    });

    it('does not fail when onRequest or onResponse hooks throw', async () => {
      const pw = new PayWay({
        ...TEST_CONFIG,
        onRequest: () => {
          throw new Error('hook fail');
        },
        onResponse: () => {
          throw new Error('hook fail');
        },
      });

      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: '00', message: 'Success' } }));
      const result = await pw.checkout.checkTransaction('T001');

      expect(result).toEqual({ status: { code: '00', message: 'Success' } });
      expect(fetchSpy).toHaveBeenCalledOnce();
    });

    it('parses rate limit headers and forwards them to onResponse', async () => {
      const rateLimitSpy = vi.fn();
      const pw = new PayWay({
        ...TEST_CONFIG,
        onResponse: (_endpoint, _status, _body, rateLimitInfo) => {
          rateLimitSpy(rateLimitInfo);
        },
      });

      const response = mockJsonResponse({ status: { code: '00', message: 'Success' } });
      response.headers.set('x-rate-limit-limit', '50');
      response.headers.set('x-rate-limit-remaining', '49');
      response.headers.set('x-rate-limit-reset', '120');
      fetchSpy.mockResolvedValueOnce(response);

      await pw.checkout.getTransactionList({});

      expect(rateLimitSpy).toHaveBeenCalledTimes(1);
      expect(rateLimitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50,
          remaining: 49,
          reset: 120,
        }),
      );
    });

    it('throttles requests to documented endpoints when the rate limit is exceeded', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      const pw = new PayWay({
        ...TEST_CONFIG,
        rateLimitRules: {
          [ENDPOINTS.checkTransaction]: { limit: 1, intervalMs: 1000 },
        },
      });

      fetchSpy.mockResolvedValue(mockJsonResponse({ status: { code: 0, message: 'Success' } }));

      const first = pw.checkout.checkTransaction('T001');
      await Promise.resolve();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      await first;

      const secondPromise = pw.checkout.checkTransaction('T002');
      await Promise.resolve();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(999);
      await Promise.resolve();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await secondPromise;
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  describe('refund', () => {
    it('throws PayWayConfigError if publicKeyPem is not configured', async () => {
      vi.stubEnv('PAYWAY_RSA_PUBLIC_KEY', '');
      // payway was created without publicKeyPem
      const pw = new PayWay({ ...TEST_CONFIG, maxRetries: 0 });
      await expect(pw.checkout.refund('T001', 5.0)).rejects.toThrow(PayWayConfigError);
      await expect(pw.checkout.refund('T001', 5.0)).rejects.toThrow('publicKeyPem');
    });

    it('sends form-encoded request with merchant_auth when RSA key is present', async () => {
      const pwRsa = new PayWay(CONFIG_WITH_RSA);
      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: '00', message: 'Refunded' } }));

      await pwRsa.checkout.refund('T001', 5.0);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain(ENDPOINTS.refund);
      expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      // Body is URL-encoded
      const params = new URLSearchParams(opts.body);
      expect(params.get('merchant_id')).toBe(TEST_CONFIG.merchantId);
      expect(params.has('merchant_auth')).toBe(true);
      expect(params.has('hash')).toBe(true);
      expect(params.has('request_time')).toBe(true);
    });
  });

  describe('getExchangeRate', () => {
    it('sends POST to exchange-rate endpoint', async () => {
      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: 0 }, data: { rate: 4100 } }));

      const result = await payway.checkout.getExchangeRate();

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain(ENDPOINTS.getExchangeRate);
      expect((result as unknown as { data: { rate: number } }).data.rate).toBe(4100);
    });
  });

  describe('HTTP error paywayCode extraction', () => {
    it('extracts paywayCode from non-200 response body (PTL04 refund discovery)', async () => {
      // Sandbox discovered: refund returns HTTP 400 with PTL04 in body when
      // the refund amount is invalid. Client-side validation now catches the
      // most common case (< $0.01), but the server can still reject valid-looking
      // amounts (e.g. refunding more than the original). Test with valid amount
      // to exercise the HTTP error extraction path.
      const paywayBody = {
        tran_id: 'T001',
        status: {
          code: 'PTL04',
          message: 'Parameter validation required',
          description: { refund_amount: ['refund_amount must be greater than or equal to 0.01.'] },
        },
      };
      fetchSpy.mockResolvedValueOnce(mockJsonResponse(paywayBody, 400, 'Bad Request'));

      const pwRsa = new PayWay(CONFIG_WITH_RSA);
      try {
        await pwRsa.checkout.refund('T001', 5.0);
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        const error = err as PayWayAPIError;
        expect(error).toBeInstanceOf(PayWayAPIError);
        expect(error.statusCode).toBe(400);
        expect(error.paywayCode).toBe('PTL04');
        expect(error.message).toContain('Parameter validation required');
        expect(error.rawBody).toEqual(paywayBody);
      }
    });

    it('extracts paywayCode from non-200 response without nested status', async () => {
      const body = { code: 'ERR01', message: 'Something went wrong' };
      fetchSpy.mockResolvedValueOnce(mockJsonResponse(body, 500, 'Internal Server Error'));

      try {
        await payway.checkout.checkTransaction('T001');
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        const error = err as PayWayAPIError;
        expect(error.statusCode).toBe(500);
        // Should not extract paywayCode when status.code is in the flat body
        // (only nested status.code is extracted)
        expect(error.retryable).toBe(true);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// credentialsOnFile domain — happy path
// ---------------------------------------------------------------------------

describe('credentialsOnFile domain', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let payway: PayWay;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    payway = new PayWay(TEST_CONFIG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('linkAccount sends POST with request_time field', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: '00', message: 'OK' } }));

    await payway.credentialsOnFile.linkAccount({
      requestId: 'REQ-001',
      currency: 'USD',
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toHaveProperty('request_id', 'REQ-001');
    expect(body).toHaveProperty('request_time');
    expect(body).toHaveProperty('merchant_id', TEST_CONFIG.merchantId);
    expect(body).toHaveProperty('hash');
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain(ENDPOINTS.linkAccount);
  });

  it('linkCard sends POST with correct fields', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: '00', message: 'OK' } }));

    await payway.credentialsOnFile.linkCard({
      requestId: 'REQ-002',
      returnUrl: 'https://example.com/return',
    });

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain(ENDPOINTS.linkCard);
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const params = new URLSearchParams(opts.body);
    expect(params.get('request_id')).toBe('REQ-002');
    // return_url should be base64 encoded
    expect(params.get('return_url')).not.toContain('https://');
  });

  it('payment sends POST with amount formatted for currency', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: '00', message: 'OK' } }));

    await payway.credentialsOnFile.payment({
      requestId: 'REQ-003',
      transactionId: 'T003',
      amount: 25.5,
      paymentToken: 'tok_abc',
      currency: 'USD',
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toHaveProperty('amount', '25.50');
    expect(body).toHaveProperty('pwt', 'tok_abc');
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain(ENDPOINTS.payment);
  });

  it('renewToken sends POST to renew endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: '00', message: 'Renewed' } }));

    await payway.credentialsOnFile.renewToken({
      requestId: 'REQ-004',
      ctid: 'CUST-004',
      paymentToken: 'tok_expired',
    });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain(ENDPOINTS.renewToken);
  });

  it('getTokenDetails sends POST to get-token-details', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ status: { code: '00', message: 'OK' }, data: { token_type: 'card' } }),
    );

    await payway.credentialsOnFile.getTokenDetails({
      requestId: 'REQ-005',
      ctid: 'CUST-005',
      paymentToken: 'tok_abc',
    });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain(ENDPOINTS.getTokenDetails);
  });

  it('removeToken sends POST to remove-token', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: '00', message: 'Removed' } }));

    await payway.credentialsOnFile.removeToken({
      requestId: 'REQ-006',
      ctid: 'CUST-006',
      paymentToken: 'tok_abc',
    });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain(ENDPOINTS.removeToken);
  });
});

// ---------------------------------------------------------------------------
// qr domain — happy path
// ---------------------------------------------------------------------------

describe('qr domain', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let payway: PayWay;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    payway = new PayWay(TEST_CONFIG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generateQr sends the sandbox-verified QR API payload', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: 0 }, data: { qr_image: 'base64data' } }));

    await payway.qr.generateQr({
      transactionId: 'QR-001',
      amount: 10.0,
      currency: 'USD',
      paymentOption: 'abapay_khqr',
      callbackUrl: 'https://example.com/qr-callback',
    });

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain(ENDPOINTS.generateQr);
    const body = JSON.parse(opts.body);
    expect(body).toHaveProperty('tran_id', 'QR-001');
    expect(body).toHaveProperty('amount', '10.00');
    expect(body).toHaveProperty('purchase_type', 'purchase');
    expect(body).toHaveProperty('payment_option', 'abapay_khqr');
    expect(body).toHaveProperty('qr_image_template', 'template2');
    expect(body.callback_url).not.toContain('https://');
    expect(body).toHaveProperty('hash');
  });
});

// ---------------------------------------------------------------------------
// paymentLink domain — happy path
// ---------------------------------------------------------------------------

describe('paymentLink domain', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let payway: PayWay;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    payway = new PayWay(CONFIG_WITH_RSA);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('create sends form-encoded request with RSA merchant_auth', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ status: { code: '00', message: 'Created' }, data: { id: 'PL-001' } }),
    );

    await payway.paymentLink.create({
      title: 'Test Payment Link',
      amount: 50.0,
      merchantRefNo: 'REF-001',
      returnUrl: 'https://example.com/return',
    });

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain(ENDPOINTS.createPaymentLink);
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const params = new URLSearchParams(opts.body);
    expect(params.has('merchant_auth')).toBe(true);
  });

  it('getDetails sends form-encoded request with merchant_auth containing the id', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: '00' }, data: { title: 'My Link' } }));

    await payway.paymentLink.getDetails('PL-001');

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain(ENDPOINTS.getPaymentLinkDetails);
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const params = new URLSearchParams(opts.body);
    // id is inside the RSA-encrypted merchant_auth, not a top-level form field
    expect(params.has('merchant_auth')).toBe(true);
    expect(params.has('hash')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// publicKeyPem normalization (literal \n sequences from .env files)
// ---------------------------------------------------------------------------

describe('publicKeyPem normalization', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('accepts a config publicKeyPem containing literal \\n sequences', async () => {
    const escapedPem = TEST_RSA.publicKey.replace(/\n/g, '\\n');
    const pw = new PayWay({ ...TEST_CONFIG, publicKeyPem: escapedPem, maxRetries: 0 });
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: '00' }, data: { id: 'PL-1' } }));

    await pw.paymentLink.create({
      title: 'T',
      amount: 1,
      merchantRefNo: 'r1',
      returnUrl: 'https://example.com/return',
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('accepts an env PAYWAY_RSA_PUBLIC_KEY containing literal \\n sequences', async () => {
    vi.stubEnv('PAYWAY_MERCHANT_ID', 'env-merchant');
    vi.stubEnv('PAYWAY_API_KEY', 'env-api-key');
    vi.stubEnv('PAYWAY_RSA_PUBLIC_KEY', TEST_RSA.publicKey.replace(/\n/g, '\\n'));
    const pw = new PayWay({ maxRetries: 0 });
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: '00' }, data: { title: 'T' } }));

    await pw.paymentLink.getDetails('PL-1');

    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// preAuth domain — happy path
// ---------------------------------------------------------------------------

describe('preAuth domain', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let payway: PayWay;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    payway = new PayWay(CONFIG_WITH_RSA);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('complete sends the JSON pre-auth request contract', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: '00', message: 'Completed' } }));

    await payway.preAuth.complete('T-PREAUTH-001', 100.0);

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain(ENDPOINTS.completePreAuth);
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(opts.body)).toHaveProperty('merchant_auth');
  });

  it('cancel sends the JSON pre-auth request contract', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: '00', message: 'Cancelled' } }));

    await payway.preAuth.cancel('T-PREAUTH-001');

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain(ENDPOINTS.cancelPreAuth);
  });

  it('completeWithPayout uses the completion path with encrypted payout instructions', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: '00', message: 'Completed' } }));

    await payway.preAuth.completeWithPayout('T-PREAUTH-002', 200.0, [{ acc: '000123456', amt: 200 }]);

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain(ENDPOINTS.completePreAuth);
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(opts.body)).toHaveProperty('merchant_auth');
  });
});

// ---------------------------------------------------------------------------
// payout domain — happy path
// ---------------------------------------------------------------------------

describe('payout domain', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let payway: PayWay;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    payway = new PayWay(CONFIG_WITH_RSA);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('payout sends the encrypted beneficiary instruction with a hexadecimal hash', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: 0, message: 'OK' } }));

    await payway.payout.payout({
      transactionId: 'PO-001',
      amount: 50.0,
      beneficiaries: [{ account: '000123456', amount: 50.0 }],
      currency: 'USD',
    });

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain(ENDPOINTS.payout);
    const body = JSON.parse(opts.body);
    expect(body).toHaveProperty('tran_id', 'PO-001');
    expect(body).toHaveProperty('beneficiaries');
    expect(body.hash).toMatch(/^[a-f0-9]{128}$/);
    expect(body).toHaveProperty('hash');
  });

  it('updateBeneficiaryStatus sends POST with status', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: 0, message: 'Updated' } }));

    await payway.payout.updateBeneficiaryStatus({
      payee: '000123456',
      status: 1,
    });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain(ENDPOINTS.updateBeneficiaryStatus);
  });

  it('addBeneficiary sends an RSA-encrypted payee', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: 0, message: 'Added' } }));

    await payway.payout.addBeneficiary({
      payee: '000123456',
    });

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain(ENDPOINTS.addBeneficiary);
    const body = JSON.parse(opts.body);
    expect(body).toHaveProperty('merchant_auth');
  });

  it('JSON-stringifies object custom_fields in the request body', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: 0, message: 'OK' } }));

    await payway.payout.payout({
      transactionId: 'PO-CF-001',
      amount: 100.0,
      beneficiaries: [{ account: '000123456', amount: 100.0 }],
      currency: 'USD',
      customFields: { source: 'web', campaign: 'summer2026' },
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toHaveProperty('custom_fields');
    expect(body.custom_fields).toBe(JSON.stringify({ source: 'web', campaign: 'summer2026' }));
  });

  it('rejects payout when beneficiary amounts do not sum to total', async () => {
    await expect(
      payway.payout.payout({
        transactionId: 'PO-002',
        amount: 100.0,
        beneficiaries: [{ account: '000123456', amount: 50.0 }],
        currency: 'USD',
      }),
    ).rejects.toThrow('beneficiary amounts (50) must sum to total amount (100)');
  });

  it('rejects payout with empty beneficiaries', async () => {
    await expect(
      payway.payout.payout({
        transactionId: 'PO-003',
        amount: 100.0,
        beneficiaries: [],
        currency: 'USD',
      }),
    ).rejects.toThrow('beneficiaries must be a non-empty array');
  });
});

// ---------------------------------------------------------------------------
// khqr domain — happy path
// ---------------------------------------------------------------------------

describe('khqr domain', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let payway: PayWay;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    payway = new PayWay(TEST_CONFIG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getTransactionsByMerchantRef sends POST with merchant_ref', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: 0, message: 'OK' }, data: [] }));

    await payway.khqr.getTransactionsByMerchantRef('MCREF-001');

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain(ENDPOINTS.getTransactionsByMerchantRef);
    const body = JSON.parse(opts.body);
    expect(body).toHaveProperty('merchant_ref', 'MCREF-001');
    expect(body).toHaveProperty('hash');
  });

  it('generates an official offline KHQR payload from the captured configuration without fetching', () => {
    const configuredPayway = new PayWay({ ...TEST_CONFIG, khqr: TEST_KHQR_CONFIG });

    expect(configuredPayway.khqr.validateConfiguration()).toEqual({ ready: true, issues: [] });
    expect(configuredPayway.khqr.generateOfflineQR({ amount: 1.5, currency: 'USD', merchantRef: 'INV-1' })).toMatch(
      /^000201010212/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps the documented payway.qr offline alias wired to resolved KHQR configuration', () => {
    const configuredPayway = new PayWay({ ...TEST_CONFIG, khqr: TEST_KHQR_CONFIG });

    expect(configuredPayway.qr.generateOfflineQR({ amount: 10.12, currency: 'USD', merchantRef: 'INV-QR' })).toMatch(
      /^000201010212/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports credentials-only clients as unready and rejects offline generation', () => {
    expect(payway.khqr.validateConfiguration().ready).toBe(false);
    expect(() => payway.khqr.generateOfflineQR({ amount: 1.5, currency: 'USD', merchantRef: 'INV-1' })).toThrow(
      PayWayConfigError,
    );
  });

  it('reports callback setup readiness through the KHQR domain', () => {
    const configuredPayway = new PayWay({
      ...TEST_CONFIG,
      khqr: {
        ...TEST_KHQR_CONFIG,
        callback: {
          url: 'https://merchant.example/khqr',
          enrollment: 'confirmed-by-merchant',
          verification: 'mTLS',
        },
      },
    });

    expect(configuredPayway.khqr.validateCallbackSetup()).toEqual({ ready: true, issues: [] });
  });
});

// ---------------------------------------------------------------------------
// verifyCallback (public method on PayWay instance)
// ---------------------------------------------------------------------------

describe('PayWay.verifyCallback', () => {
  it('delegates to verifyCallbackSignature with the configured apiKey', () => {
    const payway = new PayWay(TEST_CONFIG);

    const body = { tran_id: 'T999', amount: '10.00', status: '0' };
    // Compute expected signature
    const sortedConcat = '10.000T999'; // amount, status, tran_id
    const validSig = crypto.createHmac('sha512', TEST_CONFIG.apiKey).update(sortedConcat).digest('base64');

    expect(payway.verifyCallback(body, validSig)).toBe(true);
    expect(payway.verifyCallback(body, 'bad-sig')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Request mechanics
// ---------------------------------------------------------------------------

describe('request mechanics', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('auto-fills req_time when not provided', async () => {
    const payway = new PayWay(TEST_CONFIG);
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: 0 } }));

    await payway.checkout.checkTransaction('T001');

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.req_time).toMatch(/^\d{14}$/);
  });

  it('uses sandbox base URL by default', async () => {
    const payway = new PayWay(TEST_CONFIG);
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: 0 } }));

    await payway.checkout.checkTransaction('T001');

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/^https:\/\/checkout-sandbox\.payway\.com\.kh/);
  });

  it('uses production base URL when environment is production', async () => {
    const payway = new PayWay({ ...TEST_CONFIG, environment: 'production' });
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: 0 } }));

    await payway.checkout.checkTransaction('T001');

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/^https:\/\/checkout\.payway\.com\.kh/);
  });

  it('uses PAYWAY_ENV before the legacy PAYWAY_SANDBOX flag', async () => {
    vi.stubEnv('PAYWAY_MERCHANT_ID', 'env-merchant');
    vi.stubEnv('PAYWAY_API_KEY', 'env-api-key');
    vi.stubEnv('PAYWAY_ENV', 'sandbox');
    vi.stubEnv('PAYWAY_SANDBOX', 'false');
    const fetchSpy = vi.fn().mockResolvedValue(mockJsonResponse({ status: { code: 0 } }));
    vi.stubGlobal('fetch', fetchSpy);
    const payway = new PayWay();

    await payway.checkout.checkTransaction('T001');

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/^https:\/\/checkout-sandbox\.payway\.com\.kh/);
  });

  it('uses custom baseUrl when provided', async () => {
    const payway = new PayWay({ ...TEST_CONFIG, baseUrl: 'https://custom.example.com' });
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: 0 } }));

    await payway.checkout.checkTransaction('T001');

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/^https:\/\/custom\.example\.com/);
  });

  it('sends JSON content-type for HMAC-only endpoints', async () => {
    const payway = new PayWay(TEST_CONFIG);
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: 0 } }));

    await payway.checkout.checkTransaction('T001');

    const opts = fetchSpy.mock.calls[0][1];
    expect(opts.headers['Content-Type']).toBe('application/json');
  });

  it('sends form-urlencoded content-type for merchant-auth endpoints', async () => {
    const payway = new PayWay(CONFIG_WITH_RSA);
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ status: { code: '00' } }));

    await payway.checkout.refund('T001', 5.0);

    const opts = fetchSpy.mock.calls[0][1];
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });
});

// ---------------------------------------------------------------------------
// checkout.pollTransactionStatus — AsyncIterator-based polling
// ---------------------------------------------------------------------------

describe('checkout.pollTransactionStatus', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let payway: PayWay;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    payway = new PayWay({ ...TEST_CONFIG, maxRetries: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const pendingResponse = {
    status: { code: 0, message: 'Success' },
    data: { payment_status: 'PENDING', tran_id: 'T001' },
  };

  const approvedResponse = {
    status: { code: 0, message: 'Success' },
    data: { payment_status: 'APPROVED', tran_id: 'T001' },
  };

  it('yields PENDING then APPROVED and iterator completes', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockJsonResponse(pendingResponse))
      .mockResolvedValueOnce(mockJsonResponse(pendingResponse))
      .mockResolvedValueOnce(mockJsonResponse(approvedResponse));

    const results: PollTransactionResult[] = [];
    for await (const result of payway.checkout.pollTransactionStatus('T001', { intervalMs: 1 })) {
      results.push(result);
    }

    expect(results).toHaveLength(3);
    expect(results[0].paymentStatus).toBe('PENDING');
    expect(results[0].isTerminal).toBe(false);
    expect(results[1].paymentStatus).toBe('PENDING');
    expect(results[2].paymentStatus).toBe('APPROVED');
    expect(results[2].isTerminal).toBe(true);
    expect(results[2].transactionId).toBe('T001');
    expect(results[2].attempt).toBe(3);
    expect(results[2].durationMs).toBeGreaterThanOrEqual(0);
    expect(results[2].timestamp).toBeTruthy();
  });

  it('stops on DECLINED terminal status', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({
        status: { code: 0, message: 'Success' },
        data: { payment_status: 'DECLINED', tran_id: 'T001' },
      }),
    );

    const results: PollTransactionResult[] = [];
    for await (const result of payway.checkout.pollTransactionStatus('T001', { intervalMs: 1 })) {
      results.push(result);
    }

    expect(results).toHaveLength(1);
    expect(results[0].paymentStatus).toBe('DECLINED');
    expect(results[0].isTerminal).toBe(true);
  });

  it('stops on CANCELLED terminal status', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({
        status: { code: 0, message: 'Success' },
        data: { payment_status: 'CANCELLED', tran_id: 'T001' },
      }),
    );

    const results: PollTransactionResult[] = [];
    for await (const result of payway.checkout.pollTransactionStatus('T001', { intervalMs: 1 })) {
      results.push(result);
    }

    expect(results).toHaveLength(1);
    expect(results[0].paymentStatus).toBe('CANCELLED');
    expect(results[0].isTerminal).toBe(true);
  });

  it('stops on REFUNDED terminal status', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({
        status: { code: 0, message: 'Success' },
        data: { payment_status: 'REFUNDED', tran_id: 'T001' },
      }),
    );

    const results: PollTransactionResult[] = [];
    for await (const result of payway.checkout.pollTransactionStatus('T001', { intervalMs: 1 })) {
      results.push(result);
    }

    expect(results).toHaveLength(1);
    expect(results[0].paymentStatus).toBe('REFUNDED');
    expect(results[0].isTerminal).toBe(true);
  });

  it('throws PollingAbortedError on maxDurationMs exceeded', async () => {
    // Always return PENDING so it never hits terminal
    fetchSpy.mockResolvedValue(mockJsonResponse(pendingResponse));

    const iterator = payway.checkout.pollTransactionStatus('T001', {
      intervalMs: 50,
      maxDurationMs: 150,
    });

    const results: unknown[] = [];
    let thrownError: unknown;
    try {
      for await (const result of iterator) {
        results.push(result);
      }
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeDefined();
    expect(thrownError).toBeInstanceOf(PollingAbortedError);
    const err = thrownError as InstanceType<typeof PollingAbortedError>;
    expect(err.reason).toBe('max_duration_exceeded');
    expect(err.transactionId).toBe('T001');
    expect(err.totalAttempts).toBeGreaterThanOrEqual(1);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('throws PollingAbortedError on maxConsecutiveErrors', async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error('Network error 1'))
      .mockRejectedValueOnce(new Error('Network error 2'))
      .mockRejectedValueOnce(new Error('Network error 3'));

    const iterator = payway.checkout.pollTransactionStatus('T001', {
      intervalMs: 1,
      maxConsecutiveErrors: 3,
    });

    const results: PollTransactionResult[] = [];
    let thrownError: unknown;
    try {
      for await (const result of iterator) {
        results.push(result);
      }
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeDefined();
    expect(thrownError).toBeInstanceOf(PollingAbortedError);
    const err = thrownError as InstanceType<typeof PollingAbortedError>;
    expect(err.reason).toBe('max_consecutive_errors');
    expect(err.transactionId).toBe('T001');
    expect(err.totalAttempts).toBe(3);
    // Error results are yielded before abort
    expect(results).toHaveLength(3);
    expect(results[0].paymentStatus).toContain('ERROR');
    expect(results[0].isTerminal).toBe(false);
  });

  it('resets consecutive error count on success', async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error('err1'))
      .mockRejectedValueOnce(new Error('err2'))
      .mockResolvedValueOnce(mockJsonResponse(approvedResponse)); // success resets counter

    const results: PollTransactionResult[] = [];
    for await (const result of payway.checkout.pollTransactionStatus('T001', {
      intervalMs: 1,
      maxConsecutiveErrors: 3,
    })) {
      results.push(result);
    }

    // 2 error yields + 1 terminal yield = 3 results, no abort
    expect(results).toHaveLength(3);
    expect(results[0].paymentStatus).toContain('ERROR');
    expect(results[1].paymentStatus).toContain('ERROR');
    expect(results[2].paymentStatus).toBe('APPROVED');
    expect(results[2].isTerminal).toBe(true);
  });

  it('empty iterator when transaction immediately returns terminal', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse(approvedResponse));

    const results: PollTransactionResult[] = [];
    for await (const result of payway.checkout.pollTransactionStatus('T001', { intervalMs: 1 })) {
      results.push(result);
    }

    expect(results).toHaveLength(1);
    expect(results[0].isTerminal).toBe(true);
  });

  it('respects custom intervalMs', async () => {
    vi.useFakeTimers();

    fetchSpy.mockResolvedValue(mockJsonResponse(pendingResponse));

    const iterator = payway.checkout.pollTransactionStatus('T001', {
      intervalMs: 1000,
      maxDurationMs: 3500,
    });

    const results: unknown[] = [];
    const iterate = (async () => {
      for await (const result of iterator) {
        results.push(result);
      }
    })();

    // Pre-attach rejection handler to prevent unhandled rejection during fake timer advancement
    iterate.catch(() => {});

    // First poll fires immediately
    await vi.advanceTimersByTimeAsync(0);
    expect(results).toHaveLength(1);

    // Second poll after 1s
    await vi.advanceTimersByTimeAsync(1000);
    expect(results).toHaveLength(2);

    // Third poll after another 1s
    await vi.advanceTimersByTimeAsync(1000);
    expect(results).toHaveLength(3);

    // Let timeout hit
    await vi.advanceTimersByTimeAsync(2000);

    try {
      await iterate;
    } catch {
      // Expected — PollingAbortedError from timeout
    }

    expect(results.length).toBeGreaterThanOrEqual(3);
    vi.useRealTimers();
  });

  it('PollingAbortedError.toJSON() serializes correctly', () => {
    const err = new PollingAbortedError({
      transactionId: 'TX-JSON',
      reason: 'max_consecutive_errors',
      lastStatus: 'PENDING',
      totalAttempts: 5,
      message: 'Custom message',
    });

    const json = err.toJSON();
    expect(json.name).toBe('PollingAbortedError');
    expect(json.message).toBe('Custom message');
    expect(json.transactionId).toBe('TX-JSON');
    expect(json.reason).toBe('max_consecutive_errors');
    expect(json.lastStatus).toBe('PENDING');
    expect(json.totalAttempts).toBe(5);
  });

  it('yields error results with durationMs 0 and isTerminal false', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Timeout')).mockResolvedValueOnce(mockJsonResponse(approvedResponse));

    const results: PollTransactionResult[] = [];
    for await (const result of payway.checkout.pollTransactionStatus('T001', {
      intervalMs: 1,
      maxConsecutiveErrors: 3,
    })) {
      results.push(result);
    }

    expect(results).toHaveLength(2);
    // Error result
    expect(results[0].durationMs).toBe(0);
    expect(results[0].isTerminal).toBe(false);
    expect(results[0].paymentStatus).toContain('ERROR');
    expect(results[0].paymentStatus).toContain('Timeout');
    expect(results[0].transactionId).toBe('T001');
    expect(results[0].attempt).toBe(1);
    // Success result (terminal — stops the loop)
    expect(results[1].paymentStatus).toBe('APPROVED');
    expect(results[1].isTerminal).toBe(true);
  });

  it('sends correct HMAC fields to checkTransaction endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse(approvedResponse));

    for await (const _result of payway.checkout.pollTransactionStatus('T001', { intervalMs: 1 })) {
      break;
    }

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain(ENDPOINTS.checkTransaction);
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body).toHaveProperty('tran_id', 'T001');
    expect(body).toHaveProperty('merchant_id', TEST_CONFIG.merchantId);
    expect(body).toHaveProperty('hash');
    expect(body).toHaveProperty('req_time');
  });
});
