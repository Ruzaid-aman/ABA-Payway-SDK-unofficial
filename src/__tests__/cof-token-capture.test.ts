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
import { buildWebhookFixture } from '../webhook/fixtures.js';
import {
  latestTokenForCtid,
  LINKED_TOKENS_FILE_NAME,
  loadLinkedTokens,
  markTokenRenewed,
  maskPwt,
  removeLinkedTokens,
  resolveTokenStoreDir,
  saveLinkedToken,
  tokenExpiryStatus,
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

  it('recognizes the LIVE nested payment_credential shape (§26 AOF-7, captured 2026-09-15)', () => {
    // Verbatim field set from the first real capture (wh_mu2hf6i6_7c84ba65).
    const live = {
      request_id: 'aoflink001',
      payment_credential: {
        ctid: 'aofcycle01',
        pwt: 'pwt-live-capture',
        source_of_fund: '*****0003',
        type: 'ABA ACCOUNT',
        status: 1,
        expired_at: '2026-12-14T16:41:13.8919367+07:00',
        token_flag: 'CITI_FLEX',
        frequency: '',
        subscribed_amount: 0.0,
        amount_limit_per_tran: 50,
        currency: 'USD',
      },
    };
    expect(isCofLinkCallback(live)).toBe(true);
    expect(isCofLinkCallback({ request_id: 'r', payment_credential: { pwt: '' } })).toBe(false);
    expect(isCofLinkCallback({ request_id: 'r', payment_credential: 'not-an-object' })).toBe(false);

    const parsed = parseCofLinkCallback(live);
    expect(parsed.pwt).toBe('pwt-live-capture');
    expect(parsed.ctid).toBe('aofcycle01');
    expect(parsed.requestId).toBe('aoflink001');
    expect(parsed.status).toBe('1');
    expect(parsed.tokenFlag).toBe('CITI_FLEX');
    // FU-08 wave: the delivered `expired_at` is surfaced as the first-class
    // `expiredAt` field (drives the scheduled-token expiry gate) and no
    // longer duplicates into extraFields.
    expect(parsed.expiredAt).toBe('2026-12-14T16:41:13.8919367+07:00');
    // Numeric + string credential metadata survives stringified in extraFields.
    expect(parsed.extraFields).toEqual({
      source_of_fund: '*****0003',
      type: 'ABA ACCOUNT',
      frequency: '',
      subscribed_amount: '0',
      amount_limit_per_tran: '50',
      currency: 'USD',
    });
  });

  it('parses documented fields and preserves extras (minus hash) for legacy flat deliveries', () => {
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

  it('accepts alternate spellings (cust_id/req_id) on the flat shape', () => {
    const parsed = parseCofLinkCallback({ pwt: 'tok', cust_id: 'c9', req_id: 'r9' });
    expect(parsed.ctid).toBe('c9');
    expect(parsed.requestId).toBe('r9');
  });

  it('throws on a delivery without pwt', () => {
    expect(() => parseCofLinkCallback({ tran_id: 't' })).toThrow(/no `pwt` field/);
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
    const file = JSON.parse(readFileSync(join(dir, LINKED_TOKENS_FILE_NAME), 'utf8')) as {
      version: number;
      tokens: unknown[];
    };
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
    expect(resolveTokenStoreDir(undefined, { PAYWAY_DATA_DIR: '/data', APPDATA: appData } as NodeJS.ProcessEnv)).toBe(
      '/data',
    );
  });

  it('removeLinkedTokens deletes by ctid (or ctid+pwt) and returns the count', () => {
    saveLinkedToken({ ctid: 'rm1', pwt: 'tok-a' }, dir);
    saveLinkedToken({ ctid: 'rm1', pwt: 'tok-b' }, dir);
    saveLinkedToken({ ctid: 'rm2', pwt: 'tok-c' }, dir);

    expect(removeLinkedTokens('rm1', 'tok-a', dir)).toBe(1);
    expect(loadLinkedTokens(dir).map((t) => t.pwt)).toEqual(['tok-b', 'tok-c']);

    expect(removeLinkedTokens('rm1', undefined, dir)).toBe(1);
    expect(loadLinkedTokens(dir).map((t) => t.ctid)).toEqual(['rm2']);

    expect(removeLinkedTokens('never-existed', undefined, dir)).toBe(0);
    expect(removeLinkedTokens('rm2', undefined, join(dir, 'no-such-store'))).toBe(0);
  });

  it('tokenExpiryStatus buckets tokens by the ~90-day docs/09 window', () => {
    const now = new Date('2026-09-13T00:00:00.000Z');
    const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString();

    const expired = tokenExpiryStatus({ capturedAt: iso(91) }, now);
    expect(expired.status).toBe('expired');
    expect(expired.daysLeft).toBeLessThanOrEqual(0);
    expect(expired.expiresAt).toBeInstanceOf(Date);

    // Boundary day: exactly 90 days after grant floors to 0 days left → expired.
    expect(tokenExpiryStatus({ capturedAt: iso(90) }, now).status).toBe('expired');

    const expiring = tokenExpiryStatus({ capturedAt: iso(85) }, now);
    expect(expiring.status).toBe('expiring-soon');
    expect(expiring.daysLeft).toBe(5);

    expect(tokenExpiryStatus({ capturedAt: iso(1) }, now).status).toBe('valid');

    // Renewal restarts the window from renewedAt, not capturedAt.
    const renewed = tokenExpiryStatus({ capturedAt: iso(100), renewedAt: iso(1) }, now);
    expect(renewed.status).toBe('valid');
    expect(renewed.daysLeft).toBe(89);

    expect(tokenExpiryStatus({} as { capturedAt: string }, now)).toEqual({
      status: 'unknown',
      daysLeft: null,
      expiresAt: null,
    });
  });

  it('markTokenRenewed updates only the matching record and preserves its fields', () => {
    saveLinkedToken({ ctid: 'ren1', pwt: 'tok-a', tokenFlag: 'CITI_FLEX', requestId: 'req-1' }, dir);
    saveLinkedToken({ ctid: 'ren1', pwt: 'tok-b' }, dir);

    const updated = markTokenRenewed('ren1', 'tok-a', '2026-09-13T00:00:00.000Z', dir);
    expect(updated?.renewedAt).toBe('2026-09-13T00:00:00.000Z');
    expect(updated?.tokenFlag).toBe('CITI_FLEX');
    expect(updated?.requestId).toBe('req-1');
    const all = loadLinkedTokens(dir);
    expect(all.find((t) => t.pwt === 'tok-b')?.renewedAt).toBeUndefined();

    expect(markTokenRenewed('never', 'nope', undefined, dir)).toBeUndefined();
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
        {
          hostname: '127.0.0.1',
          port: p,
          method: 'POST',
          path,
          headers: { 'Content-Type': 'application/json', ...headers },
        },
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

  // Q18 contingency: the classic PayWay callback contract carries the HMAC in
  // the BODY `hash` field (docs/09 §5), not the x-payway-hmac-sha512 header.
  // If the never-captured CoF link callback uses that shape, the pwt must
  // still persist — and the record must say WHERE the verified signature
  // came from so the first live capture pins the real contract.
  it('persists the pwt when the signature travels in the BODY hash field (no header)', async () => {
    const body = { pwt: 'pwt-bodyhash987', ctid: 'customer123', status: '00' };
    const sig = signCallbackBody(body, apiKey);
    const status = await httpRequest(port, '/aba-payway-webhook', JSON.stringify({ ...body, hash: sig }), {});
    expect(status).toBe(200);
    const stored = latestTokenForCtid('customer123', join(tempDir, 'tokens'));
    expect(stored?.pwt).toBe('pwt-bodyhash987');
    const [record] = storage.getAll();
    expect(record.signatureVerdict).toBe('verified');
    expect(record.signatureSource).toBe('body');
  });

  it('records signatureSource header when the header form is used', async () => {
    const body = { tran_id: 't-src-1', status: '0' };
    const sig = signCallbackBody(body, apiKey);
    await httpRequest(port, '/aba-payway-webhook', JSON.stringify(body), { 'x-payway-hmac-sha512': sig });
    const [record] = storage.getAll();
    expect(record.signatureVerdict).toBe('verified');
    expect(record.signatureSource).toBe('header');
  });

  it('a TAMPERED body hash is invalid — token captured raw but NOT persisted', async () => {
    const body = { pwt: 'pwt-forged', ctid: 'attacker', hash: 'c3VwZXJzaWNyZXRub3A=' };
    const status = await httpRequest(port, '/aba-payway-webhook', JSON.stringify(body), {});
    expect(status).toBe(200);
    expect(storage.getAll()).toHaveLength(1);
    expect(loadLinkedTokens(join(tempDir, 'tokens'))).toEqual([]);
    const [record] = storage.getAll();
    expect(record.signatureVerdict).toBe('invalid');
  });

  it('a delivery with neither header nor body hash stays unsigned (no persistence)', async () => {
    const body = { pwt: 'pwt-no-sig', ctid: 'customer123' };
    const status = await httpRequest(port, '/aba-payway-webhook', JSON.stringify(body), {});
    expect(status).toBe(200);
    expect(loadLinkedTokens(join(tempDir, 'tokens'))).toEqual([]);
    const [record] = storage.getAll();
    expect(record.signatureVerdict).toBe('unsigned');
    expect(record.signatureSource).toBeUndefined();
  });

  it('khqr-route CoF delivery with a body hash also persists (all routes share the fallback)', async () => {
    const body = { pwt: 'pwt-khqr-bodyhash', ctid: 'customer123', status: '00' };
    const sig = signCallbackBody(body, apiKey);
    const status = await httpRequest(port, '/aba-payway-khqr-webhook', JSON.stringify({ ...body, hash: sig }), {});
    expect(status).toBe(200);
    const stored = latestTokenForCtid('customer123', join(tempDir, 'tokens'));
    expect(stored?.pwt).toBe('pwt-khqr-bodyhash');
  });

  it('the cof-link.linked fixture drives the full body-hash capture path end-to-end', async () => {
    const fixture = buildWebhookFixture('cof-link.linked', apiKey, { ctid: 'fxtcust01', tranId: 'fxtreq01' });
    expect(fixture.signatureChannel).toBe('body');
    expect(fixture.verification).toBe('hmac');
    // Delivered exactly as `webhook trigger` would: body only, NO header.
    const status = await httpRequest(port, '/aba-payway-webhook', fixture.body, {});
    expect(status).toBe(200);
    const stored = latestTokenForCtid('fxtcust01', join(tempDir, 'tokens'));
    const fixturePwt = (fixture.parsed.payment_credential as Record<string, unknown>).pwt as string;
    expect(stored?.pwt).toBe(fixturePwt);
    expect(stored?.requestId).toBe('fxtreq01');
    expect(stored?.tokenFlag).toBe('CITI_FLEX');
    const records = storage.getAll();
    const last = records[records.length - 1];
    expect(last.signatureVerdict).toBe('verified');
    expect(last.signatureSource).toBe('body');
  });
});
