/**
 * Purchase-scope improvements from the Purchase API test campaign
 * (2026-09-05): gate-0 hosted-HTML success surface (W2-2), purchaseHosted()
 * helper, payout {acc, amt} shape validation on the purchase path (W1-5),
 * and the advisory-only lifetime maximum wording (W1-1).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PayWay, PayWayAPIError, PayWayConfigError } from '../index.js';
import { mockJsonResponse } from '../test/test-utils.js';
import type { PayWayConfig } from '../client.js';
import { gatewayDayWindow } from '../utils.js';

const TEST_CONFIG = {
  merchantId: 'test-merchant-001',
  apiKey: 'test-api-key-secret',
  environment: 'sandbox' as const,
};

const HOSTED_PAGE_HTML =
  '<!DOCTYPE html><html lang="en"><head><title>PayWay - Checkout</title></head><body><div id="aba_merchant_request"/></body></html>';

/** 200 + text/html body — the gate-0 hosted-page shape (campaign W2-1). */
function mockHtmlResponse(html: string, contentType = 'text/html; charset=utf-8'): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.reject(new Error('not JSON')),
    text: () => Promise.resolve(html),
    headers: new Headers({ 'content-type': contentType }),
    redirected: false,
    type: 'basic',
    url: '',
    clone: () => ({}) as Response,
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

const BASE_PARAMS = {
  transactionId: 'HOSTED-1',
  amount: 5.55,
  currency: 'USD' as const,
  paymentOption: 'cards' as const,
  returnUrl: 'https://example.com/return',
};

describe('purchase() gate-0 hosted HTML success (W2-2)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let payway: PayWay;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    payway = new PayWay(TEST_CONFIG as PayWayConfig);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves to a PurchaseHostedHtmlResult instead of "Invalid JSON response"', async () => {
    fetchSpy.mockResolvedValue(mockHtmlResponse(HOSTED_PAGE_HTML));

    const result = await payway.checkout.purchase({ ...BASE_PARAMS, paymentGate: 0 });

    expect(result).toMatchObject({
      hosted_checkout: true,
      content_type: 'text/html; charset=utf-8',
    });
    expect((result as { html: string }).html).toContain('PayWay - Checkout');
  });

  it('keeps parsing JSON purchases as before (no gate)', async () => {
    fetchSpy.mockResolvedValue(mockJsonResponse({ status: { code: '00' }, qrString: '000201', abapay_deeplink: 'aba://x' }));

    const result = await payway.checkout.purchase({ ...BASE_PARAMS });

    expect(result).toMatchObject({ status: { code: '00' }, qrString: '000201' });
    expect(result).not.toHaveProperty('hosted_checkout');
  });

  it('does not hijack HTML from other endpoints (generic Invalid JSON error preserved)', async () => {
    fetchSpy.mockResolvedValue(mockHtmlResponse('<html>cdn error</html>'));

    await expect(payway.checkout.checkTransaction('SOME-TXN')).rejects.toThrow(/Invalid JSON response/);
  });
});

describe('purchaseHosted()', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let payway: PayWay;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    payway = new PayWay(TEST_CONFIG as PayWayConfig);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends payment_gate 0 and returns the structured hosted page', async () => {
    fetchSpy.mockResolvedValue(mockHtmlResponse(HOSTED_PAGE_HTML));

    const page = await payway.checkout.purchaseHosted({ ...BASE_PARAMS });

    expect(page.hosted_checkout).toBe(true);
    expect(page.html).toContain('PayWay - Checkout');

    const sentBody = JSON.parse(String(fetchSpy.mock.calls[0][1].body)) as Record<string, unknown>;
    expect(sentBody.payment_gate).toBe(0);
    expect(sentBody.tran_id).toBe('HOSTED-1');
  });

  it('leaves an explicit caller paymentGate untouched', async () => {
    fetchSpy.mockResolvedValue(mockHtmlResponse(HOSTED_PAGE_HTML));

    await payway.checkout.purchaseHosted({ ...BASE_PARAMS, paymentGate: 0 });
    const sentBody = JSON.parse(String(fetchSpy.mock.calls[0][1].body)) as Record<string, unknown>;
    expect(sentBody.payment_gate).toBe(0);
  });

  it('throws PayWayAPIError with rawBody when the gateway answers JSON instead of the page', async () => {
    fetchSpy.mockResolvedValue(mockJsonResponse({ status: { code: '00' }, qrString: '000201' }));

    try {
      await payway.checkout.purchaseHosted({ ...BASE_PARAMS });
      expect.unreachable('purchaseHosted should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PayWayAPIError);
      expect((error as PayWayAPIError).message).toContain('hosted checkout HTML page');
      expect((error as PayWayAPIError).rawBody).toMatchObject({ status: { code: '00' } });
    }
  });
});

