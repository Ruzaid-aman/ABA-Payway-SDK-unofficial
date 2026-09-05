/**
 * Purchase API test campaign — Wave 2/3/4 agent-only prep.
 * Creates all scan-target transactions (long lifetime 1440 min so the user can
 * scan outside a 10-minute window — DEVIATION from plan's lifetime 10, noted),
 * re-pins F8 (C-R1-1), preps H7 closed card session (U11), D-7 duplicates,
 * E-1 boundary amounts, E-8 long return_url, card-channel unpaid visibility (E-5/H5),
 * and renders scannable QR PNGs for the user checklist.
 *
 * Run: NODE_TLS_REJECT_UNAUTHORIZED='0' npx tsx .scratch/purchase-api-test-plan/wave234-prep-sdk.ts
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

const RETURN_URL = 'https://example.com/checkout/return';
const LIFETIME = 1440; // minutes — 24 h, so user scans are not time-boxed to 10 min (deviation noted in captures)

const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID,
  apiKey: process.env.PAYWAY_API_KEY,
  publicKeyPem: process.env.PAYWAY_RSA_PUBLIC_KEY,
  environment: 'sandbox',
});

const log: Record<string, unknown>[] = [];

function record(id: string, data: unknown): void {
  log.push({ id, data });
  console.log(`\n### ${id}`);
  console.log(JSON.stringify(data, null, 1).slice(0, 900));
}

function shapeOf(r: unknown): string[] {
  return r && typeof r === 'object' ? Object.keys(r as object) : [];
}

async function saveQr(id: string, qrString: string): Promise<string> {
  const file = path.join(QR_DIR, `${id}.png`);
  await QRCode.toFile(file, qrString, { width: 512, margin: 2 });
  return file;
}

async function create(id: string, params: Record<string, unknown>): Promise<Record<string, unknown> | { error: string; raw?: unknown }> {
  try {
    const r = (await payway.checkout.purchase({
      transactionId: id,
      returnUrl: RETURN_URL,
      lifetime: LIFETIME,
      ...(params as object),
    })) as Record<string, unknown>;
    const status = r.status as { code?: string; tran_id?: string } | undefined;
    record(id, { created: true, code: status?.code, tran_id: status?.tran_id, shape: shapeOf(r), hasQrString: !!r.qrString, hasQrImage: !!r.qrImage, hasDeeplink: !!r.abapay_deeplink, hasCheckoutQrUrl: !!r.checkout_qr_url });
    return r;
  } catch (err) {
    const e = err as Error & { rawBody?: unknown };
    record(id, { created: false, errorClass: e.constructor.name, message: e.message.slice(0, 300), raw: e.rawBody });
    return { error: e.constructor.name, raw: e.rawBody };
  }
}

async function main(): Promise<void> {
  // P0 representative: expect not-found before creation
  try {
    await payway.checkout.checkTransaction('w2asdk001');
    record('P0-w2asdk001', { result: 'FOUND (unexpected)' });
  } catch (err) {
    const e = err as Error & { rawBody?: { status?: { code?: string } } };
    record('P0-w2asdk001', { errorClass: e.constructor.name, code: e.rawBody?.status?.code, message: e.message.slice(0, 160) });
  }

  // Wave 2 — KHQR scan targets
  const aSdk1 = (await create('w2asdk001', { amount: 2.22, currency: 'USD', paymentOption: 'abapay_khqr' })) as Record<string, unknown>;
  if (aSdk1.qrString) await saveQr('w2asdk001', aSdk1.qrString as string);
  const aSdk2 = (await create('e2ekhqr-sdk-001', { amount: 2.22, currency: 'USD', paymentOption: 'abapay_khqr' })) as Record<string, unknown>;
  if (aSdk2.qrString) await saveQr('e2ekhqr-sdk-001', aSdk2.qrString as string);
  const aR2 = (await create('w2ar2001', { amount: 3.13, currency: 'USD', paymentOption: 'abapay_khqr', paymentGate: 0, viewType: 'hosted_view' })) as Record<string, unknown>;
  record('A-R2-1-page', { checkout_qr_url: aR2.checkout_qr_url });

  // Wave 3 — card route
  const cR11 = await create('w2cr11001', { amount: 1.0, currency: 'USD', paymentOption: 'cards' }); // F8 re-pin: expect QR JSON, not card page
  record('C-R1-1-F8', { shape: shapeOf(cR11), hasCheckoutQrUrl: 'checkout_qr_url' in (cR11 as object) });
  const cR21 = (await create('w2cr2001', { amount: 5.55, currency: 'USD', paymentOption: 'cards', paymentGate: 0, viewType: 'hosted_view' })) as Record<string, unknown>;
  record('C-R2-1-page', { checkout_qr_url: cR21.checkout_qr_url, shape: shapeOf(cR21) });

  // H7 prep: closed card session (U11)
  const h7 = (await create('w2h7close1', { amount: 9.99, currency: 'USD', paymentOption: 'cards', paymentGate: 0, viewType: 'hosted_view' })) as Record<string, unknown>;
  try {
    const closed = (await payway.checkout.closeTransaction('w2h7close1')) as Record<string, unknown>;
    record('H7-close', { closeResponse: closed });
  } catch (err) {
    const e = err as Error & { rawBody?: unknown };
    record('H7-close', { errorClass: e.constructor.name, message: e.message.slice(0, 200), raw: e.rawBody });
  }
  record('H7-page-url', { checkout_qr_url: h7.checkout_qr_url });

  // D-7 duplicate tran_id (purchase path)
  const dup1 = (await create('dup0001', { amount: 7.01, currency: 'USD', paymentOption: 'abapay_khqr' })) as Record<string, unknown>;
  const dup2 = (await create('dup0001', { amount: 7.02, currency: 'USD', paymentOption: 'abapay_khqr' })) as Record<string, unknown>;
  if (dup1.qrString) await saveQr('dup0001-first-7.01', dup1.qrString as string);
  if (dup2.qrString) await saveQr('dup0001-second-7.02', dup2.qrString as string);
  record('D-7-note', { qr1_amount_in_payload: (dup1.qrString as string)?.match(/5404(\d+\.\d+)/)?.[1], qr2_amount_in_payload: (dup2.qrString as string)?.match(/5404(\d+\.\d+)/)?.[1] });

  // E-1 boundary amounts
  await create('w2e1min001', { amount: 0.01, currency: 'USD', paymentOption: 'abapay_khqr' });
  await create('w2e1max001', { amount: 100000, currency: 'USD', paymentOption: 'abapay_khqr' });

  // E-8 very long return_url (~1500 chars)
  const longUrl = `https://example.com/checkout/return?payload=${'x'.repeat(1450)}`;
  try {
    const r = (await payway.checkout.purchase({ transactionId: 'w2e8url001', amount: 1.0, currency: 'USD', paymentOption: 'abapay_khqr', returnUrl: longUrl, lifetime: LIFETIME })) as Record<string, unknown>;
    record('E-8-long-return-url', { created: true, code: (r.status as { code?: string })?.code, urlLength: longUrl.length });
  } catch (err) {
    const e = err as Error & { rawBody?: unknown };
    record('E-8-long-return-url', { created: false, errorClass: e.constructor.name, message: e.message.slice(0, 200), raw: e.rawBody });
  }

  // C-R2-2: SDK popup plugin form (local, no expiry)
  const popupHtml = payway.checkout.getCheckoutFormHtml(
    { transactionId: 'w2cr22002', amount: 5.55, currency: 'USD', paymentOption: 'cards', returnUrl: RETURN_URL },
    { popupMode: true },
  );
  fs.writeFileSync(path.join(OUT_DIR, 'w2cr22002-popup-card-form.html'), popupHtml);
  record('C-R2-2-form', { file: 'w2cr22002-popup-card-form.html', bytes: popupHtml.length, hasPluginScript: popupHtml.includes('checkout2-0.js') });

  // wait for detail indexing (~5 s+), then P1 checks
  await new Promise((r) => setTimeout(r, 8000));

  // E-5/H5: card-channel unpaid — detail quirk fields + list visibility
  try {
    const d = (await payway.checkout.getTransactionDetail('w2cr2001')) as Record<string, unknown>;
    const data = d.data as Record<string, unknown> | undefined;
    record('E-5-detail-card-unpaid', data ? { original_currency: data.original_currency, payment_amount: data.payment_amount, payment_type: data.payment_type, card_source: data.card_source, ops: data.transaction_operations } : d);
  } catch (err) {
    record('E-5-detail-card-unpaid', { error: (err as Error).message.slice(0, 200) });
  }
  const list = (await payway.checkout.getTransactionList({})) as { transactions?: Record<string, unknown>[] } | Record<string, unknown>[];
  const rows = Array.isArray(list) ? list : (list.transactions ?? []);
  const cardVisible = rows.some((t) => t.transaction_id === 'w2cr2001');
  const khqrVisible = rows.some((t) => t.transaction_id === 'w2asdk001');
  const e1Visible = rows.some((t) => t.transaction_id === 'w2e1max001');
  record('E-5/H5-list-visibility', { listRows: rows.length, w2cr2001_card_channel: cardVisible ? 'VISIBLE' : 'NOT-VISIBLE', w2asdk001_khqr_channel: khqrVisible ? 'VISIBLE' : 'NOT-VISIBLE', w2e1max001_100k: e1Visible ? 'VISIBLE' : 'NOT-VISIBLE' });

  fs.writeFileSync(path.join(OUT_DIR, 'wave234-prep-sdk.json'), JSON.stringify(log, null, 2));
  console.log('\nEvidence: test-output/purchase-test-campaign/wave234-prep-sdk.json');
  console.log('QR PNGs:', fs.readdirSync(QR_DIR).join(', '));
}

main().catch((err) => {
  console.error('Prep failed:', err);
  process.exit(1);
});
