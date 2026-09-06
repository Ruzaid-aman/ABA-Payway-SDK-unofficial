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
