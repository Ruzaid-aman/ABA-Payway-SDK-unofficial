/**
 * Behavior pins for the CoF + subscription live-docs parity work (2026-08-31).
 *
 * Load-bearing contracts:
 * - Required-field enforcement: linkAccount/linkCard ctid + tokenFlag (+ linkAccount
 *   currency) are gateway-documented REQUIRED — missing values throw PayWayConfigError.
 * - Appended hash positions keep the pre-parity HMAC byte-identical for callers
 *   that don't pass the new fields (empty strings vanish under concatenation).
 * - Subscription trio on the purchase path: tokenFlag implies ctid, frequency
 *   required iff CITR_FIX, other flags rejected on this path.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { generateHmac } from '../auth.js';
import { PayWay } from '../client.js';
import { createCredentialsOnFileDomain } from '../domains/credentials-on-file.js';
import { PayWayConfigError } from '../errors.js';
import type { CofPaymentParams, LinkAccountParams, LinkCardParams, PayWayConfig } from '../client.js';

const TEST_CONFIG = {
  merchantId: 'test-merchant-001',
  apiKey: 'test-api-key-secret',
  environment: 'sandbox' as const,
};

const STRICT_CONFIG = { ...TEST_CONFIG, strictValidation: true } as unknown as PayWayConfig;

function makeCofDomain(config: PayWayConfig = TEST_CONFIG as unknown as PayWayConfig) {
  const calls: Array<{ path: string; body: Record<string, unknown>; hmacFields: string[]; timeField?: string; contentType?: string }> = [];
  const request = async <T>(
    path: string,
    body: Record<string, unknown>,
    hmacFields: string[],
    timeField?: string,
    contentType?: string,
  ): Promise<T> => {
    calls.push({ path, body, hmacFields, timeField, contentType });
    return { status: { code: '00' } } as T;
  };
  return { domain: createCredentialsOnFileDomain(config, request), calls };
}

const LINK_ACCOUNT_PARAMS: LinkAccountParams = {
  requestId: 'REQ001',
  ctid: 'CTID001',
  tokenFlag: 'CITI_FLEX',
  currency: 'USD',
};

const LINK_CARD_PARAMS: LinkCardParams = {
  requestId: 'REQ002',
  ctid: 'CTID002',
  tokenFlag: 'CITO_FLEX',
};

const COF_PAYMENT_PARAMS: CofPaymentParams = {
  requestId: 'REQ003',
  transactionId: 'TX-003',
  amount: 5,
  paymentToken: 'pwt-123',
  currency: 'USD',
};

beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe('linkAccount required fields (live docs)', () => {
  it('throws when ctid / tokenFlag / currency are missing', () => {
    const { domain } = makeCofDomain();
    const { ctid, ...noCtid } = LINK_ACCOUNT_PARAMS;
    const { tokenFlag, ...noFlag } = LINK_ACCOUNT_PARAMS;
    const { currency, ...noCurrency } = LINK_ACCOUNT_PARAMS;
    expect(() => domain.linkAccount(noCtid as LinkAccountParams)).toThrow(PayWayConfigError);
    expect(() => domain.linkAccount(noFlag as LinkAccountParams)).toThrow(PayWayConfigError);
    expect(() => domain.linkAccount(noCurrency as LinkAccountParams)).toThrow(PayWayConfigError);
  });

  it('warns when tokenFlag is outside the live-documented set but keeps it sendable', async () => {
    const { domain, calls } = makeCofDomain();
    await domain.linkAccount({ ...LINK_ACCOUNT_PARAMS, tokenFlag: 'CITO_FIX' });
    expect(calls[0].body.token_flag).toBe('CITO_FIX');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('outside the live-documented'));
  });

  it('does not warn for the live-documented flags', async () => {
    const { domain } = makeCofDomain();
    await domain.linkAccount(LINK_ACCOUNT_PARAMS);
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('linkCard continueSuccessUrl + required fields', () => {
  it('throws when ctid / tokenFlag are missing', () => {
    const { domain } = makeCofDomain();
    const { ctid, ...noCtid } = LINK_CARD_PARAMS;
    const { tokenFlag, ...noFlag } = LINK_CARD_PARAMS;
    expect(() => domain.linkCard(noCtid as LinkCardParams)).toThrow(PayWayConfigError);
    expect(() => domain.linkCard(noFlag as LinkCardParams)).toThrow(PayWayConfigError);
  });

  it('sends continue_success_url base64-encoded only when set', async () => {
    const { domain, calls } = makeCofDomain();
    await domain.linkCard(LINK_CARD_PARAMS);
    expect(calls[0].body.continue_success_url).toBeUndefined();

    await domain.linkCard({ ...LINK_CARD_PARAMS, continueSuccessUrl: 'https://example.com/done' });
    const sent = calls[1].body.continue_success_url as string;
    expect(sent).not.toContain('https://');
    expect(Buffer.from(sent, 'base64').toString('utf8')).toBe('https://example.com/done');
  });

  it('hash is append-compatible: unset continueSuccessUrl keeps the 10-field HMAC', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: { code: '00' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchSpy);
    const payway = new PayWay(TEST_CONFIG);
    await payway.credentialsOnFile.linkCard(LINK_CARD_PARAMS);
    const body = Object.fromEntries(new URLSearchParams(fetchSpy.mock.calls[0][1].body));
    const legacyFields = [
      'request_time',
      'merchant_id',
      'request_id',
      'ctid',
      'return_deeplink',
      'token_flag',
      'frequency',
      'return_url',
      'callback_url',
      'currency',
    ];
    const legacyHash = generateHmac(body, legacyFields, TEST_CONFIG.apiKey as string);
    expect(body.hash).toBe(legacyHash);
    vi.unstubAllGlobals();
  });
});

describe('cofPayment extended params (live docs 2026-08-31)', () => {
  it('hash is append-compatible: params absent keeps the 10-field HMAC', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: { code: '00' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchSpy);
    const payway = new PayWay(TEST_CONFIG);
    await payway.credentialsOnFile.payment(COF_PAYMENT_PARAMS);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    const legacyFields = [
      'request_time',
      'merchant_id',
      'request_id',
      'tran_id',
      'amount',
      'ctid',
      'pwt',
      'token_flag',
      'currency',
      'callback_url',
    ];
    const legacyHash = generateHmac(body, legacyFields, TEST_CONFIG.apiKey as string);
    expect(body.hash).toBe(legacyHash);
    vi.unstubAllGlobals();
  });

  it('encodes and sends the 10 new optional params', async () => {
    const { domain, calls } = makeCofDomain();
    await domain.payment({
      ...COF_PAYMENT_PARAMS,
      firstName: 'Dara',
      lastName: 'Sok',
      email: 'dara@example.com',
      phone: '+85512345678',
      purchaseType: 'pre-auth',
      items: [{ name: 'Item', quantity: 1, price: 5 }],
      returnParams: 'ref=7',
      payout: [{ acc: '000111222', amt: 1 }],
      customFields: { k: 'v' },
      shippingFee: 0.5,
    });
    const body = calls[0].body;
    expect(body.first_name).toBe('Dara');
    expect(body.last_name).toBe('Sok');
    expect(body.email).toBe('dara@example.com');
    expect(body.phone).toBe('+85512345678');
    expect(body.purchase_type).toBe('pre-auth');
    expect(typeof body.items).toBe('string');
    expect(body.return_params).toBe('ref=7');
    expect(typeof body.payout).toBe('string');
    expect(typeof body.custom_fields).toBe('string');
    expect(body.shipping_fee).toBe(0.5);
    expect(calls[0].hmacFields.slice(-10)).toEqual([
      'first_name',
      'last_name',
      'email',
      'phone',
      'purchase_type',
      'items',
      'return_params',
      'payout',
      'custom_fields',
      'shipping_fee',
    ]);
  });
});

describe('purchase subscription trio (live subscription operation)', () => {
  it('requires ctid when tokenFlag is set', () => {
    const payway = new PayWay(TEST_CONFIG);
    expect(() =>
      payway.checkout.createTransaction({
        transactionId: 'SUB-1',
        amount: 10,
        tokenFlag: 'CITR_FIX',
        frequency: '1M',
      }),
    ).toThrow(/ctid is required/);
  });

  it('requires frequency when tokenFlag=CITR_FIX and rejects other flags', () => {
    const payway = new PayWay(TEST_CONFIG);
    expect(() =>
      payway.checkout.createTransaction({
        transactionId: 'SUB-1',
        amount: 10,
        ctid: 'CTID-SUB',
        tokenFlag: 'CITR_FIX',
      }),
    ).toThrow(/frequency is required/);
    expect(() =>
      payway.checkout.createTransaction({
        transactionId: 'SUB-1',
        amount: 10,
        ctid: 'CTID-SUB',
        tokenFlag: 'CITO_FLEX' as unknown as 'CITR_FIX',
      }),
    ).toThrow(/only 'CITR_FIX'/);
  });

  it('rejects frequency without tokenFlag', () => {
    const payway = new PayWay(TEST_CONFIG);
    expect(() =>
      payway.checkout.createTransaction({
        transactionId: 'SUB-1',
        amount: 10,
        frequency: '1M',
      }),
    ).toThrow(/frequency requires tokenFlag/);
  });

  it('emits subscription fields and hash positions; hash append-compatible without them', () => {
    const payway = new PayWay(TEST_CONFIG);
    const base = { transactionId: 'SUB-1', amount: 10, currency: 'USD' as const };
    const plain = payway.checkout.createTransaction(base);

    // Append-compat: recomputing the legacy 24-field hash over the same
    // payload must equal the sent hash (token_flag/frequency hashed as '').
    const legacyFields = [
      'req_time',
      'merchant_id',
      'tran_id',
      'amount',
      'items',
      'shipping',
      'firstname',
      'lastname',
      'email',
      'phone',
      'type',
      'payment_option',
      'return_url',
      'cancel_url',
      'continue_success_url',
      'return_deeplink',
      'currency',
      'custom_fields',
      'return_params',
      'payout',
      'lifetime',
      'additional_params',
      'google_pay_token',
      'skip_success_page',
    ];
    expect(plain.hash).toBe(generateHmac(plain, legacyFields, TEST_CONFIG.apiKey));

    const sub = payway.checkout.createTransaction({
      ...base,
      ctid: 'CTID-SUB',
      tokenFlag: 'CITR_FIX',
      frequency: '2M',
      paymentOption: 'abapay_deeplink',
    });
    expect(sub.token_flag).toBe('CITR_FIX');
    expect(sub.frequency).toBe('2M');
    expect(sub.ctid).toBe('CTID-SUB');
    const withSub = generateHmac(
      sub,
      [...legacyFields, 'token_flag', 'frequency'],
      TEST_CONFIG.apiKey,
    );
    expect(sub.hash).toBe(withSub);
  });

  it('warns when subscription paymentOption is outside the documented set', () => {
    const payway = new PayWay(TEST_CONFIG);
    payway.checkout.createTransaction({
      transactionId: 'SUB-2',
      amount: 10,
      ctid: 'CTID-SUB',
      tokenFlag: 'CITR_FIX',
      frequency: '1W',
      paymentOption: 'abapay_khqr',
    });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('outside the documented set'));
  });

  it('escalates the subscription paymentOption advisory under strictValidation', () => {
    const payway = new PayWay(STRICT_CONFIG);
    expect(() =>
      payway.checkout.createTransaction({
        transactionId: 'SUB-3',
        amount: 10,
        ctid: 'CTID-SUB',
        tokenFlag: 'CITR_FIX',
        frequency: '1W',
        paymentOption: 'abapay_khqr',
      }),
    ).toThrow(PayWayConfigError);
  });
});
