/**
 * Wave 5 — U12 redo: FRESH duplicate tran_id pair (D-7 "which amount wins").
 * The first pair (w2u12001) sat past its 10-min record lifetime before the scan.
 * Both creations via checkout.purchase() (R1, JSON path) — the API under test.
 *
 * Run: NODE_TLS_REJECT_UNAUTHORIZED='0' npx tsx .scratch/purchase-api-test-plan/wave5-u12-fresh.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { PayWay } from '../../src/index.js';

for (const line of fs.readFileSync(path.resolve(import.meta.dirname, '../../.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
}

const OUT_DIR = path.resolve(import.meta.dirname, '../../test-output/purchase-test-campaign');
const QR_DIR = path.join(OUT_DIR, 'qr');

const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID,
  apiKey: process.env.PAYWAY_API_KEY,
  publicKeyPem: process.env.PAYWAY_RSA_PUBLIC_KEY,
  environment: 'sandbox',
});

const createdUtc = new Date().toISOString();
const dup1 = (await payway.checkout.purchase({
  transactionId: 'w2u12002',
  amount: 1.71,
  currency: 'USD',
  paymentOption: 'abapay_khqr',
  returnUrl: 'https://example.com/checkout/return',
  lifetime: 10,
})) as Record<string, unknown>;
const dup2 = (await payway.checkout.purchase({
  transactionId: 'w2u12002',
  amount: 1.72,
  currency: 'USD',
  paymentOption: 'abapay_khqr',
  returnUrl: 'https://example.com/checkout/return',
  lifetime: 10,
})) as Record<string, unknown>;

const png1 = path.join(QR_DIR, 'w2u12002-first-1.71.png');
const png2 = path.join(QR_DIR, 'w2u12002-second-1.72.png');
if (dup1.qrString) await QRCode.toFile(png1, dup1.qrString as string, { width: 512, margin: 2 });
if (dup2.qrString) await QRCode.toFile(png2, dup2.qrString as string, { width: 512, margin: 2 });

console.log(JSON.stringify({
  created_utc: createdUtc,
  code1: (dup1.status as { code?: string } | undefined)?.code,
  code2: (dup2.status as { code?: string } | undefined)?.code,
  png1,
  png2,
}));
