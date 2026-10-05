/**
 * Official-value pins for audit items DX-RULE-001..004
 * (docs/project/2026-10-05-dx-platform-audit-pass2.md §47 rows
 * DX-RULE-001..004; §48.6 acceptance items 5-9).
 *
 * Evidence: OFFICIAL_DOCUMENTATION — the developer.payway.com.kh purchase and
 * qr-api pages, retrieved 2026-10-05 (rule matrix §19.2, rows PUR-003,
 * QR-012, QR-016, QR-009). All tests are pure in-process: the domain
 * factories get stubbed request functions and the test harness runs on fake
 * Module 1/2 functions — no fetch, no child processes, no dist dependency.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenerateQrParams, PayWayConfig } from '../client.js';
import { PURCHASE_PAYMENT_OPTIONS, PURCHASE_PAYMENT_OPTIONS_LEGACY, QR_PAYMENT_OPTIONS } from '../constants.js';
import { createCheckoutDomain } from '../domains/checkout.js';
import { createQrDomain } from '../domains/qr.js';
import { PayWayConfigError } from '../errors.js';
import { DEFAULT_TEST_CASES, generateMockSession, runTestSuite } from '../test/index.js';
import { validateAmountFloor } from '../utils.js';

const TEST_CONFIG = {
  merchantId: 'test-merchant-001',
  apiKey: 'test-api-key-secret',
  environment: 'sandbox',
} as PayWayConfig;
const STRICT_CONFIG = { ...TEST_CONFIG, strictValidation: true } as PayWayConfig;

/** Stubbed transport: resolves after recording the call — no network. */
function makeCheckoutRequest() {
  return vi.fn(async <T>(): Promise<T> => ({ status: { code: '00' } }) as T);
}

function makeCheckoutDomain(config: PayWayConfig) {
  return createCheckoutDomain(
    config as PayWayConfig & { merchantId: string; apiKey: string },
    makeCheckoutRequest() as unknown as Parameters<typeof createCheckoutDomain>[1],
    makeCheckoutRequest() as unknown as Parameters<typeof createCheckoutDomain>[2],
    'https://sandbox.example',
  );
}

type QrCall = { path: string; body: Record<string, unknown> };

function makeQrDomain(config: PayWayConfig) {
  const calls: QrCall[] = [];
  const request = async <T>(path: string, body: Record<string, unknown>): Promise<T> => {
    calls.push({ path, body });
    return { status: { code: '0' }, qrString: 'x' } as T;
  };
  return { domain: createQrDomain(config, request as unknown as Parameters<typeof createQrDomain>[1]), calls };
}

const QR_BASE: GenerateQrParams = {
  transactionId: 'official-qr-1',
  amount: 6.12,
  paymentOption: 'abapay_khqr',
  callbackUrl: 'https://example.com/callback',
  currency: 'USD',
  lifetime: 360,
};

