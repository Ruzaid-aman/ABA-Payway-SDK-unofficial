#!/usr/bin/env npx tsx
/**
 * checkout-link-poll.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates an online transaction via the Create Transaction API
 * (checkout.purchase), extracts the hosted checkout URL, opens it in the
 * default browser, then polls the transaction status.
 *
 * Usage:
 *   npx tsx scripts/checkout-link-poll.ts [amount] [currency]
 *
 * Defaults: amount = 12.12 USD, lifetime = 600s (10 min), poll window = 10 min.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { resolve } from 'node:path';
import { PayWay } from '../src/client.js';
import { PollingAbortedError } from '../src/errors.js';

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

const AMOUNT = Number.parseFloat(process.argv[2] ?? '12.12');
const CURRENCY = (process.argv[3] ?? 'USD').toUpperCase() as 'USD' | 'KHR';
const LIFETIME_SECONDS = 600;
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_MS = 600_000;

const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

function makeTxId(): string {
  const ts = Date.now().toString(36).slice(-6);
  const rand = Math.random().toString(36).slice(2, 5);
  return `PAY${ts}${rand}`.slice(0, 20);
}

function openInBrowser(url: string): void {
  try {
    if (process.platform === 'win32') {
      spawnSync('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
    } else if (process.platform === 'darwin') {
      spawnSync('open', [url], { detached: true, stdio: 'ignore' });
    } else {
      spawnSync('xdg-open', [url], { detached: true, stdio: 'ignore' });
    }
  } catch {
    console.log(`  ${c.yellow('⚠')} Could not auto-open browser — copy/paste the URL above.`);
  }
}

async function main(): Promise<void> {
  if (!MERCHANT_ID || !API_KEY) {
    console.error(`${c.red('ERROR:')} PAYWAY_MERCHANT_ID and PAYWAY_API_KEY are required.`);
    process.exit(1);
  }

  const txId = makeTxId();
  const outputDir = path.join(process.cwd(), 'test-logs', 'checkout-link');
  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`\n${c.bold('=== ABA PayWay — Create Transaction → Checkout Link ===')}\n`);
  console.log(`  ${c.dim('Transaction ID:')} ${txId}`);
  console.log(`  ${c.dim('Amount:')}         ${CURRENCY} ${AMOUNT.toFixed(CURRENCY === 'USD' ? 2 : 0)}`);
  console.log(`  ${c.dim('Lifetime:')}       ${LIFETIME_SECONDS}s (${LIFETIME_SECONDS / 60} min)`);
  console.log(`  ${c.dim('Poll window:')}    ${MAX_POLL_MS / 1000}s @ ${(POLL_INTERVAL_MS / 1000).toFixed(0)}s interval\n`);

  const payway = new PayWay({
    merchantId: MERCHANT_ID,
    apiKey: API_KEY,
    environment: 'sandbox',
    debug: false,
    rateLimitThrottling: false,
  });

  console.log(`${c.bold('STEP 1: Create transaction (checkout.purchase)')}\n`);

  const result = await payway.checkout.purchase({
    transactionId: txId,
    amount: AMOUNT,
    currency: CURRENCY,
    paymentOption: 'abapay_khqr_deeplink',
    viewType: 'hosted_view',
    paymentGate: 0,
    lifetime: LIFETIME_SECONDS,
  });

  const record = result as Record<string, unknown>;
  const checkoutUrl = record.checkout_qr_url as string | undefined;
  const deeplink = record.abapay_deeplink as string | undefined;
  const qrString = (record.qrString as string | undefined) ?? (record.qr_string as string | undefined);

  if (!checkoutUrl) {
    console.error(`  ${c.red('✗')} No checkout_qr_url in response:`);
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  fs.writeFileSync(path.join(outputDir, `${txId}-response.json`), JSON.stringify(result, null, 2));
  console.log(`  ${c.green('✓')} Transaction created\n`);
  console.log(`  ${c.cyan('Checkout URL:')}`);
  console.log(`  ${c.bold(checkoutUrl)}\n`);
  if (deeplink) console.log(`  ${c.dim('ABA deeplink also returned (saved to response json)')}`);
  if (qrString) console.log(`  ${c.dim(`KHQR payload (${qrString.length} chars) also returned`)}`);

  fs.writeFileSync(path.join(outputDir, `${txId}-checkout-url.txt`), checkoutUrl);

  console.log(`${c.bold('STEP 2: Opening checkout page in browser')}\n`);
  openInBrowser(checkoutUrl);

  console.log(`${c.bold('STEP 3: Poll transaction status (up to 10 minutes)')}\n`);
  console.log(`  Complete the payment in the opened checkout page.\n`);

  const startedAt = Date.now();

  try {
    for await (const result of payway.checkout.pollTransactionStatus(txId, {
      intervalMs: POLL_INTERVAL_MS,
      maxDurationMs: MAX_POLL_MS,
    })) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0).padStart(4, ' ');
      const color =
        result.paymentStatus === 'APPROVED'
          ? c.green
          : result.paymentStatus === 'PENDING'
            ? c.yellow
            : result.paymentStatus.startsWith('ERROR')
              ? c.red
              : (s: string) => s;
      console.log(
        `  [${elapsed}s] poll #${String(result.attempt).padStart(3)}: ${color(result.paymentStatus.padEnd(10))}`,
      );
    }
  } catch (err) {
    if (err instanceof PollingAbortedError && err.reason === 'max_duration_exceeded') {
      console.log(`\n  ${c.yellow('⏱')} Polling window ended after 600s (transaction still PENDING or expired).`);
    } else {
      throw err;
    }
  }

  console.log(`\n${c.bold('=== Summary ===')}`);
  console.log(`  Transaction ID: ${txId}`);
  console.log(`  Amount:         ${CURRENCY} ${AMOUNT.toFixed(CURRENCY === 'USD' ? 2 : 0)}`);
  console.log(`  Checkout URL:   ${checkoutUrl}`);
  console.log(`  Elapsed:        ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
  console.log(`  Artifacts dir:  test-logs/checkout-link/${txId}-*\n`);
}

main().catch((error) => {
  console.error(`\n\x1b[31mFATAL:\x1b[0m ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
