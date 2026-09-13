/**
 * SQLite storage round-trip coverage (HANDOFF §5.2).
 *
 * `better-sqlite3` is an optional peer dep — this suite runs ONLY when the
 * driver is installed (`npm i -D better-sqlite3`). With it absent, every test
 * skips and the load-failure branch remains covered by the factory suite.
 * Mirrors webhook-storage-factory.test.ts cases plus BOTH parse-metadata
 * slots (khqr + paymentLinkPushback — the C2 addition) and the pre-existing
 * database migration (khqr_json/pushback_json columns added via ALTER).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteWebhookStorage } from '../webhook/storage-sqlite.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'payway-sqlite-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function driverAvailable(): Promise<boolean> {
  try {
    await import('better-sqlite3');
    return true;
  } catch {
    return false;
  }
}

const hasDriver = await driverAvailable();
const maybeDescribe = hasDriver ? describe : describe.skip;

maybeDescribe('SqliteWebhookStorage round-trip (driver installed)', () => {
  it('save/getAll/count round-trips the raw delivery', async () => {
    const dir = makeTempDir();
    const storage = await SqliteWebhookStorage.create(path.join(dir, 'callbacks.db'));

    const record = storage.save({
      headers: { 'content-type': 'application/json' },
      body: '{"status":"SUCCESS"}',
      sourceIp: '127.0.0.1',
    });
    expect(record.id).toMatch(/^wh_/);
    expect(record.receivedAt).toBeTruthy();

    const all = storage.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].body).toBe('{"status":"SUCCESS"}');
    expect(all[0].sourceIp).toBe('127.0.0.1');
    expect(storage.count()).toBe(1);
    storage.close();
  });

  it('attaches khqr parse metadata and survives reopen', async () => {
    const dir = makeTempDir();
    const dbPath = path.join(dir, 'callbacks.db');
    const storage = await SqliteWebhookStorage.create(dbPath);

    const record = storage.save({ headers: {}, body: '{"transaction_id":"K1"}' });
    const updated = storage.updateKhqrMetadata(record.id, {
      parsed: {
        kind: 'khqr-offline',
        schema: 'aba-khqr-payment-notification-v1',
        verification: 'unverified',
        notification: {
          transactionId: 'K1',
          transactionDate: '2026-08-21 10:15:30',
          originalCurrency: 'USD',
          originalAmount: 1,
          bankRef: 'BANK-REF-1',
          apv: '123456',
          paymentStatusCode: 0,
          paymentStatus: 'APPROVED',
          paymentCurrency: 'USD',
          paymentAmount: 1,
          paymentType: 'KHQR',
          payerAccount: 'payer@example.com',
          bankName: 'Example Bank',
          merchantRef: 'mr',
        },
        raw: { transaction_id: 'K1' },
        unknownFields: {},
      },
    });
    expect(updated.khqr?.parsed?.notification.transactionId).toBe('K1');

    storage.close();
    const reopened = await SqliteWebhookStorage.create(dbPath);
    const restored = reopened.getAll()[0];
    expect(restored.khqr?.parsed?.notification.transactionId).toBe('K1');
    reopened.close();
  });

  it('attaches paymentLinkPushback metadata (C2 slot) and survives reopen', async () => {
    const dir = makeTempDir();
    const dbPath = path.join(dir, 'callbacks.db');
    const storage = await SqliteWebhookStorage.create(dbPath);

    const record = storage.save({
      headers: { 'user-agent': 'PayWayApp/3.0' },
      body: '{"tran_id":"178865526240157","status":0,"merchant_ref_no":"r1"}',
    });
    const updated = storage.updatePaymentLinkPushbackMetadata(record.id, {
      parsed: {
        tranId: '178865526240157',
        status: 'APPROVED',
        merchantRefNo: 'r1',
        raw: { tran_id: '178865526240157', status: 0, merchant_ref_no: 'r1' },
      },
    });
    expect(updated.paymentLinkPushback?.parsed?.status).toBe('APPROVED');

    storage.close();
    const reopened = await SqliteWebhookStorage.create(dbPath);
    const restored = reopened.getAll()[0];
    expect(restored.paymentLinkPushback?.parsed?.tranId).toBe('178865526240157');
    expect(restored.paymentLinkPushback?.parsed?.merchantRefNo).toBe('r1');
    reopened.close();
  });

  it('migrates a pre-C2 database by adding the pushback_json column', async () => {
    const dir = makeTempDir();
    const dbPath = path.join(dir, 'legacy.db');
    const storage = await SqliteWebhookStorage.create(dbPath);
    storage.save({ headers: {}, body: '{"a":1}' });
    storage.close();

    const reopened = await SqliteWebhookStorage.create(dbPath);
    const record = reopened.getAll()[0];
    const updated = reopened.updatePaymentLinkPushbackMetadata(record.id, { parseError: 'smoke' });
    expect(updated.paymentLinkPushback?.parseError).toBe('smoke');
    reopened.close();
  });

  it('updateKhqrMetadata throws for an unknown record id', async () => {
    const dir = makeTempDir();
    const storage = await SqliteWebhookStorage.create(path.join(dir, 'callbacks.db'));
    expect(() => storage.updateKhqrMetadata('wh_missing', { parseError: 'x' })).toThrow(/not found/);
    storage.close();
  });

  it('corrupt file surfaces a clear create error', async () => {
    const dir = makeTempDir();
    const dbPath = path.join(dir, 'corrupt.db');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(dbPath, 'this is not a sqlite database');
    await expect(SqliteWebhookStorage.create(dbPath)).rejects.toThrow();
  });
});

maybeDescribe('SqliteWebhookStorage customerQr metadata (Customer Module callbacks)', () => {
  it('round-trips the parsed Customer Module callback (driver installed)', async () => {
    const dir = makeTempDir();
    const storage = await SqliteWebhookStorage.create(path.join(dir, 'callbacks.db'));
    const raw = {
      payment_status_code: 0,
      transaction_id: '178702944869996',
      payment_status: 'APPROVED',
      apv: '118954',
      original_amount: 0.38,
      original_currency: 'USD',
      payment_amount: 0.38,
      payment_currency: 'USD',
      payment_type: 'ABA Pay',
      transaction_date: '2026-08-18 12:04:08',
      bank_ref: '100SB1787029448',
      payer_account: '*001',
      payer_name: 'Payer Name',
      bank_name: 'ABA Bank',
      merchant_ref: 'dt-one-8989',
      customer: { customer_id: 'dt-one-8989', customer_name: 'dhitraj' },
    };
    const saved = storage.save({ headers: {}, body: JSON.stringify(raw) });
    const { parseCustomerQrCallback } = await import('../webhook/customer-callback.js');
    const updated = storage.updateCustomerQrMetadata(saved.id, { parsed: parseCustomerQrCallback(raw) });
    expect(updated.customerQr?.parsed?.kind).toBe('customer-module-qr');

    storage.close();
    const reopened = await SqliteWebhookStorage.create(path.join(dir, 'callbacks.db'));
    const record = reopened.getAll()[0];
    expect(record.customerQr?.parsed?.notification.merchantRef).toBe('dt-one-8989');
    expect(record.customerQr?.parsed?.notification.customer?.customer_name).toBe('dhitraj');
    reopened.close();
  });

  it('migrates a pre-customerQr database in place (customer_qr_json column added)', async () => {
    const dir = makeTempDir();
    const dbPath = path.join(dir, 'legacy.db');
    const { DatabaseSync } = await import('node:sqlite') as { DatabaseSync: new (p: string) => { exec(sql: string): void; close(): void } };
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE callbacks (
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
    )`);
    legacy.exec("INSERT INTO callbacks (record_id, received_at, headers_json, body) VALUES ('wh_legacy1', '2026-01-01T00:00:00Z', '{}', '{}')");
    legacy.close();

    const storage = await SqliteWebhookStorage.create(dbPath);
    const record = storage.getAll()[0];
    expect(record.id).toBe('wh_legacy1');
    expect(record.customerQr).toBeUndefined();
    const updated = storage.updateCustomerQrMetadata('wh_legacy1', { parseError: 'migrated' });
    expect(updated.customerQr?.parseError).toBe('migrated');
    storage.close();
  });
});


maybeDescribe('SqliteWebhookStorage.fromDb (shared handle)', () => {
  it('round-trips records on a caller-owned db the instance does not close', async () => {
    const dir = makeTempDir();
    const dbPath = path.join(dir, 'payway.db');
    const mod = await import('better-sqlite3');
    const Sqlite3 = (mod.default ?? mod) as new (p: string) => import('../journal/sink-sqlite.js').SqliteDb;
    const db = new Sqlite3(dbPath);
    db.pragma('journal_mode = WAL');

    const storage = SqliteWebhookStorage.fromDb(db as never);
    const record = storage.save({ headers: { 'user-agent': 'ua' }, body: '{"tran_id":"F1"}' });
    expect(storage.getAll()).toHaveLength(1);
    expect(storage.getAll()[0].id).toBe(record.id);

    storage.close(); // shared mode: must NOT close the underlying handle
    const reopened = SqliteWebhookStorage.fromDb(db as never);
    expect(reopened.getAll()[0].id).toBe(record.id);

    // The facade owns the handle; after IT closes, the file is released (Windows check).
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
