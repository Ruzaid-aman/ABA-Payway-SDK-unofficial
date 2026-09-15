/**
 * Tests for webhook storage adapters (JSON and SQLite).
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JsonWebhookStorage } from '../webhook/storage-json.js';
import { ensureCallbackMetadataColumns, ensureKhqrMetadataColumn } from '../webhook/storage-sqlite.js';
import { parseCustomerQrCallback } from '../webhook/customer-callback.js';

// ─── JSON Storage Tests ──────────────────────────────────────────────────

describe('JsonWebhookStorage', () => {
  let tempDir: string;
  let storage: JsonWebhookStorage;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'webhook-json-test-'));
    storage = new JsonWebhookStorage(join(tempDir, 'callbacks.jsonl'));
  });

  afterEach(() => {
    storage.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('saves and retrieves a single record', () => {
    const input = {
      headers: { 'content-type': 'application/json' },
      body: '{"status":"COMPLETED","id":"123"}',
      sourceIp: '127.0.0.1',
    };

    const saved = storage.save(input);

    expect(saved.id).toMatch(/^wh_/);
    expect(saved.receivedAt).toBeTruthy();
    expect(saved.body).toBe(input.body);
    expect(saved.headers).toEqual(input.headers);
    expect(saved.sourceIp).toBe('127.0.0.1');

    const all = storage.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(saved.id);
  });

  it('saves multiple records in order', () => {
    storage.save({ headers: {}, body: 'first', sourceIp: undefined });
    storage.save({ headers: {}, body: 'second', sourceIp: undefined });
    storage.save({ headers: {}, body: 'third', sourceIp: undefined });

    const all = storage.getAll();
    expect(all).toHaveLength(3);
    expect(all[0].body).toBe('first');
    expect(all[1].body).toBe('second');
    expect(all[2].body).toBe('third');
  });

  it('returns correct count', () => {
    expect(storage.count()).toBe(0);

    storage.save({ headers: {}, body: 'a', sourceIp: undefined });
    expect(storage.count()).toBe(1);

    storage.save({ headers: {}, body: 'b', sourceIp: undefined });
    expect(storage.count()).toBe(2);
  });

  it('creates directory if it does not exist', () => {
    const deepPath = join(tempDir, 'nested', 'dir', 'callbacks.jsonl');
    const deepStorage = new JsonWebhookStorage(deepPath);

    deepStorage.save({ headers: {}, body: 'test', sourceIp: undefined });

    expect(existsSync(deepPath)).toBe(true);
    deepStorage.close();
  });

  it('stores raw malformed JSON as-is (WH-TC-05)', () => {
    const malformedBody = '{invalid json content';
    storage.save({ headers: {}, body: malformedBody, sourceIp: undefined });

    const all = storage.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].body).toBe(malformedBody);
  });

  it('preserves all headers including arrays', () => {
    const headers = {
      'content-type': 'application/json',
      'x-custom-header': ['value1', 'value2'],
      'x-single': 'single-value',
      'x-undefined': undefined,
    };

    storage.save({ headers, body: '{}', sourceIp: undefined });

    const all = storage.getAll();
    expect(all[0].headers['content-type']).toBe('application/json');
    expect(all[0].headers['x-custom-header']).toEqual(['value1', 'value2']);
    expect(all[0].headers['x-single']).toBe('single-value');
  });

  it('returns empty array from empty file', () => {
    expect(storage.getAll()).toEqual([]);
  });

  it('generates unique IDs for each record', () => {
    const r1 = storage.save({ headers: {}, body: 'a', sourceIp: undefined });
    // Small delay to ensure different timestamp
    const r2 = storage.save({ headers: {}, body: 'b', sourceIp: undefined });

    expect(r1.id).not.toBe(r2.id);
  });

  it('includes ISO-8601 timestamp', () => {
    const saved = storage.save({ headers: {}, body: 'test', sourceIp: undefined });
    const date = new Date(saved.receivedAt);
    expect(date.toISOString()).toBe(saved.receivedAt);
  });

  it('keeps the raw JSONL record durable when atomic metadata replacement fails', () => {
    const failedRenameStorage = new JsonWebhookStorage(join(tempDir, 'failed-rename.jsonl'), {
      renameFile: () => {
        throw new Error('simulated rename failure');
      },
    });
    const saved = failedRenameStorage.save({ headers: {}, body: 'raw delivery', sourceIp: undefined });

    expect(() => failedRenameStorage.updateKhqrMetadata(saved.id, { parseError: 'invalid JSON' })).toThrow(
      'simulated rename failure',
    );
    expect(failedRenameStorage.getAll()).toEqual([saved]);
    expect(readFileSync(join(tempDir, 'failed-rename.jsonl'), 'utf-8')).toContain('raw delivery');
    failedRenameStorage.close();
  });
});

describe('ensureKhqrMetadataColumn', () => {
  it('ignores only an existing khqr_json column', () => {
    const db = {
      exec: vi.fn(() => {
        throw new Error('duplicate column name: khqr_json');
      }),
    };

    expect(() => ensureKhqrMetadataColumn(db)).not.toThrow();
  });

  it('propagates a SQLite migration error unrelated to an existing column', () => {
    const db = {
      exec: vi.fn(() => {
        throw new Error('database is locked');
      }),
    };

    expect(() => ensureKhqrMetadataColumn(db)).toThrow('database is locked');
  });
});

// ─── Phase 3: callback-correlation metadata ───────────────────────────────

describe('JsonWebhookStorage Phase 3 fields', () => {
  let tempDir: string;
  let storage: JsonWebhookStorage;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'webhook-json-p3-'));
    storage = new JsonWebhookStorage(join(tempDir, 'callbacks.jsonl'));
  });

  afterEach(() => {
    storage.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('round-trips the signature verdict, matched transaction and replay marker', () => {
    storage.save({
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tran_id: 'TX-P3', status: 'APPROVED' }),
      signatureVerdict: 'verified',
      matchedTransactionId: 'TX-P3',
      matchedStatus: 'APPROVED',
      replay: false,
    });
    storage.save({
      headers: {},
      body: JSON.stringify({ tran_id: 'TX-P3', status: 'APPROVED' }),
      signatureVerdict: 'invalid',
      verificationReason: 'signature_mismatch',
      matchedTransactionId: 'TX-P3',
      matchedStatus: 'APPROVED',
      replay: true,
    });

    const records = storage.getAll();
    expect(records).toHaveLength(2);
    expect(records[0].signatureVerdict).toBe('verified');
    expect(records[0].matchedTransactionId).toBe('TX-P3');
    expect(records[0].replay).toBe(false);
    expect(records[1].signatureVerdict).toBe('invalid');
    expect(records[1].verificationReason).toBe('signature_mismatch');
    expect(records[1].replay).toBe(true);
  });

  it('reads legacy records without the new fields (undefined, not throw)', () => {
    writeFileSync(join(tempDir, 'callbacks.jsonl'), `${JSON.stringify({ id: 'wh_old', receivedAt: new Date().toISOString(), headers: {}, body: 'x' })}\n`, 'utf-8');
    const [legacy] = storage.getAll();
    expect(legacy.id).toBe('wh_old');
    expect(legacy.signatureVerdict).toBeUndefined();
    expect(legacy.matchedTransactionId).toBeUndefined();
    expect(legacy.replay).toBeUndefined();
  });
});

describe('ensureCallbackMetadataColumns', () => {
  it('attempts all Phase-3 + Q18 columns and tolerates duplicates', () => {
    const executed: string[] = [];
    const db = {
      exec: (sql: string) => {
        executed.push(sql);
        if (executed.length > 2) {
          const column = sql.replace('ALTER TABLE callbacks ADD COLUMN ', '').split(' ')[0];
          throw new Error(`duplicate column name: ${column}`);
        }
      },
    };

    expect(() => ensureCallbackMetadataColumns(db)).not.toThrow();
    expect(executed).toHaveLength(6);
    expect(executed[0]).toContain('signature_verdict');
    expect(executed[4]).toContain('replay');
    expect(executed[5]).toContain('signature_source');
  });

  it('propagates a SQLite error unrelated to an existing column', () => {
    const db = {
      exec: () => {
        throw new Error('database is locked');
      },
    };

    expect(() => ensureCallbackMetadataColumns(db)).toThrow('database is locked');
  });
});

describe('JsonWebhookStorage customerQr metadata (Customer Module callbacks)', () => {
  let tempDir: string;
  let storage: JsonWebhookStorage;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'webhook-json-customer-qr-'));
    storage = new JsonWebhookStorage(join(tempDir, 'callbacks.jsonl'));
  });

  afterEach(() => {
    storage.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  const REAL_CUSTOMER_QR_BODY = {
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

  it('round-trips the parsed Customer Module callback via updateCustomerQrMetadata', () => {
    const saved = storage.save({ headers: {}, body: JSON.stringify(REAL_CUSTOMER_QR_BODY), sourceIp: '127.0.0.1' });
    const updated = storage.updateCustomerQrMetadata(saved.id, { parsed: parseCustomerQrCallback(REAL_CUSTOMER_QR_BODY) });
    expect(updated.customerQr?.parsed?.kind).toBe('customer-module-qr');
    expect(updated.customerQr?.parsed?.notification.customer?.customer_name).toBe('dhitraj');

    const [reloaded] = storage.getAll();
    expect(reloaded.customerQr?.parsed?.notification.merchantRef).toBe('dt-one-8989');
  });

  it('round-trips a customerQr parse error and reads legacy records without the slot', () => {
    const saved = storage.save({ headers: {}, body: 'not-json' });
    const updated = storage.updateCustomerQrMetadata(saved.id, { parseError: 'boom' });
    expect(updated.customerQr?.parseError).toBe('boom');

    storage.save({ headers: {}, body: '{}' });
    const all = storage.getAll();
    expect(all[all.length - 1].customerQr).toBeUndefined();
  });

  it('updateCustomerQrMetadata throws for an unknown record id', () => {
    expect(() => storage.updateCustomerQrMetadata('wh_missing', { parseError: 'x' })).toThrow(/not found/);
  });
});
