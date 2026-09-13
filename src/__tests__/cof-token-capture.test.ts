/**
 * Tests for CoF link-callback token persistence:
 *  - `parseCofLinkCallback` / `isCofLinkCallback` (heuristic, Q18-safe)
 *  - `classifyCallback` gains the 'cof-link' kind (and only when pwt present)
 *  - linked-token store (save/load/latest/upsert/masking)
 *  - server integration: verified signed pwt delivery persists the token;
 *    unverified delivery is captured raw but NOT persisted.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { classifyCallback } from '../webhook/customer-callback.js';
import { isCofLinkCallback, parseCofLinkCallback } from '../webhook/cof-callback.js';
import {
  latestTokenForCtid,
  LINKED_TOKENS_FILE_NAME,
  loadLinkedTokens,
  maskPwt,
  resolveTokenStoreDir,
  saveLinkedToken,
} from '../webhook/token-store.js';
import { createWebhookServer, type WebhookServerResult } from '../webhook/server.js';
import { JsonWebhookStorage } from '../webhook/storage-json.js';

describe('CoF link-callback parsing', () => {
  it('recognizes a delivery with a pwt field as the discriminator', () => {
    expect(isCofLinkCallback({ pwt: 'tok123', status: '00' })).toBe(true);
    expect(isCofLinkCallback({ pwt: '' })).toBe(false);
    expect(isCofLinkCallback({ tran_id: 't1', status: '0' })).toBe(false);
    expect(isCofLinkCallback('string')).toBe(false);
    expect(isCofLinkCallback(null)).toBe(false);
  });

  it('parses documented fields and preserves extras (minus hash) for Q18 capture', () => {
    const parsed = parseCofLinkCallback({
      pwt: 'tok123',
      ctid: 'customer123',
      request_id: 'req0001',
      status: '00',
      token_flag: 'CITI_FLEX',
      some_unknown_field: 'keep-me',
      hash: 'sig',
    });
    expect(parsed.pwt).toBe('tok123');
    expect(parsed.ctid).toBe('customer123');
    expect(parsed.requestId).toBe('req0001');
    expect(parsed.status).toBe('00');
    expect(parsed.tokenFlag).toBe('CITI_FLEX');
    expect(parsed.extraFields).toEqual({ some_unknown_field: 'keep-me' });
  });

  it('accepts alternate spellings (cust_id/req_id) — schema is unverified live', () => {
    const parsed = parseCofLinkCallback({ pwt: 'tok', cust_id: 'c9', req_id: 'r9' });
    expect(parsed.ctid).toBe('c9');
    expect(parsed.requestId).toBe('r9');
  });

  it('throws on a delivery without pwt', () => {
    expect(() => parseCofLinkCallback({ tran_id: 't' })).toThrow(/no string `pwt`/);
  });

  it('classification: pwt presence wins over online-checkout shape', () => {
    expect(classifyCallback({ pwt: 'tok', status: '00' })).toBe('cof-link');
    // Existing contracts unchanged (regression).
    expect(classifyCallback({ tran_id: 't', status: '0' })).toBe('online-checkout');
    expect(classifyCallback({ tran_id: 't', merchant_ref_no: 'm' })).toBe('payment-link-pushback');
    expect(classifyCallback({ transaction_id: 't', merchant_ref: 'm' })).toBe('khqr-offline');
  });
});

describe('Linked-token store', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'token-store-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('load on a missing store returns empty', () => {
    expect(loadLinkedTokens(dir)).toEqual([]);
    expect(latestTokenForCtid('c1', dir)).toBeUndefined();
  });

  it('save + load + latest round-trips', () => {
    saveLinkedToken({ ctid: 'c1', pwt: 'tok-old' }, dir);
    saveLinkedToken({ ctid: 'c2', pwt: 'tok-other' }, dir);
    const relink = saveLinkedToken({ ctid: 'c1', pwt: 'tok-new' }, dir);
    expect(relink.capturedAt).toBeTruthy();
    const tokens = loadLinkedTokens(dir);
    expect(tokens).toHaveLength(3);
    expect(latestTokenForCtid('c1', dir)?.pwt).toBe('tok-new');
    expect(latestTokenForCtid('c2', dir)?.pwt).toBe('tok-other');
    expect(latestTokenForCtid('missing', dir)).toBeUndefined();
  });

  it('re-capture of the same (ctid, pwt) upserts in place', () => {
    saveLinkedToken({ ctid: 'c1', pwt: 'tok' }, dir, { PAYWAY_TOKEN_STORE_DIR: dir } as NodeJS.ProcessEnv);
    const first = latestTokenForCtid('c1', dir);
    saveLinkedToken({ ctid: 'c1', pwt: 'tok', sourceRecordId: 'wh_2' }, dir);
    const tokens = loadLinkedTokens(dir);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].sourceRecordId).toBe('wh_2');
    expect(tokens[0].capturedAt >= (first?.capturedAt ?? '')).toBe(true);
  });

  it('corrupt store degrades to empty (capture/charge paths never crash)', () => {
    writeFileSync(join(dir, LINKED_TOKENS_FILE_NAME), '{not json', 'utf8');
    expect(loadLinkedTokens(dir)).toEqual([]);
  });

  it('file lands in the resolved dir with the expected name', () => {
    saveLinkedToken({ ctid: 'c1', pwt: 'tok' }, dir);
    expect(existsSync(join(dir, LINKED_TOKENS_FILE_NAME))).toBe(true);
    const file = JSON.parse(readFileSync(join(dir, LINKED_TOKENS_FILE_NAME), 'utf8')) as { version: number; tokens: unknown[] };
    expect(file.version).toBe(1);
    expect(file.tokens).toHaveLength(1);
  });

  it('dir resolution: explicit arg wins over env over the data root', () => {
    expect(resolveTokenStoreDir('/x', {})).toBe('/x');
    expect(resolveTokenStoreDir(undefined, { PAYWAY_TOKEN_STORE_DIR: '/y' } as NodeJS.ProcessEnv)).toBe('/y');
    const appData = mkdtempSync(join(tmpdir(), 'payway-appdata-'));
    expect(resolveTokenStoreDir(undefined, { APPDATA: appData } as NodeJS.ProcessEnv)).toBe(
      join(appData, 'aba-payway-sdk', 'data'),
    );
    expect(
      resolveTokenStoreDir(undefined, { PAYWAY_DATA_DIR: '/data', APPDATA: appData } as NodeJS.ProcessEnv),
    ).toBe('/data');
  });

  it('maskPwt keeps first/last 4 only', () => {
    expect(maskPwt('abcdefghijklmnop')).toBe('abcd…mnop');
    expect(maskPwt('short')).toBe('*****');
  });
});

describe('Server CoF token capture', () => {
  let tempDir: string;
  let storage: JsonWebhookStorage;
  let server: WebhookServerResult;
  let port: number;
  const apiKey = 'test-api-key';

  function signCallbackBody(body: Record<string, unknown>, key: string): string {
    const concatenated = Object.keys(body)
      .sort()
      .map((k) => {
        const value = body[k];
        if (value === undefined || value === null) return '';
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
      })
      .join('');
    return crypto.createHmac('sha512', key).update(concatenated).digest('base64');
  }

  function httpRequest(p: number, path: string, body: string, headers: Record<string, string>): Promise<number> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { hostname: '127.0.0.1', port: p, method: 'POST', path, headers: { 'Content-Type': 'application/json', ...headers } },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode ?? 0));
        },
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cof-capture-test-'));
    storage = new JsonWebhookStorage(join(tempDir, 'callbacks.jsonl'));
    port = await new Promise<number>((resolve, reject) => {
      const probe = http.createServer();
      probe.listen(0, '127.0.0.1', () => {
        const addr = probe.address();
        if (addr && typeof addr === 'object') {
          const p = addr.port;
          probe.close(() => resolve(p));
        } else {
          probe.close(() => reject(new Error('no port')));
        }
      });
      probe.on('error', reject);
    });
    server = createWebhookServer(storage, { port, quiet: true, apiKey, tokenStoreDir: join(tempDir, 'tokens') });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    storage.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('persists the pwt from a VERIFIED signed CoF link callback', async () => {
    const body = { pwt: 'pwt-abcdef123456', ctid: 'customer123', status: '00' };
    const sig = signCallbackBody(body, apiKey);
    const status = await httpRequest(port, '/aba-payway-webhook', JSON.stringify(body), {
      'x-payway-hmac-sha512': sig,
    });
    expect(status).toBe(200);
    const stored = latestTokenForCtid('customer123', join(tempDir, 'tokens'));
    expect(stored?.pwt).toBe('pwt-abcdef123456');
    const records = storage.getAll();
    expect(stored?.sourceRecordId).toBe(records[records.length - 1].id);
  });

  it('captures the raw record but does NOT persist the token when the signature is invalid', async () => {
    const body = { pwt: 'pwt-evil', ctid: 'attacker' };
    const status = await httpRequest(port, '/aba-payway-webhook', JSON.stringify(body), {
      'x-payway-hmac-sha512': 'bm9wZQ==',
    });
    expect(status).toBe(200); // capture sink stays 200
    expect(storage.getAll()).toHaveLength(1);
    expect(loadLinkedTokens(join(tempDir, 'tokens'))).toEqual([]);
  });

  it('does not persist tokens for ordinary checkout callbacks', async () => {
    const body = { tran_id: 't1', status: '0' };
    const sig = signCallbackBody(body, apiKey);
    await httpRequest(port, '/aba-payway-webhook', JSON.stringify(body), { 'x-payway-hmac-sha512': sig });
    expect(loadLinkedTokens(join(tempDir, 'tokens'))).toEqual([]);
  });
});
