/**
 * Wave 5 — per-step fresh artifacts for U2 (gate-0 hosted KHQR page).
 * Old w2p1khqrgate0 page references a scan-dead txn (W5-1), so a fresh page is
 * fetched via checkout.purchaseHosted() immediately before the user opens it.
 *
 * Run: NODE_TLS_REJECT_UNAUTHORIZED='0' npx tsx .scratch/purchase-api-test-plan/wave5-u2-create.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { PayWay } from '../../src/index.js';

for (const line of fs.readFileSync(path.resolve(import.meta.dirname, '../../.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
}

const OUT_DIR = path.resolve(import.meta.dirname, '../../test-output/purchase-test-campaign');
fs.mkdirSync(OUT_DIR, { recursive: true });

const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID,
  apiKey: process.env.PAYWAY_API_KEY,
  publicKeyPem: process.env.PAYWAY_RSA_PUBLIC_KEY,
  environment: 'sandbox',
});

const createdUtc = new Date().toISOString();
const r = await payway.checkout.purchaseHosted({
  transactionId: 'w2u2001',
  amount: 3.13,
  currency: 'USD',
  paymentOption: 'abapay_khqr',
  returnUrl: 'https://example.com/checkout/return',
  lifetime: 10,
});

const entry = {
  id: 'w2u2001',
  purpose: 'U2 / A-R2-1 gate-0 hosted KHQR page (fresh)',
  created_utc: createdUtc,
  hosted_checkout: r.hosted_checkout,
  content_type: r.content_type,
  html_bytes: r.html.length,
};
const file = path.join(OUT_DIR, 'w2u2001-hosted-page.html');
fs.writeFileSync(file, r.html);
console.log(JSON.stringify({ ...entry, page: file }));
fs.writeFileSync(path.join(OUT_DIR, 'wave5-u2-create.json'), JSON.stringify(entry, null, 2));
