/**
 * Customer Module callback parsing and callback classification.
 *
 * A Customer Module (Merchant Portal "Printed QR") payment notification is a
 * KHQR-shaped body plus a nested `customer` object and `payer_name`. It IS
 * HMAC-signed (header `X-PAYWAY-HMAC-SHA512`) even though it lands on the same
 * khqr route as the unsigned offline-KHQR notification — the presence or
 * absence of a signature header (not the body shape) distinguishes the two
 * deliveries on that route.
 *
 * Real captured sample (Merchant Portal customer "dhitraj", outlet "Donation
 * outlet", merchant_ref = Customer ID `dt-one-8989`):
 *
 * {
 *   "payment_status_code": 0,
 *   "transaction_id": "178702944869996",
 *   "payment_status": "APPROVED",
 *   "apv": "118954",
 *   "original_amount": 0.38,
 *   "original_currency": "USD",
 *   "payment_amount": 0.38,
 *   "payment_currency": "USD",
 *   "payment_type": "ABA Pay",
 *   "transaction_date": "2026-08-18 12:04:08",
 *   "bank_ref": "100SB1787029448",
 *   "payer_account": "*001",
 *   "payer_name": "Payer Name",
 *   "bank_name": "ABA Bank",
 *   "merchant_ref": "dt-one-8989",
 *   "customer": {
 *     "type": "individual",
 *     "customer_id": "dt-one-8989",
 *     "customer_name": "dhitraj",
 *     "vat_tin": "Test organization",
 *     "email": "ruzaid0101+alavps@gmail.com",
 *     "phone": "+85596 407 4052",
 *     "address": "2740 Barnes Avenue Bronx,",
 *     "remark": ""
 *   }
 * }
 *
 * Contract notes (merchant-captured, 2026-08-18):
 * - `merchant_ref` carries the portal Customer ID (server-side QR attribution;
 *   the ID never appears in the KHQR payload itself).
 * - The nested `customer` object is a portal profile snapshot — useful for
 *   matching/display, but the payment obligation still matches on
 *   `merchant_ref`, never on `customer.email` etc.
 * - This is a notification about a completed deduction: `payment_status_code`
 *   0 means approved, but non-approved variants may arrive (same guard set as
 *   every callback: verify signature, check state, dedupe by transaction id).
 */

/** Portal customer profile snapshot embedded in Customer Module callbacks. */
export interface CustomerQrCustomer {
  /** Portal customer type — `'individual'` (or `'company'`, portal-configurable). */
  readonly type?: string;
  /** The portal Customer ID — mirrors top-level `merchant_ref`. */
  readonly customer_id?: string;
  readonly customer_name?: string;
  readonly vat_tin?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly address?: string;
  readonly remark?: string;
}

export interface ParsedCustomerQrCallback {
  readonly kind: 'customer-module-qr';
  readonly schema: 'aba-customer-qr-callback-v1';
  /**
   * `unverified` here refers to THIS parser — the body is not
   * authenticated by parsing. Signature verification is a separate,
   * mandatory step against `X-PAYWAY-HMAC-SHA512` (see server.ts).
   */
  readonly verification: 'unverified';
  readonly notification: {
    readonly transactionId: string;
    readonly transactionDate: string;
    readonly originalCurrency: string;
    readonly originalAmount: number;
    readonly bankRef: string;
    readonly apv: string;
    readonly paymentStatusCode: number;
    readonly paymentStatus: string;
    readonly paymentCurrency: string;
    readonly paymentAmount: number;
    readonly paymentType: string;
    readonly payerAccount: string;
    readonly payerName: string;
    readonly bankName: string;
    /** The portal Customer ID — the reconciliation join key. */
    readonly merchantRef: string;
    /** Portal customer profile snapshot, when present. */
    readonly customer?: CustomerQrCustomer;
  };
  readonly raw: Record<string, unknown>;
  /** Fields outside the published shape — retained, never rejected. */
  readonly unknownFields: Record<string, unknown>;
}

/** The five callback contracts a merchant-profile callback URL can receive. */
export type CallbackKind =
  | 'online-checkout'
  | 'customer-module-qr'
  | 'khqr-offline'
  | 'payment-link-pushback'
  | 'cof-link'
  | 'unknown';

const STRING_FIELDS = [
  'transaction_id',
  'transaction_date',
  'original_currency',
  'bank_ref',
  'apv',
  'payment_status',
  'payment_currency',
  'payment_type',
  'payer_account',
  'payer_name',
  'bank_name',
  'merchant_ref',
] as const;

const NUMBER_FIELDS = ['original_amount', 'payment_status_code', 'payment_amount'] as const;

const PUBLISHED_FIELDS = new Set<string>([...STRING_FIELDS, ...NUMBER_FIELDS, 'customer']);

function requireRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('Customer QR callback payload must be an object');
  }
  return payload as Record<string, unknown>;
}

function requireString(payload: Record<string, unknown>, field: string): string {
  const value = payload[field];
  if (typeof value !== 'string') {
    throw new TypeError(`Customer QR callback field ${field} must be a string`);
  }
  return value;
}

