#!/usr/bin/env npx tsx
/**
 * Check transaction status for all QR template test payments.
 *
 * Uses getTransactionList to find the $5 USD transactions from today,
 * then getTransactionDetail on each one.
 *
 * Usage:  npx tsx scripts/check-qr-transactions.ts
 */

import { PayWay } from '../src/index.js';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Wait ms milliseconds */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fmtDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function statusLabel(code: unknown): string {
  const labels: Record<string, string> = {
    '0': 'APPROVED',
    '2': 'PENDING',
    '3': 'DECLINED',
    '4': 'REFUNDED',
    '7': 'CANCELLED',
  };
  return labels[String(code)] ?? `UNKNOWN(${code})`;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  QR Transaction Status Check — $5.00 USD template tests    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const payway = new PayWay();

  // ── Step 1: Fetch recent transactions ─────────────────────────
  const now = new Date();
  const todayStart = fmtDateTime(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0));
  const nowStr = fmtDateTime(now);
  const yesterdayStart = fmtDateTime(new Date(now.getTime() - 86_400_000));

  console.log('  📋 Fetching recent transactions...');
  console.log(`     Date range: ${todayStart} → ${nowStr}\n`);

  const listResult = await payway.checkout.getTransactionList({
    fromDate: todayStart,
    toDate: nowStr,
    fromAmount: '5.00',
    toAmount: '5.00',
    status: 'APPROVED',
    page: '1',
    pagination: '50',
  });

  // Parse the list — response may be wrapped in { data: [...] } or be the array itself
  const raw = listResult as any;
  const transactions: any[] = Array.isArray(raw) ? raw : raw?.data ?? raw?.transactions ?? raw?.list ?? [];

  // Check if nested under status
  if (transactions.length === 0 && raw?.status?.code === '0') {
    console.log('  ℹ️  List API returned success but no transaction array. Trying detail lookup...\n');
  }

  console.log(`  Found ${transactions.length} transaction(s) matching $5.00 USD today\n`);

  if (transactions.length === 0) {
    // Fallback: try fetching with wider filters
    console.log('  Trying broader search (no amount filter)...');
    const broadResult = await payway.checkout.getTransactionList({
      fromDate: todayStart,
      toDate: nowStr,
      page: '1',
      pagination: '100',
    });

    const broadRaw = broadResult as any;
    const broadTxns: any[] = Array.isArray(broadRaw) ? broadRaw : broadRaw?.data ?? broadRaw?.transactions ?? broadRaw?.list ?? [];

    // Filter for $5.00 — check multiple possible field names
    const filtered = broadTxns.filter((t: any) => {
      const amt = Number(t.amount ?? t.tran_amount ?? t.total_amount ?? t.payment_amount ?? t.amt);
      return amt === 5 || amt === 5.0 || amt === 5.00;
    });

    console.log(`  Found ${filtered.length} $5 transactions from ${broadTxns.length} total\n`);

    // Debug: show first transaction's keys to understand structure
    if (broadTxns.length > 0) {
      console.log(`  ℹ️  Sample keys: ${Object.keys(broadTxns[0]).join(', ')}\n`);
    }
    transactions.push(...filtered);
  }

  if (transactions.length === 0) {
    console.log('  ⚠️  No $5.00 transactions found. Listing all recent transactions:\n');
    const allResult = await payway.checkout.getTransactionList({
      fromDate: todayStart,
      toDate: nowStr,
      page: '1',
      pagination: '20',
    });

    const allRaw = allResult as any;
    const allTxns: any[] = Array.isArray(allRaw) ? allRaw : allRaw?.data ?? allRaw?.transactions ?? allRaw?.list ?? [];

    // Print whatever structure we got
    console.log('  Raw response structure:', JSON.stringify(allResult).slice(0, 500), '\n');

    if (allTxns.length > 0) {
      console.log('  Recent transactions:');
      for (const t of allTxns) {
        const txId = t.tran_id ?? t.transactionId ?? t.id ?? '?';
        const amt = t.amount ?? t.tran_amount ?? '?';
        const status = t.status ?? t.status_code ?? '?';
        console.log(`    ${txId}  $${amt}  status=${statusLabel(status)}`);
      }
    }

    process.exit(0);
  }

  // ── Step 2: Get detail for each transaction ───────────────────
  console.log('─── Transaction Details ──────────────────────────────────────\n');

  // ── Query detail for each transaction ────────────────────────
  // Rate limit: 10 requests/minute for transaction-detail
  console.log('  ⏳ Querying details (rate limit: 10/min, ~7s between calls)...\n');
  const results: Array<{
    tranId: string;
    amount: unknown;
    currency: unknown;
    status: string;
    statusMessage: string;
    duration: number;
    error?: string;
  }> = [];

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const txId = tx.transaction_id ?? tx.tran_id ?? tx.transactionId ?? tx.id;
    if (!txId) {
      console.log(`  ⚠️  Skipping transaction with no ID:`, JSON.stringify(tx).slice(0, 100));
      continue;
    }

    process.stdout.write(`  ${String(txId).padEnd(25)} … `);

    const start = Date.now();
    try {
      const detail = await payway.checkout.getTransactionDetail(txId);
      const duration = Date.now() - start;

      const d = detail as any;
      const inner = d?.data ?? d;  // TransactionDetailResponse nests under .data
      const status = inner?.payment_status_code ?? inner?.payment_status ?? d?.status?.code ?? '?';
      const statusStr = inner?.payment_status ?? statusLabel(status);
      const statusMsg = d?.status?.message ?? '';

      console.log(`${statusStr.padEnd(12)} ${inner?.payment_amount ?? inner?.total_amount ?? '?'} ${inner?.payment_currency ?? 'USD'}  (${duration}ms)`);

      if (inner?.apv) {
        console.log(`  ${''.padEnd(25)}   └─ APV: ${inner.apv}  Type: ${inner.payment_type ?? '?'}  Payer: ${(inner.first_name ?? '')} ${(inner.last_name ?? '').trim()}`);
      } else if (statusMsg) {
        console.log(`  ${''.padEnd(25)}   └─ ${statusMsg}`);
      }

      results.push({
        tranId: txId,
        amount: inner?.payment_amount ?? inner?.total_amount ?? tx.payment_amount,
        currency: inner?.payment_currency ?? 'USD',
        status: statusStr,
        statusMessage: statusMsg,
        duration,
      });
    } catch (err: any) {
      const duration = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`✗ ERROR  (${duration}ms)`);
      console.log(`  ${''.padEnd(25)}   └─ ${msg}`);

      results.push({
        tranId: txId,
        amount: tx.amount,
        currency: 'USD',
        status: 'ERROR',
        statusMessage: msg,
        duration,
        error: msg,
      });
    }

    // Respect 10-req/min rate limit: wait ~7s between calls (skip after last)
    if (i < transactions.length - 1) {
      await sleep(7000);
    }
  }

  // ── Summary ──────────────────────────────────────────────────
  const approved = results.filter((r) => r.status === 'APPROVED' || r.status === '0' || r.status === 0).length;
  const pending = results.filter((r) => r.status === 'PENDING' || r.status === '2' || r.status === 2).length;
  const other = results.filter((r) => !['APPROVED', 'PENDING'].includes(r.status)).length;

  console.log('\n─── Summary ─────────────────────────────────────');
  console.log(`  Total:     ${results.length}`);
  console.log(`  ✅ Approved: ${approved}`);
  console.log(`  ⏳ Pending:  ${pending}`);
  if (other > 0) console.log(`  ❓ Other:    ${other}`);
  console.log(`  Avg query:  ${Math.round(results.reduce((s, r) => s + r.duration, 0) / results.length)}ms`);

  // ── Save results to JSON ─────────────────────────────────────
  const outPath = join(__dirname, '..', 'test-logs', 'qr-images', 'transaction-results.json');
  const finalOutput = {
    checked: new Date().toISOString(),
    amount: 5,
    currency: 'USD',
    total: results.length,
    approved,
    pending,
    transactions: results.map((r) => ({
      tranId: r.tranId,
      status: r.status,
      amount: r.amount,
      currency: r.currency,
    })),
  };

  writeFileSync(outPath, JSON.stringify(finalOutput, null, 2));
  console.log(`\n  💾 Results saved to: ${outPath}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
