/**
 * StorageService facade tests — JSON backend (unconditional; runs everywhere)
 * and SQLite backend (driver-gated companion file).
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createStorageService, probeStorageBackend } from '../storage/storage-service.js';

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function makeRoot(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'payway-storage-json-'));
  tempDirs.push(dir);
  return dir;
}

describe('probeStorageBackend', () => {
  it('reports json when the driver is force-disabled', async () => {
    expect(await probeStorageBackend({ PAYWAY_FORCE_JSON_STORAGE: '1' })).toBe('json');
  });

  it('auto-detects the installed optional peer', async () => {
    const backend = await probeStorageBackend({});
    expect(['json', 'sqlite']).toContain(backend);
  });
});

describe('createStorageService (json backend)', () => {
  it('paths follow the data-root layout', async () => {
    const root = makeRoot();
    const service = await createStorageService({ dir: root, backend: 'json' });
    expect(service.backend).toBe('json');
    expect(service.mode).toBe('digest');
    expect(service.paths).toEqual({
      dataRoot: root,
      journalFile: path.join(root, 'journal.jsonl'),
      tokenStoreFile: path.join(root, 'linked-tokens.json'),
      webhookFile: path.join(root, 'webhook_data', 'callbacks.jsonl'),
    });
    service.close();
  });

  it('journal append → read round-trips through the shared pipeline', async () => {
    const root = makeRoot();
    const service = await createStorageService({ dir: root, backend: 'json' });
    service.journal.append({ kind: 'execution.request', correlationId: 'c1', attempt: 0 });
    service.journal.append({ kind: 'execution.response', correlationId: 'c1', httpStatus: 200 });

    const read = service.journal.read();
    expect(read.events.map((e) => e.kind)).toEqual(['execution.request', 'execution.response']);
    expect(read.events[0].eventId).toBeTruthy(); // envelope filled by the shared factory
    expect(existsSync(service.paths.journalFile)).toBe(true);
    service.close();
  });

  it('tokens save / latestForCtid / remove compose the JSON store', async () => {
    const root = makeRoot();
    const service = await createStorageService({ dir: root, backend: 'json' });
    service.tokens.save({ ctid: 'c1', pwt: 'old' });
    const saved = service.tokens.save({ ctid: 'c1', pwt: 'new', sourceRecordId: 'wh_1' });
    expect(saved.capturedAt).toBeTruthy();

    expect(service.tokens.latestForCtid('c1')?.pwt).toBe('new');
    expect(service.tokens.load()).toHaveLength(2);
    expect(service.tokens.remove('c1', 'old')).toBe(1);
    expect(service.tokens.load().map((t) => t.pwt)).toEqual(['new']);
    expect(service.tokens.remove('missing')).toBe(0);
    service.close();
  });

  it('tokens.markRenewed restarts the expiry window and preserves other fields', async () => {
    const root = makeRoot();
    const service = await createStorageService({ dir: root, backend: 'json' });
    service.tokens.save({ ctid: 'c1', pwt: 'tok', tokenFlag: 'CITI_FLEX' });
    const updated = service.tokens.markRenewed('c1', 'tok', '2026-09-13T00:00:00.000Z');
    expect(updated?.renewedAt).toBe('2026-09-13T00:00:00.000Z');
    expect(service.tokens.load()[0].tokenFlag).toBe('CITI_FLEX');
    expect(service.tokens.markRenewed('missing', 'nope')).toBeUndefined();
    service.close();
  });

  it('webhooks save/getAll/count use the raw-capture contract', async () => {
    const root = makeRoot();
    const service = await createStorageService({ dir: root, backend: 'json' });
    const record = service.webhooks.save({ headers: {}, body: '{"tran_id":"W1"}' });
    expect(record.id).toBeTruthy();
    expect(service.webhooks.count()).toBe(1);
    expect(service.webhooks.getAll()[0].body).toContain('W1');
    expect(existsSync(service.paths.webhookFile)).toBe(true);
    service.close();
  });

  it('journal prune drops old events', async () => {
    const root = makeRoot();
    const service = await createStorageService({ dir: root, backend: 'json' });
    service.journal.append({ kind: 'poll.attempt', correlationId: 'c2' });
    const result = service.journal.prune(new Date('2099-01-01T00:00:00.000Z'));
    expect(result.removed).toBe(1);
    expect(service.journal.read().events).toHaveLength(0);
    service.close();
  });
});
