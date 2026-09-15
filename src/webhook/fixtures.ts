/**
 * Signed callback fixtures for local webhook testing (P0 W-2 of
 * docs/competitive-analysis-cli-stripe-razorpay.md — Stripe `trigger` analog).
 *
 * Four fixture families mirror the webhook-server routes:
 *  - `payment.approved` / `payment.declined` … — online checkout callbacks:
 *    the full documented callback body, SIGNED with the merchant's API key
 *    (same algorithm as the gateway: sorted-key concat → HMAC-SHA512 →
 *    Base64) so a correct receiver accepts them and a broken one rejects.
 *  - `khqr.notification` — offline KHQR payment notification (no published
 *    auth contract; delivered unsigned, matching the real contract).
 *  - `payment-link.pushback` — payment-link pushback, live-verified shape
 *    `{tran_id, status: 0, merchant_ref_no}` with NO hash field
 *    (SANDBOX-FINDINGS §22 V-1); verify via check-transaction, not HMAC.
 *  - `cof-link.linked` — credentials-on-file link callback rehearsal
 *    (Q18): the pwt/ctid/request_id body with the HMAC carried in the
 *    classic body `hash` FIELD (docs/09 §5 shape) and NO signature header —
 *    exercises the receiver's body-hash verification + token persistence
 *    before a real customer link exists. SYNTHETIC: the field set is our
 *    best guess until the first live capture pins the real contract.
 *
 * Status code values come from `PAYMENT_STATUS_CODES` (sandbox-pinned), and
 * the online-checkout body mirrors the mock-callback.cjs fixture that the
 * aba-payway-hash skill ships — one canonical shape, no drift.
 */

import { randomBytes } from 'node:crypto';
import { signCallbackBody } from '../auth.js';
import { PAYMENT_STATUS_CODES } from '../constants.js';

export type WebhookFixtureEvent =
  | 'payment.approved'
  | 'payment.declined'
  | 'payment.pending'
  | 'payment.refunded'
  | 'payment.cancelled'
  | 'customer-qr.payment'
  | 'khqr.notification'
  | 'payment-link.pushback'
  | 'cof-link.linked';

export const WEBHOOK_FIXTURE_EVENTS: readonly WebhookFixtureEvent[] = [
  'payment.approved',
  'payment.declined',
  'payment.pending',
  'payment.refunded',
  'payment.cancelled',
  'customer-qr.payment',
  'khqr.notification',
  'payment-link.pushback',
  'cof-link.linked',
];

export interface WebhookFixtureOverrides {
  /** Transaction id embedded in the fixture (auto-generated when omitted). */
  tranId?: string;
  /** Merchant reference (defaults to the transaction id). */
  merchantRef?: string;
  /** Payment amount (USD default 10.00; KHR integers). */
  amount?: number;
  /** Payment currency — 'USD' | 'KHR'. */
  currency?: 'USD' | 'KHR';
  /** Customer/payer name shown in the fixture. */
  payerName?: string;
  /** Customer Module only: portal customer name inside the nested customer object. */
  customerName?: string;
  /** CoF link fixture only: customer token identifier (default `mockcust01`). */
  ctid?: string;
  /** CoF link fixture only: token flag echoed in the delivery (default `CITI_FLEX`). */
  tokenFlag?: string;
  /** CoF link fixture only: the delivered pwt (auto-generated when omitted). */
  pwt?: string;
}

export interface WebhookFixture {
  /** Fixture event name (echoes the requested event). */
  event: WebhookFixtureEvent;
  /** Webhook-server route this fixture belongs to. */
  route: '/aba-payway-webhook' | '/aba-payway-khqr-webhook' | '/aba-payway-pushback';
  /** Raw JSON body string ready to POST. */
  body: string;
  /** Parsed body (the fixture JSON). */
  parsed: Record<string, unknown>;
  /** HMAC-SHA512 Base64 signature over the body (signed fixtures only). */
  signature?: string;
  /**
   * Where the signature travels: 'header' (default — X-PAYWAY-HMAC-SHA512)
   * or 'body' (the classic `hash` FIELD, CoF link fixture — the receiver
   * must verify the body hash, no header is sent).
   */
  signatureChannel?: 'header' | 'body';
  /** Embedded transaction id (correlation key for check-transaction). */
  tranId: string;
  /**
   * How the receiving app must verify this delivery:
   * 'hmac' — signature verification path (header or body hash);
   * 'check-transaction' — no signature contract; reconcile via the gateway.
   */
  verification: 'hmac' | 'check-transaction';
}

