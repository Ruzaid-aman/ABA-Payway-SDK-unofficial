/**
 * SQLite linked-token store tests — driver-gated (skips cleanly when the
 * optional `better-sqlite3` peer dep is absent).
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { SqliteDb } from '../journal/sink-sqlite.js';
import { SqliteLinkedTokenStore } from '../webhook/token-store-sqlite.js';

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

function makeStore(): { store: SqliteLinkedTokenStore; db: SqliteDb } {
  const dir = mkdtempSync(path.join(tmpdir(), 'payway-token-sqlite-'));
  tempDirs.push(dir);
  const db = new Sqlite3(path.join(dir, 'payway.db')) as SqliteDb;
  db.pragma('journal_mode = WAL');
  return { store: new SqliteLinkedTokenStore(db), db };
}

maybeDescribe('SqliteLinkedTokenStore (driver installed)', () => {
  it('save → load round-trips every field including extraFields', () => {
    const { store, db } = makeStore();
    store.save({
      ctid: 'c1',
      pwt: 'pwt-aaaaaaaa1111',
      linkType: 'card',
      tokenFlag: 'CITI_FLEX',
      frequency: '1M',
      currency: 'USD',
      requestId: 'req-9',
      extraFields: { status: 'SUCCESS', mystery: 'field' },
      sourceRecordId: 'wh_1',
      capturedAt: '2026-09-13T00:00:00.000Z',
    });
    const records = store.load();
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({
      ctid: 'c1',
      pwt: 'pwt-aaaaaaaa1111',
      linkType: 'card',
      tokenFlag: 'CITI_FLEX',
      frequency: '1M',
      currency: 'USD',
      requestId: 'req-9',
      extraFields: { status: 'SUCCESS', mystery: 'field' },
      capturedAt: '2026-09-13T00:00:00.000Z',
      sourceRecordId: 'wh_1',
    });
    db.close();
  });

  it('re-saving the same (ctid, pwt) replaces in place without duplicating', () => {
    const { store, db } = makeStore();
    store.save({ ctid: 'c1', pwt: 'tok' });
    store.save({ ctid: 'c1', pwt: 'tok', requestId: 'req-newer' });
    expect(store.load()).toHaveLength(1);
    expect(store.load()[0].requestId).toBe('req-newer');
    db.close();
  });

  it('latestForCtid returns the most recently inserted token per ctid', () => {
    const { store, db } = makeStore();
    store.save({ ctid: 'c1', pwt: 'old' });
    store.save({ ctid: 'c1', pwt: 'new' });
    store.save({ ctid: 'c2', pwt: 'other' });
    expect(store.latestForCtid('c1')?.pwt).toBe('new');
    expect(store.latestForCtid('missing')).toBeUndefined();
    db.close();
  });

  it('remove deletes by ctid (or ctid+pwt) and reports the count', () => {
    const { store, db } = makeStore();
    store.save({ ctid: 'c1', pwt: 'a' });
    store.save({ ctid: 'c1', pwt: 'b' });
    store.save({ ctid: 'c2', pwt: 'c' });
    expect(store.remove('c1', 'a')).toBe(1);
    expect(store.load().map((t) => t.pwt)).toEqual(['b', 'c']);
    expect(store.remove('c1')).toBe(1);
    expect(store.load().map((t) => t.ctid)).toEqual(['c2']);
    expect(store.remove('missing')).toBe(0);
    db.close();
  });
});
