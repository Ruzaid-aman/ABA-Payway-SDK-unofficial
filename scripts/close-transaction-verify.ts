#!/usr/bin/env npx tsx
/**
 * close-transaction-verify.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable closer/verifier for ABA PayWay transactions. Usable as a CLI tool
 * or imported as helpers from other scripts.
 *
 *   1. (unless --status-only) closeTransaction — void before payment;
 *      an already-closed/absent transaction is reported, not fatal.
 *   2. Post-close status: immediately, then again after a delay
 *      (sandbox quirk: closed-but-unpaid keeps reporting PENDING).
 *
 * CLI:
 *   npx tsx scripts/close-transaction-verify.ts <transactionId> [options]
 *     --status-only    skip the close call, just report status twice
 *     --delay <ms>     second-read delay (default 3000)
 *     --json           machine-readable summary line
 *
 * Exit codes: 0 close+verify ran · 2 API failure on close of a live txn.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PayWay } from '../src/client.js';

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

const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
};

export interface CloseOutcome {
  attempted: boolean;
  accepted: boolean;
  code?: string | number;
  message?: string;
  error?: string;
  alreadyClosedHint?: boolean;
  raw?: unknown;
}

/** Close (void) a transaction before payment. Non-fatal on repeat/unknown IDs. */
export async function closeOrReport(payway: PayWay, txId: string): Promise<CloseOutcome> {
  try {
    const result = await payway.checkout.closeTransaction(txId);
    const st = (result as Record<string, unknown>).status as Record<string, unknown> | undefined;
    return {
      attempted: true,
      accepted: String(st?.code) === '00',
      code: st?.code as string | undefined,
      message: typeof st?.message === 'string' ? st.message : undefined,
      raw: result,
    };
  } catch (err) {
    const e = err as { statusCode?: number; paywayCode?: string; message?: string; rawBody?: unknown };
    // Sandbox observations: nonexistent -> HTTP 403 internal code 5;
    // some profiles answer PTL36 "Transaction not found or is invalid".
    const looksAlreadyHandled =
      e.paywayCode === '5' || e.paywayCode === 'PTL36' || /not found|already/i.test(e.message ?? '');
    return {
      attempted: true,
      accepted: false,
      code: e.paywayCode,
      message: e.message?.slice(0, 120),
      error: `http=${e.statusCode}`,
      alreadyClosedHint: looksAlreadyHandled,
      raw: e.rawBody,
    };
  }
}

export async function statusOf(payway: PayWay, txId: string): Promise<string> {
  try {
    const result = await payway.checkout.checkTransaction(txId);
    const data = result.data as Record<string, undefined> | undefined;
    return String(data?.payment_status ?? 'UNKNOWN');
  } catch (err) {
    const e = err as { paywayCode?: string };
    return e.paywayCode === '6' ? 'NOT_CREATED_YET' : `ERROR (${err instanceof Error ? err.message.slice(0, 50) : '?'})`;
  }
}

export interface VerifySummary {
  txId: string;
  close: CloseOutcome;
  immediateStatus: string;
  delayedStatus: string;
}

/** Close, then read status twice so callers see the gateway's settled view. */
export async function closeAndVerify(
  payway: PayWay,
  txId: string,
  opts: { statusOnly?: boolean; delayMs?: number } = {},
): Promise<VerifySummary> {
  const close: CloseOutcome = opts.statusOnly
    ? { attempted: false, accepted: false }
    : await closeOrReport(payway, txId);

  const immediateStatus = await statusOf(payway, txId);
  const delayMs = opts.delayMs ?? 3_000;
  await new Promise((r) => setTimeout(r, delayMs));
  const delayedStatus = await statusOf(payway, txId);

  return { txId, close, immediateStatus, delayedStatus };
}

function printHuman(summary: VerifySummary): void {
  console.log(`\n${c.bold(`=== close + verify ${summary.txId} ===`)}\n`);
  if (!summary.close.attempted) {
    console.log(`  close:      ${c.dim('skipped (--status-only)')}`);
  } else if (summary.close.accepted) {
    console.log(`  close:      ${c.green('✓')} code=${summary.close.code} ${JSON.stringify(summary.close.message)}`);
  } else {
    console.log(
      `  close:      ${c.yellow('not accepted')} code=${summary.close.code ?? '-'} ${summary.close.error ?? ''} ${c.dim(summary.close.message ?? '')}`,
    );
    if (summary.close.alreadyClosedHint) {
      console.log(`              ${c.dim('(likely already closed or unknown ID — verifying status anyway)')}`);
    }
  }
  console.log(`  status now: ${summary.immediateStatus}`);
  console.log(`  status +3s: ${summary.delayedStatus}`);

  console.log(`\n  ${c.dim('Interpretation (sandbox-verified 2026-08-25):')}`);
  console.log(`  ${c.dim('• There is NO "CLOSED" status in check-transaction or transaction-detail.')}`);
  console.log(`  ${c.dim('• code 00 + PENDING  -> closed-unpaid OR still open — indistinguishable remotely.')}`);
  console.log(`  ${c.dim('• code 00 + APPROVED -> payment landed AFTER close: sandbox does NOT enforce closure.')}`);
  console.log(`  ${c.dim('    (two live cases: PAY8skk3vbbi MC *6777, PAY8t4x1ozl9 VISA *0206 — both APPROVED)')}`);
  console.log(`  ${c.dim('=> Keep a local "closed" flag; treat webhook/check as payment truth only,')}`);
  console.log(`  ${c.dim('   and be ready to refund anything approved after a close until ABA clarifies production.')}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const txId = args.find((a) => !a.startsWith('--'));
  if (!txId) {
    console.error('Usage: npx tsx scripts/close-transaction-verify.ts <transactionId> [--status-only] [--delay ms] [--json]');
    process.exit(1);
  }

  const { PayWay } = await import('../src/client.js');
  const payway = new PayWay({
    merchantId: process.env.PAYWAY_MERCHANT_ID,
    apiKey: process.env.PAYWAY_API_KEY,
    environment: 'sandbox',
    rateLimitThrottling: false,
  });

  const delayIdx = args.indexOf('--delay');
  const summary = await closeAndVerify(payway, txId, {
    statusOnly: args.includes('--status-only'),
    delayMs: delayIdx !== -1 ? Number.parseInt(args[delayIdx + 1] ?? '3000', 10) : 3_000,
  });

  if (args.includes('--raw')) {
    console.log(`\n${c.bold('Raw PayWay close response:')}`);
    console.log(JSON.stringify(summary.close.raw ?? null, null, 2));
    console.log(`${c.bold('Raw check response (immediate):')}`);
    console.log(`  ${c.dim('(see --json for full summary incl. both status reads)')}`);
  }

  if (args.includes('--json')) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printHuman(summary);
  }

  process.exitCode = summary.close.attempted && !summary.close.accepted && !summary.close.alreadyClosedHint ? 2 : 0;
}

const invokedDirectly =
  process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`\n\x1b[31mFATAL:\x1b[0m ${error instanceof Error ? error.stack : String(error)}`);
    process.exit(1);
  });
}
