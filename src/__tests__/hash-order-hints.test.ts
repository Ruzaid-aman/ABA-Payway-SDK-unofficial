/**
 * Audit D3 drift-guard: the PayWaySignatureError "HMAC field order" hints in
 * client.ts (`HASH_ORDER_HINTS`) must match the field list each domain
 * ACTUALLY signs with.
 *
 * Two pinning strategies, by how the order is defined in the domains:
 * - Exported constants → direct equality against `FIELDS.join('.')`
 *   (purchase ↔ PURCHASE_HASH_FIELDS, linkCard ↔ LINK_CARD_HMAC_FIELDS,
 *   generateQr ↔ GENERATE_QR_HASH_FIELDS, and the merchant-auth default
 *   family ↔ MERCHANT_AUTH_DEFAULT_HASH_FIELDS).
 * - Inline lists in the domain call sites → request spies: construct the
 *   domain via its factory with a capturing `request`/`requestWithMerchantAuth`,
 *   invoke each method once with minimal valid params, and require the hint to
 *   equal the captured `hmacFields.join('.')`. For requestWithMerchantAuth
 *   calls that pass no override (refund, payment-link create/details), the
 *   effective list is MERCHANT_AUTH_DEFAULT_HASH_FIELDS.
 *
 * The test also snapshots the full key set of HASH_ORDER_HINTS, so adding a
 * new endpoint with a hash list but no hint entry forces a conscious update
 * here instead of silently falling back to the generic wrong-hash message.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HASH_ORDER_HINTS, MERCHANT_AUTH_DEFAULT_HASH_FIELDS, SELF_ACTIVATION_HASH_FIELDS, type PayWayConfig } from '../client.js';
import { ENDPOINTS } from '../constants.js';
import { createCredentialsOnFileDomain } from '../domains/credentials-on-file.js';
import { createCheckoutDomain, PURCHASE_HASH_FIELDS } from '../domains/checkout.js';
import { createKhqrDomain } from '../domains/khqr.js';
import { createPaymentLinkDomain } from '../domains/payment-link.js';
import { createPayoutDomain } from '../domains/payout.js';
import { createPreAuthDomain } from '../domains/pre-auth.js';
import { createQrDomain, GENERATE_QR_HASH_FIELDS, REQUEST_QR_HASH_FIELDS } from '../domains/qr.js';
import { LINK_CARD_HMAC_FIELDS } from '../domains/credentials-on-file.js';
import { generateTestRsaKeyPair } from '../test/test-utils.js';

const TEST_CONFIG = {
  merchantId: 'test-merchant-001',
  apiKey: 'test-api-key-secret',
  environment: 'sandbox' as const,
};

// ── Capturing spies ────────────────────────────────────────────────────────

type RequestCall = { path: string; hmacFields: string[] };
type MerchantAuthCall = { path: string; hmacFields?: string[] };

/**
 * Capturing stand-in for PayWay#request: records (path, hmacFields) per call.
 * The domain factories only need the first three positional args for these
 * minimal calls, so the extra optional params are left off the signature.
 */
function makeRequestSpy(): { spy: <T>(path: string, body: Record<string, unknown>, hmacFields: string[]) => Promise<T>; calls: RequestCall[] } {
  const calls: RequestCall[] = [];
  const spy = async <T>(path: string, _body: Record<string, unknown>, hmacFields: string[]): Promise<T> => {
    calls.push({ path, hmacFields });
    return { status: { code: '00' } } as T;
  };
  return { spy, calls };
}

/** Capturing stand-in for PayWay#requestWithMerchantAuth. */
function makeMerchantAuthSpy(): {
  spy: <T>(
    path: string,
    authPayload: Record<string, unknown>,
    options?: { hmacFields?: string[]; contentType?: string },
  ) => Promise<T>;
  calls: MerchantAuthCall[];
} {
  const calls: MerchantAuthCall[] = [];
  const spy = async <T>(
    path: string,
    _authPayload: Record<string, unknown>,
    options?: { hmacFields?: string[]; contentType?: string },
  ): Promise<T> => {
    calls.push({ path, hmacFields: options?.hmacFields });
    return { status: { code: '00' } } as T;
  };
  return { spy, calls };
}

