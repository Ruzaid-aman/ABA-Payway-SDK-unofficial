#!/usr/bin/env npx tsx
/**
 * online-qr-poll.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates ONE online KHQR payment QR and polls its transaction status.
 *
 * Usage:
 *   npx tsx scripts/online-qr-poll.ts [amount] [currency] [lifetimeSeconds]
 *
 * Defaults: amount = 31.11 USD, lifetime = 600s (10 min), poll window = lifetime.
 * Saves the QR PNG under test-logs/qr-payment/ and opens it for scanning.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
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
const CALLBACK_URL =
  process.env.PAYWAY_CALLBACK_URL ?? 'https://webhook.site/51bc2004-9fcf-428b-97d4-6ed54e0ba40e';

const AMOUNT = Number.parseFloat(process.argv[2] ?? '31.11');
const CURRENCY = (process.argv[3] ?? 'USD').toUpperCase() as 'USD' | 'KHR';
const QR_LIFETIME_SECONDS = Number.parseInt(process.argv[4] ?? '600', 10);
const QR_TEMPLATE = process.argv[5] ?? 'template2_color';
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_MS = QR_LIFETIME_SECONDS * 1_000;

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

async function main(): Promise<void> {
  if (!MERCHANT_ID || !API_KEY) {
    console.error(`${c.red('ERROR:')} PAYWAY_MERCHANT_ID and PAYWAY_API_KEY are required.`);
    process.exit(1);
  }

  const txId = makeTxId();
  const outputDir = path.join(process.cwd(), 'test-logs', 'qr-payment');
  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`\n${c.bold('=== ABA PayWay — Online QR + Poll ===')}\n`);
  console.log(`  ${c.dim('Transaction ID:')} ${txId}`);
  console.log(`  ${c.dim('Amount:')}         ${CURRENCY} ${AMOUNT.toFixed(CURRENCY === 'USD' ? 2 : 0)}`);
  console.log(`  ${c.dim('QR Lifetime:')}    ${QR_LIFETIME_SECONDS}s (${QR_LIFETIME_SECONDS / 60} min)`);
  console.log(`  ${c.dim('QR Template:')}    ${QR_TEMPLATE}`);
  console.log(`  ${c.dim('Poll window:')}    ${MAX_POLL_MS / 1000}s @ ${(POLL_INTERVAL_MS / 1000).toFixed(0)}s interval\n`);

  const payway = new PayWay({
    merchantId: MERCHANT_ID,
    apiKey: API_KEY,
    environment: 'sandbox',
    debug: false,
    rateLimitThrottling: false,
  });

  console.log(`${c.bold('STEP 1: Generate online QR')}\n`);

  let qrImage: string | undefined;
  try {
    const qr = await payway.qr.generateQr({
      transactionId: txId,
      amount: AMOUNT,
      currency: CURRENCY,
      paymentOption: 'abapay_khqr',
      callbackUrl: CALLBACK_URL,
      qrImageTemplate: QR_TEMPLATE,
      lifetime: QR_LIFETIME_SECONDS,
    });

    const record = qr as Record<string, unknown>;
    qrImage = (record.qrImage as string | undefined) ?? (record.qr_image as string | undefined);
    const qrString = (record.qrString as string | undefined) ?? (record.qr_string as string | undefined);
    const deeplink = record.abapay_deeplink as string | undefined;

    if (qrString) {
      fs.writeFileSync(path.join(outputDir, `${txId}-qr-string.txt`), qrString);
      console.log(`  ${c.dim(`KHQR payload (${qrString.length} chars) saved`)}`);
    }
    if (deeplink) {
      fs.writeFileSync(path.join(outputDir, `${txId}-deeplink.txt`), deeplink);
      console.log(`  ${c.dim('ABA deeplink saved')}`);
    }
    console.log(`  ${c.green('✓')} QR generated for transaction ${c.bold(txId)}\n`);
  } catch (err) {
    console.error(`  ${c.red('✗')} QR generation failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  if (qrImage) {
    const match = qrImage.match(/^data:image\/(\w+);base64,(.+)$/);
    if (match) {
      const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
      const imgPath = path.join(outputDir, `${txId}-qr.${ext}`);
      fs.writeFileSync(imgPath, Buffer.from(match[2], 'base64'));
      console.log(`  ${c.green('✓')} QR image saved: ${c.bold(imgPath)}`);
      if (process.platform === 'win32') {
        spawnSync('cmd', ['/c', 'start', '', imgPath], { detached: true, stdio: 'ignore' });
      }
      console.log('');
    }
  }

  console.log(`${c.bold('STEP 2: Poll transaction status (up to ' + QR_LIFETIME_SECONDS / 60 + ' minutes)')}\n`);
  console.log(`  Scan the QR with ABA Mobile or any KHQR-compatible app to pay.\n`);

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
      console.log(`\n  ${c.yellow('⏱')} Polling window ended after ${QR_LIFETIME_SECONDS}s (transaction still PENDING or expired).`);
    } else {
      throw err;
    }
  }

  console.log(`\n${c.bold('=== Summary ===')}`);
  console.log(`  Transaction ID: ${txId}`);
  console.log(`  Amount:         ${CURRENCY} ${AMOUNT.toFixed(CURRENCY === 'USD' ? 2 : 0)}`);
  console.log(`  Elapsed:        ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
  console.log(`  Artifacts dir:  test-logs/qr-payment/${txId}-*\n`);
}

main().catch((error) => {
  console.error(`\n\x1b[31mFATAL:\x1b[0m ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
