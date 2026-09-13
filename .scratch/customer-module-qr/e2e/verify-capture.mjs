// Verify the captured customer-qr.payment delivery from the evidence JSONL.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const dist = await import(pathToFileURL(process.cwd() + '/dist/index.js').href);

const evidenceFile = process.argv[2];
const apiKey = process.argv[3];
const record = JSON.parse(readFileSync(evidenceFile, 'utf-8').trim().split('\n').pop());
const body = JSON.parse(record.body);

const checks = [
  ['captured raw body has nested customer', body.customer?.customer_id === 'dt-one-8989'],
  ['captured raw body has payer_name', body.payer_name === 'Payer Name'],
  ['merchant_ref = portal Customer ID', body.merchant_ref === 'dt-one-8989'],
  ['signature verdict verified', record.signatureVerdict === 'verified'],
  ['matchedTransactionId from transaction_id', record.matchedTransactionId === body.transaction_id],
  ['matchedStatus APPROVED', record.matchedStatus === 'APPROVED'],
  ['not flagged replay (first delivery)', record.replay === false],
  ['customerQr metadata attached', record.customerQr?.parsed?.kind === 'customer-module-qr'],
  ['customer_id join key', record.customerQr?.parsed?.notification?.merchantRef === 'dt-one-8989'],
  ['customer name parsed', record.customerQr?.parsed?.notification?.customer?.customer_name === 'dhitraj'],
  ['no khqr slot (correct classification)', record.khqr === undefined || record.khqr?.parsed === undefined],
  ['wire-byte signature verifies', dist.verifyCallbackDetailed(body, record.headers['x-payway-hmac-sha512'], apiKey, { stripHash: true }).valid === true],
];

let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; }
console.log(failed === 0 ? 'E2E: ALL LEGS PASS' : `E2E: ${failed} LEGS FAILED`);
process.exit(failed === 0 ? 0 : 1);
