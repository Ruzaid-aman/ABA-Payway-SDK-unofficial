/**
 * Wave 5 — duplicate-state isolation probe (U11 follow-up).
 *
 * The re-POST of a gate-0 card form for CLOSED w2u11001 answered JSON code 4
 * "Duplicated Transaction ID" on first POST (then a retry rendered the closed
 * session and the payment LANDED — H7). This probe re-POSTs a gate-0 KHQR form
 * for w2u12001, which is PENDING with TWO existing JSON-path records, to split:
 *   (a) code 4 = form-path rejects ANY existing tran_id, or
 *   (b) code 4 was CLOSED-state-specific, and PENDING dups render the page.
 * REPORT-ONLY for the user: do NOT pay whatever renders.
 *
 * Run: npx tsx .scratch/purchase-api-test-plan/wave5-dupprobe-form.ts   (no network)
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
    transactionId: 'w2u12001',
    amount: 1.71,
    currency: 'USD',
    paymentOption: 'abapay_khqr',
    returnUrl: 'https://example.com/checkout/return',
    lifetime: 10,
    paymentGate: 0,
  },
  { autoSubmit: true },
);

const file = path.join(OUT_DIR, 'w2u12001-dupprobe-form.html');
fs.writeFileSync(file, html);
console.log(JSON.stringify({ file, bytes: html.length, hasPaymentGate: /name="payment_gate"/.test(html) }));
