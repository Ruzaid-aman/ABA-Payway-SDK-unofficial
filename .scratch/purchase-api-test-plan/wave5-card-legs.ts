/**
 * Wave 5 — card legs + remaining KHQR user-step artifacts.
 *
 * Builds (per W5-3 knowledge: hosted interface renders ONLY as a browser
 * form-POST response with payment_gate=0 — server-saved HTML is a dead end):
 *   U5+E7  w2u5001   SDK gate-0 CARD form, autoSubmit, return_params echo probe
 *   E-6    w2e6b001  SDK gate-0 CARD form, skipSuccessPage 0 + continueSuccessUrl
 *   U6     w2u6001   SDK popup plugin CARD form (record + pay)
 *   U11    w2u11001  SDK purchase (gate 0, CARD) → close → gate-0 CARD form (H7 retest)
 *   U12    w2u12001  duplicate tran_id pair (KHQR 1.71 / 1.72) → two QR PNGs
 *
 * Run: NODE_TLS_REJECT_UNAUTHORIZED='0' npx tsx .scratch/purchase-api-test-plan/wave5-card-legs.ts
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
fs.mkdirSync(QR_DIR, { recursive: true });

const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID,
  apiKey: process.env.PAYWAY_API_KEY,
  publicKeyPem: process.env.PAYWAY_RSA_PUBLIC_KEY,
  environment: 'sandbox',
});

const RETURN_URL = 'https://example.com/checkout/return';
const log: Record<string, unknown> = {};

function save(name: string, html: string): string {
  const file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, html);
  return name;
}

// U5 + E-7: gate-0 CARD form with return_params echo probe
log.w2u5001 = {
  file: save(
    'w2u5001-gate0-card-form.html',
    payway.checkout.getCheckoutFormHtml(
      {
        transactionId: 'w2u5001',
        amount: 2.0,
        currency: 'USD',
        paymentOption: 'cards',
        returnUrl: RETURN_URL,
        lifetime: 10,
        paymentGate: 0,
        returnParams: { e7probe: 'return_params-echo-test', order: 'E7' },
      },
      { autoSubmit: true },
    ),
  ),
  purpose: 'U5 card page + E-7 return_params echo',
};

// E-6: gate-0 CARD form with skip_success_page 0 + continue_success_url
log.w2e6b001 = {
  file: save(
    'w2e6b001-continue-card-form.html',
    payway.checkout.getCheckoutFormHtml(
      {
        transactionId: 'w2e6b001',
        amount: 1.12,
        currency: 'USD',
        paymentOption: 'cards',
        returnUrl: RETURN_URL,
        lifetime: 10,
        paymentGate: 0,
        skipSuccessPage: 0,
        continueSuccessUrl: 'https://example.com/checkout/continue',
      },
      { autoSubmit: true },
    ),
  ),
  purpose: 'E-6 skip_success_page 0 + continue_success_url redirect observation',
};

// U6: SDK popup plugin card form
log.w2u6001 = {
  file: save(
    'w2u6001-popup-card-form.html',
    payway.checkout.getCheckoutFormHtml(
      {
        transactionId: 'w2u6001',
        amount: 2.5,
        currency: 'USD',
        paymentOption: 'cards',
        returnUrl: RETURN_URL,
        lifetime: 10,
      },
      { popupMode: true },
    ),
  ),
  purpose: 'U6 popup plugin (SDK-signed)',
  hasPluginScript: fs.readFileSync(path.join(OUT_DIR, 'w2u6001-popup-card-form.html'), 'utf8').includes('checkout2-0.js'),
};

// U11: create → close → browser form for the SAME tran_id (H7 retest)
const createdUtc = new Date().toISOString();
await payway.checkout.purchase({
  transactionId: 'w2u11001',
  amount: 1.5,
  currency: 'USD',
  paymentOption: 'cards',
  returnUrl: RETURN_URL,
  lifetime: 10,
  paymentGate: 0,
});
await new Promise((r) => setTimeout(r, 2000));
let closeResult: unknown;
try {
  closeResult = await payway.checkout.closeTransaction('w2u11001');
} catch (err) {
  closeResult = { error: (err as Error).constructor.name, message: (err as Error).message.slice(0, 160) };
}
log.w2u11001 = {
  created_utc: createdUtc,
  closed: closeResult,
  file: save(
    'w2u11001-closed-card-form.html',
    payway.checkout.getCheckoutFormHtml(
      {
        transactionId: 'w2u11001',
        amount: 1.5,
        currency: 'USD',
        paymentOption: 'cards',
        returnUrl: RETURN_URL,
        lifetime: 10,
        paymentGate: 0,
      },
      { autoSubmit: true },
    ),
  ),
  purpose: 'U11 H7 retest — closed session card page',
};

// U12: duplicate tran_id pair (fresh, small amounts)
const dup1 = (await payway.checkout.purchase({
  transactionId: 'w2u12001',
  amount: 1.71,
  currency: 'USD',
  paymentOption: 'abapay_khqr',
  returnUrl: RETURN_URL,
  lifetime: 10,
})) as Record<string, unknown>;
const dup2 = (await payway.checkout.purchase({
  transactionId: 'w2u12001',
  amount: 1.72,
  currency: 'USD',
  paymentOption: 'abapay_khqr',
  returnUrl: RETURN_URL,
  lifetime: 10,
})) as Record<string, unknown>;
if (dup1.qrString) await QRCode.toFile(path.join(QR_DIR, 'w2u12001-first-1.71.png'), dup1.qrString as string, { width: 512, margin: 2 });
if (dup2.qrString) await QRCode.toFile(path.join(QR_DIR, 'w2u12001-second-1.72.png'), dup2.qrString as string, { width: 512, margin: 2 });
log.w2u12001 = {
  purpose: 'U12 duplicate tran_id on purchase (D-7)',
  first_amount_in_payload: (dup1.qrString as string)?.match(/5404(\d+\.\d+)/)?.[1],
  second_amount_in_payload: (dup2.qrString as string)?.match(/5404(\d+\.\d+)/)?.[1],
  pngs: ['qr/w2u12001-first-1.71.png', 'qr/w2u12001-second-1.72.png'],
};

fs.writeFileSync(path.join(OUT_DIR, 'wave5-card-legs.json'), JSON.stringify(log, null, 2));
console.log(JSON.stringify(log, null, 1));
