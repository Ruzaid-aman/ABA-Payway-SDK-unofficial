/**
 * Credentials-on-File (CoF) link-callback parsing.
 *
 * When `link-account` or `link-card` completes, PayWay delivers the payment
 * token (`pwt`) by POST to the link's `callback_url` — the ONLY delivery
 * channel (docs/09; knowledge/callbacks-webhooks.md). The delivery is
 * HMAC-signed like an online checkout callback.
 *
 * ⚠️ The exact live field set has never been captured (open question Q18 —
 * the sandbox profile answered 104 "Merchant not enabled token flag" on
 * every link attempt through 2026-09-12). Parsing is therefore HEURISTIC:
 * the one field the live docs name is `pwt` ("The field for tokens is `pwt`
 * (not `payment_token`)"). Everything else is best-effort and echoed back
 * for Q18 capture; the raw body remains the audit source in the webhook
 * record.
 */

/** A heuristically parsed CoF link callback. The raw body stays the audit source. */
export interface ParsedCofLinkCallback {
  /** The delivered payment token — the only documented field. */
  readonly pwt: string;
  /** Customer token identifier, when the delivery echoes one. */
  readonly ctid?: string;
  /** Link request id, when the delivery echoes one. */
  readonly requestId?: string;
  /** Status field, when present (spelling unverified — Q18). */
  readonly status?: string;
  /** Token flag echoed back (CITI_FLEX / CITO_FLEX), when present. */
  readonly tokenFlag?: string;
  /**
   * Every other string field on the delivery (minus the `hash` signature),
   * preserved verbatim for the Q18 first-capture analysis.
   */
  readonly extraFields: Record<string, string>;
}

/**
 * True when the payload plausibly carries a CoF link result. The `pwt` field
 * is the discriminator — no other callback contract (online checkout,
 * customer-module QR, offline KHQR, payment-link pushback) carries it.
 */
export function isCofLinkCallback(payload: unknown): payload is Record<string, unknown> {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload) &&
    typeof (payload as Record<string, unknown>).pwt === 'string' &&
    ((payload as Record<string, unknown>).pwt as string).length > 0
  );
}

function firstString(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/**
 * Heuristically parse a CoF link callback (schema UNVERIFIED live — Q18).
 * Unknown string fields (minus the hash) are preserved in `extraFields` so
 * the first live capture can pin the real contract without losing data.
 */
export function parseCofLinkCallback(payload: unknown): ParsedCofLinkCallback {
  if (!isCofLinkCallback(payload)) {
    throw new Error('Not a CoF link callback: no string `pwt` field on the delivery');
  }
  const known = new Set(['pwt', 'ctid', 'cust_id', 'request_id', 'req_id', 'status', 'token_flag', 'hash']);
  const extraFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (known.has(key) || key === 'hash') continue;
    if (typeof value === 'string' && value.length > 0) extraFields[key] = value;
  }
  return {
    pwt: payload.pwt as string,
    ctid: firstString(payload, 'ctid', 'cust_id'),
    requestId: firstString(payload, 'request_id', 'req_id'),
    status: firstString(payload, 'status'),
    tokenFlag: firstString(payload, 'token_flag'),
    extraFields,
  };
}
