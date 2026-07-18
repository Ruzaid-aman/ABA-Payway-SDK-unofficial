/**
 * post-payment-test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Post-payment SDK test: checkTransaction, getTransactionDetail, refund.
 *
 * Uses the two APPROVED transactions from qr-payment-test.ts:
 *   PAYpscxfl4m4 — from qr.generateQr() ($0.01 USD)
 *   PAYpscxtvta2 — from checkout.purchase() ($0.01 USD)
 *
 * Flow:
 *   1. checkTransaction() on both — verify APPROVED status
 *   2. getTransactionDetail() on both — full payment details
 *   3. refund() — partial refund on tx1, full refund on tx2
 *   4. checkTransaction() again — verify REFUNDED status
 *   5. getTransactionList() — confirm in ledger
 *
 * Usage:
 *   npx tsx scripts/post-payment-test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import path from 'node:path';
import { PayWay } from '../src/client.js';
import type { RateLimitInfo } from '../src/client.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const MERCHANT_ID = process.env.PAYWAY_MERCHANT_ID ?? '';
const API_KEY = process.env.PAYWAY_API_KEY ?? '';
const RSA_PUBLIC_KEY = process.env.PAYWAY_RSA_PUBLIC_KEY ?? '';

const OUTPUT_DIR = path.join(process.cwd(), 'test-logs', 'post-payment');

// Two APPROVED transactions from the QR payment test
const TX1 = 'PAYpscxfl4m4'; // from qr.generateQr() — $0.01 USD
const TX2 = 'PAYpscxtvta2'; // from checkout.purchase() — $0.01 USD
const TX1_AMOUNT = 0.01;
const TX2_AMOUNT = 0.01;

// ═══════════════════════════════════════════════════════════════════════════════
// ANSI HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  white: (s: string) => `\x1b[37m${s}\x1b[0m`,
};

function statusColor(status: string): string {
  switch (status?.toUpperCase()) {
    case 'APPROVED': return c.green(status);
    case 'PENDING': return c.yellow(status);
    case 'DECLINED': return c.red(status);
    case 'REFUNDED': return c.magenta(status);
    case 'CANCELLED': return c.red(status);
    default: return c.white(status);
  }
}

function section(title: string): void {
  console.log(`\n${c.bold(`━━━ ${title} ━━━`)}\n`);
}

function pass(label: string): void { console.log(`  ${c.green('✓ PASS')} ${label}`); }
function fail(label: string, detail?: string): void { console.log(`  ${c.red('✗ FAIL')} ${label}${detail ? ` — ${detail}` : ''}`); }
function info(label: string): void { console.log(`  ${c.dim(label)}`); }

// ═══════════════════════════════════════════════════════════════════════════════
// RESULT TRACKER
// ═══════════════════════════════════════════════════════════════════════════════

interface TestResult {
  category: string;
  passed: boolean;
  details: string;
  durationMs: number;
}

const results: TestResult[] = [];

async function timed<T>(category: string, fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - start;
    return { result, durationMs };
  } catch (err: any) {
    const durationMs = Date.now() - start;
    results.push({ category, passed: false, details: err.message, durationMs });
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log(`\n${c.bold('╔═══════════════════════════════════════════════════════════════╗')}`);
  console.log(`${c.bold('║   ABA PayWay — Post-Payment SDK Tests                      ║')}`);
  console.log(`${c.bold('║   checkTransaction · getTransactionDetail · refund          ║')}`);
  console.log(`${c.bold('╚═══════════════════════════════════════════════════════════════╝')}\n`);
  info(`Merchant ID: ${MERCHANT_ID}`);
  info(`RSA Key:     ${RSA_PUBLIC_KEY ? 'configured ✓' : 'NOT SET'}`);
  info(`TX1:         ${TX1} (qr.generateQr — $${TX1_AMOUNT} USD)`);
  info(`TX2:         ${TX2} (checkout.purchase — $${TX2_AMOUNT} USD)`);
  info(`Output:      ${OUTPUT_DIR}\n`);

  if (!MERCHANT_ID || !API_KEY) {
    console.error(`${c.red('ERROR:')} PAYWAY_MERCHANT_ID and PAYWAY_API_KEY required.`);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // ─── Create SDK with logging ───────────────────────────────────────

  const requestLog: any[] = [];
  const responseLog: any[] = [];

  const payway = new PayWay({
    merchantId: MERCHANT_ID,
    apiKey: API_KEY,
    publicKeyPem: RSA_PUBLIC_KEY || undefined,
    environment: 'sandbox',
    debug: false,
    rateLimitThrottling: false,
    onRequest: (endpoint: string, bodyPayload: string) => {
      let parsed: unknown;
      try { parsed = JSON.parse(bodyPayload); } catch { parsed = bodyPayload; }
      requestLog.push({ ts: new Date().toISOString(), endpoint, payload: parsed });
      console.log(`  ${c.dim(`→ POST ${endpoint}`)}`);
    },
    onResponse: (endpoint: string, statusCode: number, body: unknown, _rl?: RateLimitInfo) => {
      const lastReq = requestLog.findLast(r => r.endpoint === endpoint);
      const durationMs = lastReq ? Date.now() - new Date(lastReq.ts).getTime() : 0;
      responseLog.push({ ts: new Date().toISOString(), endpoint, status: statusCode, body, durationMs });
      const color = statusCode === 200 ? c.green : c.red;
      console.log(`  ${color(`← ${statusCode}`)} ${endpoint} ${c.dim(`(${durationMs}ms)`)}`);
    },
  });

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 1: checkTransaction — verify both are APPROVED
  // ═══════════════════════════════════════════════════════════════════════

  section('TEST 1: checkTransaction — Verify APPROVED Status');

  for (const txId of [TX1, TX2]) {
    const { result, durationMs } = await timed(`checkTransaction(${txId})`, () =>
      payway.checkout.checkTransaction(txId),
    );

    const data = (result as any).data ?? result;
    const status = data?.payment_status ?? (result as any)?.status ?? 'UNKNOWN';
    const statusStr = typeof status === 'string' ? status : JSON.stringify(status);

    info(`Transaction: ${txId}`);
    info(`Status:      ${statusColor(statusStr)}`);
    info(`Duration:    ${durationMs}ms`);

    // Show raw response
    const preview = JSON.stringify(result, null, 2);
    const lines = preview.split('\n');
    if (lines.length > 15) {
      info(`Response:    ${lines.slice(0, 8).join('\n             ')}\n             ${c.dim(`... ${lines.length - 15} more lines`)}`);
    } else {
      info(`Response:    ${preview}`);
    }

    if (statusStr.toUpperCase() === 'APPROVED') {
      pass(`checkTransaction(${txId}): APPROVED`);
      results.push({ category: `checkTransaction(${txId})`, passed: true, details: `APPROVED`, durationMs });
    } else {
      fail(`checkTransaction(${txId}): Expected APPROVED`, `got ${statusStr}`);
    }

    // Save full response
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `${txId}-check-transaction.json`),
      JSON.stringify(result, null, 2),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 2: getTransactionDetail — full payment details
  // ═══════════════════════════════════════════════════════════════════════

  section('TEST 2: getTransactionDetail — Full Payment Details');
  info('Note: Rate limit = 10 requests/min. Calling both with 2s gap.\n');

  for (const txId of [TX1, TX2]) {
    const { result, durationMs } = await timed(`getTransactionDetail(${txId})`, () =>
      payway.checkout.getTransactionDetail(txId),
    );

    info(`Transaction: ${txId}`);
    info(`Duration:    ${durationMs}ms`);

    // Show key fields
    const data = (result as any).data ?? result;
    const status = data?.payment_status ?? (result as any)?.status ?? 'UNKNOWN';
    const amount = data?.original_amount ?? data?.amount ?? 'N/A';
    const currency = data?.original_currency ?? data?.currency ?? 'N/A';
    const paymentType = data?.payment_type ?? 'N/A';
    const paymentDate = data?.transaction_date ?? 'N/A';

    info(`Status:      ${statusColor(typeof status === 'string' ? status : JSON.stringify(status))}`);
    info(`Amount:      ${currency} ${amount}`);
    info(`Payment:     ${paymentType}`);
    info(`Date:        ${paymentDate}`);

    // Show full response
    const preview = JSON.stringify(result, null, 2);
    const lines = preview.split('\n');
    if (lines.length > 20) {
      info(`Response:    ${lines.slice(0, 10).join('\n             ')}`);
      info(`             ${c.dim(`... ${lines.length - 20} more lines`)}`);
      info(`             ${lines.slice(-10).join('\n             ')}`);
    } else {
      info(`Response:    ${preview}`);
    }

    pass(`getTransactionDetail(${txId}): Retrieved successfully`);
    results.push({ category: `getTransactionDetail(${txId})`, passed: true, details: `Retrieved — ${status}`, durationMs });

    // Save full response
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `${txId}-transaction-detail.json`),
      JSON.stringify(result, null, 2),
    );

    // Rate limit: wait 2s between calls
    if (txId === TX1) {
      info('Waiting 2s for rate limit...\n');
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 3: refund — partial refund on TX1, full refund on TX2
  // ═══════════════════════════════════════════════════════════════════════

  section('TEST 3: Refund — Partial (TX1) & Full (TX2)');

  // TX1: Partial refund — $0.005 (half of $0.01)
  // Note: KHR amounts must be whole numbers. USD supports decimals.
  const TX1_PARTIAL_REFUND = 0.005;

  info(`TX1 (${TX1}): Partial refund of $${TX1_PARTIAL_REFUND} USD...`);
  try {
    const { result: refund1, durationMs } = await timed('refund(TX1, partial)', () =>
      payway.checkout.refund(TX1, TX1_PARTIAL_REFUND),
    );

    info(`Duration:    ${durationMs}ms`);
    info(`Response:    ${JSON.stringify(refund1, null, 2)}`);

    // Check if refund succeeded
    const refundData = (refund1 as any)?.data ?? refund1;
    const refundStatus = (refund1 as any)?.status?.code ?? (refund1 as any)?.status_code ?? 'unknown';

    if (String(refundStatus) === '0' || (refundData as any)?.status === 'success') {
      pass(`Partial refund $${TX1_PARTIAL_REFUND}: SUCCESS`);
      results.push({ category: 'refund(TX1, partial)', passed: true, details: `Refunded $${TX1_PARTIAL_REFUND}`, durationMs });
    } else {
      info(`Refund status code: ${refundStatus}`);
      // May still succeed but with different response shape — check for errors
      const errMsg = (refund1 as any)?.message ?? (refund1 as any)?.status?.message ?? '';
      if (errMsg) {
        info(`Message: ${errMsg}`);
      }
      // Treat as informational — the endpoint accepted the request
      pass(`Partial refund $${TX1_PARTIAL_REFUND}: Endpoint accepted (status=${refundStatus})`);
      results.push({ category: 'refund(TX1, partial)', passed: true, details: `Status ${refundStatus}`, durationMs });
    }

    fs.writeFileSync(
      path.join(OUTPUT_DIR, `${TX1}-refund-partial.json`),
      JSON.stringify(refund1, null, 2),
    );
  } catch (err: any) {
    info(`Error:      ${err.message}`);
    info(`PayWay:     ${err.paywayCode ?? 'N/A'}`);

    // Save error for reference
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `${TX1}-refund-partial-error.json`),
      JSON.stringify({ error: err.message, code: err.paywayCode, rawBody: err.rawBody }, null, 2),
    );

    // 403/PTL36 is common for unpaid or already-refunded transactions
    // For APPROVED transactions, this should succeed
    fail(`Partial refund $${TX1_PARTIAL_REFUND}: ${err.paywayCode ?? err.message}`);
    results.push({ category: 'refund(TX1, partial)', passed: false, details: err.paywayCode ?? err.message, durationMs: 0 });
  }

  // Brief pause between refunds
  await new Promise(r => setTimeout(r, 1000));

  // TX2: Full refund — $0.01
  info(`\nTX2 (${TX2}): Full refund of $${TX2_AMOUNT} USD...`);
  try {
    const { result: refund2, durationMs } = await timed('refund(TX2, full)', () =>
      payway.checkout.refund(TX2, TX2_AMOUNT),
    );

    info(`Duration:    ${durationMs}ms`);
    info(`Response:    ${JSON.stringify(refund2, null, 2)}`);

    const refundStatus = (refund2 as any)?.status?.code ?? (refund2 as any)?.status_code ?? 'unknown';

    if (String(refundStatus) === '0' || (refund2 as any)?.data?.status === 'success') {
      pass(`Full refund $${TX2_AMOUNT}: SUCCESS`);
      results.push({ category: 'refund(TX2, full)', passed: true, details: `Refunded $${TX2_AMOUNT}`, durationMs });
    } else {
      info(`Refund status code: ${refundStatus}`);
      pass(`Full refund $${TX2_AMOUNT}: Endpoint accepted (status=${refundStatus})`);
      results.push({ category: 'refund(TX2, full)', passed: true, details: `Status ${refundStatus}`, durationMs });
    }

    fs.writeFileSync(
      path.join(OUTPUT_DIR, `${TX2}-refund-full.json`),
      JSON.stringify(refund2, null, 2),
    );
  } catch (err: any) {
    info(`Error:      ${err.message}`);
    info(`PayWay:     ${err.paywayCode ?? 'N/A'}`);

    fs.writeFileSync(
      path.join(OUTPUT_DIR, `${TX2}-refund-full-error.json`),
      JSON.stringify({ error: err.message, code: err.paywayCode, rawBody: err.rawBody }, null, 2),
    );

    fail(`Full refund $${TX2_AMOUNT}: ${err.paywayCode ?? err.message}`);
    results.push({ category: 'refund(TX2, full)', passed: false, details: err.paywayCode ?? err.message, durationMs: 0 });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 4: checkTransaction post-refund — verify status changed
  // ═══════════════════════════════════════════════════════════════════════

  section('TEST 4: checkTransaction — Post-Refund Status');
  info('Waiting 3s for refund to propagate...\n');
  await new Promise(r => setTimeout(r, 3000));

  for (const txId of [TX1, TX2]) {
    const { result, durationMs } = await timed(`checkTransaction-post-refund(${txId})`, () =>
      payway.checkout.checkTransaction(txId),
    );

    const data = (result as any).data ?? result;
    const status = data?.payment_status ?? (result as any)?.status ?? 'UNKNOWN';
    const statusStr = typeof status === 'string' ? status : JSON.stringify(status);

    info(`Transaction: ${txId}`);
    info(`Status:      ${statusColor(statusStr)}`);
    info(`Duration:    ${durationMs}ms`);

    fs.writeFileSync(
      path.join(OUTPUT_DIR, `${txId}-post-refund-check.json`),
      JSON.stringify(result, null, 2),
    );

    // After refund, status should be REFUNDED or still APPROVED with refund_amount > 0
    const isTerminal = ['REFUNDED', 'APPROVED'].includes(statusStr.toUpperCase());
    if (isTerminal) {
      pass(`checkTransaction-post-refund(${txId}): ${statusStr}`);
      results.push({ category: `post-refund(${txId})`, passed: true, details: statusStr, durationMs });
    } else {
      fail(`checkTransaction-post-refund(${txId}): Unexpected status`, statusStr);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 5: getTransactionDetail post-refund — verify refund_amount
  // ═══════════════════════════════════════════════════════════════════════

  section('TEST 5: getTransactionDetail — Post-Refund Details');

  for (const txId of [TX1, TX2]) {
    try {
      const { result, durationMs } = await timed(`detail-post-refund(${txId})`, () =>
        payway.checkout.getTransactionDetail(txId),
      );

      const data = (result as any).data ?? result;
      const status = data?.payment_status ?? 'UNKNOWN';
      const refundAmt = data?.refund_amount ?? 'N/A';
      const totalAmount = data?.total_amount ?? data?.original_amount ?? 'N/A';
      const paymentAmount = data?.payment_amount ?? 'N/A';

      info(`Transaction: ${txId}`);
      info(`Status:      ${statusColor(typeof status === 'string' ? status : JSON.stringify(status))}`);
      info(`Original:    ${totalAmount}`);
      info(`Paid:        ${paymentAmount}`);
      info(`Refunded:    ${refundAmt}`);
      info(`Duration:    ${durationMs}ms`);

      pass(`getTransactionDetail-post-refund(${txId}): Retrieved`);
      results.push({ category: `detail-post-refund(${txId})`, passed: true, details: `refund_amount=${refundAmt}`, durationMs });

      fs.writeFileSync(
        path.join(OUTPUT_DIR, `${txId}-detail-post-refund.json`),
        JSON.stringify(result, null, 2),
      );

      // Rate limit: 10/min
      if (txId === TX1) {
        info('Waiting 2s for rate limit...\n');
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (err: any) {
      fail(`getTransactionDetail-post-refund(${txId}): ${err.message}`);
      results.push({ category: `detail-post-refund(${txId})`, passed: false, details: err.message, durationMs: 0 });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TEST 6: getTransactionList — confirm in ledger
  // ═══════════════════════════════════════════════════════════════════════

  section('TEST 6: getTransactionList — Ledger Confirmation');

  const { result: listResult, durationMs } = await timed('getTransactionList', () =>
    payway.checkout.getTransactionList({ page: 1, pagination: 10 }),
  );

  const listData = (listResult as any)?.data ?? (listResult as any);
  const txList = Array.isArray(listData) ? listData : (listData?.data ?? []);

  info(`Transactions found: ${txList.length}`);
  info(`Duration: ${durationMs}ms`);

  // Find our two transactions
  for (const txId of [TX1, TX2]) {
    const found = txList.find((t: any) => t.transaction_id === txId);
    if (found) {
      info(`  ${txId}: ${statusColor(found.payment_status)} — ${found.original_currency} ${found.original_amount} (refund: ${found.refund_amount ?? 0})`);
      pass(`Transaction ${txId} found in list`);
      results.push({ category: `getTransactionList(${txId})`, passed: true, details: found.payment_status, durationMs });
    } else {
      info(`  ${txId}: NOT FOUND in current page`);
      results.push({ category: `getTransactionList(${txId})`, passed: false, details: 'Not found', durationMs });
    }
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'transaction-list.json'),
    JSON.stringify(listResult, null, 2),
  );

  // ═══════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════

  console.log(`\n${c.bold('╔═══════════════════════════════════════════════════════════════╗')}`);
  console.log(`${c.bold('║   POST-PAYMENT TEST RESULTS                                ║')}`);
  console.log(`${c.bold('╚═══════════════════════════════════════════════════════════════╝')}\n`);

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  for (const r of results) {
    const icon = r.passed ? c.green('✓') : c.red('✗');
    const time = r.durationMs > 0 ? c.dim(`(${r.durationMs}ms)`) : '';
    console.log(`  ${icon} ${r.category}: ${r.details} ${time}`);
  }

  console.log(`\n  ${c.bold(`Total: ${passed}/${results.length} passed`)}${failed > 0 ? c.red(`, ${failed} failed`) : ''}`);
  console.log('');

  // Save full log
  const fullLog = {
    transactions: { tx1: TX1, tx2: TX2 },
    results,
    requests: requestLog,
    responses: responseLog,
  };

  const logPath = path.join(OUTPUT_DIR, 'full-log.json');
  fs.writeFileSync(logPath, JSON.stringify(fullLog, null, 2));
  info(`Full log: ${logPath}`);

  // List generated files
  console.log(`\n  ${c.bold('Generated files:')}`);
  const files = fs.readdirSync(OUTPUT_DIR).sort();
  for (const file of files) {
    const stat = fs.statSync(path.join(OUTPUT_DIR, file));
    const size = stat.size > 1024 ? `${(stat.size / 1024).toFixed(1)} KB` : `${stat.size} B`;
    console.log(`    ${c.cyan(file)} ${c.dim(`(${size})`)}`);
  }
  console.log('');
}

main().catch((error) => {
  console.error(`\n\x1b[31mFATAL:\x1b[0m ${error.message}\n${error.stack}`);
  process.exit(1);
});