/** The effective signed order for a merchant-auth call: override or the default. */
function effectiveMerchantAuthFields(call: MerchantAuthCall): string[] {
  return call.hmacFields ?? [...MERCHANT_AUTH_DEFAULT_HASH_FIELDS];
}

beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

// ── 1. Hints backed by exported constants ───────────────────────────────────

describe('HASH_ORDER_HINTS pinned to exported hash-field constants', () => {
  it('purchase hint equals PURCHASE_HASH_FIELDS (live 26-field order)', () => {
    expect(HASH_ORDER_HINTS[ENDPOINTS.purchase]).toBe(PURCHASE_HASH_FIELDS.join('.'));
  });

  it('linkCard hint equals LINK_CARD_HMAC_FIELDS', () => {
    expect(HASH_ORDER_HINTS[ENDPOINTS.linkCard]).toBe(LINK_CARD_HMAC_FIELDS.join('.'));
  });

  it('generateQr hint equals GENERATE_QR_HASH_FIELDS', () => {
    expect(HASH_ORDER_HINTS[ENDPOINTS.generateQr]).toBe(GENERATE_QR_HASH_FIELDS.join('.'));
  });

  it('requestQr hint equals REQUEST_QR_HASH_FIELDS', () => {
    expect(HASH_ORDER_HINTS[ENDPOINTS.requestQr]).toBe(REQUEST_QR_HASH_FIELDS.join('.'));
  });

  it('self-activation hints equal SELF_ACTIVATION_HASH_FIELDS (algorithm varies per endpoint, order does not)', () => {
    expect(HASH_ORDER_HINTS[ENDPOINTS.registerNewMerchant]).toBe(SELF_ACTIVATION_HASH_FIELDS.join('.'));
    expect(HASH_ORDER_HINTS[ENDPOINTS.getMerchantCredentialInfo]).toBe(SELF_ACTIVATION_HASH_FIELDS.join('.'));
    expect(HASH_ORDER_HINTS[ENDPOINTS.getMerchantInfo]).toBe(SELF_ACTIVATION_HASH_FIELDS.join('.'));
  });

  it('refund / payment-link / beneficiary hints equal MERCHANT_AUTH_DEFAULT_HASH_FIELDS', () => {
    // refund (checkout) and create/getDetails/void (payment-link) pass NO
    // hmacFields override — the effective signed order is the default.
    expect(HASH_ORDER_HINTS[ENDPOINTS.refund]).toBe(MERCHANT_AUTH_DEFAULT_HASH_FIELDS.join('.'));
    expect(HASH_ORDER_HINTS[ENDPOINTS.createPaymentLink]).toBe(MERCHANT_AUTH_DEFAULT_HASH_FIELDS.join('.'));
    expect(HASH_ORDER_HINTS[ENDPOINTS.getPaymentLinkDetails]).toBe(MERCHANT_AUTH_DEFAULT_HASH_FIELDS.join('.'));
    expect(HASH_ORDER_HINTS[ENDPOINTS.voidPaymentLink]).toBe(MERCHANT_AUTH_DEFAULT_HASH_FIELDS.join('.'));
    // add/updateBeneficiary DO pass an explicit two-field override.
    expect(HASH_ORDER_HINTS[ENDPOINTS.addBeneficiary]).toBe('request_time.merchant_auth');
    expect(HASH_ORDER_HINTS[ENDPOINTS.updateBeneficiaryStatus]).toBe('request_time.merchant_auth');
  });
});

// ── 2. Hints pinned via request spies (inline hash lists) ───────────────────

