/**
 * Pins for the purchase-path payment_option validation (rule PUR-003).
 *
 * History: the advisory originally checked the QR enum (openapi-suite-coverage
 * W1, 2026-09-12), then the archived-spec union. Since the official-values
 * wave (audit DX-RULE-001, 2026-10-05) the enum is the OFFICIAL 6-value set
 * from developer.payway.com.kh (retrieved 2026-10-05): official values are
 * silent in normal AND strict mode; legacy archived-spec values
 * (`abapay`, `abapay_deeplink`) produce a non-escalating advisory (risk R-A —
 * never hard-rejected); unknown values throw citing PUR-003.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { type PayWayConfig, PayWay } from '../client.js';
import { PURCHASE_PAYMENT_OPTIONS, PURCHASE_PAYMENT_OPTIONS_LEGACY } from '../constants.js';
import { PayWayConfigError } from '../errors.js';

const TEST_CONFIG: PayWayConfig = {
  merchantId: 'test-merchant-001',
  apiKey: 'test-api-key-secret',
  environment: 'sandbox',
};

const STRICT_CONFIG = { ...TEST_CONFIG, strictValidation: true } as PayWayConfig;

function checkoutPaymentOption(paymentOption: string, extra?: { googlePayToken?: string }) {
  const payway = new PayWay(TEST_CONFIG);
  return payway.checkout.createTransaction({
    transactionId: 'PO-TEST-001',
    amount: 5,
    returnUrl: 'https://example.com/return',
    paymentOption,
    ...extra,
  });
}

function strictCheckoutPaymentOption(paymentOption: string, extra?: { googlePayToken?: string }) {
  const payway = new PayWay(STRICT_CONFIG);
  return payway.checkout.createTransaction({
    transactionId: 'PO-TEST-002',
    amount: 5,
    returnUrl: 'https://example.com/return',
    paymentOption,
    ...extra,
  });
}

describe('purchase payment_option official set (PUR-003)', () => {
  let warnSpy: MockInstance<typeof console.warn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('documents the official purchase enum and the legacy advisory set', () => {
    expect([...PURCHASE_PAYMENT_OPTIONS]).toEqual([
      'cards',
      'abapay_khqr',
      'abapay_khqr_deeplink',
      'alipay',
      'wechat',
      'google_pay',
    ]);
    expect([...PURCHASE_PAYMENT_OPTIONS_LEGACY]).toEqual(['abapay', 'abapay_deeplink']);
  });

  it.each(['cards', 'abapay_khqr', 'abapay_khqr_deeplink', 'alipay', 'wechat', 'google_pay'])(
    'stays silent on officially documented value %s',
    (paymentOption) => {
      expect(() => checkoutPaymentOption(paymentOption, paymentOption === 'google_pay' ? { googlePayToken: 'tok' } : undefined)).not.toThrow();
      expect(warnSpy).not.toHaveBeenCalled();
    },
  );

  it.each([...PURCHASE_PAYMENT_OPTIONS_LEGACY])(
    'advises (never rejects) on legacy value %s, citing PUR-003',
    (paymentOption) => {
      expect(() => checkoutPaymentOption(paymentOption)).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('legacy purchase value'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('PUR-003'));
    },
  );

  it('legacy values are not escalated by strictValidation (risk R-A: profile-dependent acceptance)', () => {
    expect(() => strictCheckoutPaymentOption('abapay')).not.toThrow(PayWayConfigError);
    expect(() => strictCheckoutPaymentOption('abapay_deeplink')).not.toThrow(PayWayConfigError);
  });

  it('throws on unknown values in normal mode, citing PUR-003 and listing the official values', () => {
    expect(() => checkoutPaymentOption('nonsense_option')).toThrow(PayWayConfigError);
    expect(() => checkoutPaymentOption('nonsense_option')).toThrow(/PUR-003/);
    expect(() => checkoutPaymentOption('nonsense_option')).toThrow(new RegExp(PURCHASE_PAYMENT_OPTIONS.join('.*')));
  });

  it('throws on unknown values under strictValidation too', () => {
    expect(() => strictCheckoutPaymentOption('nonsense_option')).toThrow(PayWayConfigError);
    expect(() => strictCheckoutPaymentOption('nonsense_option')).toThrow(/PUR-003/);
  });
});
