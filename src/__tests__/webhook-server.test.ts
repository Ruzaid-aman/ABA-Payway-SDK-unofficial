/**
 * Tests for the webhook HTTP server.
 *
 * Covers WH-TC-03 (receive and store callback), WH-TC-05 (no validation),
 * WH-TC-08 (port conflict), and general server behavior.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import { JsonWebhookStorage } from '../webhook/storage-json.js';
import { createWebhookServer, type WebhookServerResult } from '../webhook/server.js';

function httpRequest(
  port: number,
  method: string,
  path: string,
  body?: string,
  headers?: Record<string, string>,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, method, path, headers: { 'Content-Type': 'application/json', ...headers } },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

describe('WebhookServer', () => {
  let tempDir: string;
  let storage: JsonWebhookStorage;
  let server: WebhookServerResult;
  let port: number;

  // Find a free port
  function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = http.createServer();
      srv.listen(0, () => {
        const addr = srv.address();
        if (addr && typeof addr === 'object') {
          const p = addr.port;
          srv.close(() => resolve(p));
        } else {
          srv.close(() => reject(new Error('Could not get free port')));
        }
      });
    });
  }

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'webhook-server-test-'));
    storage = new JsonWebhookStorage(join(tempDir, 'callbacks.jsonl'));
    port = await getFreePort();
    server = createWebhookServer(storage, { port, quiet: true });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    storage.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('WH-TC-03: receives and stores a valid callback', async () => {
    const payload = JSON.stringify({ status: 'COMPLETED', tran_id: '123' });

    const res = await httpRequest(port, 'POST', '/aba-payway-webhook', payload, {
      'x-payway-hmac-sha512': 'test-signature',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { acknowledged: boolean; id: string };
    expect(body.acknowledged).toBe(true);
    expect(body.id).toMatch(/^wh_/);

    // Verify stored
    const records = storage.getAll();
    expect(records).toHaveLength(1);
    expect(records[0].body).toBe(payload);
  });

  it('WH-TC-05: accepts malformed JSON without rejecting', async () => {
    const malformedPayload = '{invalid json content';

    const res = await httpRequest(port, 'POST', '/aba-payway-webhook', malformedPayload);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { acknowledged: boolean };
    expect(body.acknowledged).toBe(true);

    // Raw string stored as-is
    const records = storage.getAll();
    expect(records).toHaveLength(1);
    expect(records[0].body).toBe(malformedPayload);
  });

  it('returns 404 for non-webhook paths', async () => {
    const res = await httpRequest(port, 'POST', '/other-path', '{}');
    expect(res.statusCode).toBe(404);
  });

  it('returns 405 for GET on webhook path', async () => {
    const res = await httpRequest(port, 'GET', '/aba-payway-webhook');
    expect(res.statusCode).toBe(405);
  });

  it('logs signature verification result but never rejects', async () => {
    const payload = JSON.stringify({ status: 'COMPLETED' });
    const res = await httpRequest(port, 'POST', '/aba-payway-webhook', payload, {
      'x-payway-hmac-sha512': 'invalid-signature',
    });

    expect(res.statusCode).toBe(200);
    expect(storage.count()).toBe(1);
  });

  it('stores request headers', async () => {
    const payload = JSON.stringify({ test: true });
    await httpRequest(port, 'POST', '/aba-payway-webhook', payload, {
      'x-custom-header': 'custom-value',
    });

    const records = storage.getAll();
    expect(records).toHaveLength(1);
    expect(records[0].headers['x-custom-header']).toBe('custom-value');
    expect(records[0].headers['content-type']).toBe('application/json');
  });

  it('reports isRunning correctly', async () => {
    expect(server.isRunning).toBe(true);
    await server.stop();
    expect(server.isRunning).toBe(false);
  });

  it('is idempotent on stop', async () => {
    await server.stop();
    // Second stop should not throw
    await server.stop();
    expect(server.isRunning).toBe(false);
  });
});

describe('WebhookServer port conflict (WH-TC-08)', () => {
  it('rejects with helpful error when port is busy', async () => {
    // Create a server that occupies a port
    const occupyingSrv = http.createServer();
    await new Promise<void>((resolve) => occupyingSrv.listen(0, resolve));
    const addr = occupyingSrv.address();
    const port = addr && typeof addr === 'object' ? addr.port : 0;

    const tempDir = mkdtempSync(join(tmpdir(), 'webhook-port-test-'));
    const storage = new JsonWebhookStorage(join(tempDir, 'callbacks.jsonl'));
    const server = createWebhookServer(storage, { port, quiet: true });

    try {
      await expect(server.start()).rejects.toThrow('already in use');
    } finally {
      storage.close();
      // Release the occupying server
      await new Promise<void>((resolve) => occupyingSrv.close(() => resolve()));
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
