/**
 * SQLite linked-token store — the second backend for captured CoF `pwt`
 * tokens (storage wave 3, .scratch/storage-service/plan-3.md).
 *
 * Same record shape and (ctid, pwt) upsert semantics as the JSON store
 * (src/webhook/token-store.ts), backed by a caller-owned better-sqlite3
 * handle — the StorageService facade opens one shared `<dataRoot>/payway.db`
 * for every store, so this class never closes the db itself.
 *
 * Rowid order defines "insertion order" (the JSON store's array order), which
 * is what `latestForCtid` relies on. The pwt stays plaintext exactly like the
 * JSON store; masking is a display concern (maskPwt).
 */

import type { LinkedTokenRecord } from './token-store.js';
import type { SqliteDb } from '../journal/sink-sqlite.js';

/** Create the linked_tokens table if absent (duplicate-tolerant, shared handles). */
export function prepareLinkedTokensSchema(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS linked_tokens (
      ctid TEXT NOT NULL,
      pwt TEXT NOT NULL,
      link_type TEXT,
      token_flag TEXT,
      frequency TEXT,
      currency TEXT,
      request_id TEXT,
      extra_fields TEXT,
      captured_at TEXT NOT NULL,
      source_record_id TEXT,
      PRIMARY KEY (ctid, pwt)
    )
  `);
}

interface TokenRow {
  ctid: string;
  pwt: string;
  link_type: string | null;
  token_flag: string | null;
  frequency: string | null;
  currency: string | null;
  request_id: string | null;
  extra_fields: string | null;
  captured_at: string;
  source_record_id: string | null;
}

function rowToRecord(row: TokenRow): LinkedTokenRecord {
  let extraFields: Record<string, string> | undefined;
  if (row.extra_fields) {
    try {
      const parsed: unknown = JSON.parse(row.extra_fields);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        extraFields = parsed as Record<string, string>;
      }
    } catch {
      extraFields = undefined; // a corrupt extras blob must not break reads
    }
  }
  return {
    ctid: row.ctid,
    pwt: row.pwt,
    ...(row.link_type ? { linkType: row.link_type as LinkedTokenRecord['linkType'] } : {}),
    ...(row.token_flag ? { tokenFlag: row.token_flag } : {}),
    ...(row.frequency ? { frequency: row.frequency } : {}),
    ...(row.currency ? { currency: row.currency } : {}),
    ...(row.request_id ? { requestId: row.request_id } : {}),
    ...(extraFields ? { extraFields } : {}),
    capturedAt: row.captured_at,
    ...(row.source_record_id ? { sourceRecordId: row.source_record_id } : {}),
  };
}

export class SqliteLinkedTokenStore {
  private readonly db: SqliteDb;

  constructor(db: SqliteDb) {
    prepareLinkedTokensSchema(db);
    this.db = db;
  }

  load(): LinkedTokenRecord[] {
    const rows = this.db.prepare('SELECT * FROM linked_tokens ORDER BY rowid').all() as TokenRow[];
    return rows.map(rowToRecord);
  }

  save(record: Omit<LinkedTokenRecord, 'capturedAt'> & { capturedAt?: string }): LinkedTokenRecord {
    const full: LinkedTokenRecord = { capturedAt: new Date().toISOString(), ...record };
    this.db
      .prepare(
        `INSERT OR REPLACE INTO linked_tokens
           (ctid, pwt, link_type, token_flag, frequency, currency, request_id, extra_fields, captured_at, source_record_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        full.ctid,
        full.pwt,
        full.linkType ?? null,
        full.tokenFlag ?? null,
        full.frequency ?? null,
        full.currency ?? null,
        full.requestId ?? null,
        full.extraFields ? JSON.stringify(full.extraFields) : null,
        full.capturedAt,
        full.sourceRecordId ?? null,
      );
    return full;
  }

  latestForCtid(ctid: string): LinkedTokenRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM linked_tokens WHERE ctid = ? ORDER BY rowid DESC LIMIT 1')
      .get(ctid) as TokenRow | undefined;
    return row ? rowToRecord(row) : undefined;
  }

  /** Delete by ctid — or one specific pwt — and return the removed count. */
  remove(ctid: string, pwt?: string): number {
    const result =
      pwt === undefined
        ? this.db.prepare('DELETE FROM linked_tokens WHERE ctid = ?').run(ctid)
        : this.db.prepare('DELETE FROM linked_tokens WHERE ctid = ? AND pwt = ?').run(ctid, pwt);
    return Number(result.changes ?? 0);
  }
}
