/**
 * Behavior pins for the B4 advisory-validation framework (live-docs parity,
 * 2026-08-31). Load-bearing contracts:
 * - Advisory limits (length caps, enums, min amounts, list windows) warn once
 *   per distinct message via `warnAdvisory` and escalate to `PayWayConfigError`
 *   under `strictValidation` (config flag OR `PAYWAY_STRICT_VALIDATION=1` env).
 * - Gateway-REQUIRED rules always throw regardless of the flag
 *   (googlePayToken for google_pay; non-empty merchantRef).
 * - khqr merchantRef errors are now `PayWayConfigError` (previously plain Error).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PayWay } from '../client.js';
import type { CreateTransactionParams, GetTransactionListParams, PayWayConfig } from '../client.js';
import { createCheckoutDomain } from '../domains/checkout.js';
import { createKhqrDomain } from '../domains/khqr.js';
import { PayWayConfigError } from '../errors.js';
import { validateAmountFloor, warnAdvisory } from '../utils.js';

const TEST_CONFIG = {
  merchantId: 'test-merchant-001',
  apiKey: 'test-api-key-secret',
  environment: 'sandbox' as const,
};

const STRICT_CONFIG = { ...TEST_CONFIG, strictValidation: true } as unknown as PayWayConfig;

type DomainConfig = PayWayConfig & { merchantId: string; apiKey: string };

function makeCheckout(config: DomainConfig = TEST_CONFIG as unknown as DomainConfig) {
  const request = async <T>(path: string): Promise<T> => ({ path, status: { code: '00' } } as T);
  const requestWithMerchantAuth = async <T>(path: string): Promise<T> => ({ path, status: { code: '00' } } as T);
  return createCheckoutDomain(config, request, requestWithMerchantAuth, 'https://sandbox.example');
}

function makeKhqr(config: DomainConfig = TEST_CONFIG as unknown as DomainConfig) {
  const request = async <T>(path: string): Promise<T> => ({ path, status: { code: '00' } } as T);
  return createKhqrDomain(config, request);
}

describe('warnAdvisory (advisory framework core)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns once per distinct message and dedups repeats', () => {
    const msg = `dedup-probe-${Date.now()}-${Math.random()}`;
    warnAdvisory(TEST_CONFIG as PayWayConfig, msg);
    warnAdvisory(TEST_CONFIG as PayWayConfig, msg);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(`[payway] ${msg}`);
  });

  it('different messages each warn', () => {
    const a = `dedup-a-${Date.now()}`;
    const b = `dedup-b-${Date.now()}`;
    warnAdvisory(TEST_CONFIG as PayWayConfig, a);
    warnAdvisory(TEST_CONFIG as PayWayConfig, b);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });
});

describe('strictValidation escalation', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('config flag escalates an advisory to PayWayConfigError', () => {
    const payway = makeCheckout(STRICT_CONFIG as DomainConfig);
    expect(() =>
      payway.createTransaction({
        transactionId: 'STRICT-1',
        amount: 10,
        lastname: 'x'.repeat(101),
      }),
    ).toThrow(PayWayConfigError);
  });

  it('PAYWAY_STRICT_VALIDATION=1 env escalates without the config flag', () => {
    vi.stubEnv('PAYWAY_STRICT_VALIDATION', '1');
    try {
      const payway = new PayWay(TEST_CONFIG);
      expect(() =>
        payway.checkout.createTransaction({
          transactionId: 'STRICT-2',
          amount: 10,
          lifetime: 50000,
        }),
      ).toThrow(PayWayConfigError);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('non-strict config only warns for the same advisory', () => {
    const payway = makeCheckout();
    expect(() =>
      payway.createTransaction({
        transactionId: 'WARN-1',
        amount: 10,
        lifetime: 50000,
      }),
    ).not.toThrow();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('lifetime'));
  });
});

describe('purchase advisory caps (buildPurchasePayload)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const base: CreateTransactionParams = { transactionId: 'CAP-1', amount: 10 };

  it('lifetime > 43200 warns', () => {
    makeCheckout().createTransaction({ ...base, lifetime: 43201 });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('43200'));
  });

  it('firstname > 100 chars or with digits warns (deduped to one warn)', () => {
    const payway = makeCheckout();
    // Same advisory message for both violations → warn-once dedup fires once.
    payway.createTransaction({ ...base, firstname: 'x'.repeat(101) });
    payway.createTransaction({ ...base, firstname: 'John123' });
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('firstname'));
  });

  it('lastname > 100 warns', () => {
    makeCheckout().createTransaction({ ...base, lastname: 'y'.repeat(101) });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('lastname'));
  });

  it('email > 50 warns', () => {
    makeCheckout().createTransaction({ ...base, email: `${'e'.repeat(50)}@x.com` });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('email'));
  });

  it('phone > 20 warns', () => {
    makeCheckout().createTransaction({ ...base, phone: '1'.repeat(21) });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('phone'));
  });

  it('items > 10 entries and > 500 encoded chars warn', () => {
    const payway = makeCheckout();
    payway.createTransaction({
      ...base,
      items: Array.from({ length: 11 }, (_, i) => ({ name: `i${i}`, quantity: 1, price: 1 })),
    });
    payway.createTransaction({ ...base, items: [{ name: 'z'.repeat(600), quantity: 1, price: 1 }] });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('10'));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('500'));
  });

  it('paymentOption outside the documented enum warns; inside does not', () => {
    const payway = makeCheckout();
    payway.createTransaction({ ...base, paymentOption: 'not_an_option' as unknown as 'abapay' });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('payment_option'));
    vi.mocked(console.warn).mockClear();
    payway.createTransaction({ ...base, paymentOption: 'cards' });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('google_pay without googlePayToken throws even without strictValidation', () => {
    expect(() => makeCheckout().createTransaction({ ...base, paymentOption: 'google_pay' })).toThrow(
      /googlePayToken is required/,
    );
    expect(() =>
      makeCheckout().createTransaction({ ...base, paymentOption: 'google_pay', googlePayToken: 'tok' }),
    ).not.toThrow();
  });
});


describe('getTransactionList advisory limits', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('malformed dates warn with the required format', () => {
    const payway = makeCheckout();
    payway.getTransactionList({ fromDate: '2026/01/01', toDate: 'bad' } as GetTransactionListParams);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('fromDate'));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('toDate'));
  });

  it('>3-day span warns', () => {
    makeCheckout().getTransactionList({
      fromDate: '2026-01-01 00:00:00',
      toDate: '2026-01-10 00:00:00',
    });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('3 days'));
  });

  it('pagination > 1000 warns', () => {
    makeCheckout().getTransactionList({ pagination: '1001' } as GetTransactionListParams);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('1000'));
  });

  it('status outside the enum warns (case-insensitive check)', () => {
    const payway = makeCheckout();
    payway.getTransactionList({ status: 'approved,weird' } as GetTransactionListParams);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('weird'));
    vi.mocked(console.warn).mockClear();
    payway.getTransactionList({ status: 'approved' } as GetTransactionListParams);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('null status does not throw (status accepts null)', () => {
    expect(() => makeCheckout().getTransactionList({ status: null } as GetTransactionListParams)).not.toThrow();
  });

  it('all list advisories escalate under strictValidation', () => {
    const payway = makeCheckout(STRICT_CONFIG as DomainConfig);
    expect(() =>
      payway.getTransactionList({
        fromDate: '2026-01-01 00:00:00',
        toDate: '2026-01-10 00:00:00',
      }),
    ).toThrow(PayWayConfigError);
  });
});

describe('khqr merchantRef validation', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('empty merchantRef throws PayWayConfigError (error-class change)', () => {
    expect(() => makeKhqr().getTransactionsByMerchantRef('')).toThrow(PayWayConfigError);
    expect(() => makeKhqr().getTransactionsByMerchantRef('   ')).toThrow(PayWayConfigError);
  });

  it('merchantRef > 20 chars warns once and still calls', async () => {
    await makeKhqr().getTransactionsByMerchantRef('x'.repeat(21));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('20-character'));
  });
});

describe('validateAmountFloor', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('USD 0.005 warns (below 0.01 floor)', () => {
    validateAmountFloor(TEST_CONFIG as PayWayConfig, 0.005, 'USD', 'generate-qr');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('0.01'));
  });

  it('KHR 50 warns (below 100 floor)', () => {
    validateAmountFloor(TEST_CONFIG as PayWayConfig, 50, 'KHR', 'payout');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('100'));
  });

  it('amounts at/above the floor do not warn', () => {
    validateAmountFloor(TEST_CONFIG as PayWayConfig, 0.01, 'USD', 'generate-qr');
    validateAmountFloor(TEST_CONFIG as PayWayConfig, 100, 'KHR', 'payout');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('strict config escalates floors to PayWayConfigError', () => {
    expect(() => validateAmountFloor(STRICT_CONFIG, 0.005, 'USD', 'generate-qr')).toThrow(PayWayConfigError);
    expect(() => validateAmountFloor(STRICT_CONFIG, 50, 'KHR', 'payout')).toThrow(PayWayConfigError);
  });

  it('wired contexts cover qr, cof payment, payout and payment-link', () => {
    validateAmountFloor(TEST_CONFIG as PayWayConfig, 0.001, 'USD', 'generate-qr');
    validateAmountFloor(TEST_CONFIG as PayWayConfig, 0.001, 'USD', 'payment-credential');
    validateAmountFloor(TEST_CONFIG as PayWayConfig, 0.001, 'USD', 'payout');
    validateAmountFloor(TEST_CONFIG as PayWayConfig, 0.001, 'USD', 'payment-link create');
    expect(console.warn).toHaveBeenCalledTimes(4);
  });
});
