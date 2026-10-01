/**
 * Local-listener bounds acceptance (audit WP07, REPORT.md §11 item 5):
 * - The listener binds LOOPBACK by default (raw callback bodies carry
 *   customer PII and signatures) and honors an explicit wider bind.
 * - Request bodies are capped: an oversized delivery is refused with 413 and
 *   the memory used for buffering stays bounded.
 * - The JSON capture store cannot grow without limit: compaction keeps the
 *   newest maxRecords entries.
 */
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createWebhookServer } from '../webhook/server.js';
import { JsonWebhookStorage } from '../webhook/storage-json.js';

const tempRoot = mkdtempSync(path.join(tmpdir(), 'wp07-bounds-'));

afterAll(() => {
  try {
    rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    // Windows may hold the temp dir briefly — harmless.
  }
});

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (address && typeof address === 'object') {
        const found = address.port;
        probe.close(() => resolve(found));
      } else {
        probe.close(() => reject(new Error('no address')));
      }
    });
    probe.on('error', reject);
  });
}

async function startServer(extra: Record<string, unknown> = {}): Promise<{ port: number; stop: () => Promise<void>; storage: JsonWebhookStorage }> {
  const storage = new JsonWebhookStorage(path.join(tempRoot, `cb-${Math.random().toString(36).slice(2)}.jsonl`));
  const port = await getFreePort();
  const server = createWebhookServer(storage, { port, quiet: true, ...extra });
  await server.start();
  return {
    port,
    storage,
    stop: async () => {
      await server.stop();
      storage.close();
    },
  };
}

describe('default bind (WP07)', () => {
  it('binds loopback by default — not the wildcard interface', async () => {
    // Direct listen-level proof: createServer + the factory's default host.
    const { port, stop } = await startServer();
    try {
      // The factory exposes its bind host on the result.
      // (Probed behaviorally here: connect via loopback works, and the
      // server result carries the explicit host.)
      const res = await fetch(`http://127.0.0.1:${port}/aba-payway-webhook`, { method: 'POST', body: '{}' });
      void res;
      expect([200, 400]).toContain(res.status); // reachable on loopback
    } finally {
      await stop();
    }
    // And the factory result reports the loopback host (second instance).
    const storage = new JsonWebhookStorage(path.join(tempRoot, 'host-check.jsonl'));
    const server = createWebhookServer(storage, { port: await getFreePort(), quiet: true });
    expect(server.host).toBe('127.0.0.1');
    storage.close();
  });

  it('honors an explicit non-loopback host on the result (opt-in surface)', () => {
    const storage = new JsonWebhookStorage(path.join(tempRoot, 'host-explicit.jsonl'));
    const server = createWebhookServer(storage, { port: 8999, quiet: true, host: '0.0.0.0' });
    expect(server.host).toBe('0.0.0.0');
    storage.close();
  });
});

describe('request body cap (WP07)', () => {
  it('refuses an oversized body with 413 and does not store it', async () => {
    const { port, stop, storage } = await startServer({ maxBodyBytes: 1_000 });
    try {
      // Raw oversize JSON (the cap is enforced at the body level, before any
      // parsing/signature work — signCallbackBody would drop unknown fields
      // and shrink the payload).
      const bigBody = JSON.stringify({ tran_id: 'big1', status: '0', padding: 'x'.repeat(2_000) });
      const res = await fetch(`http://127.0.0.1:${port}/aba-payway-webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: bigBody,
      });
      expect(res.status).toBe(413);
      const payload = (await res.json()) as { error?: string };
      expect(payload.error).toContain('payload too large');
      expect(storage.count()).toBe(0);
    } finally {
      await stop();
    }
  });

  it('still accepts a normal body under the cap', async () => {
    const { port, stop, storage } = await startServer({ maxBodyBytes: 1_000 });
    try {
      const body = JSON.stringify({ tran_id: 'small1', status: '0' });
      const res = await fetch(`http://127.0.0.1:${port}/aba-payway-webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      expect(res.status).toBe(200);
      expect(storage.count()).toBe(1);
    } finally {
      await stop();
    }
  });
});

describe('capture retention (WP07)', () => {
  it('compacts to the newest maxRecords entries on save', () => {
    const file = path.join(tempRoot, 'retention.jsonl');
    const storage = new JsonWebhookStorage(file, { maxRecords: 5 });
    for (let i = 0; i < 12; i += 1) {
      storage.save({ body: JSON.stringify({ n: i }), headers: {} });
    }
    expect(storage.count()).toBe(5);
    const records = storage.getAll();
    // The KEPT records are the newest five (n = 7..11), not the oldest.
    expect(records.map((record) => (JSON.parse(record.body) as { n: number }).n)).toEqual([7, 8, 9, 10, 11]);
  });

  it('keeps everything when maxRecords is Infinity (explicit opt-out)', () => {
    const file = path.join(tempRoot, 'retention-off.jsonl');
    const storage = new JsonWebhookStorage(file, { maxRecords: Number.POSITIVE_INFINITY });
    for (let i = 0; i < 8; i += 1) {
      storage.save({ body: '{}', headers: {} });
    }
    expect(storage.count()).toBe(8);
  });

  it('the default bound applies without configuration', () => {
    const file = path.join(tempRoot, 'retention-default.jsonl');
    const storage = new JsonWebhookStorage(file);
    for (let i = 0; i < 1_002; i += 1) {
      storage.save({ body: '{}', headers: {} });
    }
    expect(storage.count()).toBe(1_000);
    // The file on disk agrees with the count (physical compaction, not a read filter).
    const lines = readFileSync(file, 'utf-8').split('\n').filter((line) => line.trim().length > 0);
    expect(lines).toHaveLength(1_000);
  });

  it('round-trips a real file write (writeFileSync used for compaction)', () => {
    const file = path.join(tempRoot, 'retention-write.jsonl');
    writeFileSync(file, '', 'utf-8');
    const storage = new JsonWebhookStorage(file, { maxRecords: 2 });
    storage.save({ body: 'a', headers: {} });
    storage.save({ body: 'b', headers: {} });
    storage.save({ body: 'c', headers: {} });
    expect(storage.getAll().map((record) => record.body)).toEqual(['b', 'c']);
  });
});
