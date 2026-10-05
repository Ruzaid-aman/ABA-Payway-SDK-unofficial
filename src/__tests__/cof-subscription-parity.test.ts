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
import { mockJsonResponse } from '../test/test-utils.js';
import type { CofPaymentParams, LinkAccountParams, LinkCardParams, PayWayConfig } from '../client.js';

const TEST_CONFIG = {
  merchantId: 'test-merchant-001',
  apiKey: 'test-api-key-secret',
  environment: 'sandbox' as const,
};

const STRICT_CONFIG = { ...TEST_CONFIG, strictValidation: true } as unknown as PayWayConfig;

function makeCofDomain(config: PayWayConfig = TEST_CONFIG as unknown as PayWayConfig) {
  const calls: Array<{
    path: string;
    body: Record<string, unknown>;
    hmacFields: string[];
    timeField?: string;
    contentType?: string;
  }> = [];
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

  it('hash uses the §16-verified live-doc order (merchant_id first)', async () => {
    const { domain, calls } = makeCofDomain();
    await domain.linkCard(LINK_CARD_PARAMS);
    expect(calls[0].hmacFields).toEqual([
      'merchant_id',
      'request_time',
      'ctid',
      'callback_url',
      'request_id',
      'token_flag',
      'frequency',
      'amount',
      'currency',
      'continue_success_url',
    ]);
    // amount is a hash position with no body field (live-doc quirk).
    expect(calls[0].body.amount).toBeUndefined();
  });
});

describe('cofPayment extended params (live docs 2026-08-31)', () => {
  it('hash uses the §16-verified live 19-field order; request_id is NOT sent', async () => {
    const { domain, calls } = makeCofDomain();
    await domain.payment(COF_PAYMENT_PARAMS);
    const body = calls[0].body as Record<string, string>;
    expect(calls[0].hmacFields).toEqual([
      'request_time',
      'merchant_id',
      'tran_id',
      'amount',
      'currency',
      'items',
      'ctid',
      'pwt',
      'first_name',
      'last_name',
      'email',
      'phone',
      'purchase_type',
      'callback_url',
      'custom_fields',
      'return_params',
      'payout',
      'token_flag',
      'shipping_fee',
    ]);
    expect(body.request_id).toBeUndefined();
  });

  it('encodes and sends the 10 new optional params', async () => {
    const { domain, calls } = makeCofDomain();
    await domain.payment({
      ...COF_PAYMENT_PARAMS,
      requestId: undefined,
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
    // Live order (SANDBOX-FINDINGS §17, 2026-09-05): the gateway signs ctid
    // between items and shipping on the subscription path — the live docs'
    // 26-field list omits it and is rejected with Wrong Hash.
    const withSub = generateHmac(
      sub,
      [...legacyFields.slice(0, 5), 'ctid', ...legacyFields.slice(5), 'token_flag', 'frequency'],
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

// ---------------------------------------------------------------------------
// purchase() NETWORK path — the SENT hash (audit D1).
//
// The local builder (createTransaction) already hashes over the live 27-field
// order (ctid signed after items per SANDBOX-FINDINGS §17), but purchase()
// used to pass its own legacy 24-field list to the
// injected request(), which UNCONDITIONALLY re-hashes (client.ts request()).
// Subscription purchases therefore SENT a hash computed without
// token_flag/frequency → gateway "Wrong Hash". These tests pin the hash that
// actually travels over the wire, stubbing global fetch like
// payment-link-image.test.ts does.
// ---------------------------------------------------------------------------

// Deliberate INDEPENDENT copy of the live 27-field purchase hash order
// (req_time … skip_success_page, ctid between items and shipping — the
// gateway signs ctid on the subscription path even though the live docs omit
// it, SANDBOX-FINDINGS §17 2026-09-05 — then the subscription additions
// token_flag + frequency). Do NOT import PURCHASE_HASH_FIELDS here: a
// regression in that constant must fail these assertions, not follow it.
const LIVE_PURCHASE_HASH_FIELDS = [
  'req_time',
  'merchant_id',
  'tran_id',
  'amount',
  'items',
  'ctid',
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
  'token_flag',
  'frequency',
];

// Deliberate INDEPENDENT copy of the legacy 24-field order (the live list
// minus ctid/token_flag/frequency) — used to pin append-compatibility.
const LEGACY_PURCHASE_HASH_FIELDS = LIVE_PURCHASE_HASH_FIELDS.filter(
  (field) => field !== 'ctid' && field !== 'token_flag' && field !== 'frequency',
);

const PURCHASE_SUCCESS_BODY = {
  status: { code: '00', message: 'Success' },
  qrString: '000201010212',
  abapay_deeplink: 'aba://mobile/pay',
};

describe('purchase() network path — sent hash', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let payway: PayWay;

  beforeEach(() => {
    fetchSpy = vi.fn();
    fetchSpy.mockResolvedValue(mockJsonResponse(PURCHASE_SUCCESS_BODY));
    vi.stubGlobal('fetch', fetchSpy);
    payway = new PayWay(TEST_CONFIG);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the subscription trio hashed over the live 27-field order', async () => {
    const response = await payway.checkout.purchase({
      transactionId: 'SUB-NET-1',
      amount: 9.99,
      currency: 'USD',
      returnUrl: 'https://example.com/return',
      ctid: 'CTID-SUB',
      tokenFlag: 'CITR_FIX',
      frequency: '1M',
    });
    expect(response).toEqual(PURCHASE_SUCCESS_BODY);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const sentBody = JSON.parse(String(fetchSpy.mock.calls[0][1].body)) as Record<string, unknown>;
    expect(sentBody.token_flag).toBe('CITR_FIX');
    expect(sentBody.frequency).toBe('1M');
    // The hash that actually left the machine must cover token_flag/frequency.
    expect(sentBody.hash).toBe(generateHmac(sentBody, LIVE_PURCHASE_HASH_FIELDS, TEST_CONFIG.apiKey));
  });

  it('sends a plain-purchase hash byte-identical to the legacy 24-field order', async () => {
    await payway.checkout.purchase({
      transactionId: 'PLAIN-NET-1',
      amount: 5,
      currency: 'USD',
      returnUrl: 'https://example.com/return',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const sentBody = JSON.parse(String(fetchSpy.mock.calls[0][1].body)) as Record<string, unknown>;
    expect(sentBody.token_flag).toBeUndefined();
    expect(sentBody.frequency).toBeUndefined();
    // Live order…
    expect(sentBody.hash).toBe(generateHmac(sentBody, LIVE_PURCHASE_HASH_FIELDS, TEST_CONFIG.apiKey));
    // …must remain append-compatible with the legacy 24-field order when the
    // subscription fields are unset (unset fields hash as '').
    expect(sentBody.hash).toBe(generateHmac(sentBody, LEGACY_PURCHASE_HASH_FIELDS, TEST_CONFIG.apiKey));
  });
});
