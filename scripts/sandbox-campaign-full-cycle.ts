/**
 * Full-cycle sandbox validation campaign.
 *
 * Exercises: exchange-rate, purchase creation, check-transaction,
 * close-transaction, transaction-detail, transaction-list, refund,
 * plus edge-case probes. Writes structured evidence to test-output/.
 *
 * Usage: npx tsx scripts/sandbox-campaign-full-cycle.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { PayWay } from '../src/index.js';

// Load .env (same minimal loader as src/cli.ts)
(function loadDotEnv(): void {
  const envPath = new URL('../.env', import.meta.url);
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.replace(/\r/g, '').trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (!(key in process.env)) process.env[key] = trimmed.slice(eqIdx + 1).trim();
  }
})();

interface Evidence {
  scenario: string;
  ok: boolean;
  httpStatus?: number | string;
  paywayCode?: string;
  message: string;
  raw?: unknown;
  durationMs: number;
}

const evidence: Evidence[] = [];
const payway = new PayWay({ debug: false });

async function record(
  scenario: string,
  fn: () => Promise<unknown>,
): Promise<unknown> {
  const start = Date.now();
  try {
    const result = await fn();
    const dur = Date.now() - start;
    const raw = result as Record<string, unknown>;
    const status = (raw?.status ?? {}) as Record<string, unknown>;
    evidence.push({
      scenario,
      ok: true,
      paywayCode: status.code !== undefined ? String(status.code) : undefined,
      message: String(status.message ?? 'success'),
      raw,
      durationMs: dur,
    });
    return result;
  } catch (error) {
    const e = error as {
      message?: string;
      statusCode?: number;
      paywayCode?: string;
      rawBody?: unknown;
    };
    evidence.push({
      scenario,
      ok: false,
      httpStatus: e.statusCode,
      paywayCode: e.paywayCode,
      message: e.message ?? String(error),
      raw: e.rawBody,
      durationMs: Date.now() - start,
    });
    return undefined;
  }
}

function stamp(): string {
  return Date.now().toString(36);
}

// ---------------------------------------------------------------------------
// 1. Exchange rate (lightweight connectivity + auth check)
// ---------------------------------------------------------------------------
await record('exchange-rate', () => payway.checkout.getExchangeRate());

// ---------------------------------------------------------------------------
// 2. Purchase creation (checkout QR)
// ---------------------------------------------------------------------------
const tranId = `CAM${stamp()}X`;
const created = await record('purchase-create', () =>
  payway.checkout.purchase({
    transactionId: tranId,
    amount: 5,
    currency: 'USD',
    paymentOption: 'abapay_khqr',
    paymentGate: 0,
  }),
);
console.log(`created tran_id=${tranId}`);

// ---------------------------------------------------------------------------
// 3. Check-transaction immediately after create (expect PENDING / OPEN)
// ---------------------------------------------------------------------------
await record('check-immediately-after-create', async () => {
  // Small delay so PayWay has the transaction registered
  await new Promise((r) => setTimeout(r, 1500));
  return payway.checkout.checkTransaction(tranId);
});

// ---------------------------------------------------------------------------
// 4. Close-transaction on an unpaid (OPEN/PENDING) transaction
// ---------------------------------------------------------------------------
await record('close-unpaid', () => payway.checkout.closeTransaction(tranId));

// ---------------------------------------------------------------------------
// 5. Check again after close — what status does a closed txn report?
// ---------------------------------------------------------------------------
await record('check-after-close', async () => {
  await new Promise((r) => setTimeout(r, 1000));
  return payway.checkout.checkTransaction(tranId);
});

// ---------------------------------------------------------------------------
// 6. Refund on a non-paid transaction (edge case: expect PTL57/PTL58 or similar)
// ---------------------------------------------------------------------------
await record('refund-on-nonpaid', () => payway.checkout.refund(tranId, 1, 'USD'));

// ---------------------------------------------------------------------------
// 7. Transaction detail on closed txn
// ---------------------------------------------------------------------------
await record('detail-closed', () =>
  payway.checkout.getTransactionDetail(tranId),
);

// ---------------------------------------------------------------------------
// 8. Edge cases
// ---------------------------------------------------------------------------

// 8a. Duplicate tran_id purchase (same id reused)
await record('purchase-duplicate-tran-id', () =>
  payway.checkout.purchase({
    transactionId: tranId,
    amount: 5,
    currency: 'USD',
    paymentOption: 'abapay_khqr',
  }),
);

// 8b. Zero amount
await record('purchase-zero-amount', () =>
  payway.checkout.purchase({
    transactionId: `CAMZ${stamp()}`,
    amount: 0,
    currency: 'USD',
    paymentOption: 'abapay_khqr',
  }),
).catch(() => undefined); // client-side validation may reject first

// 8c. Invalid tran_id characters (client-side validation expected)
await record('purchase-invalid-tran-id-chars', () =>
  payway.checkout.purchase({
    transactionId: 'bad id with spaces!',
    amount: 1,
    currency: 'USD',
    paymentOption: 'abapay_khqr',
  }),
).catch(() => undefined);

// 8d. Unknown payment option
await record('purchase-unknown-payment-option', () =>
  payway.checkout.purchase({
    transactionId: `CAMU${stamp()}`,
    amount: 1,
    currency: 'USD',
    paymentOption: 'not_a_real_option',
  }),
);

// 8e. check-transaction for non-existent tran_id
await record('check-nonexistent-tran', () =>
  payway.checkout.checkTransaction(`NOPE${stamp()}`),
);

// 8f. refund with sub-minimum amount (client-side PTL04 guard expected)
await record('refund-subminimum-client-guard', () =>
  payway.checkout.refund(`SOMEID123`, 0.001, 'USD'),
).catch(() => undefined);

// 8g. refund of nonexistent transaction (server response shape?)
await record('refund-nonexistent-server', () =>
  payway.checkout.refund(`NOPE${stamp()}`, 1, 'USD'),
);

// 8h. close nonexistent transaction
await record('close-nonexistent', () =>
  payway.checkout.closeTransaction(`NOPE${stamp()}`),
);

// 8i. transaction-list today (also verifies list contract)
await record('list-today', () =>
  payway.checkout.getTransactionList({
    fromDate: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
    toDate: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
    page: '1',
    pagination: '10',
  }),
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
writeFileSync(
  'test-output/campaign-evidence.json',
  JSON.stringify({ ranAt: new Date().toISOString(), evidence }, null, 2),
);

console.log('\n=== CAMPAIGN EVIDENCE ===');
for (const ev of evidence) {
  const icon = ev.ok ? 'OK  ' : 'FAIL';
  console.log(
    `[${icon}] ${ev.scenario} (${ev.durationMs}ms)` +
      ` http=${ev.httpStatus ?? '-'} code=${ev.paywayCode ?? '-'} :: ${ev.message.slice(0, 140)}`,
  );
}
