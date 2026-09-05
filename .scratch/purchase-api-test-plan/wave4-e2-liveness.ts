/**
 * Campaign agent legs — E-2 expired-transaction states + user-step liveness
 * sweep (read-only; check-transaction 600/s, detail ≤6 calls).
 *
 * E-2 (plan §E): transactions created in Wave 1 with lifetime 10 min are long
 * expired — does check/detail ever change from PENDING after expiry?
 * Liveness: the Wave-2/3/4 prep txns (lifetime 1440 min) must still be
 * PENDING for the pending user steps U1–U12.
 *
 * Run from repo root:
 *   NODE_TLS_REJECT_UNAUTHORIZED='0' npx tsx .scratch/purchase-api-test-plan/wave4-e2-liveness.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { PayWay, PayWayBusinessError } from '../../src/index.js';

const envPath = path.resolve(import.meta.dirname, '../../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}

const OUT_DIR = path.resolve(import.meta.dirname, '../../test-output/purchase-test-campaign');
fs.mkdirSync(OUT_DIR, { recursive: true });

const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID,
  apiKey: process.env.PAYWAY_API_KEY,
  publicKeyPem: process.env.PAYWAY_RSA_PUBLIC_KEY,
  environment: 'sandbox',
});

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface CheckResult {
  tran_id: string;
  check_status: string;
  check_code: string | null;
}

async function check(tranId: string): Promise<CheckResult> {
  try {
    const result = (await payway.checkout.checkTransaction(tranId)) as unknown as Record<string, unknown>;
    const data = result?.data as Record<string, unknown> | undefined;
    return {
      tran_id: tranId,
      check_status: String(data?.payment_status ?? (result as { status?: { code?: unknown } })?.status?.code ?? '?'),
      check_code: data?.payment_status_code !== undefined ? String(data.payment_status_code) : null,
    };
  } catch (err) {
    const code = err instanceof PayWayBusinessError ? err.paywayCode : undefined;
    const name = err instanceof Error ? err.constructor.name : String(err);
    return {
      tran_id: tranId,
      check_status: `ERROR(${name}:${code ?? ''})`,
      check_code: code ?? null,
    };
  }
}

async function detail(tranId: string): Promise<Record<string, unknown> | { error: string }> {
  try {
    const result = (await payway.checkout.getTransactionDetail(tranId)) as unknown as Record<string, unknown>;
    const data = (result?.data ?? result) as Record<string, unknown>;
    return {
      payment_status: data?.payment_status,
      payment_amount: data?.payment_amount,
      original_currency: data?.original_currency,
      original_amount: data?.original_amount,
      payment_type: data?.payment_type,
      refund_amount: data?.refund_amount,
    };
  } catch (err) {
    const label = err instanceof Error ? `${err.constructor.name}: ${err.message.slice(0, 120)}` : String(err);
    return { error: label };
  }
}

// ── E-2: expired wave-1 txns (lifetime 10 min, created 2026-09-05 evening) ──
const EXPIRED = ['w1base001', 'd5001', 'd8nortn001', 'd8cli001', 'd9dadv001', 'd9cli002'];

const e2: Record<string, unknown>[] = [];
for (const id of EXPIRED) {
  const c = await check(id);
  e2.push({ ...c });
  console.log(`E-2 ${id}: ${c.check_status} (code ${c.check_code ?? '—'})`);
}
// Detail on 3 of them (rate limit 10/min — paced below).
for (const id of EXPIRED.slice(0, 3)) {
  await sleep(6_500);
  const d = await detail(id);
  e2.push({ tran_id: `${id} [detail]`, ...d });
  console.log(`E-2 ${id} detail: ${JSON.stringify(d)}`);
}

// ── Liveness: prep-leg txns awaiting user steps (lifetime 1440 min) ──
const USER_STEP_TXNS = [
  'w2asdk001',        // U1  A-SDK-1
  'e2ekhqr-sdk-001',  // U1  A-SDK-2 memorable ID
  'w2ar3001',         // U3  A-R3-1 CLI KHQR
  'w2akhr001',        // U3  A-KHR mirror
  'w2ar41001',        // U4  A-R4-1 CLI form (page needs re-POST — see captures)
  'w2ar2001',         // U2  A-R2-1 gate-0 KHQR page
  'w2cr2001',         // U5  C-R2-1 hosted card (page not saved; w2p2cardsgate0 page is the spare)
  'w2p2cardsgate0',   // U5  spare gate-0 card page ($2.00)
  'w2cr22002',        // U6  C-R2-2 popup plugin
  'w2cr41001',        // U7  C-R4-1 plain card form
  'w2cr42001',        // U6  C-R4-2 popup card form
  'w2ccli001',        // U8  C-CLI-1 cards-option QR
  'w2h7closed2',      // U11 H7 closed card page
  'dup0001',          // U12 D-7 duplicate tran_id (both creations share this ID)
  'w2e1min001',       // E-1 min boundary
  'w2e1max001',       // E-1 max boundary
  'w2e8url001',       // E-8 long return_url
  'w2p1khqrgate0',    // spare gate-0 KHQR page
  'w2p6cardsgate0hosted', // spare gate-0 card page
  'w2h7close1',       // W2-3 evidence — closed, do NOT pay
];

const liveness: Record<string, unknown>[] = [];
for (const id of USER_STEP_TXNS) {
  const c = await check(id);
  liveness.push(c);
  console.log(`LIVE ${id}: ${c.check_status}`);
}

const summary = {
  generated_utc: new Date().toISOString(),
  note: 'E-2 = expired wave-1 txns (lifetime 10 min, created 2026-09-05 evening). LIVE = prep-leg user-step txns (lifetime 1440 min).',
  e2_expired: e2,
  liveness: liveness,
};
const outPath = path.join(OUT_DIR, 'e2-liveness.json');
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(`\nEvidence: ${outPath}`);
