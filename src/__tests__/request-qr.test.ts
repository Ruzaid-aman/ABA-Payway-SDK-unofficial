/**
 * Behavior pins for the Soundbox QR endpoint (`payments/request-qr`) —
 * openapi-suite-coverage W2 (2026-09-12).
 *
 * The contract is spec-derived (docs/archive/Default module.openapi.json)
 * and NOT live-verified: the spec's b4hash for this endpoint is a corrupted
 * copy-paste from generate-qr, so REQUEST_QR_HASH_FIELDS keeps only the
 * fields that exist in the request schema, in the spec's relative order.
 * These tests pin that order, the payload shape, and the local validation
 * surface (nullable amount, REQUIRED payment_option incl. `abapay`,
 * minute-unit lifetime, public-https callback).
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { generateHmac } from '../auth.js';
import type { PayWayConfig, RequestQrParams } from '../client.js';
import { ENDPOINTS } from '../constants.js';
import { createQrDomain, REQUEST_QR_HASH_FIELDS, REQUEST_QR_PAYMENT_OPTIONS } from '../domains/qr.js';
import { PayWayConfigError } from '../errors.js';

const CONFIG = {} as unknown as PayWayConfig;
const STRICT_CONFIG = { strictValidation: true } as unknown as PayWayConfig;

const BASE_PARAMS: RequestQrParams = {
  transactionId: 'sb-test-001',
  currency: 'USD',
  paymentOption: 'abapay',
  callbackUrl: 'https://example.com/soundbox-callback',
};

type RequestCall = { path: string; body: Record<string, unknown>; hmacFields: string[] };

function makeRequestSpy() {
  const calls: RequestCall[] = [];
  const spy = async <TResponse>(
    path: string,
    body: Record<string, unknown>,
    hmacFields: string[],
  ): Promise<TResponse> => {
    calls.push({ path, body, hmacFields });
    return { tran_id: 'sb-test-001', qr_string: 'QR', amount: null, currency: 'USD', status: { code: 0, message: 'Success' } } as TResponse;
  };
  return { spy, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('requestQr (Soundbox QR)', () => {
  it('targets the request-qr endpoint and sends the spec payload shape', async () => {
    const { spy, calls } = makeRequestSpy();
    const domain = createQrDomain(CONFIG, spy);
    await domain.requestQr({ ...BASE_PARAMS, amount: 2.5, lifetime: 60, purchaseType: 'purchase' });

    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe(ENDPOINTS.requestQr);
    const body = calls[0].body;
    expect(body.tran_id).toBe('sb-test-001');
    expect(body.amount).toBe('2.50');
    expect(body.purchase_type).toBe('purchase');
    expect(body.payment_option).toBe('abapay');
    expect(body.callback_url).toBe(Buffer.from('https://example.com/soundbox-callback', 'utf8').toString('base64'));
    expect(body.currency).toBe('USD');
    expect(body.lifetime).toBe(60);
  });

  it('omits amount when null (Soundbox keypad entry) but keeps its hash position', async () => {
    const { spy, calls } = makeRequestSpy();
    const domain = createQrDomain(CONFIG, spy);
    await domain.requestQr(BASE_PARAMS);

    const body = calls[0].body;
    expect(body).not.toHaveProperty('amount');
    // Omitted fields still occupy their position in the HMAC (empty string).
    expect(calls[0].hmacFields).toContain('amount');
    expect(calls[0].hmacFields).toEqual([...REQUEST_QR_HASH_FIELDS]);
  });

  it('signs with the spec-derived 9-field order (filtered from the corrupted spec b4hash)', async () => {
    const { spy, calls } = makeRequestSpy();
    const domain = createQrDomain(CONFIG, spy);
    await domain.requestQr(BASE_PARAMS);

    const body = { req_time: '20260912000000', merchant_id: 'm', tran_id: 't', amount: '', purchase_type: 'purchase', payment_option: 'abapay', callback_url: 'cb', currency: 'USD', lifetime: '' };
    const expected = generateHmac(body, [...REQUEST_QR_HASH_FIELDS], 'key');
    const actual = generateHmac(
      Object.fromEntries(REQUEST_QR_HASH_FIELDS.map((f) => [f, body[f] ?? ''])),
      [...REQUEST_QR_HASH_FIELDS],
      'key',
    );
    expect(actual).toBe(expected);
    expect(calls[0].hmacFields).toEqual([
      'req_time',
      'merchant_id',
      'tran_id',
      'amount',
      'purchase_type',
      'payment_option',
      'callback_url',
      'currency',
      'lifetime',
    ]);
  });

  it('rejects an unknown payment_option (paymentOption is REQUIRED on request-qr)', async () => {
    const { spy } = makeRequestSpy();
    const domain = createQrDomain(CONFIG, spy);
    expect(() => domain.requestQr({ ...BASE_PARAMS, paymentOption: 'google_pay' })).toThrow(PayWayConfigError);
    expect(() => domain.requestQr({ ...BASE_PARAMS, paymentOption: undefined as unknown as string })).toThrow(
      PayWayConfigError,
    );
  });

  it('accepts the documented payment_option set including abapay', () => {
    expect([...REQUEST_QR_PAYMENT_OPTIONS]).toEqual(['abapay', 'abapay_khqr', 'wechat', 'alipay']);
    for (const option of REQUEST_QR_PAYMENT_OPTIONS) {
      const { spy } = makeRequestSpy();
      const domain = createQrDomain(CONFIG, spy);
      expect(() => domain.requestQr({ ...BASE_PARAMS, paymentOption: option })).not.toThrow();
    }
  });

  it('warns (advisory) when wechat/alipay is used with non-USD currency', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { spy } = makeRequestSpy();
    const domain = createQrDomain(CONFIG, spy);
    await domain.requestQr({ ...BASE_PARAMS, currency: 'KHR', paymentOption: 'wechat' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('USD-only'));
  });

  it('validates the minute-unit lifetime window (3..43200)', async () => {
    const { spy } = makeRequestSpy();
    const domain = createQrDomain(CONFIG, spy);
    expect(() => domain.requestQr({ ...BASE_PARAMS, lifetime: 2 })).toThrow(PayWayConfigError);
    expect(() => domain.requestQr({ ...BASE_PARAMS, lifetime: 43201 })).toThrow(PayWayConfigError);
    expect(() => domain.requestQr({ ...BASE_PARAMS, lifetime: 1.5 as unknown as number })).toThrow(PayWayConfigError);
    expect(() => domain.requestQr({ ...BASE_PARAMS, lifetime: 43200 })).not.toThrow();
  });

  it('requires a public https callbackUrl', () => {
    const { spy } = makeRequestSpy();
    const domain = createQrDomain(CONFIG, spy);
    expect(() => domain.requestQr({ ...BASE_PARAMS, callbackUrl: 'http://example.com/cb' })).toThrow(PayWayConfigError);
  });

  it('rejects non-positive amounts when amount is provided', () => {
    const { spy } = makeRequestSpy();
    const domain = createQrDomain(CONFIG, spy);
    expect(() => domain.requestQr({ ...BASE_PARAMS, amount: 0 })).toThrow(PayWayConfigError);
    expect(() => domain.requestQr({ ...BASE_PARAMS, amount: -1 })).toThrow(PayWayConfigError);
  });

  it('escalates the USD-only advisory under strictValidation', () => {
    const { spy } = makeRequestSpy();
    const domain = createQrDomain(STRICT_CONFIG, spy);
    expect(() => domain.requestQr({ ...BASE_PARAMS, currency: 'KHR', paymentOption: 'wechat' })).toThrow(
      PayWayConfigError,
    );
  });
});
