/**
 * SQLite storage adapter for webhook payloads.
 *
 * Uses `better-sqlite3` (synchronous SQLite binding) to persist raw callback
 * payloads. The module is imported dynamically so the SDK remains usable
 * without this optional peer dependency.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { KhqrWebhookMetadata, PaymentLinkPushbackMetadata, WebhookRecord, WebhookStorage } from './storage.js';

const DEFAULT_PATH = './webhook_data/callbacks.db';

interface BetterSqlite3Database {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
  };
  close(): void;
  pragma(sql: string): void;
}

/**
 * Attempt to load better-sqlite3 dynamically.
 * Returns the constructor or `null` if the module is not installed.
 */
async function loadBetterSqlite3(): Promise<new (path: string) => BetterSqlite3Database> {
  try {
    const mod = await import('better-sqlite3');
    // biome-ignore lint/suspicious/noExplicitAny: dynamic import of optional peer dependency
    return (mod.default ?? mod) as any;
  } catch {
    return null as unknown as new (
      path: string,
    ) => BetterSqlite3Database;
  }
}

/** Add parse metadata to callback databases created before offline KHQR support. */
export function ensureKhqrMetadataColumn(db: Pick<BetterSqlite3Database, 'exec'>): void {
  try {
    db.exec('ALTER TABLE callbacks ADD COLUMN khqr_json TEXT');
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('duplicate column name') && message.includes('khqr_json')) return;
    throw error;
  }
}

/**
 * Phase 3: callback-correlation columns (signature verdict, extracted
 * transaction id/status, replay marker). Additive and duplicate-tolerant so
 * databases created before Phase 3 migrate in place.
 */
export function ensureCallbackMetadataColumns(db: Pick<BetterSqlite3Database, 'exec'>): void {
  const columns: Array<[string, string]> = [
    ['signature_verdict', 'TEXT'],
    ['verification_reason', 'TEXT'],
    ['matched_transaction_id', 'TEXT'],
    ['matched_status', 'TEXT'],
    ['replay', 'INTEGER'],
  ];
  for (const [name, type] of columns) {
    try {
      db.exec(`ALTER TABLE callbacks ADD COLUMN ${name} ${type}`);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('duplicate column name') && message.includes(name)) continue;
      throw error;
    }
  }
}

/** Add the payment-link pushback metadata column to pre-existing databases. */
export function ensurePushbackMetadataColumn(db: Pick<BetterSqlite3Database, 'exec'>): void {
  try {
    db.exec('ALTER TABLE callbacks ADD COLUMN pushback_json TEXT');
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('duplicate column name') && message.includes('pushback_json')) return;
    throw error;
  }
}

export class SqliteWebhookStorage implements WebhookStorage {
  private db: BetterSqlite3Database;

  private constructor(db: BetterSqlite3Database) {
    this.db = db;
  }

  /**
   * Create a SQLite storage instance.
   * @throws {Error} If `better-sqlite3` is not installed.
   */
  static async create(filePath?: string): Promise<SqliteWebhookStorage> {
    const Sqlite3 = await loadBetterSqlite3();
    if (!Sqlite3) {
      throw new Error(
        'better-sqlite3 is not installed. Install it with: npm install better-sqlite3\n' +
          'Or use --storage json for file-based storage.',
      );
    }

    const dbPath = filePath ? resolve(filePath) : resolve(DEFAULT_PATH);
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const db = new Sqlite3(dbPath);
    try {
      db.pragma('journal_mode = WAL');
      db.exec(`
        CREATE TABLE IF NOT EXISTS callbacks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          record_id TEXT NOT NULL,
          received_at TEXT NOT NULL,
          headers_json TEXT NOT NULL,
          body TEXT NOT NULL,
          source_ip TEXT,
          khqr_json TEXT,
          pushback_json TEXT,
          signature_verdict TEXT,
          verification_reason TEXT,
          matched_transaction_id TEXT,
          matched_status TEXT,
          replay INTEGER
        )
      `);
      ensureKhqrMetadataColumn(db);
      ensureCallbackMetadataColumns(db);
      ensurePushbackMetadataColumn(db);
    } catch (error) {
      // A failed open (corrupt file, bad pragma) must not leak the handle —
      // on Windows the open file blocks even the temp-dir cleanup.
      db.close();
      throw error;
    }

    return new SqliteWebhookStorage(db);
  }