describe('purchase-path payout shape validation (W1-5)', () => {
  let payway: PayWay;

  beforeEach(() => {
    payway = new PayWay(TEST_CONFIG as PayWayConfig);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects {account, amount} (QR-domain keys) locally instead of at the gateway', () => {
    expect(() =>
      payway.checkout.createTransaction({
        transactionId: 'PAYOUT-1',
        amount: 1,
        currency: 'USD',
        returnUrl: 'https://example.com/return',
        payout: [{ account: '500000001', amount: 1 }] as unknown as { acc: string; amt: number }[],
      }),
    ).toThrow(PayWayConfigError);
  });

  it('rejects malformed {acc, amt} entries on createTransaction', () => {
    expect(() =>
      payway.checkout.createTransaction({
        transactionId: 'PAYOUT-2',
        amount: 1,
        currency: 'USD',
        returnUrl: 'https://example.com/return',
        payout: [{ acc: '', amt: 1 }],
      }),
    ).toThrow(PayWayConfigError);
  });

  it('accepts well-formed {acc, amt} arrays and pre-encoded strings', () => {
    expect(() =>
      payway.checkout.createTransaction({
        transactionId: 'PAYOUT-3',
        amount: 1,
        currency: 'USD',
        returnUrl: 'https://example.com/return',
        payout: [{ acc: '500000001', amt: 1 }],
      }),
    ).not.toThrow();
    expect(() =>
      payway.checkout.createTransaction({
        transactionId: 'PAYOUT-4',
        amount: 1,
        currency: 'USD',
        returnUrl: 'https://example.com/return',
        payout: '[{"acc":"500000001","amt":1}]',
      }),
    ).not.toThrow();
  });

  it('rejects the same wrong shape on cof payment()', () => {
    // payment() validates synchronously and throws before any fetch —
    // assert with a sync arrow, not .rejects.
    expect(() =>
      payway.credentialsOnFile.payment({
        transactionId: 'COF-PAYOUT-1',
        amount: 1,
        currency: 'USD',
        paymentToken: 'pwt-test',
        payout: [{ account: '500000001', amount: 1 }] as unknown as { acc: string; amt: number }[],
      }),
    ).toThrow(PayWayConfigError);
  });
});

describe('purchase lifetime maximum is advisory-only (W1-1)', () => {
  it('warns that the max is advisory and not enforced locally', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payway = new PayWay(TEST_CONFIG as PayWayConfig);
      payway.checkout.createTransaction({
        transactionId: 'LIFE-MAX-1',
        amount: 1,
        currency: 'USD',
        returnUrl: 'https://example.com/return',
        lifetime: 43201,
      });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('advisory only'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('43200'));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('escalates to a throw under strictValidation', () => {
    const payway = new PayWay({ ...TEST_CONFIG, strictValidation: true } as PayWayConfig);
    expect(() =>
      payway.checkout.createTransaction({
        transactionId: 'LIFE-MAX-2',
        amount: 1,
        currency: 'USD',
        returnUrl: 'https://example.com/return',
        lifetime: 43201,
      }),
    ).toThrow(PayWayConfigError);
  });
});

describe('gatewayDayWindow()', () => {
  it('computes the UTC+7 gateway-day boundaries', () => {
    // 17:30Z on Sep 5 is already Sep 6 00:30 in the gateway clock.
    const window = gatewayDayWindow(new Date('2026-09-05T17:30:00Z'));
    expect(window).toEqual({ fromDate: '2026-09-06 00:00:00', toDate: '2026-09-06 23:59:59' });
  });

  it('stays on the same day mid-window', () => {
    const window = gatewayDayWindow(new Date('2026-09-05T02:00:00Z'));
    expect(window.fromDate).toBe('2026-09-05 00:00:00');
    expect(window.toDate).toBe('2026-09-05 23:59:59');
  });
});
