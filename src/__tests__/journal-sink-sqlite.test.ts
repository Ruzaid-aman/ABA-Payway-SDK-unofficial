/**
 * SQLite journal sink tests — driver-gated (skips cleanly when the optional
 * `better-sqlite3` peer dep is absent). Mirrors webhook-storage-sqlite.test.ts
 * conventions. Exercise: emit→read round-trip, prune, unknown-kind tolerance.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  pruneSqliteJournal,
  readSqliteJournalEvents,
  SqliteJournalSink,
  type SqliteDb,
} from '../journal/sink-sqlite.js';
import { JOURNAL_VERSION, type JournalEventV1 } from '../journal/types.js';

let Sqlite3: new (path: string) => SqliteDb | null = null as never;
let driverAvailable = false;
try {
  const mod = await import('better-sqlite3');
  Sqlite3 = (mod.default ?? mod) as new (path: string) => SqliteDb;
  driverAvailable = true;
} catch {
  driverAvailable = false;
}

const maybeDescribe = driverAvailable ? describe : describe.skip;

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function makeDb(): { db: SqliteDb; dir: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'payway-journal-sqlite-'));
  tempDirs.push(dir);
  const db = new Sqlite3(path.join(dir, 'payway.db')) as SqliteDb;
  db.pragma('journal_mode = WAL');
  return { db, dir };
}

let seq = 0;
function event(partial: Partial<JournalEventV1>): JournalEventV1 {
  seq += 1;
  return {
    version: JOURNAL_VERSION,
    ts: new Date().toISOString(),
    eventId: `ev-${seq}`,
    kind: 'execution.request',
    correlationId: 'c1',
    ...partial,
  } as JournalEventV1;
}

maybeDescribe('SqliteJournalSink (driver installed)', () => {
  it('emit → read round-trips the full payload in insertion order', () => {
    const { db } = makeDb();
    const sink = new SqliteJournalSink(db);
    sink.emit(event({ transactionId: 'T1' }));
    sink.emit(event({ kind: 'execution.response', transactionId: 'T1', httpStatus: 200 }));

    const read = readSqliteJournalEvents(db);
    expect(read.malformed).toBe(0);
    expect(read.events.map((e) => e.kind)).toEqual(['execution.request', 'execution.response']);
    expect(read.events[0].transactionId).toBe('T1');
    expect(read.events[1].httpStatus).toBe(200);
    expect(read.events[0].version).toBe(JOURNAL_VERSION);
    db.close();
  });

  it('re-emitting the same eventId replaces in place (crash-safe idempotence)', () => {
    const { db } = makeDb();
    const sink = new SqliteJournalSink(db);
    const e = event({ transactionId: 'T2' });
    sink.emit(e);
    sink.emit({ ...e, transactionId: 'T2-updated' });

    const read = readSqliteJournalEvents(db);
    expect(read.events).toHaveLength(1);
    expect(read.events[0].transactionId).toBe('T2-updated');
    db.close();
  });

  it('prune drops events older than the cutoff and keeps the rest', () => {
    const { db } = makeDb();
    const sink = new SqliteJournalSink(db);
    const old = event({ ts: '2020-01-01T00:00:00.000Z' });
    const fresh = event({ ts: new Date('2099-01-01T00:00:00.000Z').toISOString() });
    sink.emit(old);
    sink.emit(fresh);

    const result = pruneSqliteJournal(db, new Date('2026-01-01T00:00:00.000Z'));
    expect(result.removed).toBe(1);
    expect(result.kept).toBe(1);
    expect(readSqliteJournalEvents(db).events.map((e) => e.eventId)).toEqual([fresh.eventId]);
    db.close();
  });

  it('tolerates payloads written by future readers (unknown kinds preserved)', () => {
    const { db } = makeDb();
    const sink = new SqliteJournalSink(db);
    sink.emit(event({}));
    db.exec(
      `INSERT INTO journal_events (event_id, ts, kind, payload) VALUES ('future-1', '2026-09-13T00:00:00.000Z', 'future.kind', '{"version":"payway-journal/v1","kind":"future.kind"}')`,
    );
    const read = readSqliteJournalEvents(db);
    expect(read.events.map((e) => (e as { kind: string }).kind)).toContain('future.kind');
    db.close();
  });
});
