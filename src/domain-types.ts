/**
 * Hand-written SDK domain types.
 *
 * `src/types.ts` is fully generated from `payway-openapi/` via
 * `npm run generate-types` — any hand-written type placed there is
 * silently destroyed on regeneration. Everything that must survive a
 * regen lives here instead.
 */
import type { components } from './types.js';

// ─────────────────────── Transaction Polling Types ───────────────────────

/** Terminal payment statuses that stop the polling loop. */
export type TerminalPaymentStatus = 'APPROVED' | 'DECLINED' | 'CANCELLED' | 'REFUNDED';

/** Status values that indicate the transaction is still pending. */
export type PendingPaymentStatus = 'PENDING' | 'PRE-AUTH';

/** A single poll result yielded by the async iterator. */
export interface PollTransactionResult {
  /** The transaction ID being polled. */
  transactionId: string;
  /** 1-based poll attempt number. */
  attempt: number;
  /** The raw response from checkTransaction(). */
  response: components['schemas']['CheckTransactionResponse'];
  /** The extracted payment_status string (e.g. 'PENDING', 'APPROVED'). */
  paymentStatus: string;
  /** Whether this is a terminal status — polling will stop after this yield. */
  isTerminal: boolean;
  /** Duration of this specific poll HTTP request in milliseconds. */
  durationMs: number;
  /** ISO-8601 timestamp when this poll completed. */
  timestamp: string;
}

/** Configuration options for pollTransactionStatus(). */
export interface PollTransactionOptions {
  /** Poll interval in milliseconds. Default: 5000 (5 seconds). */
  intervalMs?: number;
  /** Maximum polling duration in milliseconds. Default: 600000 (10 minutes). */
  maxDurationMs?: number;
  /** Maximum consecutive poll errors before aborting. Default: 3. */
  maxConsecutiveErrors?: number;
}

// ─────────────────────── Link Card ───────────────────────

/**
 * Link-card responses are ALWAYS an HTML page (success and error alike)
 * per the live docs, so the gateway never returns this JSON envelope —
 * the SDK keeps the type as the "if the gateway ever speaks JSON" contract
 * and surfaces HTML as a structured error instead (see linkCard()).
 */
export interface LinkCardResponse {
  status?: {
    code?: string;
    message?: string;
  };
}

// ─────────────────────── Hosted Checkout (payment_gate 0) ───────────────────────

/**
 * Structured success for a hosted-checkout purchase: with `paymentGate: 0`
 * the gateway answers HTTP 200 with the full hosted "PayWay - Checkout"
 * HTML page as the response BODY — there is no `checkout_qr_url` JSON
 * field on today's gateway (campaign W2-1/W2-2, 2026-09-05). The
 * transaction IS created and PENDING at this point; the payment outcome
 * arrives through the merchant's return_url / return_params flow (or
 * `pollTransactionStatus()` / `check-transaction`).
 */
export interface PurchaseHostedHtmlResult {
  /** Discriminator: this object is a hosted-page success, not a QR JSON. */
  hosted_checkout: true;
  /** Content-Type of the gateway response (normally `text/html`). */
  content_type: string;
  /** The complete hosted checkout page — render it, redirect to it, or embed it. */
  html: string;
}
