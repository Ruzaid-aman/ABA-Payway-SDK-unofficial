import { createHmac } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Contract tests for the dependency-free .cjs tools bundled with the skills
 * (under each skill's scripts folder). These scripts are plain CommonJS on
 * purpose (repo is ESM), so they are imported through createRequire.
 */
const require = createRequire(import.meta.url);

const khqr = require('../../skills/aba-payway-customer-qr/scripts/decode-khqr.cjs');
const manifest = require('../../skills/aba-payway-customer-qr/scripts/qr-manifest.cjs');
const signer = require('../../skills/aba-payway-hash/scripts/sign-request.cjs');
const verifier = require('../../skills/aba-payway-hash/scripts/verify-callback.cjs');
const mockCb = require('../../skills/aba-payway-hash/scripts/mock-callback.cjs');
const status = require('../../skills/aba-payway-check-transaction/scripts/decode-status.cjs');
const checkout = require('../../skills/aba-payway-first-payment/scripts/checkout-payload.cjs');
const reconcile = require('../../skills/aba-payway-transaction-by-merchant-ref/scripts/reconcile.cjs');

const SAMPLE_CUSTOMER_QR =
  '00020101021130510016abaakhppxxx@abaa01153250602141550800208ABA Bank5204787653038405802KH5915Donation outlet6010BATTAMBANG624268380010PAYWAY@ABA0104693002071620916050119924001317871247638256803mmp63049955';

describe('decode-khqr.cjs (Customer Module QR validator)', () => {
  it('validates the CRC-16/CCITT-FALSE checksum of a real customer QR', () => {
    expect(khqr.crc16(SAMPLE_CUSTOMER_QR.replace(/63049955$/, '6304'))).toBe('9955');
    expect(khqr.crcValid(SAMPLE_CUSTOMER_QR)).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const tampered = SAMPLE_CUSTOMER_QR.replace('Donation outlet', 'Donation outleX').replace(/63049955$/, '63041CDF');
    expect(khqr.crcValid(tampered)).toBe(false);
  });

  it('parses the TLV tree with nested templates', () => {
    const tree = khqr.parseTlv(SAMPLE_CUSTOMER_QR, '', '');
    const joined = tree.join('\n');
    expect(joined).toContain('[01]');
    expect(joined).toContain('"11"');
    expect(joined).toContain('[30.00]');
    expect(joined).toContain('abaakhppxxx@abaa');
    expect(joined).toContain('[62.68.02]');
    expect(joined).toContain('1620916');
    expect(joined).toContain('[99.68]');
    expect(joined).not.toContain('MALFORMED');
  });

  it('summarizes static/open-amount/USD flags', () => {
    const summary = khqr.summarize(SAMPLE_CUSTOMER_QR).join('\n');
    expect(summary).toContain('STATIC');
    expect(summary).toContain('OPEN');
    expect(summary).toContain('USD');
    expect(summary).toContain('Donation outlet');
  });
});

describe('qr-manifest.cjs (batch QR audit)', () => {
  it('extracts a manifest row from a customer QR payload', () => {
    const row = manifest.extractManifest(SAMPLE_CUSTOMER_QR, 'C:/x/dhitraj.jpg');
    expect(row.bakong_id).toBe('abaakhppxxx@abaa');
    expect(row.account_number).toBe('325060214155080');
    expect(row.bank).toBe('ABA Bank');
    expect(row.merchant_name).toBe('Donation outlet');
    expect(row.type).toBe('STATIC');
    expect(row.outlet_code).toBe('6930');
    expect(row.merchant_id).toBe('1620916');
    expect(row.profile_id).toBe('1787124763825');
    expect(row.mmp).toBe('mmp');
    expect(row.crc_valid).toBe(true);
  });
});

describe('sign-request.cjs (HMAC-SHA512 request signing)', () => {
  it('signs the get-mc-ref preset with the documented field order', () => {
    const { payload, concatenated } = signer.buildSignedPayload(
      'get-mc-ref',
      { req_time: '20250213084236', merchant_id: 'ec000002', merchant_ref: '17394277693' },
      'k',
    );
    expect(concatenated).toBe('20250213084236ec00000217394277693');
    expect(payload.hash).toBe(createHmac('sha512', 'k').update(concatenated).digest('base64'));
  });

  it('substitutes empty string for missing checkout fields (live 26-field order)', () => {
    const { concatenated } = signer.buildSignedPayload(
      'checkout',
      { req_time: 't', merchant_id: 'm', tran_id: 'x', amount: '10.00', currency: 'USD' },
      'k',
    );
    // req_time|merchant_id|tran_id|amount → 12 empty fields → currency → 8 empty
    // fields (incl. the appended token_flag/frequency — plain purchases stay
    // byte-identical to the legacy 24-field HMAC; audit S2 fix).
    expect(concatenated).toBe('tmx10.00USD');
  });

  it('signs subscription payloads over the appended token_flag.frequency positions', () => {
    const { payload, concatenated } = signer.buildSignedPayload(
      'checkout',
      {
        req_time: 't',
        merchant_id: 'm',
        tran_id: 'sub-1',
        amount: '9.99',
        currency: 'USD',
        token_flag: 'CITR_FIX',
        frequency: '1M',
        ctid: 'customer123',
      },
      'k',
    );
    // The live 27-field order (§17, 2026-09-05) signs ctid AFTER items —
    // empty positions (items/shipping/…) vanish; token_flag + frequency are
    // appended after skip_success_page (the tool always sets type: 'purchase').
    expect(concatenated).toBe('tmsub-19.99customer123USDCITR_FIX1M');
    expect(payload.token_flag).toBe('CITR_FIX');
    expect(payload.frequency).toBe('1M');
    expect(payload.ctid).toBe('customer123');
  });

  it('generates UTC req_time in YYYYMMDDHHmmss format', () => {
    expect(signer.formatRequestTime(new Date(Date.UTC(2025, 1, 13, 8, 42, 36)))).toBe('20250213084236');
  });

  it('formats amounts per currency (USD 2dp, KHR integer)', () => {
    expect(signer.formatAmount(10, 'USD')).toBe('10.00');
    expect(signer.formatAmount(40000.4, 'KHR')).toBe('40000');
  });

  it('base64-encodes URLs but leaves plain strings untouched', () => {
    const b64 = Buffer.from('https://example.com/success', 'utf8').toString('base64');
    expect(signer.encodeBase64IfNeeded('https://example.com/success')).toBe(b64);
    expect(signer.encodeBase64IfNeeded('order-123')).toBe('order-123');
  });
});

describe('verify-callback.cjs (sorted-key callback verification)', () => {
  const body = {
    tran_id: 'order-123',
    amount: '10.00',
    merchant_ref: 'dt-one-8989',
    payment_status: 'APPROVED',
    customer: { customer_id: 'dt-one-8989', customer_name: 'dhitraj' },
  };

  it('concatenates sorted keys with JSON-encoded objects', () => {
    expect(verifier.buildConcatenated(body)).toBe(
      '10.00{"customer_id":"dt-one-8989","customer_name":"dhitraj"}dt-one-8989APPROVEDorder-123',
    );
  });

  it('accepts a correctly-signed callback and rejects a tampered one', () => {
    const sig = createHmac('sha512', 'secret').update(verifier.buildConcatenated(body)).digest('base64');
    expect(verifier.verifyCallback(body, sig, 'secret').valid).toBe(true);
    expect(verifier.verifyCallback(body, sig, 'wrong-key').valid).toBe(false);
    expect(verifier.verifyCallback({ ...body, amount: '99.00' }, sig, 'secret').valid).toBe(false);
  });
});

describe('mock-callback.cjs (signed fake callbacks)', () => {
  it('builds a body whose signature verifies with verify-callback.cjs', () => {
    const body = mockCb.buildCallbackBody({ 'tran-id': 'order-1', amount: 5.55, status: 'PENDING' });
    expect(body.payment_status).toBe('PENDING');
    expect(body.payment_status_code).toBe(2);
    expect(body.payment_amount).toBe('5.55');
    const sig = mockCb.signBody(body, 'secret');
    expect(verifier.verifyCallback(body, sig, 'secret').valid).toBe(true);
  });

  it('maps status names to sandbox-verified codes and rejects unknown statuses', () => {
    expect(mockCb.STATUS_CODES.REFUNDED).toBe(4);
    expect(() => mockCb.buildCallbackBody({ status: 'NOPE' })).toThrow();
  });

  it('rejects unsupported currencies before anything is signed (audit D09)', () => {
    expect(() => mockCb.buildCallbackBody({ currency: 'EUR' })).toThrow(/Invalid --currency "EUR". Valid: USD, KHR/);
    // Case-insensitive acceptance for the supported set is preserved:
    expect(mockCb.buildCallbackBody({ currency: 'usd' }).payment_currency).toBe('USD');
    expect(mockCb.buildCallbackBody({ currency: 'khr' }).payment_currency).toBe('KHR');
  });

  it('rejects malformed, zero and negative amounts instead of shipping NaN (audit D09)', () => {
    expect(() => mockCb.buildCallbackBody({ amount: 'abc' })).toThrow(/Invalid --amount "abc"/);
    expect(() => mockCb.buildCallbackBody({ amount: 'NaN' })).toThrow(/Invalid --amount/);
    expect(() => mockCb.buildCallbackBody({ amount: '0' })).toThrow(/Invalid --amount "0"/);
    expect(() => mockCb.buildCallbackBody({ amount: '-5' })).toThrow(/Invalid --amount "-5"/);
    expect(() => mockCb.buildCallbackBody({ amount: Number.POSITIVE_INFINITY })).toThrow(/Invalid --amount/);
  });

  it('keeps the documented currency formatting for valid input (USD 2dp, KHR integer, defaults)', () => {
    expect(mockCb.buildCallbackBody({}).payment_amount).toBe('10.00');
    expect(mockCb.buildCallbackBody({ currency: 'KHR', amount: '40000.4' }).payment_amount).toBe('40000');
    const khrDefault = mockCb.buildCallbackBody({ currency: 'KHR' });
    expect(khrDefault.payment_amount).toBe('40000');
    expect(khrDefault.original_amount).toBe('40000');
  });
});

describe('mock-callback.cjs process contract (audit D09: accurate helper exits)', () => {
  // Spawned children cannot open loopback TCP to a PARENT-hosted server on
  // some Windows setups (see starter-e2e.test.ts), but child→child loopback
  // works (probed 2026-10-01), so the fixture HTTP servers run as their own
  // child processes and mock-callback.cjs as another.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-callback-proc-'));
  const mockScript = require.resolve('../../skills/aba-payway-hash/scripts/mock-callback.cjs');
  // Path-encoded contract: /status/<code> answers that code; other paths 404.
  const statusServerScript = path.join(dir, 'fixture-server.cjs');
  fs.writeFileSync(
    statusServerScript,
    [
      'const http = require("node:http");',
      'const s = http.createServer((req, res) => {',
      '  const m = (req.url || "").match(/^\\/status\\/(\\d{3})/);',
      '  if (!m) { res.writeHead(404); res.end("bad path"); return; }',
      '  res.writeHead(Number(m[1]), { "content-type": "text/plain" });',
      '  res.end("fixture");',
      '});',
      's.listen(0, "127.0.0.1", () => console.log("up", s.address().port));',
    ].join('\n'),
  );
  // Accepts the connection and never responds (for the --timeout test).
  const hangServerScript = path.join(dir, 'hang-server.cjs');
  fs.writeFileSync(
    hangServerScript,
    [
      'const http = require("node:http");',
      'const s = http.createServer(() => { /* never respond */ });',
      's.listen(0, "127.0.0.1", () => console.log("up", s.address().port));',
    ].join('\n'),
  );

  const started: ReturnType<typeof spawn>[] = [];
  let serverPort = 0;

  const startServer = (script: string): Promise<number> =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script]);
      started.push(child);
      let out = '';
      const timer = setTimeout(() => reject(new Error(`fixture server never became ready: ${out}`)), 8000);
      child.stdout.on('data', (d: Buffer) => {
        out += String(d);
        const m = out.match(/up (\d+)/);
        if (m) {
          clearTimeout(timer);
          resolve(Number(m[1]));
        }
      });
      child.on('exit', (code) => reject(new Error(`fixture server exited early (${code}): ${out}`)));
    });

  const runMock = (url: string, extraArgs: string[] = []) =>
    spawnSync(process.execPath, [mockScript, '--url', url, '--api-key', 'fixture-key', ...extraArgs], {
      encoding: 'utf8',
      timeout: 15000,
    });

  beforeAll(async () => {
    serverPort = await startServer(statusServerScript);
  });

  afterAll(() => {
    for (const child of started.splice(0)) child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('exits 0 and reports acknowledgment on HTTP 2xx', () => {
    const r = runMock(`http://127.0.0.1:${serverPort}/status/200`);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Handler acknowledged (2xx)');
  });

  it('exits 1 on HTTP 400 (a non-2xx answer is a runtime failure, not success)', () => {
    const r = runMock(`http://127.0.0.1:${serverPort}/status/400`);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('HTTP 400');
    expect(r.stdout).toContain('did NOT acknowledge');
  });

  it('exits 1 on HTTP 500', () => {
    const r = runMock(`http://127.0.0.1:${serverPort}/status/500`);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('did NOT acknowledge');
  });

  it('exits 1 on network failure (connection refused)', () => {
    const r = runMock('http://127.0.0.1:1/cb');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Request failed');
  });

  it('exits 1 on a handler that never answers when --timeout bounds the wait', async () => {
    const hangPort = await startServer(hangServerScript);
    const r = runMock(`http://127.0.0.1:${hangPort}/status/200`, ['--timeout', '300']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('timeout after 300ms');
  }, 20000);

  it('exits 2 on a malformed amount without sending anything', () => {
    const r = runMock(`http://127.0.0.1:${serverPort}/status/200`, ['--amount', 'abc']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Invalid --amount "abc"');
    expect(r.stdout).not.toContain('SENDING');
  });

  it('exits 2 on an unsupported currency', () => {
    const r = runMock(`http://127.0.0.1:${serverPort}/status/200`, ['--currency', 'EUR']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Invalid --currency "EUR"');
    expect(r.stdout).not.toContain('SENDING');
  });
});

describe('decode-status.cjs (status/error decoding)', () => {
  it('decodes an APPROVED callback as terminal', () => {
    const out = status.decodeStatus({
      payment_status_code: 0,
      payment_status: 'APPROVED',
      transaction_id: '178702944869996',
      merchant_ref: 'dt-one-8989',
      payment_amount: 0.38,
      payment_currency: 'USD',
    });
    expect(out).toContain('APPROVED');
    expect(out).toContain('[TERMINAL');
    expect(out).toContain('dt-one-8989');
  });

  it('explains gateway and PTL error codes', () => {
    expect(status.GATEWAY_CODE_HINTS['1']).toContain('Wrong Hash');
    expect(status.GATEWAY_CODE_HINTS.PTL37).toContain('exceeds');
    const out = status.decodeStatus({ status: { code: '15', message: 'Invalid Merchant' } });
    expect(out).toContain('merchant_id not recognized');
  });
});

describe('checkout-payload.cjs (signed checkout payload + HTML form)', () => {
  it('builds a payload matching the SDK 26-field signing order', () => {
    const { payload, concatenated } = checkout.buildCheckoutPayload({
      tranId: 'order-123',
      amount: 10,
      currency: 'USD',
      merchantId: 'ec000002',
      apiKey: 'k',
      returnUrl: 'https://example.com/success',
      reqTime: '20250213084236',
    });
    expect(payload.tran_id).toBe('order-123');
    expect(payload.amount).toBe('10.00');
    expect(payload.return_url).toBe(Buffer.from('https://example.com/success').toString('base64'));
    expect(payload.hash).toBe(createHmac('sha512', 'k').update(concatenated).digest('base64'));
  });

  it('signs the subscription trio in the live appended positions with ctid after items', () => {
    const { payload, concatenated } = checkout.buildCheckoutPayload({
      tranId: 'sub-1',
      amount: 9.99,
      currency: 'USD',
      merchantId: 'm',
      apiKey: 'k',
      reqTime: 't',
      ctid: 'customer123',
      tokenFlag: 'CITR_FIX',
      frequency: '1M',
    });
    expect(payload.ctid).toBe('customer123');
    expect(payload.token_flag).toBe('CITR_FIX');
    expect(payload.frequency).toBe('1M');
    // ctid hashes after items (§17 — the gateway signs it on the subscription
    // path); token_flag + frequency hash after skip_success_page (the tool
    // always sets type: 'purchase').
    expect(concatenated).toBe('tmsub-19.99customer123purchaseUSDCITR_FIX1M');
  });

  it('rejects lifetime below 3 minutes (purchase lifetime is MINUTES, min 3)', () => {
    expect(() =>
      checkout.buildCheckoutPayload({ tranId: 'ok', amount: 5, merchantId: 'm', apiKey: 'k', lifetime: 1 }),
    ).toThrow(/MINUTES/);
    expect(() =>
      checkout.buildCheckoutPayload({ tranId: 'ok', amount: 5, merchantId: 'm', apiKey: 'k', lifetime: 600 }),
    ).not.toThrow();
  });

  it('rejects subscription shapes that violate the SDK trio rules', () => {
    // tokenFlag without ctid:
    expect(() =>
      checkout.buildCheckoutPayload({ tranId: 'ok', amount: 5, merchantId: 'm', apiKey: 'k', tokenFlag: 'CITR_FIX', frequency: '1M' }),
    ).toThrow(/ctid is required/);
    // non-CITR_FIX flag on the purchase path:
    expect(() =>
      checkout.buildCheckoutPayload({ tranId: 'ok', amount: 5, merchantId: 'm', apiKey: 'k', ctid: 'c123', tokenFlag: 'CITI_FLEX', frequency: '1M' }),
    ).toThrow(/CITR_FIX/);
    // frequency without tokenFlag:
    expect(() =>
      checkout.buildCheckoutPayload({ tranId: 'ok', amount: 5, merchantId: 'm', apiKey: 'k', frequency: '1M' }),
    ).toThrow(/frequency requires token-flag/);
  });

  it('emits an HTML auto-post form containing all payload fields', () => {
    const { payload } = checkout.buildCheckoutPayload({
      tranId: 'order-1',
      amount: 40000,
      currency: 'KHR',
      merchantId: 'm',
      apiKey: 'k',
    });
    const html = checkout.buildHtmlForm(payload, checkout.CHECKOUT_URLS.sandbox);
    expect(html).toContain(checkout.CHECKOUT_URLS.sandbox);
    for (const field of Object.keys(payload)) {
      expect(html).toContain(`name="${field}"`);
    }
  });

  it('rejects invalid tran_id and non-2dp USD amounts', () => {
    expect(() =>
      checkout.buildCheckoutPayload({ tranId: 'bad id!', amount: 1, merchantId: 'm', apiKey: 'k' }),
    ).toThrow();
    expect(() =>
      checkout.buildCheckoutPayload({ tranId: 'ok', amount: 1.999, currency: 'USD', merchantId: 'm', apiKey: 'k' }),
    ).toThrow();
  });
});

describe('reconcile.cjs (F03: ID-dedupe reconciliation checkpoint)', () => {
  it('admits equal-timestamp and delayed rows as candidates — ID dedupe is the only "seen" gate', () => {
    // The watermark no longer filters rows (the old strict `>` comparison
    // dropped equal-time new IDs and delayed arrivals — audit F03).
    expect(reconcile.isCandidate({ transaction_date: '2026-08-25 10:00:00' }, '2026-08-25 09:59:59')).toBe(true);
    expect(reconcile.isCandidate({ transaction_date: '2026-08-25 09:59:59' }, '2026-08-25 09:59:59')).toBe(true);
    expect(reconcile.isCandidate({ transaction_date: '2026-08-25 09:00:00' }, '2026-08-25 09:59:59')).toBe(true);
    expect(reconcile.isCandidate({ transaction_date: '2026-08-25 10:00:00' }, null)).toBe(true);
  });

  it('buildCheckpoint merges seen IDs and advances the watermark, surviving equal timestamps', () => {
    const previous = { last_transaction_date: '2026-08-25 09:59:59', transaction_ids: ['TX1'] };
    const next = reconcile.buildCheckpoint(previous, [
      { transaction_id: 'TX2', transaction_date: '2026-08-25 09:59:59' }, // equal-time NEW id
      { transaction_id: 'TX3', transaction_date: '2026-08-25 10:05:00' },
      { transaction_id: 'TX1', transaction_date: '2026-08-25 10:06:00' }, // repeat id
    ]);
    expect(next.last_transaction_date).toBe('2026-08-25 10:06:00');
    expect(next.transaction_ids.sort()).toEqual(['TX1', 'TX2', 'TX3']);
  });

  it('caps the seen set at SEEN_ID_CAP, dropping the OLDEST ids', () => {
    const many = Array.from({ length: reconcile.SEEN_ID_CAP + 10 }, (_, i) => ({
      transaction_id: `T${i}`,
      transaction_date: '2026-08-25 10:00:00',
    }));
    const next = reconcile.buildCheckpoint({ last_transaction_date: null, transaction_ids: [] }, many);
    expect(next.transaction_ids).toHaveLength(reconcile.SEEN_ID_CAP);
    expect(next.transaction_ids).not.toContain('T0');
    expect(next.transaction_ids).toContain(`T${reconcile.SEEN_ID_CAP + 9}`);
  });

  it('persist + reload round-trips the atomic checkpoint (restart semantics)', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'reconcile-'));
    const file = path.join(dir, 'state.json');
    reconcile.saveCheckpoint(file, { last_transaction_date: '2026-08-25 10:00:00', transaction_ids: ['A', 'B'] });
    const loaded = reconcile.loadCheckpoint(file);
    expect(loaded.last_transaction_date).toBe('2026-08-25 10:00:00');
    expect(loaded.transaction_ids).toEqual(['A', 'B']);
    // A torn/missing file degrades to a fresh start, never a crash.
    expect(reconcile.loadCheckpoint(path.join(dir, 'missing.json'))).toEqual({
      last_transaction_date: null,
      transaction_ids: [],
    });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('loadCheckpoint tolerates a corrupt state file (restart after interruption)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-corrupt-'));
    const file = path.join(dir, 'state.json');
    fs.writeFileSync(file, '{not json');
    expect(reconcile.loadCheckpoint(file)).toEqual({ last_transaction_date: null, transaction_ids: [] });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // R6 (second-pass audit): a legacy timestamp file + its sibling seen-ID file
  // must migrate together BEFORE processing — loading only the timestamp file
  // produced an EMPTY id set, and the inclusive-watermark policy (ID dedupe as
  // the sole gate) would then re-emit every previously seen transaction.
  it('loadCheckpoint migrates the legacy .seen.json sibling into the id set (R6)', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'reconcile-legacy-'));
    const state = path.join(dir, 'legacy.json');
    fs.writeFileSync(state, JSON.stringify({ last_transaction_date: '2026-09-07 12:00:00' }));
    fs.writeFileSync(path.join(dir, 'legacy.seen.json'), JSON.stringify({ transaction_ids: ['already-emitted'] }));

    const loaded = reconcile.loadCheckpoint(state);
    expect(loaded.last_transaction_date).toBe('2026-09-07 12:00:00');
    expect(loaded.transaction_ids).toEqual(['already-emitted']);

    // End-to-end upgrade: process a batch containing the already-seen row and
    // a new one, persist, "restart" — only the genuinely-new row would emit.
    const batch = [
      { transaction_id: 'already-emitted', transaction_date: '2026-09-07 12:00:00' },
      { transaction_id: 'brand-new', transaction_date: '2026-09-07 13:00:00' },
    ];
    const next = reconcile.buildCheckpoint(loaded, batch);
    reconcile.saveCheckpoint(state, next);
    const reloaded = reconcile.loadCheckpoint(state);
    expect(new Set(reloaded.transaction_ids)).toEqual(new Set(['already-emitted', 'brand-new']));
    expect(reloaded.last_transaction_date).toBe('2026-09-07 13:00:00');
    const wouldEmit = batch.filter((t) => !reloaded.transaction_ids.includes(t.transaction_id));
    expect(wouldEmit).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('loadCheckpoint migrates legacy siblings across naming variants (R6)', async () => {
    for (const siblingName of ['state.json.seen.json', 'state.json-seen.json', 'state.seen.json']) {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'reconcile-legacy-alt-'));
      const state = path.join(dir, 'state.json');
      fs.writeFileSync(state, JSON.stringify({ last_transaction_date: '2026-09-07 09:00:00' }));
      fs.writeFileSync(path.join(dir, siblingName), JSON.stringify({ transaction_ids: ['seen-1', 'seen-2'] }));
      const loaded = reconcile.loadCheckpoint(state);
      expect(loaded.transaction_ids, siblingName).toEqual(['seen-1', 'seen-2']);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exposes the endpoint saturation cap for gap reporting', () => {
    expect(reconcile.MAX_ROWS_PER_RESPONSE).toBe(50);
  });

  it('serializes rows to CSV with quoting', () => {
    // payment_status is the 4th of 15 columns
    expect(reconcile.toCsvRow({ transaction_id: '1', payment_status: 'APPROVED' })).toBe('1,,,APPROVED,,,,,,,,,,,');
    expect(reconcile.toCsvRow({ transaction_id: 'x,y', payment_status: 'OK' }).startsWith('"x,y",')).toBe(true);
    expect(reconcile.CSV_COLUMNS).toContain('payment_status_code');
  });

  it('signs the get-mc-ref request as req_time+merchant_id+merchant_ref', () => {
    const hash = reconcile.signRequest('20250213084236', 'ec000002', '17394277693', 'k');
    expect(hash).toBe(createHmac('sha512', 'k').update('20250213084236ec00000217394277693').digest('base64'));
  });
});
