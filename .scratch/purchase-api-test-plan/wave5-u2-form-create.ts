/**
 * Wave 5 — U2 redo: SDK getCheckoutFormHtml() local signed form (R2 browser path).
 *
 * WHY: the gate-0 purchaseHosted() HTML body cannot render standalone (W5-3) —
 * it is a Nuxt app with relative /_nuxt/* assets + client-side QR hydration, so
 * it only renders as the browser's form-POST response (gateway origin). The R2
 * browser artifact is therefore the SDK's plain-submitted local form (hosted
 * view mode per the official docs — no checkout2-0.js plugin).
 *
 * Run: npx tsx .scratch/purchase-api-test-plan/wave5-u2-form-create.ts   (no network)
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
const html = payway.checkout.getCheckoutFormHtml({
  transactionId: 'w2u2002',
  amount: 3.13,
  currency: 'USD',
  paymentOption: 'abapay_khqr',
  returnUrl: 'https://example.com/checkout/return',
  lifetime: 10,
});

const file = path.join(OUT_DIR, 'w2u2002-khqr-form.html');
fs.writeFileSync(file, html);
const entry = {
  id: 'w2u2002',
  purpose: 'U2 redo — SDK getCheckoutFormHtml plain (hosted view) auto-submit form',
  created_utc: createdUtc,
  bytes: html.length,
  hasPluginScript: html.includes('checkout2-0.js'),
  autoSubmit: html.includes('document.forms[0].submit') || html.includes('submit()'),
  action_url: html.match(/action="([^"]+)"/)?.[1],
  file,
};
console.log(JSON.stringify(entry, null, 1));
fs.writeFileSync(path.join(OUT_DIR, 'wave5-u2-form-create.json'), JSON.stringify(entry, null, 2));
