/**
 * SQLite journal sink — the second backend for the transaction journal
 * (storage wave 3, .scratch/storage-service/plan-3.md).
 *
 * Same `JournalSink` contract as the JSONL sink, backed by an optional
 * `better-sqlite3` handle the CALLER owns (the StorageService facade opens
 * one shared `<dataRoot>/payway.db` for every store, so this sink never
 * closes the db itself). Events are stored as full JSON payloads keyed by
 * their eventId — `INSERT OR REPLACE` makes re-emits idempotent after a
 * crash, and unknown `kind` values / future fields round-trip untouched
 * (the same reader contract as the JSONL file).
 *
 * Fail-open stays the emitter's job (createJournalEmitterForSink wraps every
 * emit in try/catch) — the sink itself may throw, matching JsonlJournalSink's
 * division of labor.
 */

import type { JournalFileRead, JournalPruneResult } from './writer.js';
import type { JournalEventV1 } from './types.js';

/** Minimal structural type for the better-sqlite3 surface the stores use. */
export interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number | bigint };
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
  };
  close(): void;
  pragma(sql: string): void;
}

/** Create the journal table if absent (duplicate-tolerant, shared handles). */
export function prepareJournalSchema(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS journal_events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      ts TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_journal_events_ts ON journal_events(ts)');
}

export class SqliteJournalSink {
  private readonly insert: ReturnType<SqliteDb['prepare']>;

  constructor(db: SqliteDb) {
    prepareJournalSchema(db);
    this.insert = db.prepare(
      `INSERT OR REPLACE INTO journal_events (event_id, ts, kind, payload) VALUES (?, ?, ?, ?)`,
    );
  }

  emit(event: JournalEventV1): void {
    this.insert.run(event.eventId, event.ts, event.kind, JSON.stringify(event));
  }
}

/** Read every journaled event in insertion order (unknown payloads counted, not fatal). */
export function readSqliteJournalEvents(db: SqliteDb): JournalFileRead {
  prepareJournalSchema(db);
  const rows = db.prepare('SELECT payload FROM journal_events ORDER BY seq').all() as Array<{
    payload: string;
  }>;
  const events: JournalEventV1[] = [];
  let malformed = 0;
  for (const row of rows) {
    try {
      const parsed: unknown = JSON.parse(row.payload);
      if (parsed && typeof parsed === 'object' && typeof (parsed as JournalEventV1).kind === 'string') {
        events.push(parsed as JournalEventV1);
      } else {
        malformed += 1;
      }
    } catch {
      malformed += 1;
    }
  }
  return { file: 'sqlite:journal_events', events, malformed };
}

/** Drop events older than `before` by ts. Returns removed/kept counts. */
export function pruneSqliteJournal(db: SqliteDb, before: Date): JournalPruneResult {
  prepareJournalSchema(db);
  const cutoff = before.toISOString();
  const result = db.prepare('DELETE FROM journal_events WHERE ts < ?').run(cutoff);
  const removed = Number(result.changes ?? 0);
  const total = Number(
    (db.prepare('SELECT COUNT(*) AS n FROM journal_events').get() as { n: number | bigint }).n ?? 0,
  );
  return { removed, kept: total };
}