  save(record: Omit<WebhookRecord, 'id' | 'receivedAt'>): WebhookRecord {
    const entry: WebhookRecord = {
      id: `wh_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`,
      receivedAt: new Date().toISOString(),
      ...record,
    };

    this.db
      .prepare(
        'INSERT INTO callbacks (record_id, received_at, headers_json, body, source_ip, khqr_json, pushback_json, signature_verdict, verification_reason, matched_transaction_id, matched_status, replay) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        entry.id,
        entry.receivedAt,
        JSON.stringify(entry.headers),
        entry.body,
        entry.sourceIp ?? null,
        entry.khqr ? JSON.stringify(entry.khqr) : null,
        entry.paymentLinkPushback ? JSON.stringify(entry.paymentLinkPushback) : null,
        entry.signatureVerdict ?? null,
        entry.verificationReason ?? null,
        entry.matchedTransactionId ?? null,
        entry.matchedStatus ?? null,
        entry.replay === undefined ? null : entry.replay ? 1 : 0,
      );

    return entry;
  }

  updateKhqrMetadata(id: string, khqr: KhqrWebhookMetadata): WebhookRecord {
    this.db.prepare('UPDATE callbacks SET khqr_json = ? WHERE record_id = ?').run(JSON.stringify(khqr), id);
    const updated = this.getAll().find((record) => record.id === id);
    if (!updated) throw new Error(`Webhook record ${id} was not found`);
    return updated;
  }

  updatePaymentLinkPushbackMetadata(id: string, pushback: PaymentLinkPushbackMetadata): WebhookRecord {
    this.db.prepare('UPDATE callbacks SET pushback_json = ? WHERE record_id = ?').run(JSON.stringify(pushback), id);
    const updated = this.getAll().find((record) => record.id === id);
    if (!updated) throw new Error(`Webhook record ${id} was not found`);
    return updated;
  }

  getAll(): WebhookRecord[] {
    const rows = this.db
      .prepare(
        'SELECT record_id, received_at, headers_json, body, source_ip, khqr_json, pushback_json, signature_verdict, verification_reason, matched_transaction_id, matched_status, replay FROM callbacks ORDER BY rowid ASC',
      )
      .all() as Array<{
      record_id: string;
      received_at: string;
      headers_json: string;
      body: string;
      source_ip: string | null;
      khqr_json: string | null;
      pushback_json: string | null;
      signature_verdict: string | null;
      verification_reason: string | null;
      matched_transaction_id: string | null;
      matched_status: string | null;
      replay: number | null;
    }>;

    return rows.map((row) => ({
      id: row.record_id,
      receivedAt: row.received_at,
      headers: JSON.parse(row.headers_json) as Record<string, string | string[] | undefined>,
      body: row.body,
      sourceIp: row.source_ip ?? undefined,
      khqr: row.khqr_json ? JSON.parse(row.khqr_json) : undefined,
      paymentLinkPushback: row.pushback_json ? JSON.parse(row.pushback_json) : undefined,
      signatureVerdict: (row.signature_verdict ?? undefined) as WebhookRecord['signatureVerdict'],
      verificationReason: (row.verification_reason ?? undefined) as WebhookRecord['verificationReason'],
      matchedTransactionId: row.matched_transaction_id ?? undefined,
      matchedStatus: row.matched_status ?? undefined,
      replay: row.replay === null || row.replay === undefined ? undefined : row.replay === 1,
    }));
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM callbacks').get() as { cnt: number };
    return row.cnt;
  }

  close(): void {
    this.db.close();
  }
}
