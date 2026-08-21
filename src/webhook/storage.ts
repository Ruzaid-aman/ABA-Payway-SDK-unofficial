import type { ParsedKhqrPaymentNotification } from './khqr-notification.js';

/**
 * Webhook storage interface and types.
 *
 * Provides a generic persistence layer for raw PayWay callback payloads.
 * Two implementations: JSON file (zero deps, default) and SQLite (optional peer dep).
 */

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
}

export interface KhqrWebhookMetadata {
  readonly parsed?: ParsedKhqrPaymentNotification;
  readonly parseError?: string;
  /** A prior captured notification had the same ABA transaction ID. */
  readonly duplicateTransactionId?: boolean;
}

export interface WebhookStorage {
  /**
   * Persist a raw webhook payload.
   * The `receivedAt` and `id` fields are populated by the implementation.
   */
  save(record: Omit<WebhookRecord, 'id' | 'receivedAt'>): WebhookRecord;

  /** Attach offline-KHQR parse metadata after the raw delivery is durable. */
  updateKhqrMetadata(id: string, khqr: KhqrWebhookMetadata): WebhookRecord;

  /** Retrieve all stored records, ordered by insertion time. */
  getAll(): WebhookRecord[];

  /** Return the total number of stored records. */
  count(): number;

  /** Release any resources (file handles, database connections). */
  close(): void;
}
