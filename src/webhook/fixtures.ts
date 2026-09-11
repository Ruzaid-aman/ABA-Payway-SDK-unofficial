/**
 * Signed callback fixtures for local webhook testing (P0 W-2 of
 * docs/competitive-analysis-cli-stripe-razorpay.md — Stripe `trigger` analog).
 *
 * Three fixture families mirror the three webhook-server routes:
 *  - `payment.approved` / `payment.declined` … — online checkout callbacks:
 *    the full documented callback body, SIGNED with the merchant's API key
 *    (same algorithm as the gateway: sorted-key concat → HMAC-SHA512 →
 *    Base64) so a correct receiver accepts them and a broken one rejects.
 *  - `khqr.notification` — offline KHQR payment notification (no published
 *    auth contract; delivered unsigned, matching the real contract).
 *  - `payment-link.pushback` — payment-link pushback, live-verified shape
 *    `{tran_id, status: 0, merchant_ref_no}` with NO hash field
 *    (SANDBOX-FINDINGS §22 V-1); verify via check-transaction, not HMAC.
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
  | 'payment-link.pushback';

export const WEBHOOK_FIXTURE_EVENTS: readonly WebhookFixtureEvent[] = [
  'payment.approved',
  'payment.declined',
  'payment.pending',
  'payment.refunded',
  'payment.cancelled',
  'customer-qr.payment',
  'khqr.notification',
  'payment-link.pushback',
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
  /** HMAC-SHA512 Base64 signature over the body (online route only). */
  signature?: string;
  /** Embedded transaction id (correlation key for check-transaction). */
  tranId: string;
  /**
   * How the receiving app must verify this delivery:
   * 'hmac' — X-PAYWAY-HMAC-SHA512 verifyCallback path;
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
  Exclude<WebhookFixtureEvent, 'khqr.notification' | 'payment-link.pushback' | 'customer-qr.payment'>,
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
      transaction_id: String(Math.floor(Math.random() * 1e15)),
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
