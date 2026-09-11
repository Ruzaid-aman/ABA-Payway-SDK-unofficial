/**
 * Pins for the purchase-path payment_option advisory (openapi-suite-coverage
 * W1, 2026-09-12).
 *
 * The archived gateway spec documents `cards`, `abapay`, `abapay_deeplink`
 * for the purchase endpoint; `abapay_khqr_deeplink` (the checkout default)
 * and `google_pay` are live-verified additions. Before the fix the advisory
 * checked the QR enum (PAYMENT_OPTIONS), so spec-documented `abapay` /
 * `abapay_deeplink` raised a spurious warning on every checkout.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PayWay } from '../client.js';
import { PURCHASE_PAYMENT_OPTIONS } from '../constants.js';
import { PayWayConfigError } from '../errors.js';

const TEST_CONFIG = {
  merchantId: 'test-merchant-001',
  apiKey: 'test-api-key-secret',
  environment: 'sandbox' as const,
};

const STRICT_CONFIG = { ...TEST_CONFIG, strictValidation: true } as unknown as Parameters<typeof PayWay>[0];

function checkoutPaymentOption(paymentOption: string, extra?: { googlePayToken?: string }) {
  const payway = new PayWay(TEST_CONFIG as Parameters<typeof PayWay>[0]);
  return payway.checkout.createTransaction({
    transactionId: 'PO-TEST-001',
    amount: 5,
    returnUrl: 'https://example.com/return',
    paymentOption,
    ...extra,
  });
}

describe('purchase payment_option documented set', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('documents the spec-union-live purchase enum', () => {
    expect([...PURCHASE_PAYMENT_OPTIONS]).toEqual(['cards', 'abapay', 'abapay_deeplink', 'abapay_khqr_deeplink', 'google_pay']);
  });

  it.each(['abapay', 'abapay_deeplink'])('stays silent on spec-documented value %s', (paymentOption) => {
    expect(() => checkoutPaymentOption(paymentOption)).not.toThrow();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('stays silent on the live-verified checkout default and google_pay', () => {
    expect(() => checkoutPaymentOption('abapay_khqr_deeplink')).not.toThrow();
    expect(console.warn).not.toHaveBeenCalled();
    expect(() => checkoutPaymentOption('google_pay', { googlePayToken: 'tok' })).not.toThrow();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('warns on QR-only and unknown values (typo detection preserved)', () => {
    checkoutPaymentOption('abapay_khqr');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('outside the documented purchase enum'),
    );
    console.warn.mockClear();
    checkoutPaymentOption('nonsense_option');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('outside the documented purchase enum'),
    );
  });

  it('escalates to PayWayConfigError under strictValidation', () => {
    const payway = new PayWay(STRICT_CONFIG);
    expect(() =>
      payway.checkout.createTransaction({
        transactionId: 'PO-TEST-002',
        amount: 5,
        returnUrl: 'https://example.com/return',
        paymentOption: 'abapay_khqr',
      }),
    ).toThrow(PayWayConfigError);
  });
});
