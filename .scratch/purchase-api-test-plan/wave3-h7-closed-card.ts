/**
 * H7/U11 prep: create a cards gate-0 session, save its hosted HTML page, then
 * close it — the user later opens the saved (stale) page and attempts payment.
 * Also re-pins that a closed-unpaid purchase-path txn still reads PENDING.
 * Run: NODE_TLS_REJECT_UNAUTHORIZED='0' npx tsx .scratch/purchase-api-test-plan/wave3-h7-closed-card.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { PayWay } from '../../src/index.js';

for (const line of fs.readFileSync(path.resolve(import.meta.dirname, '../../.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
}
const OUT_DIR = path.resolve(import.meta.dirname, '../../test-output/purchase-test-campaign');
const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID,
  apiKey: process.env.PAYWAY_API_KEY,
  publicKeyPem: process.env.PAYWAY_RSA_PUBLIC_KEY,
  environment: 'sandbox',
});

const ID = 'w2h7closed2';
try {
  await payway.checkout.purchase({
    transactionId: ID, amount: 8.88, currency: 'USD', paymentOption: 'cards',
    paymentGate: 0, viewType: 'hosted_view', returnUrl: 'https://example.com/checkout/return', lifetime: 1440,
  });
  console.log('unexpected JSON response');
} catch (err) {
  const e = err as Error & { rawBody?: unknown };
  const raw = typeof e.rawBody === 'string' ? e.rawBody : '';
  if (raw.startsWith('<!DOCTYPE html')) {
    fs.writeFileSync(path.join(OUT_DIR, `${ID}-hosted-page-CLOSED.html`), raw);
    console.log(`saved hosted page (${raw.length} bytes)`);
  } else {
    console.log('not HTML:', e.message.slice(0, 200));
    process.exit(1);
  }
}
await new Promise((r) => setTimeout(r, 3000));
const closed = await payway.checkout.closeTransaction(ID);
console.log('close:', JSON.stringify(closed));
await new Promise((r) => setTimeout(r, 2000));
const st = await payway.checkout.checkTransaction(ID);
console.log('check after close:', JSON.stringify(st));
