/**
 * Credentials-on-File (CoF) link-callback parsing.
 *
 * When `link-account` or `link-card` completes, PayWay delivers the payment
 * token (`pwt`) by POST to the link's `callback_url` — the ONLY delivery
 * channel (docs/09; knowledge/callbacks-webhooks.md).
 *
 * LIVE CONTRACT (first capture 2026-09-15, SANDBOX-FINDINGS §26 AOF-7 — the
 * Q18 payload half): `application/json`, `x-payway-topic: PaymentNotification`,
 * `x-payway-hmac-sha512` header, body:
 *
 * ```json
 * {
 *   "request_id": "aoflink001",
 *   "payment_credential": {
 *     "ctid": "aofcycle01",
 *     "pwt": "5276…64 hex-ish chars",
 *     "source_of_fund": "*****0003",
 *     "type": "ABA ACCOUNT",
 *     "status": 1,
 *     "expired_at": "2026-12-14T16:41:13.8919367+07:00",
 *     "token_flag": "CITI_FLEX",
 *     "frequency": "",
 *     "subscribed_amount": 0.0,
 *     "amount_limit_per_tran": 50,
 *     "currency": "USD"
 *   }
 * }
 * ```
 *
 * Everything token-specific lives NESTED in `payment_credential`; only
 * `request_id` sits at the top level. The historic flat shape (fields on the
 * top level) is still accepted for the synthetic fixtures and older
 * heuristics. `status` here is the CREDENTIAL status (1 = active), not a
 * transaction status code.
 *
 * ⚠️ The header signature did NOT verify under our sorted-key
 * canonicalization, and 19 offline candidate orderings failed to reproduce it
 * (§26 AOF-8) — the callback HMAC canonicalization is undocumented (Q18
 * signature half stays open with the ABA team). The raw body remains the
 * audit source in the webhook record either way.
 */

/** A parsed CoF link callback. The raw body stays the audit source. */
export interface ParsedCofLinkCallback {
  /** The delivered payment token — the delivery's reason to exist. */
  readonly pwt: string;
  /** Customer token identifier, when the delivery echoes one. */
  readonly ctid?: string;
  /** Link request id, when the delivery echoes one. */
  readonly requestId?: string;
  /**
   * Status field, when present. On the live shape this is the CREDENTIAL
   * status (number, 1 = active) nested in payment_credential — not a
   * transaction status code (Q18 answer; §26 AOF-7).
   */
  readonly status?: string;
  /** Token flag echoed back (CITI_FLEX / CITO_FLEX), when present. */
  readonly tokenFlag?: string;
  /**
   * Delivered token expiry (`expired_at`), when present — an ISO-8601 instant
   * on the live capture (§26 AOF-7). Authoritative for scheduled subscription
   * tokens (CITR_FIX/MITR_FIX — FU-08: explicit `expired_at`, no inactivity
   * rule); unscheduled account tokens stay governed by the 90-day rolling
   * window regardless (T-13), so this field never overrides those.
   */
  readonly expiredAt?: string;
  /**
   * Every other scalar field on the delivery (minus the `hash` signature),
   * stringified and preserved verbatim — source_of_fund, type, frequency,
   * subscribed_amount, amount_limit_per_tran, currency on the live shape.
   * (`expired_at` is surfaced as the first-class `expiredAt` field above.)
   */
  readonly extraFields: Record<string, string>;
}

/**
 * True when the payload plausibly carries a CoF link result. The `pwt` field
 * is the discriminator — top-level (historic flat shape) or nested inside
 * `payment_credential` (live shape, §26 AOF-7). No other callback contract
 * (online checkout, customer-module QR, offline KHQR, payment-link pushback)
 * carries it.
 */
export function isCofLinkCallback(payload: unknown): payload is Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return false;
  const record = payload as Record<string, unknown>;
  if (typeof record.pwt === 'string' && record.pwt.length > 0) return true;
  const credential = record.payment_credential;
  return (
    typeof credential === 'object' &&
    credential !== null &&
    !Array.isArray(credential) &&
    typeof (credential as Record<string, unknown>).pwt === 'string' &&
    ((credential as Record<string, unknown>).pwt as string).length > 0
  );
}

function firstString(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/** String coercion for scalar callback fields — the live shape uses numbers for status/amounts. */
function firstScalar(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return undefined;
}

function collectExtraFields(
  target: Record<string, string>,
  source: Record<string, unknown>,
  known: Set<string>,
): void {
  for (const [key, value] of Object.entries(source)) {
    if (known.has(key) || key === 'hash' || key === 'payment_credential') continue;
    // Empty strings are contract-meaningful on the live shape (frequency: ""
    // = not a subscription) — preserve them like any other scalar.
    if (typeof value === 'string') {
      target[key] = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      target[key] = String(value);
    }
  }
}

/**
 * Parse a CoF link callback. Reads the live nested `payment_credential`
 * shape first, falling back to the historic flat layout. Unknown scalar
 * fields (minus the hash) from both levels are preserved in `extraFields` so
 * future contract extensions surface without code changes.
 */
export function parseCofLinkCallback(payload: unknown): ParsedCofLinkCallback {
  if (!isCofLinkCallback(payload)) {
    throw new Error('Not a CoF link callback: no `pwt` field (top level or payment_credential)');
  }
  const top = payload as Record<string, unknown>;
  const credential = (
    typeof top.payment_credential === 'object' && top.payment_credential !== null
      ? top.payment_credential
      : top
  ) as Record<string, unknown>;

  const known = new Set(['pwt', 'ctid', 'cust_id', 'request_id', 'req_id', 'status', 'token_flag', 'expired_at']);
  const extraFields: Record<string, string> = {};
  collectExtraFields(extraFields, top, known);
  if (credential !== top) collectExtraFields(extraFields, credential, known);

  return {
    pwt: firstString(credential, 'pwt') as string,
    ctid: firstString(credential, 'ctid', 'cust_id') ?? firstString(top, 'ctid', 'cust_id'),
    requestId: firstString(top, 'request_id', 'req_id'),
    status: firstScalar(credential, 'status') ?? firstScalar(top, 'status'),
    tokenFlag: firstString(credential, 'token_flag') ?? firstString(top, 'token_flag'),
    expiredAt: firstString(credential, 'expired_at') ?? firstString(top, 'expired_at'),
    extraFields,
  };
}
