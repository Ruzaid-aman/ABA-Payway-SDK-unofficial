import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PayWayConfig } from '../client.js';
import { createCheckoutDomain } from '../domains/checkout.js';
import { createPaymentLinkDomain } from '../domains/payment-link.js';
import { createSelfActivationDomain } from '../domains/self-activation.js';

const config = { merchantId: 'test-merchant', apiKey: 'test-key' } satisfies PayWayConfig;
const baseUrl = 'https://checkout-sandbox.payway.com.kh';
const purchase = { transactionId: 'V2-001', amount: 5 };
const link = { title: 'Invoice', amount: 5, merchantRefNo: 'V2-001', returnUrl: 'https://example.com/cb' };

afterEach(() => vi.restoreAllMocks());

describe('questionnaire v2 callback boundaries', () => {
  it.each(['http://example.com/cb', 'https://example.com:8443/cb', 'https://127.0.0.1/cb'])(
    'rejects unreachable purchase callbacks before signing or submitting: %s',
    (returnUrl) => {
      const request = vi.fn();
      const checkout = createCheckoutDomain(config, request, request, baseUrl);
      expect(() => checkout.createTransaction({ ...purchase, returnUrl })).toThrow(/returnUrl/);
      expect(() => checkout.getCheckoutFormHtml({ ...purchase, returnUrl })).toThrow(/returnUrl/);
      expect(() => checkout.purchase({ ...purchase, returnUrl })).toThrow(/returnUrl/);
      expect(request).not.toHaveBeenCalled();
    },
  );

  it('validates pre-encoded callbacks without double encoding or changing the signed payload', () => {
    const request = vi.fn();
    const checkout = createCheckoutDomain(config, request, request, baseUrl);
    const url = 'https://example.com:443/cb?invoice=1';
    const encoded = Buffer.from(url).toString('base64');
    vi.useFakeTimers();
    try {
      expect(checkout.createTransaction({ ...purchase, returnUrl: encoded })).toEqual(
        checkout.createTransaction({ ...purchase, returnUrl: url }),
      );
      expect(() =>
        checkout.createTransaction({
          ...purchase,
          returnUrl: Buffer.from('https://example.com:8443/cb').toString('base64'),
        }),
      ).toThrow(/standard HTTPS port 443/);
      expect(() =>
        checkout.createTransaction({
          ...purchase,
          returnUrl: Buffer.from(' https://example.com/cb ').toString('base64'),
        }),
      ).toThrow(/whitespace/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves optional callbacks, browser continuations and the private-host override', () => {
    const request = vi.fn();
    const checkout = createCheckoutDomain({ ...config, allowPrivateCallbackHosts: true }, request, request, baseUrl);
    expect(checkout.createTransaction(purchase)).not.toHaveProperty('return_url');
    expect(() =>
      checkout.createTransaction({
        ...purchase,
        returnUrl: 'https://10.1.2.3/cb',
        continueSuccessUrl: 'https://example.com:8443/done',
        cancelUrl: 'https://example.com:8443/cancel',
      }),
    ).not.toThrow();
  });

  it('applies the callback port restriction to partner pushbacks, not browser redirects', async () => {
    const request = vi.fn().mockResolvedValue({ status: { code: '00' } });
    const domain = createSelfActivationDomain(config, request);
    const params = {
      registerRef: 'REG-001',
      currency: 'USD' as const,
      pushbackUrl: 'https://example.com/cb',
      redirectUrl: 'https://example.com:8443/done',
    };
    await domain.registerMerchant(params);
    expect(request).toHaveBeenCalledOnce();
    expect(() => domain.registerMerchant({ ...params, pushbackUrl: 'https://example.com:8443/cb' })).toThrow(
      /standard HTTPS port 443/,
    );
    expect(request).toHaveBeenCalledOnce();
  });
});

describe('questionnaire v2 payment-link description advisory', () => {
  it('warns without rewriting the description or blocking the default request', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const request = vi.fn().mockResolvedValue({});
    await createPaymentLinkDomain(config, request).create({ ...link, description: '=invoice' });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/description.*start.*[=]/));
    expect(request.mock.calls[0][1].description).toBe('=invoice');
  });

  it.each(['=invoice', '+invoice', '-invoice', '@invoice'])(
    'strict mode rejects %s before submission',
    (description) => {
      const request = vi.fn();
      const domain = createPaymentLinkDomain({ ...config, strictValidation: true }, request);
      expect(() => domain.create({ ...link, description })).toThrow(/description.*start/);
      expect(request).not.toHaveBeenCalled();
    },
  );

  it.each(['', 'Invoice #1 - service', 'x'.repeat(250)])('accepts permitted description text', async (description) => {
    const request = vi.fn().mockResolvedValue({});
    await createPaymentLinkDomain({ ...config, strictValidation: true }, request).create({ ...link, description });
    expect(request.mock.calls[0][1].description).toBe(description);
  });
});
