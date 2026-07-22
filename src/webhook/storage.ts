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
}

export interface WebhookStorage {
  /**
   * Persist a raw webhook payload.
   * The `receivedAt` and `id` fields are populated by the implementation.
   */
  save(record: Omit<WebhookRecord, 'id' | 'receivedAt'>): WebhookRecord;

  /** Retrieve all stored records, ordered by insertion time. */
  getAll(): WebhookRecord[];

  /** Return the total number of stored records. */
  count(): number;

  /** Release any resources (file handles, database connections). */
  close(): void;
}
