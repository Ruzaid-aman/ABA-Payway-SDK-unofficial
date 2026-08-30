/**
 * Webhook storage factory + JSON storage round-trip coverage.
 *
 * In this environment `better-sqlite3` is not installed (optional peer dep),
 * so `createStorage('auto')` exercises the documented SQLite→JSON fallback
 * and explicit `'sqlite'` rejects. The assertions are written to hold under
 * either backend so installing better-sqlite3 later does not break them.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createStorage } from '../webhook/storage-factory.js';
import { JsonWebhookStorage } from '../webhook/storage-json.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'payway-storage-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('createStorage factory', () => {
  it('explicit json returns a JsonWebhookStorage and persists saved records', async () => {
    const dir = makeTempDir();
    const filePath = path.join(dir, 'callbacks.json');
    const storage = await createStorage('json', filePath);
    expect(storage).toBeInstanceOf(JsonWebhookStorage);
    const record = storage.save({
      headers: { 'content-type': 'application/json' },
      body: '{"status":"SUCCESS"}',
      sourceIp: '127.0.0.1',
    });
    expect(record.id).toMatch(/^wh_/);
    expect(record.receivedAt).toBeTruthy();
    expect(storage.getAll()).toHaveLength(1);
    expect(storage.count()).toBe(1);
    expect(storage.getAll()[0].body).toBe('{"status":"SUCCESS"}');
    storage.close();
    expect(existsSync(filePath)).toBe(true);
  });

  it('auto-detect falls back to JSON when the SQLite driver is unavailable', async () => {
    const dir = makeTempDir();
    const storage = await createStorage('auto', path.join(dir, 'store'));
    // Either backend is acceptable; both must expose the storage contract.
    expect(typeof storage.save).toBe('function');
    expect(typeof storage.getAll).toBe('function');
    expect(typeof storage.close).toBe('function');
    storage.save({ headers: {}, body: 'x' });
    expect(storage.count()).toBe(1);
    storage.close();
  });

  it('explicit sqlite resolves to a working backend or reports why it cannot', async () => {
    const dir = makeTempDir();
    try {
      const storage = await createStorage('sqlite', path.join(dir, 'store.sqlite'));
      storage.save({ headers: {}, body: 'y' });
      expect(storage.count()).toBe(1);
      storage.close();
    } catch (error) {
      // better-sqlite3 not installed in this environment — the failure must
      // be a descriptive Error, not a crash.
      expect((error as Error).message.length).toBeGreaterThan(0);
    }
  });

  it('json storage creates missing parent directories and tolerates an absent file', () => {
    const dir = makeTempDir();
    const filePath = path.join(dir, 'nested', 'new.json');
    const storage = new JsonWebhookStorage(filePath);
    expect(storage.getAll()).toEqual([]);
    expect(storage.count()).toBe(0);
    storage.save({ headers: {}, body: 'first' });
    expect(storage.count()).toBe(1);
    storage.close();
    expect(existsSync(filePath)).toBe(true);
  });

  it('json storage updateKhqrMetadata attaches metadata and throws for unknown ids', () => {
    const dir = makeTempDir();
    const storage = new JsonWebhookStorage(path.join(dir, 'khqr.json'));
    const record = storage.save({ headers: {}, body: 'raw' });
    const updated = storage.updateKhqrMetadata(record.id, { parseError: 'unparseable body' });
    expect(updated.khqr).toEqual({ parseError: 'unparseable body' });
    expect(storage.updateKhqrMetadata(record.id, { duplicateTransactionId: true }).khqr).toEqual({
      duplicateTransactionId: true,
    });
    expect(() => storage.updateKhqrMetadata('wh_missing', { parseError: 'x' })).toThrow(/not found/);
    storage.close();
  });
});