function formatRequestTime(date: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`
  );
}

function formatTransactionDate(date: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())} ` +
    `${p(date.getUTCHours())}:${p(date.getUTCMinutes())}:${p(date.getUTCSeconds())}`
  );
}

const STATUS_BY_EVENT: Record<
  Exclude<
    WebhookFixtureEvent,
    'khqr.notification' | 'payment-link.pushback' | 'customer-qr.payment' | 'cof-link.linked'
  >,
  { status: keyof typeof PAYMENT_STATUS_CODES; code: number }
> = {
  'payment.approved': { status: 'APPROVED', code: PAYMENT_STATUS_CODES.APPROVED },
  'payment.declined': { status: 'DECLINED', code: PAYMENT_STATUS_CODES.DECLINED },
  'payment.pending': { status: 'PENDING', code: PAYMENT_STATUS_CODES.PENDING },
  'payment.refunded': { status: 'REFUNDED', code: PAYMENT_STATUS_CODES.REFUNDED },
  'payment.cancelled': { status: 'CANCELLED', code: PAYMENT_STATUS_CODES.CANCELLED },
};

function autoTranId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${randomBytes(3).toString('hex')}`.slice(0, 20);
}

/**
 * Build one fixture delivery. Online checkout fixtures are signed with the
 * merchant's API key; KHQR and payment-link fixtures are unsigned (their
 * real-world contracts carry no hash). Throws for unknown event names.
 */
export function buildWebhookFixture(
  event: WebhookFixtureEvent,
  apiKey: string | undefined,
  overrides: WebhookFixtureOverrides = {},
): WebhookFixture {
  const now = new Date();
  const currency = overrides.currency ?? 'USD';
  const amount =
    overrides.amount !== undefined
      ? overrides.amount
      : currency === 'KHR'
        ? 40000
        : 10;
  const amountStr = currency === 'KHR' ? String(Math.round(amount)) : amount.toFixed(2);
  const tranId = overrides.tranId ?? autoTranId('mock-');

  if (event === 'customer-qr.payment') {
    // Customer Module ("Printed QR") callback — the merchant-captured shape
    // (2026-08-18): KHQR fields + payer_name + nested portal customer object,
    // SIGNED with X-PAYWAY-HMAC-SHA512 (unlike the offline notification).
    if (apiKey === undefined || apiKey.trim() === '') {
      throw new Error(
        `fixture "${event}" is an HMAC-signed Customer Module callback and needs the merchant API key (PAYWAY_API_KEY) to sign with`,
      );
    }
    const customerId = overrides.merchantRef ?? tranId;
    const parsed: Record<string, unknown> = {
      payment_status_code: PAYMENT_STATUS_CODES.APPROVED,
      // The --tran-id override IS the gateway transaction id here (like every
      // other event) — the CLI prints it and receivers correlate on it.
      transaction_id: tranId,
      payment_status: 'APPROVED',
      apv: String(Math.floor(100000 + Math.random() * 899999)),
      original_amount: amount,
      original_currency: currency,
      payment_amount: amount,
      payment_currency: currency,
      payment_type: 'ABA Pay',
      transaction_date: formatTransactionDate(now),
      bank_ref: `100SB${Date.now()}`,
      payer_account: `*${String(Math.floor(100 + Math.random() * 899))}`,
      payer_name: overrides.payerName ?? 'Mock Payer',
      bank_name: 'ABA Bank',
      merchant_ref: customerId,
      customer: {
        type: 'individual',
        customer_id: customerId,
        customer_name: overrides.customerName ?? 'Mock Customer',
        vat_tin: '',
        email: '',
        phone: '',
        address: '',
        remark: '',
      },
    };
    const signature = signCallbackBody(parsed, apiKey);
    return {
      event,
      route: '/aba-payway-khqr-webhook',
      body: JSON.stringify(parsed),
      parsed,
      signature,
      tranId: String(parsed.transaction_id),
      verification: 'hmac',
    };
  }

  if (event === 'khqr.notification') {
    const parsed: Record<string, unknown> = {
      transaction_id: String(Math.floor(Math.random() * 1e15)),
      transaction_date: formatTransactionDate(now),
      original_currency: currency,
      original_amount: amount,
      bank_ref: `100SB${Date.now()}`,
      apv: String(Math.floor(100000 + Math.random() * 899999)),
      payment_status_code: PAYMENT_STATUS_CODES.APPROVED,
      payment_status: 'APPROVED',
      payment_currency: currency,
      payment_amount: amount,
      payment_type: 'KHQR',
      payer_account: `*${String(Math.floor(100 + Math.random() * 899))}`,
      bank_name: 'ABA Bank',
      merchant_ref: overrides.merchantRef ?? tranId,
    };
    return {
      event,
      route: '/aba-payway-khqr-webhook',
      body: JSON.stringify(parsed),
      parsed,
      tranId: String(parsed.merchant_ref),
      verification: 'check-transaction',
    };
  }

  if (event === 'payment-link.pushback') {
    // Live-verified shape (SANDBOX-FINDINGS §22 V-1): application/json,
    // {tran_id, status: 0, merchant_ref_no} — status numeric, NO hash field.
    const parsed: Record<string, unknown> = {
      tran_id: tranId,
      status: 0,
      merchant_ref_no: overrides.merchantRef ?? tranId,
    };
    return {
      event,
      route: '/aba-payway-pushback',
      body: JSON.stringify(parsed),
      parsed,
      tranId,
      verification: 'check-transaction',
    };
  }

  if (event === 'cof-link.linked') {
    // Credentials-on-file link callback rehearsal — now the LIVE shape
    // (first capture 2026-09-15, §26 AOF-7): request_id at the top level,
    // everything token-specific nested in payment_credential. The gateway's
    // header-signature canonicalization is still undocumented (§26 AOF-8),
    // so the fixture keeps signing via the classic body `hash` FIELD
    // (sorted-key HMAC, no signature header) — exercising the receiver's
    // body-hash verification and token persistence.
    if (apiKey === undefined || apiKey.trim() === '') {
      throw new Error(
        `fixture "${event}" is a body-hash-signed CoF link callback and needs the merchant API key (PAYWAY_API_KEY) to sign with`,
      );
    }
    const requestId = overrides.tranId ?? autoTranId('cof');
    const ctid = overrides.ctid ?? 'mockcust01';
    const parsed: Record<string, unknown> = {
      request_id: requestId,
      payment_credential: {
        ctid,
        pwt: overrides.pwt ?? `pwt-${randomBytes(12).toString('hex')}`,
        source_of_fund: '*****0003',
        type: 'ABA ACCOUNT',
        status: 1,
        expired_at: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString(),
        token_flag: overrides.tokenFlag ?? 'CITI_FLEX',
        frequency: '',
        subscribed_amount: 0.0,
        amount_limit_per_tran: 50,
        currency: 'USD',
      },
    };
    const signature = signCallbackBody(parsed, apiKey);
    const bodyWithHash: Record<string, unknown> = { ...parsed, hash: signature };
    return {
      event,
      route: '/aba-payway-webhook',
      body: JSON.stringify(bodyWithHash),
      parsed: bodyWithHash,
      signature,
      signatureChannel: 'body',
      tranId: requestId,
      verification: 'hmac',
    };
  }

  // Online checkout callback family.
  const { status, code } = STATUS_BY_EVENT[event];
  if (apiKey === undefined || apiKey.trim() === '') {
    throw new Error(
      `fixture "${event}" is an HMAC-signed online checkout callback and needs the merchant API key (PAYWAY_API_KEY) to sign with`,
    );
  }
  const parsed: Record<string, unknown> = {
    apv: String(Math.floor(100000 + Math.random() * 899999)),
    bank_name: 'ABA Bank',
    bank_ref: `100SB${Date.now()}`,
    merchant_ref: overrides.merchantRef ?? tranId,
    original_amount: amountStr,
    original_currency: currency,
    payment_amount: amountStr,
    payment_currency: currency,
    payment_status: status,
    payment_status_code: code,
    payment_timestamp: formatRequestTime(now),
    payment_type: 'ABA Pay',
    payer_account: `*${String(Math.floor(100 + Math.random() * 899))}`,
    payer_name: overrides.payerName ?? 'Mock Payer',
    transaction_date: formatTransactionDate(now),
    tran_id: tranId,
  };
  const signature = signCallbackBody(parsed, apiKey);
  return {
    event,
    route: '/aba-payway-webhook',
    body: JSON.stringify(parsed),
    parsed,
    signature,
    tranId,
    verification: 'hmac',
  };
}
