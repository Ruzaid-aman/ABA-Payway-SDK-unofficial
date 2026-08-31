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
