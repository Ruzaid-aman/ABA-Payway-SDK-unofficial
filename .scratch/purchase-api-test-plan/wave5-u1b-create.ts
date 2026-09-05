/**
 * Campaign Wave 5 — per-step fresh creation for U1b (H8 memorable caller-supplied ID).
 * Old e2ekhqr-sdk-001 is scan-dead (W5-1 window), so a fresh memorable-ID target is
 * created immediately before the user scan. Uses checkout.purchase() (R1, API under test).
 *
 * Run: NODE_TLS_REJECT_UNAUTHORIZED='0' npx tsx .scratch/purchase-api-test-plan/wave5-u1b-create.ts
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
fs.mkdirSync(OUT_DIR, { recursive: true });

const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID,
  apiKey: process.env.PAYWAY_API_KEY,
  publicKeyPem: process.env.PAYWAY_RSA_PUBLIC_KEY,
  environment: 'sandbox',
});

const createdUtc = new Date().toISOString();
const r = (await payway.checkout.purchase({
  transactionId: 'e2ekhqr-sdk-002',
  amount: 2.22,
  currency: 'USD',
  paymentOption: 'abapay_khqr',
  returnUrl: 'https://example.com/checkout/return',
  lifetime: 10,
})) as Record<string, unknown>;

const qrString = r.qrString as string | undefined;
let png: string | undefined;
if (qrString) {
  png = path.join(OUT_DIR, 'qr', 'e2ekhqr-sdk-002.png');
  await QRCode.toFile(png, qrString, { width: 512, margin: 2 });
}
const entry = {
  id: 'e2ekhqr-sdk-002',
  purpose: 'U1b / A-SDK-2 memorable caller-supplied tran_id (H8)',
  created_utc: createdUtc,
  code: (r.status as { code?: string } | undefined)?.code,
  lifetime_minutes: 10,
  hasQrString: !!qrString,
  png,
};
console.log(JSON.stringify(entry));
fs.writeFileSync(path.join(OUT_DIR, 'wave5-u1b-create.json'), JSON.stringify(entry, null, 2));
