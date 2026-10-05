/**
 * Golden HMAC test-vector generator (audit DX-TEST-001,
 * docs/project/2026-10-05-dx-platform-audit-pass2.md §27).
 *
 * Drives the REAL signing/canonicalization code — the domain factories with
 * their live validators and payload builders (the same request-spy pattern as
 * src/__tests__/hash-order-hints.test.ts) and `generateHmac` from src/auth.ts —
 * with FIXED inputs and a FIXED test key, and writes one JSON file per vector
 * under fixtures/vectors/hmac/ plus an INDEX.json manifest.
 *
 * What each vector pins:
 * - the exact field order the operation signs with (captured from the live
 *   domain call, cross-checkable against the *_HASH_FIELDS/HMAC_FIELDS export
 *   named in `hashFieldsFamily` when there is one);
 * - the canonicalization/coercion of every value that reaches the preimage
 *   (base64-encoding of URLs/objects, amount formatting, boolean/object
 *   String() coercion, lifetime flooring, empty-position rule);
 * - the exact HMAC digest for the fixed key (base64 sha512 everywhere except
 *   the payout endpoint, which is the SDK's only HEX-encoded hash — the PO-003
 *   pin — and the self-activation trio, which signs SHA256 except
 *   get-mc-credential-info's SHA512 per the spec's own inconsistency).
 *
 * Determinism: every input is fixed — no wall clock, no randomness in the
 * emitted bytes. The three PKCS1-RSA outputs (merchant_auth, request_data,
 * payout beneficiaries) are randomized by the crypto layer on every call, so
 * they are pinned as fixed sentinels recorded in `normalization`; RSA
 * encryption itself is behaviour-pinned separately from these HMAC vectors.
 * Same inputs → byte-identical fixtures, proven by:
 *
 *     npx tsx scripts/generate/gen-golden-vectors.ts --check
 *
 * Intentional signing change? Run without --check, review the diff, and
 * commit fixtures + code together (append-only policy, §27.3 #1).
 *
 * The key is the repo's standard test fixture key (see keyAlias below); it is
 * NOT a credential and never appears in the fixtures — only its alias does.
 *
 * Direction of truth (one way only): the live signing code -> the fixtures.
 * Never edit an expectedHash by hand.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateHmac } from '../../src/auth.js';
import { MERCHANT_AUTH_DEFAULT_HASH_FIELDS, type PayWayConfig, SELF_ACTIVATION_HASH_FIELDS } from '../../src/client.js';
import { createCheckoutDomain, PURCHASE_HASH_FIELDS } from '../../src/domains/checkout.js';
import { createCredentialsOnFileDomain, LINK_CARD_HMAC_FIELDS } from '../../src/domains/credentials-on-file.js';
import { createKhqrDomain } from '../../src/domains/khqr.js';
import { createPaymentLinkDomain } from '../../src/domains/payment-link.js';
import { createPayoutDomain } from '../../src/domains/payout.js';
import { createPreAuthDomain } from '../../src/domains/pre-auth.js';
import { createQrDomain, GENERATE_QR_HASH_FIELDS, REQUEST_QR_HASH_FIELDS } from '../../src/domains/qr.js';
import { createSelfActivationDomain } from '../../src/domains/self-activation.js';
import { generateTestRsaKeyPair } from '../../src/test/test-utils.js';

// ── Fixed inputs (the whole point: nothing here may read .env or the clock) ──

/** The repo's standard TEST fixture key (src/__tests__/cli.test.ts) — never a real credential. */
export const GOLDEN_TEST_API_KEY = 'test-api-key-123456789012';
export const GOLDEN_KEY_ALIAS = 'golden-vector-test-key';
export const FIXED_MERCHANT_ID = 'TESTMID';
export const FIXED_PARTNER_ID = 'TESTPARTNER';
/** Fixed UTC request time stamped into every fixture (2026-01-01T00:00:00Z). */
export const FIXED_REQUEST_TIME = '20260101000000';

/**
 * PKCS1 RSA encryption is randomized per call, so the encrypted blobs that
 * feed a preimage are pinned as fixed sentinels. The exact sentinel value is
 * part of the canonical payload, so the pinned hash stays meaningful: it is
 * the HMAC the gateway would receive for THAT blob value.
 */
export const MERCHANT_AUTH_SENTINEL = 'golden-vector-rsa-merchant-auth-sentinel';
export const REQUEST_DATA_SENTINEL = 'golden-vector-rsa-request-data-sentinel';
export const BENEFICIARIES_SENTINEL = 'golden-vector-rsa-beneficiaries-sentinel';

const FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures/vectors/hmac');
const INDEX_FILE = path.join(FIXTURES_DIR, 'INDEX.json');
const INDEX_SCHEMA = 'payway-golden-vectors-index/v1';

/**
 * Generation-time guard: the captured field list for a named-family vector
 * must equal the exported constant it claims to pin (fail fast at generation
 * instead of shipping a mislabeled fixture).
 */
function assertSameFields(actual: string[], expected: readonly string[], label: string): void {
  if (actual.join('.') !== expected.join('.')) {
    throw new Error(`${label}: captured field order drifted from the exported constant`);
  }
}

const GOLDEN_CONFIG = {
  merchantId: FIXED_MERCHANT_ID,
  apiKey: GOLDEN_TEST_API_KEY,
  environment: 'sandbox',
} as PayWayConfig & { merchantId: string; apiKey: string };

const PROVENANCE = {
  generatedBy: 'scripts/generate/gen-golden-vectors.ts driving src/auth.ts generateHmac + the live domain factories',
  // §27.3 #3: these vectors pin THIS repository's canonicalization behaviour
  // (orders already sandbox/spec-verified in the domain sources); they are
  // self-referential by design, not external gateway truths.
  verifiedAgainst: 'self-referential — behaviour-pinning vector (see audit §27.3 #3)',
};

// ── Capture machinery (domain factories with their live request fns spied) ──

interface CapturedRequest {
  path: string;
  body: Record<string, unknown>;
  hmacFields: string[];
  timeFieldName: 'req_time' | 'request_time';
  hashEncoding?: 'base64' | 'hex';
}

