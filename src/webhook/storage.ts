import type { PaymentLinkPushback } from '../domains/payment-link.js';
import type { ParsedCustomerQrCallback } from './customer-callback.js';
import type { ParsedKhqrPaymentNotification } from './khqr-notification.js';

/**
 * Webhook storage interface and types.
 *
 * Provides a generic persistence layer for raw PayWay callback payloads.
 * Two implementations: JSON file (zero deps, default) and SQLite (optional peer dep).
 */

/**
 * Signature verification outcome for the online checkout callback route
 * (Phase 3 — the verdict is now part of the durable record; previously it
 * was computed, logged, then dropped: audit gap G7).
 */
export type WebhookSignatureVerdict = 'verified' | 'invalid' | 'unsigned';

export interface WebhookRecord {
  /** Auto-generated unique identifier. */
  readonly id: string;
  /** ISO-8601 timestamp of when the callback was received. */
  readonly receivedAt: string;
  /** Raw HTTP headers from the incoming request. */
  readonly headers: Record<string, string | string[] | undefined>;
  /** Raw, unvalidated request body as a string. */
  readonly body: string;
  /** Source IP address of the client, if available. */
  readonly sourceIp?: string;
  /** Offline KHQR parsing metadata. The raw body remains the audit source. */
  readonly khqr?: KhqrWebhookMetadata;
  /**
   * Online-route signature verification outcome. Unset on records stored by
   * older versions; the KHQR route never sets it (no published auth contract).
   */
  readonly signatureVerdict?: WebhookSignatureVerdict;
  /**
   * Where a VERIFIED signature traveled: the `x-payway-hmac-sha512` header
   * or the classic body `hash` field (the Q18 CoF callback contract may use
   * either; first live capture pins it). Unset when no signature verified
   * (unsigned/invalid/legacy records).
   */
  readonly signatureSource?: 'header' | 'body';
  /** Why verification failed — only present when `signatureVerdict === 'invalid'`. */
  readonly verificationReason?: 'signature_mismatch' | 'malformed_signature' | 'empty_body';
  /** `tran_id`/`transaction_id` extracted best-effort from the raw body — the correlation join key (gap G8). */
  readonly matchedTransactionId?: string;
  /** Status field extracted alongside the transaction id (drives replay detection). */
  readonly matchedStatus?: string;
  /** True when a prior stored record already carries the same (matchedTransactionId, matchedStatus) — a replay marker for idempotent processing. */
  readonly replay?: boolean;
  /** Payment-link pushback parsing metadata. The raw body remains the audit source. */
  readonly paymentLinkPushback?: PaymentLinkPushbackMetadata;
  /**
   * Customer Module ("Printed QR") callback parsing metadata, attached when a
   * captured delivery classifies as a customer-module callback. The raw body
   * remains the audit source.
   */
  readonly customerQr?: CustomerQrWebhookMetadata;
}

export interface KhqrWebhookMetadata {
  readonly parsed?: ParsedKhqrPaymentNotification;
  readonly parseError?: string;
  /** A prior captured notification had the same ABA transaction ID. */
  readonly duplicateTransactionId?: boolean;
}

export interface CustomerQrWebhookMetadata {
  readonly parsed?: ParsedCustomerQrCallback;
  readonly parseError?: string;
}

export interface PaymentLinkPushbackMetadata {
  /** Parsed pushback (see `parsePaymentLinkPushback`). The raw body is the audit source. */
  readonly parsed?: PaymentLinkPushback;
  /** Why the body could not be parsed, when parsing failed. */
  readonly parseError?: string;
}

export interface WebhookStorage {
  /**
   * Persist a raw webhook payload.
   * The `receivedAt` and `id` fields are populated by the implementation.
   */
  save(record: Omit<WebhookRecord, 'id' | 'receivedAt'>): WebhookRecord;

  /** Attach offline-KHQR parse metadata after the raw delivery is durable. */
  updateKhqrMetadata?(id: string, khqr: KhqrWebhookMetadata): WebhookRecord;

  /** Attach payment-link pushback parse metadata after the raw delivery is durable. */
  updatePaymentLinkPushbackMetadata?(id: string, pushback: PaymentLinkPushbackMetadata): WebhookRecord;

  /** Attach Customer Module callback parse metadata after the raw delivery is durable. */
  updateCustomerQrMetadata?(id: string, customerQr: CustomerQrWebhookMetadata): WebhookRecord;

  /** Retrieve all stored records, ordered by insertion time. */
  getAll(): WebhookRecord[];

  /** Return the total number of stored records. */
  count(): number;

  /** Release any resources (file handles, database connections). */
  close(): void;
}
