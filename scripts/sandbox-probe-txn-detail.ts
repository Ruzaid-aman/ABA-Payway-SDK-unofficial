#!/usr/bin/env npx tsx
/**
 * sandbox-probe-txn-detail.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Observes the get-transaction-detail tool chain against the live sandbox:
 *
 *   Phase A  baseline latency + response richness on known APPROVED txns
 *   Phase B  unknown-ID error shape (detail vs check)
 *   Phase C  fresh-creation visibility delay
 *   Phase D  deliberate burst past the documented 10/min cap (raw gateway
 *            behavior: status codes, error body, rate-limit headers)
 *
 * Detail calls are paced (~6.5s apart) during A-C to respect the 10/min
 * budget; Phase D runs last because it deliberately burns the window.
 *
 * Usage:
 *   npx tsx scripts/sandbox-probe-txn-detail.ts [knownTxId] [knownTxId2]
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { writeFileSync } from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PayWay } from '../src/client.js';

function loadDotEnv(): void {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.replace(/\r/g, '').trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (!(key in process.env)) process.env[key] = trimmed.slice(eqIdx + 1).trim();
  }
}

loadDotEnv();

const MERCHANT_ID = process.env.PAYWAY_MERCHANT_ID ?? '';
const API_KEY = process.env.PAYWAY_API_KEY ?? '';
const CALLBACK_URL =
  process.env.PAYWAY_CALLBACK_URL ?? 'https://webhook.site/51bc2004-9fcf-428b-97d4-6ed54e0ba40e';

const TX_A = process.argv[2] ?? 'PAY8ppgw32bc';
const TX_B = process.argv[3] ?? 'PAY8pwwkccro';
const UNKNOWN_ID = `UNK${Date.now().toString(36).slice(-6)}XX`.slice(0, 20);

const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

interface CallRecord {
  phase: string;
  op: 'detail' | 'check' | 'qr';
  target: string;
  ok: boolean;
  httpStatus?: number;
  paywayCode?: string;
  message?: string;
  latencyMs: number;
  rateLimitHeaders?: unknown;
  dataFields?: string[];
}

const records: CallRecord[] = [];
let hookLastStatus: number | undefined;
let hookLastRl: unknown;

function makeClient(opts: { throttling: boolean; maxRetries: number }): PayWay {
  return new PayWay({
    merchantId: MERCHANT_ID,
    apiKey: API_KEY,
    environment: 'sandbox',
    debug: false,
    rateLimitThrottling: opts.throttling,
    maxRetries: opts.maxRetries,
    onResponse: (_ep, statusCode, _body, rl) => {
      hookLastStatus = statusCode;
      hookLastRl = rl;
    },
  });
}

async function timed(
  phase: string,
  op: CallRecord['op'],
  target: string,
  fn: () => Promise<unknown>,
): Promise<CallRecord> {
  const startedAt = Date.now();
  const rec: CallRecord = { phase, op, target, ok: false, latencyMs: 0 };
  try {
    const result = await fn();
    rec.ok = true;
    rec.httpStatus = hookLastStatus;
    const data = (result as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    if (data) rec.dataFields = Object.keys(data);
    return rec;
  } catch (err) {
    const e = err as { statusCode?: number; paywayCode?: string; message?: string };
    rec.httpStatus = e.statusCode ?? hookLastStatus;
    rec.paywayCode = e.paywayCode;
    rec.message = e.message?.slice(0, 90);
    return rec;
  } finally {
    rec.latencyMs = Date.now() - startedAt;
    rec.rateLimitHeaders = hookLastRl;
    hookLastStatus = undefined;
    hookLastRl = undefined;
    records.push(rec);
    printRecord(rec);
  }
}

function printRecord(rec: CallRecord): void {
  const ms = `${String(rec.latencyMs).padStart(5)}ms`;
  const flag = rec.ok ? c.green('OK ') : c.red('ERR');
  const code = rec.paywayCode ? ` code=${rec.paywayCode}` : '';
  const extra = rec.message ? ` ${c.dim(rec.message)}` : '';
  console.log(`  [${rec.phase}] ${flag} ${ms} ${rec.op.padEnd(6)} ${rec.target}${code}${extra}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  if (!MERCHANT_ID || !API_KEY) {
    console.error('Missing PAYWAY_MERCHANT_ID / PAYWAY_API_KEY');
    process.exit(1);
  }

  console.log(`\n${c.bold('=== get-transaction-detail probe ===')}`);
  console.log(`  known A: ${TX_A}`);
  console.log(`  known B: ${TX_B}`);
  console.log(`  unknown: ${UNKNOWN_ID}\n`);

  const client = makeClient({ throttling: false, maxRetries: 0 });

  // ── Phase A: baseline latency + richness ────────────────────────────────
  console.log(`${c.bold('PHASE A')} baseline latency (paced)\n`);
  let firstDetailBody: unknown;
  for (let i = 0; i < 3; i++) {
    await timed('A', 'check', TX_A, () => client.checkout.checkTransaction(TX_A));
    await timed('A', 'detail', TX_A, async () => {
      firstDetailBody = await client.checkout.getTransactionDetail(TX_A);
      return firstDetailBody;
    });
    if (i < 2) await sleep(6500);
  }
  await timed('A', 'detail', TX_B, () => client.checkout.getTransactionDetail(TX_B));

  if (firstDetailBody) {
    console.log(`\n  ${c.cyan('detail response shape:')}`);
    console.log(`  ${JSON.stringify(firstDetailBody, null, 2).split('\n').join('\n  ').slice(0, 1600)}\n`);
  }
  await sleep(6500);

  // ── Phase B: unknown-ID behavior ────────────────────────────────────────
  console.log(`\n${c.bold('PHASE B')} unknown transaction ID\n`);
  await timed('B', 'check', UNKNOWN_ID, () => client.checkout.checkTransaction(UNKNOWN_ID));
  await timed('B', 'detail', UNKNOWN_ID, () => client.checkout.getTransactionDetail(UNKNOWN_ID));
  await sleep(6500);

  // ── Phase C: fresh-creation visibility ──────────────────────────────────
  console.log(`\n${c.bold('PHASE C')} fresh QR -> visibility of check vs detail\n`);
  const freshId = `PRB${Date.now().toString(36).slice(-6)}${Math.random().toString(36).slice(2, 4)}`
    .slice(0, 20);
  const qrStart = Date.now();
  await client.qr.generateQr({
    transactionId: freshId,
    amount: 0.31,
    currency: 'USD',
    paymentOption: 'abapay_khqr',
    callbackUrl: CALLBACK_URL,
  });
  console.log(`  ${c.dim(`created ${freshId} (${Date.now() - qrStart}ms)`)}\n`);

  let checkVisibleAfter: number | undefined;
  let detailVisibleAfter: number | undefined;
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline && (!checkVisibleAfter || !detailVisibleAfter)) {
    if (!checkVisibleAfter) {
      const r = await timed('C', 'check', freshId, () => client.checkout.checkTransaction(freshId));
      if (r.ok) checkVisibleAfter = Date.now() - qrStart;
    } else if (!detailVisibleAfter) {
      const r = await timed('C', 'detail', freshId, () =>
        client.checkout.getTransactionDetail(freshId),
      );
      if (r.ok) detailVisibleAfter = Date.now() - qrStart;
    }
    await sleep(!checkVisibleAfter || !detailVisibleAfter ? 4000 : 0);
  }
  console.log(
    `\n  ${c.cyan('visibility:')} check=${checkVisibleAfter ?? 'NOT VISIBLE'}ms detail=${
      detailVisibleAfter ?? 'NOT VISIBLE'
    }ms`,
  );

  // ── Phase D: burst past the documented 10/min cap ───────────────────────
  console.log(`\n${c.bold('PHASE D')} burst x12 detail (no throttle, no retries) — expect cap\n`);
  for (let i = 0; i < 12; i++) {
    await timed('D', 'detail', `${TX_A}#${i + 1}`, () => client.checkout.getTransactionDetail(TX_A));
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${c.bold('=== Per-op latency summary ===')}\n`);
  for (const op of ['check', 'detail'] as const) {
    const latencies = records.filter((r) => r.op === op && r.phase !== 'D' && r.ok);
    if (!latencies.length) continue;
    const vals = latencies.map((r) => r.latencyMs).sort((a, b) => a - b);
    const p50 = vals[Math.floor(vals.length / 2)];
    console.log(
      `  ${op.padEnd(7)} n=${String(vals.length).padEnd(3)} min=${vals[0]}ms p50=${p50}ms max=${
        vals[vals.length - 1]
      }ms`,
    );
  }

  const d = records.filter((r) => r.phase === 'D');
  const burstLine = d.map((r) => (r.ok ? '.' : 'X')).join('');
  const firstErr = d.find((r) => !r.ok);
  console.log(`\n  burst: ${burstLine}`);
  console.log(
    `  first failure at call #${d.indexOf(firstErr!) + 1}: http=${firstErr?.httpStatus} code=${
      firstErr?.paywayCode
    } msg=${firstErr?.message}`,
  );
  console.log(`  rate-limit headers seen: ${JSON.stringify(firstErr?.rateLimitHeaders ?? null)}`);

  writeFileSync(
    resolve(process.cwd(), 'test-output', 'txn-detail-probe.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), txA: TX_A, txB: TX_B, records }, null, 2),
  );
  console.log(`\n  ${c.dim('Evidence: test-output/txn-detail-probe.json')}\n`);
}

main().catch((error) => {
  console.error(`\n\x1b[31mFATAL:\x1b[0m ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