type RequestFn = <TResponse>(
  path: string,
  body: Record<string, unknown>,
  hmacFields: string[],
  timeFieldName?: 'req_time' | 'request_time',
  contentType?: 'application/json' | 'application/x-www-form-urlencoded',
  hashEncoding?: 'base64' | 'hex',
  fetchOptions?: { retry?: 'transient' | 'none' },
  callOptions?: unknown,
) => Promise<TResponse>;

function makeRequestSpy(): { request: RequestFn; calls: CapturedRequest[] } {
  const calls: CapturedRequest[] = [];
  const request = (async <TResponse>(
    path: string,
    body: Record<string, unknown>,
    hmacFields: string[],
    timeFieldName: 'req_time' | 'request_time' = 'req_time',
    _contentType?: 'application/json' | 'application/x-www-form-urlencoded',
    hashEncoding?: 'base64' | 'hex',
  ): Promise<TResponse> => {
    calls.push({ path, body, hmacFields, timeFieldName, hashEncoding });
    return { status: { code: '00' } } as TResponse;
  }) as RequestFn;
  return { request, calls };
}

interface CapturedMerchantAuth {
  path: string;
  authPayload: Record<string, unknown>;
  hmacFields?: string[];
}

type MerchantAuthFn = <TResponse>(
  path: string,
  authPayload: Record<string, unknown>,
  options?: {
    hmacFields?: string[];
    contentType?: 'application/json' | 'application/x-www-form-urlencoded';
    callOptions?: unknown;
  },
) => Promise<TResponse>;

function makeMerchantAuthSpy(): { requestWithMerchantAuth: MerchantAuthFn; calls: CapturedMerchantAuth[] } {
  const calls: CapturedMerchantAuth[] = [];
  const requestWithMerchantAuth = (async <TResponse>(
    path: string,
    authPayload: Record<string, unknown>,
    options?: { hmacFields?: string[] },
  ): Promise<TResponse> => {
    calls.push({ path, authPayload, hmacFields: options?.hmacFields });
    return { status: { code: '00' } } as TResponse;
  }) as MerchantAuthFn;
  return { requestWithMerchantAuth, calls };
}

interface CapturedPartner {
  path: string;
  requestDataPayload: Record<string, unknown>;
  hashAlgorithm: 'sha256' | 'sha512';
  bodyExtras?: Record<string, unknown>;
}

type PartnerFn = <TResponse>(
  path: string,
  requestDataPayload: Record<string, unknown>,
  options?: {
    hashAlgorithm?: 'sha256' | 'sha512';
    bodyExtras?: Record<string, unknown>;
    requestTime?: string;
    callOptions?: unknown;
  },
) => Promise<TResponse>;

function makePartnerSpy(): { partnerRequest: PartnerFn; calls: CapturedPartner[] } {
  const calls: CapturedPartner[] = [];
  const partnerRequest = (async <TResponse>(
    path: string,
    requestDataPayload: Record<string, unknown>,
    options?: { hashAlgorithm?: 'sha256' | 'sha512'; bodyExtras?: Record<string, unknown> },
  ): Promise<TResponse> => {
    calls.push({
      path,
      requestDataPayload,
      hashAlgorithm: options?.hashAlgorithm ?? 'sha256',
      bodyExtras: options?.bodyExtras,
    });
    return { status: { code: '00' } } as TResponse;
  }) as PartnerFn;
  return { partnerRequest, calls };
}

// ── Vector model + composition (mirrors the client.ts request() contracts) ──

export interface GoldenVector {
  vectorId: string;
  operation: string;
  endpoint: string;
  description: string;
  /** Name of the *_HASH_FIELDS/HMAC_FIELDS export this vector pins, or 'inline:<endpoint key>'. */
  hashFieldsFamily: string;
  fieldOrder: string[];
  fieldOrderSource: string;
  hashAlgorithm: 'sha512' | 'sha256';
  hashEncoding: 'base64' | 'hex';
  keyAlias: typeof GOLDEN_KEY_ALIAS;
  /** The exact body the hash is computed over (preimage inputs derivable via fieldOrder). */
  canonicalPayload: Record<string, unknown>;
  /** canonicalPayload values concatenated in fieldOrder — the literal HMAC preimage. */
  preimage: string;
  preimageSha256: string;
  expectedHash: string;
  normalization: Array<{ field: string; rule: string; note?: string }>;
  /** Deterministic context that is NOT hashed (e.g. the merchant_auth plaintext). */
  context?: Record<string, unknown>;
  provenance: { generatedBy: string; verifiedAgainst: string };
}

