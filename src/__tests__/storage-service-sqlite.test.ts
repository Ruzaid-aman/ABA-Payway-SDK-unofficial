/**
 * StorageService facade — SQLite backend (driver-gated). Proves the shared
 * single-handle design: all three stores live in ONE payway.db, store data
 * stays isolated per table, and close() releases the file on Windows.
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createStorageService } from '../storage/storage-service.js';

let driverAvailable = false;
try {
  await import('better-sqlite3');
  driverAvailable = true;
} catch {
  driverAvailable = false;
}
const maybeDescribe = driverAvailable ? describe : describe.skip;

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function makeRoot(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'payway-storage-sqlite-'));
  tempDirs.push(dir);
  return dir;
}

maybeDescribe('createStorageService (sqlite backend)', () => {
  it('all three stores share ONE payway.db', async () => {
    const root = makeRoot();
    const service = await createStorageService({ dir: root, backend: 'sqlite' });
    expect(service.backend).toBe('sqlite');
    const dbPath = path.join(root, 'payway.db');
    expect(service.paths.journalFile).toBe(dbPath);
    expect(service.paths.tokenStoreFile).toBe(dbPath);
    expect(service.paths.webhookFile).toBe(dbPath);
    service.close();
  });

  it('journal / tokens / webhooks round-trip through the shared handle', async () => {
    const root = makeRoot();
    const service = await createStorageService({ dir: root, backend: 'sqlite' });

    service.journal.append({ kind: 'execution.request', correlationId: 'c1', attempt: 0 });
    const saved = service.tokens.save({ ctid: 'c1', pwt: 'pwt-token-1' });
    service.webhooks.save({ headers: {}, body: '{"tran_id":"W1"}' });

    expect(service.journal.read().events.map((e) => e.kind)).toEqual(['execution.request']);
    expect(service.tokens.latestForCtid('c1')?.pwt).toBe('pwt-token-1');
    expect(saved.capturedAt).toBeTruthy();
    expect(service.webhooks.count()).toBe(1);
    expect(existsSync(path.join(root, 'payway.db'))).toBe(true);
    service.close();
  });

  it('cross-store isolation: journal read never returns token or webhook data', async () => {
    const root = makeRoot();
    const service = await createStorageService({ dir: root, backend: 'sqlite' });
    service.journal.append({ kind: 'execution.started', correlationId: 'c1' });
    service.tokens.save({ ctid: 'c9', pwt: 'pwt-secret-value' });
    service.webhooks.save({ headers: {}, body: 'raw-body' });

    const journalBlob = JSON.stringify(service.journal.read().events);
    expect(journalBlob).not.toContain('pwt-secret-value');
    expect(journalBlob).not.toContain('raw-body');
    service.close();
  });

  it('close() releases the handle (file deletable afterwards — Windows check)', async () => {
    const root = makeRoot();
    const service = await createStorageService({ dir: root, backend: 'sqlite' });
    service.journal.append({ kind: 'execution.started', correlationId: 'c1' });
    service.close();
    service.close(); // idempotent — closing twice must not throw

    const dbPath = path.join(root, 'payway.db');
    expect(existsSync(dbPath)).toBe(true);
    rmSync(dbPath, { force: true });
    expect(existsSync(dbPath)).toBe(false);
  });

  it('tokens.markRenewed updates the stored record on the shared handle', async () => {
    const root = makeRoot();
    const service = await createStorageService({ dir: root, backend: 'sqlite' });
    service.tokens.save({ ctid: 'c1', pwt: 'tok', tokenFlag: 'CITO_FLEX' });
    const updated = service.tokens.markRenewed('c1', 'tok', '2026-09-13T00:00:00.000Z');
    expect(updated?.renewedAt).toBe('2026-09-13T00:00:00.000Z');
    expect(service.tokens.load()[0].tokenFlag).toBe('CITO_FLEX');
    expect(service.tokens.markRenewed('missing', 'nope')).toBeUndefined();
    service.close();
  });

  it("backend 'auto' resolves to the detected backend and works end-to-end", async () => {
    const root = makeRoot();
    const service = await createStorageService({ dir: root, backend: 'auto' });
    expect(['json', 'sqlite']).toContain(service.backend);
    service.journal.append({ kind: 'execution.started', correlationId: 'c1' });
    expect(service.journal.read().events).toHaveLength(1);
    service.close();
  });
});