describe('HASH_ORDER_HINTS pinned to the captured hmacFields of each domain call', () => {
  it('checkout: check/close/detail/list/exchange hints match the captured orders', async () => {
    const { spy, calls } = makeRequestSpy();
    const authSpy = makeMerchantAuthSpy();
    const domain = createCheckoutDomain(
      TEST_CONFIG as PayWayConfig & { merchantId: string; apiKey: string },
      spy,
      authSpy.spy,
      'https://checkout-sandbox.payway.com.kh',
    );

    await domain.checkTransaction('TX-0001');
    await domain.closeTransaction('TX-0002');
    await domain.getTransactionDetail('TX-0003');
    await domain.getTransactionList({ fromDate: null, toDate: null, page: '1' });
    await domain.getExchangeRate();

    const byPath = new Map(calls.map((c) => [c.path, c.hmacFields.join('.')]));
    expect(HASH_ORDER_HINTS[ENDPOINTS.checkTransaction]).toBe(byPath.get(ENDPOINTS.checkTransaction));
    expect(HASH_ORDER_HINTS[ENDPOINTS.closeTransaction]).toBe(byPath.get(ENDPOINTS.closeTransaction));
    expect(HASH_ORDER_HINTS[ENDPOINTS.getTransactionDetail]).toBe(byPath.get(ENDPOINTS.getTransactionDetail));
    expect(HASH_ORDER_HINTS[ENDPOINTS.getTransactionList]).toBe(byPath.get(ENDPOINTS.getTransactionList));
    expect(HASH_ORDER_HINTS[ENDPOINTS.getExchangeRate]).toBe(byPath.get(ENDPOINTS.getExchangeRate));

    // purchase: the network path must pass PURCHASE_HASH_FIELDS to request().
    await domain.purchase({ transactionId: 'TX-PUR-1', amount: 5 });
    const purchaseCall = calls.find((c) => c.path === ENDPOINTS.purchase);
    expect(purchaseCall?.hmacFields.join('.')).toBe(PURCHASE_HASH_FIELDS.join('.'));
    expect(HASH_ORDER_HINTS[ENDPOINTS.purchase]).toBe(purchaseCall?.hmacFields.join('.'));

    // refund: merchant-auth WITHOUT an override → the default constant applies.
    await domain.refund('TX-REFUND-1', 1);
    const refundCall = authSpy.calls.find((c) => c.path === ENDPOINTS.refund);
    expect(refundCall?.hmacFields).toBeUndefined();
    expect(HASH_ORDER_HINTS[ENDPOINTS.refund]).toBe(effectiveMerchantAuthFields(refundCall!).join('.'));
  });

  it('credentials-on-file: linkAccount/linkCard/payment + token trio hints match the captured orders', async () => {
    const { spy, calls } = makeRequestSpy();
    const domain = createCredentialsOnFileDomain(TEST_CONFIG as PayWayConfig, spy);

    await domain.linkAccount({ requestId: 'REQ0001', ctid: 'CTID0001', tokenFlag: 'CITI_FLEX', currency: 'USD' });
    // frequency: D5's live-docs advisory warns without it — keep output clean.
    await domain.linkCard({ requestId: 'REQ0002', ctid: 'CTID0002', tokenFlag: 'CITI_FLEX', frequency: '1M' });
    await domain.payment({ transactionId: 'TX-COF-1', amount: 5, paymentToken: 'pwt-1', currency: 'USD' });
    await domain.renewToken({ requestId: 'REQ0003', ctid: 'CTID0003', paymentToken: 'pwt-2' });
    await domain.getTokenDetails({ requestId: 'REQ0004' });
    await domain.removeToken({ ctid: 'CTID0005', paymentToken: 'pwt-3' });

    const byPath = new Map(calls.map((c) => [c.path, c.hmacFields.join('.')]));
    expect(HASH_ORDER_HINTS[ENDPOINTS.linkAccount]).toBe(byPath.get(ENDPOINTS.linkAccount));
    expect(HASH_ORDER_HINTS[ENDPOINTS.linkCard]).toBe(byPath.get(ENDPOINTS.linkCard));
    expect(HASH_ORDER_HINTS[ENDPOINTS.payment]).toBe(byPath.get(ENDPOINTS.payment));
    expect(HASH_ORDER_HINTS[ENDPOINTS.renewToken]).toBe(byPath.get(ENDPOINTS.renewToken));
    expect(HASH_ORDER_HINTS[ENDPOINTS.getTokenDetails]).toBe(byPath.get(ENDPOINTS.getTokenDetails));
    expect(HASH_ORDER_HINTS[ENDPOINTS.removeToken]).toBe(byPath.get(ENDPOINTS.removeToken));

    // linkCard must also equal the exported constant (both paths agree).
    const linkCardCall = calls.find((c) => c.path === ENDPOINTS.linkCard);
    expect(linkCardCall?.hmacFields.join('.')).toBe(LINK_CARD_HMAC_FIELDS.join('.'));
  });

  it('qr domain: generateQr hint matches the captured order', async () => {
    const { spy, calls } = makeRequestSpy();
    const domain = createQrDomain(TEST_CONFIG as PayWayConfig, spy);
    await domain.generateQr({
      transactionId: 'qr-hint-1',
      amount: 6.12,
      paymentOption: 'abapay_khqr',
      callbackUrl: 'https://example.com/callback',
      currency: 'USD',
      lifetime: 360,
    });
    expect(HASH_ORDER_HINTS[ENDPOINTS.generateQr]).toBe(calls[0].hmacFields.join('.'));
    expect(calls[0].hmacFields.join('.')).toBe(GENERATE_QR_HASH_FIELDS.join('.'));
  });

  it('qr domain: requestQr hint matches the captured order', async () => {
    const { spy, calls } = makeRequestSpy();
    const domain = createQrDomain(TEST_CONFIG as PayWayConfig, spy);
    await domain.requestQr({
      transactionId: 'sb-hint-1',
      currency: 'USD',
      paymentOption: 'abapay',
      callbackUrl: 'https://example.com/soundbox',
    });
    expect(HASH_ORDER_HINTS[ENDPOINTS.requestQr]).toBe(calls[0].hmacFields.join('.'));
    expect(calls[0].hmacFields.join('.')).toBe(REQUEST_QR_HASH_FIELDS.join('.'));
  });

  it('khqr domain: getTransactionsByMerchantRef hint matches the captured order', async () => {
    const { spy, calls } = makeRequestSpy();
    const domain = createKhqrDomain(TEST_CONFIG as PayWayConfig, spy);
    await domain.getTransactionsByMerchantRef('mc-ref-1');
    expect(HASH_ORDER_HINTS[ENDPOINTS.getTransactionsByMerchantRef]).toBe(calls[0].hmacFields.join('.'));
  });

  it('pre-auth: complete (incl. payout variant) and cancel hints match the captured orders', async () => {
    const { spy, calls } = makeMerchantAuthSpy();
    const domain = createPreAuthDomain(TEST_CONFIG as PayWayConfig, spy);

    await domain.complete('TX-PA-1', 5);
    await domain.completeWithPayout('TX-PA-2', 5, [{ acc: '500000001', amt: 5 }]);
    await domain.cancel('TX-PA-3');

    const completeCalls = calls.filter((c) => c.path === ENDPOINTS.completePreAuth);
    expect(completeCalls).toHaveLength(2);
    expect(HASH_ORDER_HINTS[ENDPOINTS.completePreAuth]).toBe(effectiveMerchantAuthFields(completeCalls[0]).join('.'));
    expect(HASH_ORDER_HINTS[ENDPOINTS.cancelPreAuth]).toBe(effectiveMerchantAuthFields(calls[2]).join('.'));
  });

  it('payout: direct payout and both beneficiary hints match the captured orders', async () => {
    const requestSpy = makeRequestSpy();
    const authSpy = makeMerchantAuthSpy();
    const { publicKey } = generateTestRsaKeyPair();
    const domain = createPayoutDomain(
      { ...TEST_CONFIG, publicKeyPem: publicKey } as PayWayConfig,
      requestSpy.spy,
      authSpy.spy,
    );

    await domain.payout({
      transactionId: 'PO-1',
      amount: 5,
      currency: 'USD',
      beneficiaries: [{ account: '500000001', amount: 5 }],
    });
    expect(HASH_ORDER_HINTS[ENDPOINTS.payout]).toBe(requestSpy.calls[0].hmacFields.join('.'));

    await domain.addBeneficiary({ payee: '500000001' });
    await domain.updateBeneficiaryStatus({ payee: '500000001', status: 1 });
    const addCall = authSpy.calls.find((c) => c.path === ENDPOINTS.addBeneficiary);
    const updateCall = authSpy.calls.find((c) => c.path === ENDPOINTS.updateBeneficiaryStatus);
    expect(HASH_ORDER_HINTS[ENDPOINTS.addBeneficiary]).toBe(effectiveMerchantAuthFields(addCall!).join('.'));
    expect(HASH_ORDER_HINTS[ENDPOINTS.updateBeneficiaryStatus]).toBe(effectiveMerchantAuthFields(updateCall!).join('.'));
  });

  it('payment-link: create, getDetails and void pass NO hmacFields override → default applies', async () => {
    const { spy, calls } = makeMerchantAuthSpy();
    const domain = createPaymentLinkDomain(TEST_CONFIG as PayWayConfig, spy);

    await domain.create({
      title: 'T',
      amount: 1.5,
      merchantRefNo: 'r1',
      returnUrl: 'https://example.com/return',
    });
    await domain.getDetails('pl-1');
    await domain.void('pl-1');

    expect(calls[0].hmacFields).toBeUndefined();
    expect(calls[1].hmacFields).toBeUndefined();
    expect(calls[2].hmacFields).toBeUndefined();
    expect(HASH_ORDER_HINTS[ENDPOINTS.createPaymentLink]).toBe(effectiveMerchantAuthFields(calls[0]).join('.'));
    expect(HASH_ORDER_HINTS[ENDPOINTS.getPaymentLinkDetails]).toBe(effectiveMerchantAuthFields(calls[1]).join('.'));
    expect(HASH_ORDER_HINTS[ENDPOINTS.voidPaymentLink]).toBe(effectiveMerchantAuthFields(calls[2]).join('.'));
  });
});

