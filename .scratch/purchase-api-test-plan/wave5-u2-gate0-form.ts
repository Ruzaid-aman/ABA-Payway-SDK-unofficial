/**
 * Wave 5 — U2 proper: SDK getCheckoutFormHtml with paymentGate: 0 (R2 hosted view).
 *
 * W5-4 showed a gate-less form POST answers raw JSON in the browser (F8 parity).
 * With payment_gate: 0 the form-POST response is the Nuxt hosted checkout
 * interface, which renders in place because the browser POSTs to the gateway
 * (response document keeps the gateway origin — W5-3). SDK-signed, auto-submit.
 *
 * Run: npx tsx .scratch/purchase-api-test-plan/wave5-u2-gate0-form.ts   (no network)
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

const html = payway.checkout.getCheckoutFormHtml(
  {
    transactionId: 'w2u2003',
    amount: 3.13,
    currency: 'USD',
    paymentOption: 'abapay_khqr',
    returnUrl: 'https://example.com/checkout/return',
    lifetime: 10,
    paymentGate: 0,
  },
  { autoSubmit: true },
);

const file = path.join(OUT_DIR, 'w2u2003-gate0-khqr-form.html');
fs.writeFileSync(file, html);
const entry = {
  id: 'w2u2003',
  purpose: 'U2 proper — SDK gate-0 hosted-view auto-submit form',
  bytes: html.length,
  hasPaymentGateField: /name="payment_gate"/.test(html),
  autoSubmit: /submit\(\)/.test(html),
  action_url: html.match(/action="([^"]+)"/)?.[1],
  file,
};
console.log(JSON.stringify(entry, null, 1));
fs.writeFileSync(path.join(OUT_DIR, 'wave5-u2-gate0-form.json'), JSON.stringify(entry, null, 2));
