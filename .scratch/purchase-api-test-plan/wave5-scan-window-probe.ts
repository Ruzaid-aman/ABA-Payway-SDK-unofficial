/**
 * Campaign Wave 5 — scan-time validity window probe (Purchase API, SDK route R1).
 *
 * CONTEXT: user scan of w2asdk001 (SDK purchase, lifetime 1440 min, created
 * 2026-09-05 19:19 UTC+7) was refused at scan time with "Transaction expired"
 * at age ~2h15m — while check-transaction read PENDING (code 2) seconds before
 * and the KHQR payload (decoded TLV) embeds NO expiry tag. Hypotheses:
 *   H-A: gateway computes the purchase QR's scan window as lifetime SECONDS
 *        (QR-API semantics) → 1440 min ≈ dead after 24 min.
 *   H-B: fixed short scan window (record lifetime irrelevant at scan time).
 *   H-C: some other server-side scan-validity rule.
 *
 * Probes (both via checkout.purchase() — the API under test; PNG is only a
 * local rendering of the gateway-returned qrString for the human scanner):
 *   w2fresh001  $1.01 lifetime 10  → user scans IMMEDIATELY (H-A vs H-B split)
 *   w2aged001   $1.02 lifetime 10  → user scans again in ~1 h (bracket H-B/C)
 * Also re-checks w2asdk001 post-refusal (does a refused scan mutate state?).
 *
 * Run: NODE_TLS_REJECT_UNAUTHORIZED='0' npx tsx .scratch/purchase-api-test-plan/wave5-scan-window-probe.ts
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

const log: Record<string, unknown>[] = [];

async function probe(id: string, amount: number, lifetime: number): Promise<void> {
  const createdUtc = new Date().toISOString();
  try {
    const r = (await payway.checkout.purchase({
      transactionId: id,
      amount,
      currency: 'USD',
      paymentOption: 'abapay_khqr',
      returnUrl: 'https://example.com/checkout/return',
      lifetime,
    })) as Record<string, unknown>;
    const qrString = r.qrString as string | undefined;
    let png: string | undefined;
    if (qrString) {
      png = path.join(QR_DIR, `${id}.png`);
      await QRCode.toFile(png, qrString, { width: 512, margin: 2 });
    }
    const entry = {
      id,
      route: 'R1 SDK checkout.purchase()',
      created_utc: createdUtc,
      code: (r.status as { code?: string } | undefined)?.code,
      lifetime_minutes: lifetime,
      hasQrString: !!qrString,
      png,
    };
    log.push(entry);
    console.log(JSON.stringify(entry));
  } catch (err) {
    const e = err as Error & { rawBody?: unknown };
    log.push({ id, created_utc: createdUtc, errorClass: e.constructor.name, message: e.message.slice(0, 200) });
    console.log(`CREATE FAILED ${id}: ${e.constructor.name}: ${e.message.slice(0, 160)}`);
  }
}

async function main(): Promise<void> {
  await probe('w2fresh001', 1.01, 10);
  await probe('w2aged001', 1.02, 10);

  // w2asdk001 post-refusal: did the refused scan change gateway state?
  try {
    const c = (await payway.checkout.checkTransaction('w2asdk001')) as Record<string, unknown>;
    const data = c.data as Record<string, unknown> | undefined;
    const entry = { id: 'w2asdk001-post-refusal', payment_status: data?.payment_status, payment_status_code: data?.payment_status_code };
    log.push(entry);
    console.log(JSON.stringify(entry));
  } catch (err) {
    const e = err as Error;
    log.push({ id: 'w2asdk001-post-refusal', error: e.constructor.name });
    console.log(`w2asdk001 post-refusal: ${e.constructor.name}: ${e.message.slice(0, 120)}`);
  }

  log.push({
    note: 'User scan verdicts recorded separately in WAVE5-captures.md: w2fresh001 scanned immediately after creation; w2aged001 scanned ~1 h later.',
    w2asdk001_refusal: { message: 'Transaction expired', refused_at: 'scan time (QR open)', txn_age_s: 8100, record_state: 'PENDING code 2 seconds before refusal' },
  });
  fs.writeFileSync(path.join(OUT_DIR, 'wave5-scan-window-probe.json'), JSON.stringify(log, null, 2));
  console.log('\nEvidence: test-output/purchase-test-campaign/wave5-scan-window-probe.json');
  console.log('Scan NOW: test-output/purchase-test-campaign/qr/w2fresh001.png');
}

main().catch((err) => {
  console.error('Probe failed:', err);
  process.exit(1);
});