async function checkoutPurchase(config: PayWayConfig, params: Record<string, unknown>): Promise<unknown> {
  // async on purpose: purchase()/buildPurchasePayload can throw SYNCHRONOUSLY
  // (it validates before returning the request promise) — awaiting through an
  // async wrapper converts that into a rejected promise for `.rejects`.
  return makeCheckoutDomain(config).purchase({
    transactionId: 'official-pur-1',
    amount: 5,
    returnUrl: 'https://example.com/return',
    ...params,
  } as Parameters<ReturnType<typeof createCheckoutDomain>['purchase']>[0]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ───────────────────────────────────────────────────────────────────────────
// DX-RULE-001 — purchase payment_option (rule PUR-003)
// ───────────────────────────────────────────────────────────────────────────
describe('DX-RULE-001: purchase payment_option official enum (PUR-003)', () => {
  it('pins the official 6-value purchase set and the 2-value legacy set', () => {
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

  it.each([...PURCHASE_PAYMENT_OPTIONS])(
    'normal mode: official value %s produces no diagnostic',
    async (paymentOption) => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const extra = paymentOption === 'google_pay' ? { googlePayToken: 'tok' } : {};
      await expect(checkoutPurchase(TEST_CONFIG, { paymentOption, ...extra })).resolves.toBeDefined();
      expect(warnSpy).not.toHaveBeenCalled();
    },
  );

  it.each([...PURCHASE_PAYMENT_OPTIONS])(
    'strictValidation: official value %s does not throw (google_pay needs its token)',
    async (paymentOption) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const extra = paymentOption === 'google_pay' ? { googlePayToken: 'tok' } : {};
      await expect(checkoutPurchase(STRICT_CONFIG, { paymentOption, ...extra })).resolves.toBeDefined();
    },
  );

  it.each([...PURCHASE_PAYMENT_OPTIONS_LEGACY])(
    'normal mode: legacy value %s advises (citing PUR-003) but never rejects',
    async (paymentOption) => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await expect(checkoutPurchase(TEST_CONFIG, { paymentOption })).resolves.toBeDefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('legacy purchase value'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('PUR-003'));
    },
  );

  it.each([...PURCHASE_PAYMENT_OPTIONS_LEGACY])(
    'strictValidation: legacy value %s is STILL only an advisory — never hard-rejected (risk R-A)',
    async (paymentOption) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      // The non-escalating notice dedupes per process (module-global set), so
      // it may already have fired in the normal-mode case above — the
      // load-bearing assertion here is that strictValidation does NOT throw.
      await expect(checkoutPurchase(STRICT_CONFIG, { paymentOption })).resolves.toBeDefined();
    },
  );

  it.each(['paypal', 'nonsense_option'])(
    'normal mode: unknown value %s throws citing PUR-003 with the official values',
    async (paymentOption) => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await expect(checkoutPurchase(TEST_CONFIG, { paymentOption })).rejects.toThrow(PayWayConfigError);
      await expect(checkoutPurchase(TEST_CONFIG, { paymentOption })).rejects.toThrow(/PUR-003/);
      await expect(checkoutPurchase(TEST_CONFIG, { paymentOption })).rejects.toThrow(
        new RegExp(PURCHASE_PAYMENT_OPTIONS.join('.*')),
      );
      expect(warnSpy).not.toHaveBeenCalled();
    },
  );

  it.each(['paypal'])('strictValidation: unknown value %s throws citing PUR-003 too', async (paymentOption) => {
    await expect(checkoutPurchase(STRICT_CONFIG, { paymentOption })).rejects.toThrow(PayWayConfigError);
    await expect(checkoutPurchase(STRICT_CONFIG, { paymentOption })).rejects.toThrow(/PUR-003/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// DX-RULE-002 — generate-qr payment_option membership (rule QR-012)
// ───────────────────────────────────────────────────────────────────────────
describe('DX-RULE-002: generate-qr payment_option membership (QR-012)', () => {
  it('pins the official 3-value generate-qr set', () => {
    expect([...QR_PAYMENT_OPTIONS]).toEqual(['abapay_khqr', 'wechat', 'alipay']);
  });

  it.each([...QR_PAYMENT_OPTIONS])(
    'official generate-qr value %s is accepted (no diagnostic)',
    async (paymentOption) => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { domain } = makeQrDomain(TEST_CONFIG);
      await expect(domain.generateQr({ ...QR_BASE, paymentOption })).resolves.toBeDefined();
      expect(warnSpy).not.toHaveBeenCalled();
    },
  );

  it.each(['cards', 'abapay', 'abapay_deeplink', 'abapay_khqr_deeplink', 'google_pay', 'nonsense_option'])(
    'generate-qr value %s throws citing QR-012 with the official values',
    async (paymentOption) => {
      const { domain } = makeQrDomain(TEST_CONFIG);
      expect(() => domain.generateQr({ ...QR_BASE, paymentOption })).toThrow(PayWayConfigError);
      expect(() => domain.generateQr({ ...QR_BASE, paymentOption })).toThrow(/QR-012/);
      expect(() => domain.generateQr({ ...QR_BASE, paymentOption })).toThrow(new RegExp(QR_PAYMENT_OPTIONS.join('.*')));
    },
  );

  it('strictValidation does not change the QR-012 outcome', () => {
    const { domain } = makeQrDomain(STRICT_CONFIG);
    expect(() => domain.generateQr({ ...QR_BASE, paymentOption: 'cards' })).toThrow(/QR-012/);
  });

  it('the Soundbox request-qr path keeps its own spec-derived set (unaffected)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { domain } = makeQrDomain(TEST_CONFIG);
    // `abapay` is NOT a generate-qr value but remains valid for request-qr.
    // Long-enough transactionId: request-qr identifiers are advised to match
    // [a-zA-Z0-9-]{5,24} (repository assumption, out of scope here).
    await expect(
      domain.requestQr({
        transactionId: 'sb-0001',
        currency: 'USD',
        paymentOption: 'abapay',
        callbackUrl: 'https://example.com/soundbox',
      }),
    ).resolves.toBeDefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// DX-RULE-003 — items cap 10 → 50 (rule QR-016)
// ───────────────────────────────────────────────────────────────────────────
describe('DX-RULE-003: items cap 50 on both endpoints (QR-016)', () => {
  const itemsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `i${i}`, quantity: 1, price: 0.01 }));

  it.each([10, 11, 50])('purchase: %s items produce no advisory (official cap is 50)', async (n) => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(checkoutPurchase(TEST_CONFIG, { items: itemsOf(n) })).resolves.toBeDefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('purchase: 51 items advise citing QR-016 and the official source', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(checkoutPurchase(TEST_CONFIG, { items: itemsOf(51) })).resolves.toBeDefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('QR-016'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('50 line items'));
  });

  it.each([10, 11, 50])('generate-qr: %s items produce no advisory (official cap is 50)', async (n) => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { domain } = makeQrDomain(TEST_CONFIG);
    await expect(domain.generateQr({ ...QR_BASE, items: itemsOf(n) })).resolves.toBeDefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('generate-qr: 51 items advise citing QR-016 and the official source, including the items semantics sentence', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { domain } = makeQrDomain(TEST_CONFIG);
    await expect(domain.generateQr({ ...QR_BASE, items: itemsOf(51) })).resolves.toBeDefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('QR-016'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('50 line items'));
    // N-06 semantics: the advisory records that line items are description
    // only — price/quantity are never an amount check.
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not used for calculation or validation'));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// DX-RULE-004 — amount floor ADVISORY → HARD (rule QR-009, gateway code 47)
// ───────────────────────────────────────────────────────────────────────────
describe('DX-RULE-004: amount floor is HARD (QR-009, official code 47)', () => {
  it('0.009 USD throws citing QR-009 (normal mode)', () => {
    expect(() => validateAmountFloor(TEST_CONFIG, 0.009, 'USD', 'generate-qr')).toThrow(PayWayConfigError);
    expect(() => validateAmountFloor(TEST_CONFIG, 0.009, 'USD', 'generate-qr')).toThrow(/QR-009/);
    expect(() => validateAmountFloor(TEST_CONFIG, 0.009, 'USD', 'generate-qr')).toThrow(/47/);
  });

  it('99 KHR throws citing QR-009 (normal mode)', () => {
    expect(() => validateAmountFloor(TEST_CONFIG, 99, 'KHR', 'payout')).toThrow(PayWayConfigError);
    expect(() => validateAmountFloor(TEST_CONFIG, 99, 'KHR', 'payout')).toThrow(/QR-009/);
    expect(() => validateAmountFloor(TEST_CONFIG, 99, 'KHR', 'payout')).toThrow(/47/);
  });

  it('0.01 USD and 100 KHR pass with no warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => validateAmountFloor(TEST_CONFIG, 0.01, 'USD', 'generate-qr')).not.toThrow();
    expect(() => validateAmountFloor(TEST_CONFIG, 100, 'KHR', 'payout')).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('strictValidation throws identically (the rule is already maximally strict)', () => {
    expect(() => validateAmountFloor(STRICT_CONFIG, 0.009, 'USD', 'generate-qr')).toThrow(/QR-009/);
    expect(() => validateAmountFloor(STRICT_CONFIG, 99, 'KHR', 'payout')).toThrow(/QR-009/);
  });

  it('domain wiring: generate-qr with 99 KHR fails locally citing QR-009 before any request', () => {
    const { domain, calls } = makeQrDomain(TEST_CONFIG);
    expect(() => domain.generateQr({ ...QR_BASE, amount: 99, currency: 'KHR' })).toThrow(PayWayConfigError);
    expect(() => domain.generateQr({ ...QR_BASE, amount: 99, currency: 'KHR' })).toThrow(/QR-009/);
    expect(calls).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// DX-RULE-001 companion — sdk.runTestSuite emits no purchase-enum advisory
// ───────────────────────────────────────────────────────────────────────────
describe('runTestSuite emits no purchase-enum advisory', () => {
  it('sends only official purchase payment_options (or omits the field)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const seen: Array<string | undefined> = [];
    const report = await runTestSuite({
      initiate: (payload, config) => {
        seen.push(payload.paymentOption);
        const responseType = (config as { responseType?: string })?.responseType;
        return generateMockSession((responseType ?? 'qr_string') as Parameters<typeof generateMockSession>[0]);
      },
      handle: (session) => ({
        success: true,
        action: (
          {
            deeplink: 'deeplink_redirect',
            qr_string: 'qr_rendered',
            qr_image: 'qr_image_rendered',
            checkout_qr_url: 'checkout_qr_url_rendered',
            url: 'url_redirect',
            html: 'html_embedded',
          } as Record<string, string>
        )[session.responseType],
        session,
      }),
    });

    expect(report.success).toBe(true);
    expect(seen).toHaveLength(DEFAULT_TEST_CASES.length);
    for (const option of seen) {
      if (option !== undefined) {
        expect(PURCHASE_PAYMENT_OPTIONS as readonly string[]).toContain(option);
      }
    }
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringMatching(/PUR-003|outside the documented purchase enum|legacy purchase value/),
    );
  });
});
