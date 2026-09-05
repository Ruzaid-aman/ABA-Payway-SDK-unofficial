/**
 * Close all campaign transactions, then sweep check-transaction statuses.
 * Run: NODE_TLS_REJECT_UNAUTHORIZED='0' npx tsx .scratch/purchase-api-test-plan/close-all.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { PayWay } from '../../src/index.js';

for (const line of fs.readFileSync(path.resolve(import.meta.dirname, '../../.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
}
const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID,
  apiKey: process.env.PAYWAY_API_KEY,
  publicKeyPem: process.env.PAYWAY_RSA_PUBLIC_KEY,
  environment: 'sandbox',
});

const IDS = [
  // Wave 1
  'w1base001', 'd5001', 'd8nortn001', 'd8cli001', 'd9dadv001', 'd9cli002', 'd5cli001',
  // Wave 2/3/4 prep
  'w2asdk001', 'e2ekhqr-sdk-001', 'w2ar2001', 'w2ar3001', 'w2akhr001', 'w2cr11001',
  'w2p1khqrgate0', 'w2p2cardsgate0', 'w2p6cardsgate0hosted', 'w2cr2001',
  'dup0001', 'w2e1min001', 'w2e1max001', 'w2e8url001',
];

console.log('== CLOSE ==');
for (const id of IDS) {
  try {
    const r = (await payway.checkout.closeTransaction(id)) as { status?: { code?: string; message?: string } };
    console.log(`${id}: close code ${r.status?.code} (${r.status?.message})`);
  } catch (err) {
    console.log(`${id}: close FAILED — ${(err as Error).message.slice(0, 120)}`);
  }
}

console.log('\n== STATUS AFTER CLOSE ==');
for (const id of IDS) {
  try {
    const r = (await payway.checkout.checkTransaction(id)) as { data?: { payment_status?: string; payment_status_code?: number } };
    console.log(`${id}: ${r.data?.payment_status} (code ${r.data?.payment_status_code})`);
  } catch (err) {
    const e = err as Error & { rawBody?: { status?: { code?: string } } };
    console.log(`${id}: check error ${e.rawBody?.status?.code ?? ''} — ${(e as Error).message.slice(0, 80)}`);
  }
}