function buildPreimage(payload: Record<string, unknown>, fieldOrder: string[]): string {
  // Mirrors generateHmac's canonicalization (sorted only by the GIVEN order):
  // undefined/null -> '', everything else String().
  return fieldOrder
    .map((field) => {
      const val = payload[field];
      if (val === undefined || val === null) return '';
      return String(val);
    })
    .join('');
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

const RSA_SENTINEL_NORMALIZATION = {
  field: 'merchant_auth',
  rule: 'GOLDEN-RSA-SENTINEL',
  note: 'PKCS1 RSA encryption is randomized per call; the encrypted blob is pinned as a fixed sentinel so the HMAC composition is deterministic',
};

/** Compose + hash for the PayWay#request path (client.ts request(), fixed time). */
function requestPathVector(
  id: string,
  operation: string,
  description: string,
  capture: CapturedRequest,
  family: string,
  fieldOrderSource: string,
  extraNormalization: GoldenVector['normalization'] = [],
  context?: Record<string, unknown>,
): GoldenVector {
  const fullBody: Record<string, unknown> = { ...capture.body, merchant_id: FIXED_MERCHANT_ID };
  delete fullBody.hash; // the locally-built hash is overwritten by request(); it is never a preimage input
  const timeField = capture.timeFieldName ?? 'req_time';
  const normalization = [...extraNormalization];
  if (fullBody[timeField] !== undefined && fullBody[timeField] !== FIXED_REQUEST_TIME) {
    normalization.push({
      field: timeField,
      rule: 'GOLDEN-FIXED-TIME',
      note: 'run wall-clock value replaced by the fixed golden request time',
    });
  }
  fullBody[timeField] = FIXED_REQUEST_TIME;

  const encoding = capture.hashEncoding ?? 'base64';
  const preimage = buildPreimage(fullBody, capture.hmacFields);
  return {
    vectorId: id,
    operation,
    endpoint: capture.path,
    description,
    hashFieldsFamily: family,
    fieldOrder: [...capture.hmacFields],
    fieldOrderSource,
    hashAlgorithm: 'sha512',
    hashEncoding: encoding,
    keyAlias: GOLDEN_KEY_ALIAS,
    canonicalPayload: fullBody,
    preimage,
    preimageSha256: sha256Hex(preimage),
    expectedHash: generateHmac(fullBody, capture.hmacFields, GOLDEN_TEST_API_KEY, encoding),
    normalization,
    context,
    provenance: PROVENANCE,
  };
}

/** Compose + hash for the requestWithMerchantAuth path (fixed sentinel merchant_auth). */
function merchantAuthVector(
  id: string,
  operation: string,
  description: string,
  capture: CapturedMerchantAuth,
  family: string,
  fieldOrderSource: string,
): GoldenVector {
  const canonicalPayload: Record<string, unknown> = {
    merchant_id: FIXED_MERCHANT_ID,
    merchant_auth: MERCHANT_AUTH_SENTINEL,
    request_time: FIXED_REQUEST_TIME,
  };
  const fieldOrder = capture.hmacFields ?? [...MERCHANT_AUTH_DEFAULT_HASH_FIELDS];
  const preimage = buildPreimage(canonicalPayload, fieldOrder);
  return {
    vectorId: id,
    operation,
    endpoint: capture.path,
    description,
    hashFieldsFamily: family,
    fieldOrder: [...fieldOrder],
    fieldOrderSource,
    hashAlgorithm: 'sha512',
    hashEncoding: 'base64',
    keyAlias: GOLDEN_KEY_ALIAS,
    canonicalPayload,
    preimage,
    preimageSha256: sha256Hex(preimage),
    expectedHash: generateHmac(canonicalPayload, fieldOrder, GOLDEN_TEST_API_KEY),
    normalization: [RSA_SENTINEL_NORMALIZATION],
    context: { merchantAuthPayload: capture.authPayload },
    provenance: PROVENANCE,
  };
}

/** Compose + hash for the requestWithPartnerAuth path (fixed sentinel request_data). */
function partnerVector(
  id: string,
  operation: string,
  description: string,
  capture: CapturedPartner,
  algorithm: 'sha256' | 'sha512',
): GoldenVector {
  const canonicalPayload: Record<string, unknown> = {
    request_time: FIXED_REQUEST_TIME,
    partner_id: FIXED_PARTNER_ID,
    request_data: REQUEST_DATA_SENTINEL,
    ...(capture.bodyExtras ?? {}),
  };
  const fieldOrder = [...SELF_ACTIVATION_HASH_FIELDS];
  const preimage = buildPreimage(canonicalPayload, fieldOrder);
  return {
    vectorId: id,
    operation,
    endpoint: capture.path,
    description,
    hashFieldsFamily: 'SELF_ACTIVATION_HASH_FIELDS',
    fieldOrder,
    fieldOrderSource: 'repository export SELF_ACTIVATION_HASH_FIELDS (src/client.ts; spec-derived, NOT live-verified)',
    hashAlgorithm: algorithm,
    hashEncoding: 'base64',
    keyAlias: GOLDEN_KEY_ALIAS,
    canonicalPayload,
    preimage,
    preimageSha256: sha256Hex(preimage),
    expectedHash: generateHmac(canonicalPayload, fieldOrder, GOLDEN_TEST_API_KEY, 'base64', algorithm),
    normalization: [{ ...RSA_SENTINEL_NORMALIZATION, field: 'request_data' }],
    context: { requestDataPayload: capture.requestDataPayload },
    provenance: PROVENANCE,
  };
}

// ── The vector set ──────────────────────────────────────────────────────────

function buildVectors(): GoldenVector[] {
  const vectors: GoldenVector[] = [];

  // ── Purchase family (PURCHASE_HASH_FIELDS) via the checkout domain ──
  {
    // Full purchase: every URL/object field rides the encodeBase64IfNeeded
    // path, payout uses the purchase-path {acc, amt} keys, google_pay_token
    // and additional_params fill their tail positions.
    const requestSpy = makeRequestSpy();
    const purchaseCheckout = createCheckoutDomain(
      GOLDEN_CONFIG,
      requestSpy.request,
      makeMerchantAuthSpy().requestWithMerchantAuth,
    );
    purchaseCheckout.purchase({
      transactionId: 'GV-TXN-PUR-1',
      amount: 12.34,
      currency: 'USD',
      firstname: 'Sokha',
      lastname: 'Golden',
      email: 'golden.vector@example.com',
      phone: '+855-92-000-000',
      paymentOption: 'abapay_khqr_deeplink',
      items: '[{"name":"Golden item","qty":1}]',
      shipping: 1.5,
      returnUrl: 'https://example.com/return',
      cancelUrl: 'https://example.com/cancel',
      continueSuccessUrl: 'https://example.com/done',
      returnDeeplink: 'abamobilebank://ababank.com?type=payway&qrcode=GV',
      customFields: '{"campaign":"golden"}',
      returnParams: { order: 'GV-1' },
      payout: [{ acc: '500000001', amt: 12.34 }],
      additionalParams: { note: 'golden' },
      googlePayToken: 'GOLDEN-GPAY-TOKEN-0001',
      lifetime: 30,
    });
    vectors.push(
      requestPathVector(
        'hmac-purchase-001',
        'checkout.purchase',
        'Fully populated purchase — base64-encoded URLs/objects (return_url, cancel_url, continue_success_url, items, payout {acc,amt}, return_params, additional_params), raw return_deeplink scheme, google_pay_token tail, formatted amount 12.34',
        requestSpy.calls[0],
        'PURCHASE_HASH_FIELDS',
        'repository export PURCHASE_HASH_FIELDS (src/domains/checkout.ts; live 27-field order, ctid after items, sandbox-verified 2026-09-05)',
      ),
    );

    // Minimal purchase — the empty-position rule: every omitted optional
    // hashes as '' and must vanish under concatenation.
    const minimalSpy = makeRequestSpy();
    const minimalCheckout = createCheckoutDomain(
      GOLDEN_CONFIG,
      minimalSpy.request,
      makeMerchantAuthSpy().requestWithMerchantAuth,
    );
    minimalCheckout.purchase({ transactionId: 'GV-TXN-PUR-2', amount: 0.05, currency: 'USD' });
    vectors.push(
      requestPathVector(
        'hmac-purchase-002',
        'checkout.purchase',
        'Minimal purchase (transactionId + amount + currency only) — pins the empty-position rule: 20 of 27 fields hash as empty strings and the hash must equal the short-order hash for plain purchases',
        minimalSpy.calls[0],
        'PURCHASE_HASH_FIELDS',
        'repository export PURCHASE_HASH_FIELDS (src/domains/checkout.ts; live 27-field order, ctid after items, sandbox-verified 2026-09-05)',
      ),
    );

    // Subscription registration — ctid position after items + token_flag/frequency tail.
    const subSpy = makeRequestSpy();
    const subCheckout = createCheckoutDomain(
      GOLDEN_CONFIG,
      subSpy.request,
      makeMerchantAuthSpy().requestWithMerchantAuth,
    );
    subCheckout.purchase({
      transactionId: 'GV-TXN-SUB-1',
      amount: 9.99,
      currency: 'USD',
      paymentOption: 'cards',
      returnUrl: 'https://example.com/return',
      ctid: 'CTIDGV0001',
      tokenFlag: 'CITR_FIX',
      frequency: '1M',
    });
    vectors.push(
      requestPathVector(
        'hmac-purchase-003',
        'checkout.purchase',
        'Subscription registration — ctid hashed AFTER items (sandbox-verified position) plus the token_flag/frequency tail (CITR_FIX + 1M)',
        subSpy.calls[0],
        'PURCHASE_HASH_FIELDS',
        'repository export PURCHASE_HASH_FIELDS (src/domains/checkout.ts; live 27-field order, ctid after items, sandbox-verified 2026-09-05)',
      ),
    );

    // Unicode payer names — UTF-8 bytes through the HMAC.
    const uniSpy = makeRequestSpy();
    const uniCheckout = createCheckoutDomain(
      GOLDEN_CONFIG,
      uniSpy.request,
      makeMerchantAuthSpy().requestWithMerchantAuth,
    );
    uniCheckout.purchase({
      transactionId: 'GV-TXN-UNI-1',
      amount: 1.23,
      currency: 'USD',
      firstname: 'សុខា',
      lastname: 'Müller-Ñoño',
      email: 'unicode@example.com',
    });
    vectors.push(
      requestPathVector(
        'hmac-purchase-004',
        'checkout.purchase',
        'Unicode payer names (Khmer + Latin diacritics) — pins UTF-8 byte handling in the concatenated preimage',
        uniSpy.calls[0],
        'PURCHASE_HASH_FIELDS',
        'repository export PURCHASE_HASH_FIELDS (src/domains/checkout.ts; live 27-field order, ctid after items, sandbox-verified 2026-09-05)',
      ),
    );

    // Numeric amount + boolean coercion.
    const coerSpy = makeRequestSpy();
    const coerCheckout = createCheckoutDomain(
      GOLDEN_CONFIG,
      coerSpy.request,
      makeMerchantAuthSpy().requestWithMerchantAuth,
    );
    coerCheckout.purchase({ transactionId: 'GV-TXN-COR-1', amount: 7, currency: 'USD', skipSuccessPage: true });
    vectors.push(
      requestPathVector(
        'hmac-purchase-005',
        'checkout.purchase',
        'Coercion pin — numeric amount 7 formatted to "7.00" by formatAmount and boolean skip_success_page String()-coerced to "true" in the preimage',
        coerSpy.calls[0],
        'PURCHASE_HASH_FIELDS',
        'repository export PURCHASE_HASH_FIELDS (src/domains/checkout.ts; live 27-field order, ctid after items, sandbox-verified 2026-09-05)',
      ),
    );
  }

  // N-11 pin: an object passed RAW into a hashed position does NOT throw —
  // generateHmac String()-coerces it to "[object Object]". Pinning current
  // behaviour so the audit's N-11 fix (type guard + throw) is a deliberate,
  // vector-visible change, never an accident.
  {
    const payload: Record<string, unknown> = {
      req_time: FIXED_REQUEST_TIME,
      merchant_id: FIXED_MERCHANT_ID,
      tran_id: 'GV-TXN-OBJ-1',
      amount: '3.00',
      items: { raw: 'object-passed-without-encodeBase64IfNeeded' },
    };
    const preimage = buildPreimage(payload, [...PURCHASE_HASH_FIELDS]);
    vectors.push({
      vectorId: 'hmac-purchase-006',
      operation: 'auth.generateHmac',
      endpoint: 'n/a (canonicalization unit — audit N-11 hazard pin)',
      description:
        'N-11 pin: a raw JS object in a hashed position is String()-coerced to "[object Object]" instead of throwing — current behaviour pinned deliberately so the N-11 type-guard fix shows up as a vector change',
      hashFieldsFamily: 'PURCHASE_HASH_FIELDS',
      fieldOrder: [...PURCHASE_HASH_FIELDS],
      fieldOrderSource: 'repository export PURCHASE_HASH_FIELDS (src/domains/checkout.ts)',
      hashAlgorithm: 'sha512',
      hashEncoding: 'base64',
      keyAlias: GOLDEN_KEY_ALIAS,
      canonicalPayload: payload,
      preimage,
      preimageSha256: sha256Hex(preimage),
      expectedHash: generateHmac(payload, [...PURCHASE_HASH_FIELDS], GOLDEN_TEST_API_KEY),
      normalization: [],
      provenance: PROVENANCE,
    });
  }

  // ── QR families via the qr domain ──
  {
    const minSpy = makeRequestSpy();
    const minQr = createQrDomain(GOLDEN_CONFIG, minSpy.request);
    minQr.generateQr({
      transactionId: 'GV-TXN-QR-1',
      amount: 6.12,
      currency: 'USD',
      callbackUrl: 'https://example.com/payway/callback',
      requestTime: FIXED_REQUEST_TIME,
    });
    assertSameFields(
      minSpy.calls[0].hmacFields,
      GENERATE_QR_HASH_FIELDS,
      'hmac-generate-qr-001 captured order vs GENERATE_QR_HASH_FIELDS',
    );
    vectors.push(
      requestPathVector(
        'hmac-generate-qr-001',
        'qr.generateQr',
        'Minimal generate-qr — the official 19-field order with all optionals unset (empty-position rule); purchase_type/payment_option/qr_image_template defaults present, lifetime absent',
        minSpy.calls[0],
        'GENERATE_QR_HASH_FIELDS',
        'repository export GENERATE_QR_HASH_FIELDS (src/domains/qr.ts; official developer.payway.com.kh qr-api order)',
      ),
    );

    const fullSpy = makeRequestSpy();
    const fullQr = createQrDomain(GOLDEN_CONFIG, fullSpy.request);
    fullQr.generateQr({
      transactionId: 'GV-TXN-QR-2',
      amount: 6.12,
      currency: 'USD',
      callbackUrl: 'https://example.com/payway/callback',
      firstName: 'សុខា',
      lastName: 'Müller',
      email: 'golden.vector@example.com',
      phone: '+855-92-000-000',
      purchaseType: 'purchase',
      paymentOption: 'abapay_khqr',
      items: [{ name: 'Golden widget', quantity: 2, price: 3.06 }],
      customFields: '{"campaign":"golden"}',
      returnParams: { inv: 'GV-QR-1' },
      payout: [{ account: '500000001', amount: 6.12 }],
      lifetime: 360,
      qrImageTemplate: 'template3_color',
      requestTime: FIXED_REQUEST_TIME,
    });
    vectors.push(
      requestPathVector(
        'hmac-generate-qr-002',
        'qr.generateQr',
        'Fully populated generate-qr — items array + payout {account,amount} base64-encoded as JSON (QR payout keys), unicode names, lifetime 360s floored to 6 minutes, unicode + template tail',
        fullSpy.calls[0],
        'GENERATE_QR_HASH_FIELDS',
        'repository export GENERATE_QR_HASH_FIELDS (src/domains/qr.ts; official developer.payway.com.kh qr-api order)',
      ),
    );

    const sbSpy = makeRequestSpy();
    const sbQr = createQrDomain(GOLDEN_CONFIG, sbSpy.request);
    sbQr.requestQr({
      transactionId: 'GV-TXN-SB-1',
      currency: 'USD',
      paymentOption: 'abapay',
      callbackUrl: 'https://example.com/soundbox',
      lifetime: 3,
      requestTime: FIXED_REQUEST_TIME,
    });
    assertSameFields(
      sbSpy.calls[0].hmacFields,
      REQUEST_QR_HASH_FIELDS,
      'hmac-request-qr-001 captured order vs REQUEST_QR_HASH_FIELDS',
    );
    vectors.push(
      requestPathVector(
        'hmac-request-qr-001',
        'qr.requestQr',
        'Soundbox request-qr — spec-derived 9-field order; amount OMITTED (keypad entry on device), lifetime at the 3-minute minimum boundary',
        sbSpy.calls[0],
        'REQUEST_QR_HASH_FIELDS',
        'repository export REQUEST_QR_HASH_FIELDS (src/domains/qr.ts; spec-derived, NOT live-verified — see the REQUEST_QR hash-drift note)',
      ),
    );
  }

  // ── req_time read family via the checkout + khqr domains ──
  {
    const reqSpy = makeRequestSpy();
    const checkout = createCheckoutDomain(GOLDEN_CONFIG, reqSpy.request, makeMerchantAuthSpy().requestWithMerchantAuth);
    const threeFieldSource = 'inline list at the checkout-domain call site (HASH_ORDER_HINTS[checkTransaction])';
    const nineFieldSource =
      'inline list at the checkout-domain call site (HASH_ORDER_HINTS[getTransactionList] — live list-2 shape)';

    checkout.checkTransaction('GV-TXN-CHK-1', FIXED_REQUEST_TIME);
    vectors.push(
      requestPathVector(
        'hmac-check-transaction-001',
        'checkout.checkTransaction',
        'check-transaction-2 — the 3-field req_time.merchant_id.tran_id read composition',
        reqSpy.calls[0],
        'inline:checkTransaction',
        threeFieldSource,
      ),
    );

    checkout.closeTransaction('GV-TXN-CLS-1', FIXED_REQUEST_TIME);
    vectors.push(
      requestPathVector(
        'hmac-close-transaction-001',
        'checkout.closeTransaction',
        'close-transaction — same 3-field read composition as check/detail (shared family, pinned per endpoint)',
        reqSpy.calls[1],
        'inline:closeTransaction',
        threeFieldSource,
      ),
    );

    checkout.getTransactionDetail('GV-TXN-DTL-1', FIXED_REQUEST_TIME);
    vectors.push(
      requestPathVector(
        'hmac-transaction-detail-001',
        'checkout.getTransactionDetail',
        'transaction-detail — same 3-field read composition as check/close (shared family, pinned per endpoint)',
        reqSpy.calls[2],
        'inline:getTransactionDetail',
        threeFieldSource,
      ),
    );

    checkout.getTransactionList({
      fromDate: '2026-01-01 00:00:00',
      toDate: '2026-01-02 00:00:00',
      fromAmount: 10.5,
      toAmount: 99,
      status: 'APPROVED',
      page: '1',
      pagination: '50',
      requestTime: FIXED_REQUEST_TIME,
    });
    vectors.push(
      requestPathVector(
        'hmac-transaction-list-001',
        'checkout.getTransactionList',
        'transaction-list-2 — the 9-field from/to/status/page/pagination composition; numeric from/to amounts String()-coerced ("10.5", "99")',
        reqSpy.calls[3],
        'inline:getTransactionList',
        nineFieldSource,
      ),
    );

    checkout.getExchangeRate(FIXED_REQUEST_TIME);
    vectors.push(
      requestPathVector(
        'hmac-exchange-rate-001',
        'checkout.getExchangeRate',
        'exchange-rate — the shortest family: req_time.merchant_id only',
        reqSpy.calls[4],
        'inline:getExchangeRate',
        'inline list at the checkout-domain call site (HASH_ORDER_HINTS[getExchangeRate])',
      ),
    );

    const mcRefSpy = makeRequestSpy();
    const khqr = createKhqrDomain(GOLDEN_CONFIG, mcRefSpy.request);
    khqr.getTransactionsByMerchantRef('GV-MC-REF-01', FIXED_REQUEST_TIME);
    vectors.push(
      requestPathVector(
        'hmac-transactions-by-mc-ref-001',
        'khqr.getTransactionsByMerchantRef',
        'get-transactions-by-mc-ref — req_time.merchant_id.merchant_ref (merchant_ref NOT base64-encoded)',
        mcRefSpy.calls[0],
        'inline:getTransactionsByMerchantRef',
        'inline list at the khqr-domain call site (HASH_ORDER_HINTS[getTransactionsByMerchantRef])',
      ),
    );
  }

  // ── Credentials-on-file families (request path, request_time time field) ──
  {
    const cofSpy = makeRequestSpy();
    const cof = createCredentialsOnFileDomain(GOLDEN_CONFIG, cofSpy.request);

    cof.linkAccount({
      requestId: 'REQGV00001',
      ctid: 'CTIDGV0001',
      tokenFlag: 'CITI_FLEX',
      currency: 'USD',
      callbackUrl: 'https://example.com/payway/link-callback',
      returnDeeplink: 'abamobilebank://ababank.com?type=payway&qrcode=GVLA',
      requestTime: FIXED_REQUEST_TIME,
    });
    vectors.push(
      requestPathVector(
        'hmac-link-account-001',
        'credentialsOnFile.linkAccount',
        'link-account — §16-verified 8-field order (merchant_id leads); callback_url base64-encoded, return_deeplink scheme passed raw',
        cofSpy.calls[0],
        'inline:linkAccount',
        'inline list at the credentials-on-file call site (HASH_ORDER_HINTS[linkAccount]; sandbox-verified 2026-08-31)',
      ),
    );

    cof.linkCard({
      requestId: 'REQGV00002',
      ctid: 'CTIDGV0001',
      tokenFlag: 'CITI_FLEX',
      frequency: '1M',
      currency: 'USD',
      callbackUrl: 'https://example.com/payway/link-callback',
      continueSuccessUrl: 'https://example.com/done',
      requestTime: FIXED_REQUEST_TIME,
    });
    assertSameFields(
      cofSpy.calls[1].hmacFields,
      LINK_CARD_HMAC_FIELDS,
      'hmac-link-card-001 captured order vs LINK_CARD_HMAC_FIELDS',
    );
    vectors.push(
      requestPathVector(
        'hmac-link-card-001',
        'credentialsOnFile.linkCard',
        'link-card — LINK_CARD_HMAC_FIELDS with NO amount supplied: the live-doc quirk where `amount` is a hash position with no body field and hashes as empty string',
        cofSpy.calls[1],
        'LINK_CARD_HMAC_FIELDS',
        'repository export LINK_CARD_HMAC_FIELDS (src/domains/credentials-on-file.ts; §16-verified)',
      ),
    );

    cof.payment({
      transactionId: 'GV-TXN-COF-1',
      amount: 5,
      currency: 'USD',
      ctid: 'CTIDGV0001',
      paymentToken: 'pwt-golden-vector-0001',
      firstName: 'Sokha',
      callbackUrl: 'https://example.com/payway/cof-callback',
      requestTime: FIXED_REQUEST_TIME,
    });
    vectors.push(
      requestPathVector(
        'hmac-cof-payment-001',
        'credentialsOnFile.payment',
        'CoF charge — §16-verified 19-field order; request_id is NOT sent and NOT hashed; pwt hashes raw',
        cofSpy.calls[2],
        'inline:payment',
        'inline list at the credentials-on-file call site (HASH_ORDER_HINTS[payment]; sandbox-verified 2026-08-31)',
      ),
    );

    cof.renewToken({
      requestId: 'REQGV00001',
      ctid: 'CTIDGV0001',
      paymentToken: 'pwt-golden-vector-0002',
      requestTime: FIXED_REQUEST_TIME,
    });
    vectors.push(
      requestPathVector(
        'hmac-renew-token-001',
        'credentialsOnFile.renewToken',
        'renew-token — §16-verified 5-field order (ctid leads)',
        cofSpy.calls[3],
        'inline:renewToken',
        'inline list at the credentials-on-file call site (HASH_ORDER_HINTS[renewToken]; sandbox-verified 2026-08-31)',
      ),
    );

    cof.getTokenDetails({ requestId: 'REQGV00001', requestTime: FIXED_REQUEST_TIME });
    vectors.push(
      requestPathVector(
        'hmac-token-details-001',
        'credentialsOnFile.getTokenDetails',
        'get-token-details — request_id ONLY (no ctid, no pwt): merchant_id.request_time.request_id',
        cofSpy.calls[4],
        'inline:getTokenDetails',
        'inline list at the credentials-on-file call site (HASH_ORDER_HINTS[getTokenDetails]; sandbox-verified 2026-08-31)',
      ),
    );

    cof.removeToken({ ctid: 'CTIDGV0001', paymentToken: 'pwt-golden-vector-0003', requestTime: FIXED_REQUEST_TIME });
    vectors.push(
      requestPathVector(
        'hmac-remove-token-001',
        'credentialsOnFile.removeToken',
        'remove-token — ctid + pwt only (no request_id): merchant_id.ctid.request_time.pwt',
        cofSpy.calls[5],
        'inline:removeToken',
        'inline list at the credentials-on-file call site (HASH_ORDER_HINTS[removeToken]; sandbox-verified 2026-08-31)',
      ),
    );
  }

  // ── Merchant-auth families (sentinel merchant_auth; request_time time field) ──
  {
    const refundSpy = makeMerchantAuthSpy();
    const refundCheckout = createCheckoutDomain(
      GOLDEN_CONFIG,
      makeRequestSpy().request,
      refundSpy.requestWithMerchantAuth,
    );
    refundCheckout.refund('GV-TXN-REF-1', 1.5);
    vectors.push(
      merchantAuthVector(
        'hmac-refund-001',
        'checkout.refund',
        'refund — merchant-auth default composition request_time.merchant_id.merchant_auth (no hmacFields override); refund amount rides INSIDE the RSA merchant_auth, not the preimage',
        refundSpy.calls[0],
        'MERCHANT_AUTH_DEFAULT_HASH_FIELDS',
        'repository export MERCHANT_AUTH_DEFAULT_HASH_FIELDS (src/client.ts; effective order for refund + payment-link)',
      ),
    );

    const plSpy = makeMerchantAuthSpy();
    const paymentLink = createPaymentLinkDomain(GOLDEN_CONFIG, plSpy.requestWithMerchantAuth);
    paymentLink.create({
      title: 'Golden vector link',
      amount: 5,
      currency: 'USD',
      merchantRefNo: 'GV-REF-0001',
      returnUrl: 'https://example.com/return',
      description: 'Golden vector fixture',
    });
    vectors.push(
      merchantAuthVector(
        'hmac-payment-link-create-001',
        'paymentLink.create',
        'payment-link create — merchant-auth default composition; title/amount/return_url travel inside the encrypted merchant_auth',
        plSpy.calls[0],
        'MERCHANT_AUTH_DEFAULT_HASH_FIELDS',
        'repository export MERCHANT_AUTH_DEFAULT_HASH_FIELDS (src/client.ts; effective order for refund + payment-link)',
      ),
    );

    paymentLink.getDetails('PTL-GV-0001');
    vectors.push(
      merchantAuthVector(
        'hmac-payment-link-detail-001',
        'paymentLink.getDetails',
        'payment-link detail — merchant-auth default composition, link id inside merchant_auth',
        plSpy.calls[1],
        'MERCHANT_AUTH_DEFAULT_HASH_FIELDS',
        'repository export MERCHANT_AUTH_DEFAULT_HASH_FIELDS (src/client.ts; effective order for refund + payment-link)',
      ),
    );

    paymentLink.void('PTL-GV-0001');
    vectors.push(
      merchantAuthVector(
        'hmac-payment-link-void-001',
        'paymentLink.void',
        'payment-link void (undocumented endpoint, live-verified) — same merchant-auth composition as detail',
        plSpy.calls[2],
        'MERCHANT_AUTH_DEFAULT_HASH_FIELDS',
        'repository export MERCHANT_AUTH_DEFAULT_HASH_FIELDS (src/client.ts; effective order for refund + payment-link)',
      ),
    );

    const paSpy = makeMerchantAuthSpy();
    const preAuth = createPreAuthDomain(GOLDEN_CONFIG, paSpy.requestWithMerchantAuth);
    preAuth.complete('GV-TXN-PA-1', 5);
    vectors.push(
      merchantAuthVector(
        'hmac-preauth-complete-001',
        'preAuth.complete',
        'pre-auth completion — DIFFERENT order from the default: merchant_auth.request_time.merchant_id (sandbox-verified)',
        paSpy.calls[0],
        'inline:completePreAuth',
        'inline override at the pre-auth call site (HASH_ORDER_HINTS[completePreAuth])',
      ),
    );

    preAuth.cancel('GV-TXN-PA-2');
    vectors.push(
      merchantAuthVector(
        'hmac-preauth-cancel-001',
        'preAuth.cancel',
        'pre-auth cancellation — THIRD distinct merchant-auth order: merchant_id.merchant_auth.request_time (sandbox-verified; the reorder is the pin)',
        paSpy.calls[1],
        'inline:cancelPreAuth',
        'inline override at the pre-auth call site (HASH_ORDER_HINTS[cancelPreAuth])',
      ),
    );

    const benSpy = makeMerchantAuthSpy();
    const { publicKey } = generateTestRsaKeyPair();
    const payout = createPayoutDomain(
      { ...GOLDEN_CONFIG, publicKeyPem: publicKey } as PayWayConfig & { merchantId: string; apiKey: string },
      makeRequestSpy().request,
      benSpy.requestWithMerchantAuth,
    );
    payout.addBeneficiary({ payee: '500000001' });
    vectors.push(
      merchantAuthVector(
        'hmac-beneficiary-add-001',
        'payout.addBeneficiary',
        'beneficiary whitelist add — two-field override request_time.merchant_auth (no merchant_id in the preimage)',
        benSpy.calls[0],
        'inline:addBeneficiary',
        'inline override at the payout call site (HASH_ORDER_HINTS[addBeneficiary])',
      ),
    );

    payout.updateBeneficiaryStatus({ payee: '500000001', status: 1 });
    vectors.push(
      merchantAuthVector(
        'hmac-beneficiary-update-status-001',
        'payout.updateBeneficiaryStatus',
        'beneficiary status update — same two-field request_time.merchant_auth composition as add',
        benSpy.calls[1],
        'inline:updateBeneficiaryStatus',
        'inline override at the payout call site (HASH_ORDER_HINTS[updateBeneficiaryStatus])',
      ),
    );
  }

  // ── Payout family — the SDK's only HEX-encoded hash (PO-003 pin) ──
  {
    const poReqSpy = makeRequestSpy();
    const { publicKey: poPublicKey } = generateTestRsaKeyPair();
    const payout = createPayoutDomain(
      { ...GOLDEN_CONFIG, publicKeyPem: poPublicKey } as PayWayConfig & { merchantId: string; apiKey: string },
      poReqSpy.request,
      makeMerchantAuthSpy().requestWithMerchantAuth,
    );
    payout.payout({
      transactionId: 'GV-TXN-PO-1',
      amount: 5,
      currency: 'USD',
      beneficiaries: [{ account: '500000001', amount: 5 }],
    });
    const call = poReqSpy.calls[0];
    const body = { ...call.body };
    delete body.hash;
    if (typeof body.beneficiaries !== 'string') throw new Error('payout beneficiaries should be an RSA blob string');
    body.beneficiaries = BENEFICIARIES_SENTINEL; // randomized per call — pinned as sentinel
    const pinned: CapturedRequest = { ...call, body };
    vectors.push(
      requestPathVector(
        'hmac-payout-001',
        'payout.payout',
        'Direct payout — the SDK\'s ONLY hex-encoded hash (PO-003 pin: a regression to base64 changes this digest); numeric amount 5 String()-coerced to "5" (NOT "5.00"); RSA-encrypted beneficiaries pinned as sentinel',
        pinned,
        'inline:payout',
        'inline list at the payout call site (HASH_ORDER_HINTS[payout]; hex encoding per payout.ts)',
        [
          {
            field: 'beneficiaries',
            rule: 'GOLDEN-RSA-SENTINEL',
            note: 'PKCS1 RSA encryption is randomized per call; the encrypted beneficiary list is pinned as a fixed sentinel',
          },
        ],
      ),
    );
  }

  // ── Self-activation family (partner auth; SHA256, except credential-info SHA512) ──
  {
    const partnerConfig = {
      ...GOLDEN_CONFIG,
      partnerId: FIXED_PARTNER_ID,
      // Any non-empty string works: the domain uses it only as HMAC key
      // material for the deterministic public_key_hash_encrypt inside
      // request_data — no PEM validation on this path.
      publicKeyPem: 'golden-vector-fixed-public-key-material',
    } as PayWayConfig & { merchantId: string; apiKey: string };

    const regSpy = makePartnerSpy();
    const selfActivation = createSelfActivationDomain(partnerConfig, regSpy.partnerRequest);
    selfActivation.registerMerchant({
      pushbackUrl: 'https://example.com/payway/pushback',
      redirectUrl: 'https://example.com/payway/redirect',
      registerRef: 'GV-REG-0001',
      currency: 'USD',
      requestTime: FIXED_REQUEST_TIME,
    });
    vectors.push(
      partnerVector(
        'hmac-self-activation-register-001',
        'selfActivation.registerMerchant',
        "new-merchant — partner-auth composition partner_id.request_data.request_time signed with SHA256 (the spec's algorithm exception family)",
        regSpy.calls[0],
        'sha256',
      ),
    );

    const credSpy = makePartnerSpy();
    const credActivation = createSelfActivationDomain(partnerConfig, credSpy.partnerRequest);
    credActivation.getCredentialInfo({ registerRef: 'GV-REG-0001', requestTime: FIXED_REQUEST_TIME });
    vectors.push(
      partnerVector(
        'hmac-self-activation-credential-info-001',
        'selfActivation.getCredentialInfo',
        "get-mc-credential-info — same field order as its siblings but SHA512, per that endpoint's own prose (the archived spec's internal inconsistency, pinned)",
        credSpy.calls[0],
        'sha512',
      ),
    );

    const mcSpy = makePartnerSpy();
    const mcActivation = createSelfActivationDomain(partnerConfig, mcSpy.partnerRequest);
    mcActivation.getMerchantInfo({ merchantKey: 'GV-MC-KEY-0001', requestTime: FIXED_REQUEST_TIME });
    vectors.push(
      partnerVector(
        'hmac-self-activation-mc-info-001',
        'selfActivation.getMerchantInfo',
        'get-mc-info — SHA256 partner composition; request_data carries the deterministic public_key_hash_encrypt HMAC (fixed key material) plus the merchant key',
        mcSpy.calls[0],
        'sha256',
      ),
    );
  }

  return vectors;
}

// ── Emission ────────────────────────────────────────────────────────────────

function vectorFileName(vectorId: string): string {
  return `${vectorId}.json`;
}

function serializeVector(vector: GoldenVector): string {
  return `${JSON.stringify(vector, null, 2)}\n`;
}

function buildIndex(vectors: GoldenVector[]): string {
  const families = [...new Set(vectors.map((v) => v.hashFieldsFamily))].sort();
  const index = {
    schema: INDEX_SCHEMA,
    scope: 'hmac',
    description:
      'Golden HMAC vectors (audit DX-TEST-001, §27): expected signatures pinned by driving the live signing code with fixed inputs and the repo test key. One JSON file per vector; the runner is src/__tests__/golden-vectors.test.ts.',
    keyAlias: GOLDEN_KEY_ALIAS,
    keyNote:
      'The fixtures never contain the key material — only this alias. The key is the repo test fixture key from src/__tests__/cli.test.ts, never a credential.',
    regenerate: 'npx tsx scripts/generate/gen-golden-vectors.ts',
    verifyDeterminism: 'npx tsx scripts/generate/gen-golden-vectors.ts --check',
    vectorCount: vectors.length,
    hashFieldsFamilies: families,
    vectors: vectors
      .map((v) => ({
        vectorId: v.vectorId,
        file: vectorFileName(v.vectorId),
        operation: v.operation,
        endpoint: v.endpoint,
        hashFieldsFamily: v.hashFieldsFamily,
        hashAlgorithm: v.hashAlgorithm,
        hashEncoding: v.hashEncoding,
      }))
      .sort((a, b) => a.vectorId.localeCompare(b.vectorId)),
  };
  return `${JSON.stringify(index, null, 2)}\n`;
}

function main(): void {
  const checkOnly = process.argv.includes('--check');
  const vectors = buildVectors();

  const idSeen = new Set<string>();
  for (const vector of vectors) {
    if (idSeen.has(vector.vectorId)) throw new Error(`duplicate vectorId: ${vector.vectorId}`);
    idSeen.add(vector.vectorId);
    const expectedLength = vector.hashAlgorithm === 'sha512' ? 128 : 64;
    if (vector.hashEncoding === 'hex' && vector.expectedHash.length !== expectedLength) {
      throw new Error(`${vector.vectorId}: hex digest length ${vector.expectedHash.length} != ${expectedLength}`);
    }
  }

  if (checkOnly) {
    const drifted: string[] = [];
    const missing: string[] = [];
    for (const vector of vectors) {
      const file = path.join(FIXTURES_DIR, vectorFileName(vector.vectorId));
      if (!existsSync(file) || readFileSync(file, 'utf8') !== serializeVector(vector)) {
        (existsSync(file) ? drifted : missing).push(vectorFileName(vector.vectorId));
      }
    }
    const existing = existsSync(FIXTURES_DIR) ? readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json')) : [];
    const extra = existing.filter((f) => f !== 'INDEX.json' && !vectors.some((v) => vectorFileName(v.vectorId) === f));
    const indexDrifted =
      !existsSync(INDEX_FILE) || readFileSync(INDEX_FILE, 'utf8') !== buildIndex(vectors) ? ['INDEX.json'] : [];
    if (drifted.length || missing.length || extra.length || indexDrifted.length) {
      console.error('golden-vector fixtures are stale or drifted:');
      for (const f of [...missing, ...drifted, ...indexDrifted, ...extra]) console.error(`  ${f}`);
      console.error('regenerate with: npx tsx scripts/generate/gen-golden-vectors.ts');
      process.exit(1);
    }
    console.log(`golden vectors up to date (${vectors.length} vectors, byte-identical)`);
    return;
  }

  mkdirSync(FIXTURES_DIR, { recursive: true });
  for (const vector of vectors) {
    writeFileSync(path.join(FIXTURES_DIR, vectorFileName(vector.vectorId)), serializeVector(vector), 'utf8');
  }
  writeFileSync(INDEX_FILE, buildIndex(vectors), 'utf8');
  console.log(`wrote ${vectors.length} golden vectors + INDEX.json to ${path.relative(process.cwd(), FIXTURES_DIR)}`);
}

main();
