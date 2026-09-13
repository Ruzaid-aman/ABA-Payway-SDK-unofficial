// Wave 2 live e2e: trigger a customer-qr.payment fixture → capture server → verify.
// Uses the BUILT dist CLI + dist server (the shipped artifacts, not src).
import { pathToFileURL } from 'node:url';
const dist = await import(pathToFileURL(process.cwd() + '/dist/index.js').href);
const { createWebhookServer, createStorage, verifyCallbackDetailed } = dist;

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';

const API_KEY = 'e2e-customer-module-key';
const tempDir = mkdtempSync(join(tmpdir(), 'customer-qr-e2e-'));

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, () => { const p = srv.address().port; srv.close(() => resolve(p)); });
    srv.on('error', reject);
  });
}

const storage = await createStorage('json', join(tempDir, 'callbacks.jsonl'));
const port = await getFreePort();
const server = createWebhookServer(storage, { port, quiet: true, apiKey: API_KEY });
await server.start();

// 1. Fire the fixture from the BUILT dist CLI (real wire bytes, not in-process).
const fixtureUrl = `http://127.0.0.1:${port}/aba-payway-khqr-webhook`;
const cliOut = execFileSync('node', ['dist/cli.js', 'webhook', 'trigger',
  '--url', fixtureUrl,
  '--event', 'customer-qr.payment',
  '--merchant-ref', 'dt-one-8989',
  '--amount', '0.38',
  '--currency', 'USD',
  '--customer-name', 'dhitraj',
  '--payer-name', 'Payer Name',
  '--api-key', API_KEY,
  '--json',
], { encoding: 'utf-8', env: { ...process.env, PAYWAY_API_KEY: API_KEY, APPDATA: process.env.APPDATA } });
const envelope = JSON.parse(cliOut.trim().split('\n').pop());
console.log('trigger envelope:', JSON.stringify(envelope));

// 2. Assert the captured record: verified signature + customer-qr metadata + correlation.
const records = storage.getAll();
if (records.length !== 1) throw new Error(`expected 1 capture, got ${records.length}`);
const [record] = records;
const body = JSON.parse(record.body);
console.log('capture id:', record.id);
console.log('signatureVerdict:', record.signatureVerdict);
console.log('matchedTransactionId:', record.matchedTransactionId, 'matchedStatus:', record.matchedStatus);
console.log('customerQr kind:', record.customerQr?.parsed?.kind);
console.log('customer_id:', record.customerQr?.parsed?.notification?.merchantRef);

const checks = [];
checks.push(['capture count = 1', records.length === 1]);
checks.push(['signature verified', record.signatureVerdict === 'verified']);
checks.push(['correlated tran_id', record.matchedTransactionId === body.transaction_id]);
checks.push(['status APPROVED', record.matchedStatus === 'APPROVED']);
checks.push(['customer-qr metadata', record.customerQr?.parsed?.kind === 'customer-module-qr']);
checks.push(['customer_id joined', record.customerQr?.parsed?.notification?.merchantRef === 'dt-one-8989']);
checks.push(['customer name joined', record.customerQr?.parsed?.notification?.customer?.customer_name === 'dhitraj']);
checks.push(['nested customer in body', body.customer?.customer_id === 'dt-one-8989']);
checks.push(['payer name present', body.payer_name === 'Payer Name']);

// 3. Wire-byte verify: the captured body + captured signature must verify against the key.
const wire = verifyCallbackDetailed(body, record.headers['x-payway-hmac-sha512'], API_KEY, { stripHash: true });
checks.push(['wire-byte signature verifies', wire.valid === true]);

// 4. CLI exit code was 0 and the envelope is honest.
checks.push(['trigger ok', envelope.ok === true && envelope.signed === true && envelope.event === 'customer-qr.payment']);

await server.stop();
storage.close();
rmSync(tempDir, { recursive: true, force: true });

let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; }
console.log(failed === 0 ? 'E2E: ALL LEGS PASS' : `E2E: ${failed} LEGS FAILED`);
process.exit(failed === 0 ? 0 : 1);