function requireNumber(payload: Record<string, unknown>, field: string): number {
  const value = payload[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`Customer QR callback field ${field} must be a finite number`);
  }
  return value;
}

function parseCustomerObject(value: unknown): CustomerQrCustomer | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Customer QR callback field customer must be an object');
  }
  const raw = value as Record<string, unknown>;
  const optional = (key: string): string | undefined => {
    const v = raw[key];
    return typeof v === 'string' ? v : undefined;
  };
  return {
    type: optional('type'),
    customer_id: optional('customer_id'),
    customer_name: optional('customer_name'),
    vat_tin: optional('vat_tin'),
    email: optional('email'),
    phone: optional('phone'),
    address: optional('address'),
    remark: optional('remark'),
  };
}

/**
 * Parse a Customer Module (portal "Printed QR") payment notification.
 *
 * Throws a TypeError naming the first offending field — the raw body stays the
 * audit source; a parse failure never discards the delivery.
 */
export function parseCustomerQrCallback(payload: unknown): ParsedCustomerQrCallback {
  const raw = requireRecord(payload);
  for (const field of STRING_FIELDS) requireString(raw, field);
  for (const field of NUMBER_FIELDS) requireNumber(raw, field);
  const customer = parseCustomerObject(raw.customer);

  const unknownFields = Object.fromEntries(Object.entries(raw).filter(([field]) => !PUBLISHED_FIELDS.has(field)));

  return {
    kind: 'customer-module-qr',
    schema: 'aba-customer-qr-callback-v1',
    verification: 'unverified',
    notification: {
      transactionId: requireString(raw, 'transaction_id'),
      transactionDate: requireString(raw, 'transaction_date'),
      originalCurrency: requireString(raw, 'original_currency'),
      originalAmount: requireNumber(raw, 'original_amount'),
      bankRef: requireString(raw, 'bank_ref'),
      apv: requireString(raw, 'apv'),
      paymentStatusCode: requireNumber(raw, 'payment_status_code'),
      paymentStatus: requireString(raw, 'payment_status'),
      paymentCurrency: requireString(raw, 'payment_currency'),
      paymentAmount: requireNumber(raw, 'payment_amount'),
      paymentType: requireString(raw, 'payment_type'),
      payerAccount: requireString(raw, 'payer_account'),
      payerName: requireString(raw, 'payer_name'),
      bankName: requireString(raw, 'bank_name'),
      merchantRef: requireString(raw, 'merchant_ref'),
      customer,
    },
    raw,
    unknownFields,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Classify a parsed callback body into one of the four PayWay callback
 * contracts a merchant profile's single callback URL can receive:
 *
 *  - `payment-link-pushback`  — `tran_id` + `merchant_ref_no` (extra fields tolerated)
 *  - `customer-module-qr`      — `transaction_id` + nested `customer` object
 *  - `online-checkout`        — `tran_id` + `status` (+ optional `apv`, …)
 *  - `khqr-offline`           — `transaction_id` + `merchant_ref`, no `customer`
 *  - `unknown`                — anything else (log + investigate, never fulfill)
 *
 * Discriminators verified against the real captured samples in
 * `docs/archive/customermoudle-guide.md` §7.4 and the sandbox-pinned shapes.
 * Order matters: pushback's `merchant_ref_no` is unique to that contract
 * (PayWay states body shapes are NOT fixed — extra fields must not break
 * classification), and the Customer Module check requires `transaction_id`
 * so a hypothetical online body carrying a `customer` key is not misrouted.
 */
export function classifyCallback(payload: unknown): CallbackKind {
  if (!isPlainObject(payload)) return 'unknown';

  // CoF link result: the pwt discriminator — top level (historic flat
  // deliveries) or nested in payment_credential (live shape, §26 AOF-7).
  // No other callback contract carries a token — check BEFORE
  // online-checkout, which also carries `status`.
  if (typeof payload.pwt === 'string' && payload.pwt.length > 0) {
    return 'cof-link';
  }
  if (
    isPlainObject(payload.payment_credential) &&
    typeof payload.payment_credential.pwt === 'string' &&
    payload.payment_credential.pwt.length > 0
  ) {
    return 'cof-link';
  }

  // Payment-link pushback: the live-verified trio (§22 V-1). merchant_ref_no
  // never appears on the other contracts; extras beyond the trio are tolerated.
  if ('tran_id' in payload && 'merchant_ref_no' in payload) {
    return 'payment-link-pushback';
  }

  // Customer Module: KHQR fields + the nested portal customer profile.
  if (isPlainObject(payload.customer) && typeof payload.transaction_id === 'string') {
    return 'customer-module-qr';
  }

  // Online checkout: tran_id + status (payment_status is NOT on this contract).
  if ('tran_id' in payload && 'status' in payload) {
    return 'online-checkout';
  }

  // Offline KHQR notification: transaction_id-based, no nested customer.
  if ('transaction_id' in payload && 'merchant_ref' in payload) {
    return 'khqr-offline';
  }

  return 'unknown';
}