// ── 3. Structural guards ────────────────────────────────────────────────────

describe('HASH_ORDER_HINTS structural guards', () => {
  it('every key is a real ENDPOINTS value', () => {
    const endpointValues = Object.values(ENDPOINTS);
    for (const key of Object.keys(HASH_ORDER_HINTS)) {
      expect(endpointValues.includes(key as (typeof endpointValues)[number]), `unknown endpoint key: ${key}`).toBe(true);
    }
  });

  it('every hint is a non-empty, space-free, dot-joined field list', () => {
    for (const [key, hint] of Object.entries(HASH_ORDER_HINTS)) {
      expect(hint.length, `hint for ${key} must be non-empty`).toBeGreaterThan(0);
      expect(hint.includes(' '), `hint for ${key} must not contain spaces (got: "${hint}")`).toBe(false);
      // At least two dot-joined fields (every endpoint hashes ≥ 2 fields).
      const fields = hint.split('.');
      expect(fields.length, `hint for ${key} must be dot-joined field names`).toBeGreaterThanOrEqual(2);
      for (const field of fields) {
        expect(/^[a-z][a-z0-9_]*$/.test(field), `hint for ${key} has a garbled field "${field}"`).toBe(true);
      }
    }
  });

  it('covers exactly the expected endpoint set (snapshot — extend consciously)', () => {
    // Every endpoint whose request carries an HMAC hash list must have a hint
    // here. Adding a new hashed endpoint without a hint entry (or vice versa)
    // fails this snapshot and forces a conscious update.
    expect(Object.keys(HASH_ORDER_HINTS).sort()).toEqual(
      [
        ENDPOINTS.purchase,
        ENDPOINTS.checkTransaction,
        ENDPOINTS.closeTransaction,
        ENDPOINTS.getTransactionDetail,
        ENDPOINTS.getTransactionList,
        ENDPOINTS.getTransactionsByMerchantRef,
        ENDPOINTS.getExchangeRate,
        ENDPOINTS.refund,
        ENDPOINTS.linkAccount,
        ENDPOINTS.linkCard,
        ENDPOINTS.payment,
        ENDPOINTS.renewToken,
        ENDPOINTS.getTokenDetails,
        ENDPOINTS.removeToken,
        ENDPOINTS.generateQr,
        ENDPOINTS.requestQr,
        ENDPOINTS.registerNewMerchant,
        ENDPOINTS.getMerchantCredentialInfo,
        ENDPOINTS.getMerchantInfo,
        ENDPOINTS.createPaymentLink,
        ENDPOINTS.getPaymentLinkDetails,
        ENDPOINTS.voidPaymentLink,
        ENDPOINTS.completePreAuth,
        ENDPOINTS.cancelPreAuth,
        ENDPOINTS.payout,
        ENDPOINTS.addBeneficiary,
        ENDPOINTS.updateBeneficiaryStatus,
      ]
        .sort(),
    );
  });
});
