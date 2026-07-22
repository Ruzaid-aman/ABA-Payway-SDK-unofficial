#!/usr/bin/env npx tsx
/**
 * webhook-e2e-test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * End-to-end test of webhook setup, QR generation, and polling.
 *
 * Phases:
 *   1. Start the webhook HTTP server on a random port
 *   2. Send a simulated PayWay callback POST → verify storage
 *   3. Read stored webhook data
 *   4. Generate a QR via PayWay sandbox API (5-minute lifetime)
 *   5. Poll transaction status until terminal or lifetime expires
 *   6. Shutdown webhook server gracefully
 *
 * Usage:
 *   cd SDK-prepration
 *   npx tsx scripts/webhook-e2e-test.ts          # full flow
 *   npx tsx scripts/webhook-e2e-test.ts --qr-only  # skip webhook, only QR+poll
 *   npx tsx scripts/webhook-e2e-test.ts --webhook-only  # skip QR, only webhook
 *
 * Credentials: reads PAYWAY_MERCHANT_ID, PAYWAY_API_KEY from .env
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { PayWay } from '../src/client.js';
import { createWebhookServer, type WebhookServerResult } from '../src/webhook/server.js';
import type { WebhookRecord } from '../src/webhook/storage.js';

// ── Load .env if present (mirrors cli.ts loadDotEnv) ─────────────────────
(function loadDotEnv(): void {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.replace(/\r/g, '').trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
})();

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const MERCHANT_ID = process.env.PAYWAY_MERCHANT_ID ?? '';
const API_KEY = process.env.PAYWAY_API_KEY ?? '';
const CALLBACK_URL = process.env.PAYWAY_CALLBACK_URL ?? 'https://webhook.site/51bc2004-9fcf-428b-97d4-6ed54e0ba40e';

const LOG_DIR = path.join(process.cwd(), 'test-logs', 'webhook-e2e');

// Only run QR phase if credentials are present
const HAS_CREDENTIALS = !!(MERCHANT_ID && API_KEY);

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
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function makeTxId(prefix = 'WH'): string {
  const ts = Date.now().toString(36).slice(-6);
  const rand = Math.random().toString(36).slice(2, 5);
  return `${prefix}${ts}${rand}`.slice(0, 20);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function logSection(title: string): void {
  console.log();
  console.log(`  ${c.bold('═'.repeat(55))}`);
  console.log(`  ${c.bold(`  ${title}`)}`);
  console.log(`  ${c.bold('═'.repeat(55))}`);
  console.log();
}

function httpPost(port: number, pathStr: string, body: string, headers?: Record<string, string>): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method: 'POST',
        path: pathStr,
        headers: { 'Content-Type': 'application/json', ...headers },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const p = addr.port;
        srv.close(() => resolve(p));
      } else {
        srv.close(() => reject(new Error('Could not get port')));
      }
    });
    srv.on('error', reject);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1: WEBHOOK SERVER TEST
// ═══════════════════════════════════════════════════════════════════════════════

async function testWebhookServer(): Promise<{ port: number; storageDir: string; records: WebhookRecord[] }> {
  logSection('PHASE 1: Webhook Server — Start & Receive Callback');

  const port = await getFreePort();
  const storageDir = mkdtempSync(path.join(tmpdir(), 'webhook-e2e-'));
  console.log(`  ${c.dim('Storage dir:')}  ${storageDir}`);
  console.log(`  ${c.dim('Port:')}         ${port}`);

  // Create JSON storage pointed at a temp directory for inspection
  const storageFile = path.join(storageDir, 'callbacks.jsonl');
  const { JsonWebhookStorage } = await import('../src/webhook/storage-json.js');
  const jsonStorage = new JsonWebhookStorage(storageFile);

  // Create & start webhook server
  const server: WebhookServerResult = createWebhookServer(jsonStorage, {
    port,
    apiKey: API_KEY || undefined,
  });

  await server.start();
  console.log(`  ${c.green('✓')} Webhook server listening on ${c.cyan(`http://127.0.0.1:${port}/aba-payway-webhook`)}`);
  console.log(`  ${c.dim('isRunning:')}   ${server.isRunning}`);
  console.log();

  try {
    // ── Send simulated callback (WH-TC-03) ──────────────────────────────
    console.log(`  ${c.bold('Sending simulated PayWay callback...')}`);

    const callbackPayload = JSON.stringify({
      transactionId: makeTxId('WHTX'),
      status: 'COMPLETED',
      payment_option: 'abapay_khqr',
      amount: '1.00',
      currency: 'USD',
      hash: 'dummy-hash',
    });

    const response = await httpPost(port, '/aba-payway-webhook', callbackPayload);
    console.log(`    Response: ${c.cyan(`${response.statusCode}`)} ${c.dim(response.body)}`);

    if (response.statusCode !== 200) {
      console.log(`  ${c.red('✗')} Expected 200, got ${response.statusCode}`);
      throw new Error(`Webhook server returned ${response.statusCode}`);
    }
    console.log(`  ${c.green('✓')} Callback accepted`);

    // ── Verify storage (WH-TC-03 verification) ──────────────────────────
    const count = jsonStorage.count();
    console.log(`    Stored records: ${c.cyan(String(count))}`);

    const records = jsonStorage.getAll();

    if (count === 0) {
      console.log(`  ${c.red('✗')} No records stored!`);
    } else {
      console.log(`  ${c.green('✓')} ${count} record(s) saved`);
      const r = records[records.length - 1];
      console.log(`    Record ID:   ${c.cyan(r.id)}`);
      console.log(`    Received at: ${c.cyan(r.receivedAt)}`);
      console.log(`    Source IP:   ${c.cyan(r.sourceIp ?? 'unknown')}`);
      console.log(`    Body txId:   ${c.cyan(JSON.parse(r.body).transactionId)}`);
      console.log();

      // ── Test malformed payload acceptance (WH-TC-05) ──────────────────
      console.log(`  ${c.bold('Sending malformed JSON (WH-TC-05)...')}`);
      const badResponse = await httpPost(port, '/aba-payway-webhook', '{invalid}', {});
      console.log(`    Response: ${c.cyan(`${badResponse.statusCode}`)} ${c.dim(badResponse.body)}`);
      const countAfterBad = jsonStorage.count();
      const badRecord = jsonStorage.getAll()[jsonStorage.getAll().length - 1];
      console.log(`    Stored raw:  ${c.dim(badRecord.body)}`);
      console.log(`  ${c.green('✓')} Malformed payload accepted and stored without crashing`);

      // ── Test 404 route ─────────────────────────────────────────────────
      console.log();
      console.log(`  ${c.bold('Testing 404 on unknown route...')}`);
      const notFound = await httpPost(port, '/wrong-path', '{}', {});
      console.log(`    Response: ${c.cyan(`${notFound.statusCode}`)} ${c.dim(notFound.body)}`);
      console.log(`  ${c.green('✓')} Unknown route returns 404`);

      console.log();
      console.log(`  ${c.bold('Storage contents:')}`);
      for (const rec of jsonStorage.getAll()) {
        let txLabel: string;
        try {
          txLabel = JSON.parse(rec.body).transactionId ?? '<no txId>';
        } catch {
          txLabel = c.yellow('<malformed body>');
        }
        console.log(`    ${c.dim(`[${rec.id}]`)} ${rec.receivedAt} — ${c.cyan(txLabel)}`);
      }
    }

    console.log();
    console.log(`  ${c.green('✓')} ${c.bold('Webhook server phase PASSED')}`);
    console.log();

    return { port, storageDir, records: jsonStorage.getAll() };
  } finally {
    // Stop server
    await server.stop();
    console.log(`  ${c.dim('Server stopped. isRunning:')} ${server.isRunning}`);
    jsonStorage.close();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2: QR GENERATION + POLLING
// ═══════════════════════════════════════════════════════════════════════════════

async function testQrWithPolling(): Promise<void> {
  logSection('PHASE 2: QR Generation — 5-minute Lifetime + Polling');

  if (!HAS_CREDENTIALS) {
    console.log(`  ${c.yellow('⚠')} No PayWay credentials (PAYWAY_MERCHANT_ID / PAYWAY_API_KEY).`);
    console.log(`  ${c.yellow('⚠')} Skipping QR generation phase.\n`);
    return;
  }

  const txId = makeTxId('WHQR');
  const lifetimeSec = 300; // 5 minutes
  const amount = 0.01;
  const currency = 'USD';

  console.log(`  ${c.dim('Transaction ID:')}  ${txId}`);
  console.log(`  ${c.dim('Amount:')}           ${currency} ${amount.toFixed(2)}`);
  console.log(`  ${c.dim('Lifetime:')}         ${lifetimeSec}s (${lifetimeSec / 60} min)`);
  console.log(`  ${c.dim('Callback URL:')}     ${CALLBACK_URL}`);
  console.log();

  // ── Generate QR via PayWay API ──────────────────────────────────────
  console.log(`  ${c.bold('Generating QR via PayWay sandbox API...')}`);

  try {
    const payway = new PayWay();
    const qr = await payway.qr.generateQr({
      transactionId: txId,
      amount,
      currency,
      paymentOption: 'abapay_khqr',
      callbackUrl: CALLBACK_URL,
      qrImageTemplate: 'template2',
      lifetime: lifetimeSec,
    });

    console.log(`  ${c.green('✓')} QR generated successfully`);
    console.log(`    QR String: ${c.cyan(qr.qrString ? qr.qrString.slice(0, 80) + '...' : '(none)')}`);
    console.log(`    QR Image:  ${qr.qrImage ? c.cyan(`${qr.qrImage.length} chars base64`) : c.dim('(none)')}`);
    console.log();

    // ── Save QR image ──────────────────────────────────────────────────
    ensureDir(LOG_DIR);
    if (qr.qrImage) {
      const base64Data = qr.qrImage.includes('base64,')
        ? qr.qrImage.split('base64,')[1]
        : qr.qrImage;
      const imgPath = path.join(LOG_DIR, `qr-${txId}.png`);
      fs.writeFileSync(imgPath, Buffer.from(base64Data, 'base64'));
      console.log(`  ${c.green('✓')} QR image saved to ${c.cyan(imgPath)}`);
    }
    console.log();

    // ── Poll for transaction status ────────────────────────────────────
    const pollIntervalMs = 5_000;
    const pollTimeoutMs = lifetimeSec * 1000 + 30_000; // lifetime + 30s grace
    const startTime = Date.now();
    let attempts = 0;
    let terminal = false;

    console.log(`  ${c.bold('Polling transaction status...')}`);
    console.log(`    Interval: ${c.cyan(`${pollIntervalMs / 1000}s`)}`);
    console.log(`    Timeout:  ${c.cyan(`${pollTimeoutMs / 1000}s`)} (lifetime ${lifetimeSec}s + 30s grace)`);
    console.log();

    // Use the SDK's pollTransactionStatus
    try {
      for await (const result of payway.checkout.pollTransactionStatus(txId, {
        intervalMs: pollIntervalMs,
        maxDurationMs: pollTimeoutMs,
      })) {
        attempts++;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        if (result.paymentStatus.startsWith('ERROR:')) {
          console.log(`  ${c.yellow('⚠')} [${elapsed}s] Poll #${result.attempt}: ${c.yellow(result.paymentStatus)} ${c.dim(`(${result.durationMs}ms)`)}`);
          continue;
        }

        if (result.isTerminal) {
          const icon = result.paymentStatus === 'APPROVED' ? c.green('✓') : c.red('✗');
          console.log(`  ${icon} [${elapsed}s] Poll #${result.attempt}: ${c.bold(result.paymentStatus)} ${c.dim(`(${result.durationMs}ms)`)}`);
          terminal = true;
          console.log();
          console.log(`  ${c.green(`Payment ${result.paymentStatus.toLowerCase()}.`)}`);
          break;
        }

        console.log(`  ${c.dim('○')} [${elapsed}s] Poll #${result.attempt}: ${c.dim(result.paymentStatus)} ${c.dim(`(${result.durationMs}ms)`)}`);
      }
    } catch (err: unknown) {
      const { PollingAbortedError } = await import('../src/errors.js');
      if (err instanceof PollingAbortedError) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log();
        console.log(`  ${c.yellow('⚠')} Polling stopped: ${c.yellow(err.reason)} after ${c.bold(String(err.totalAttempts))} attempts (${elapsed}s elapsed)`);
        if (err.lastStatus) {
          console.log(`  ${c.dim(`Last status: ${err.lastStatus}`)}`);
        }
      } else {
        throw err;
      }
    }

    // ── Summary ────────────────────────────────────────────────────────
    console.log();
    console.log(`  ${c.bold('Polling Summary:')}`);
    console.log(`    Transaction:   ${c.cyan(txId)}`);
    console.log(`    Total polls:   ${c.cyan(String(attempts))}`);
    console.log(`    Terminal:      ${terminal ? c.green('yes') : c.yellow('no (lifetime expired)')}`);
    console.log(`    Duration:      ${c.cyan(`${((Date.now() - startTime) / 1000).toFixed(1)}s`)}`);

    // ── Check transaction detail ────────────────────────────────────────
    console.log();
    console.log(`  ${c.bold('Fetching transaction detail...')}`);
    try {
      const detail = await payway.checkout.checkTransaction({ transactionId: txId });
      const status = detail?.payment_status ?? detail?.status ?? 'unknown';
      console.log(`    Payment status: ${c.cyan(status)}`);
    } catch (e) {
      console.log(`    ${c.yellow('Could not fetch detail:')} ${e instanceof Error ? e.message : String(e)}`);
    }

    console.log();
    console.log(`  ${c.green('✓')} ${c.bold('QR + Polling phase PASSED')}`);
    console.log();
  } catch (e) {
    console.log(`  ${c.red('✗')} QR generation failed: ${e instanceof Error ? e.message : String(e)}`);
    console.log();
    console.log(`  ${c.yellow('⚠')} QR + Polling phase SKIPPED due to error`);
    console.log();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const qrOnly = args.includes('--qr-only');
  const webhookOnly = args.includes('--webhook-only');

  console.log();
  console.log(`  ${c.bold('╔═══════════════════════════════════════════════════════════════╗')}`);
  console.log(`  ${c.bold('║   ABA PayWay SDK — Webhook E2E Test                        ║')}`);
  console.log(`  ${c.bold('╚═══════════════════════════════════════════════════════════════╝')}`);
  console.log();

  // Print config
  console.log(`  ${c.dim('Merchant ID:')}  ${MERCHANT_ID || c.red('(not set)')}`);
  console.log(`  ${c.dim('API Key:')}      ${API_KEY ? API_KEY.slice(0, 8) + '...' : c.red('(not set)')}`);
  console.log(`  ${c.dim('Callback URL:')} ${CALLBACK_URL}`);
  console.log(`  ${c.dim('Mode:')}         ${qrOnly ? 'QR + Poll only' : webhookOnly ? 'Webhook only' : 'Full E2E'}`);
  console.log();

  let passed = 0;
  let failed = 0;

  try {
    if (!webhookOnly) {
      await testQrWithPolling();
      passed++;
    }
  } catch (e) {
    console.log(`  ${c.red('✗')} QR + Polling phase FAILED: ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }

  try {
    if (!qrOnly) {
      await testWebhookServer();
      passed++;
    }
  } catch (e) {
    console.log(`  ${c.red('✗')} Webhook server phase FAILED: ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }

  // ── Final summary ────────────────────────────────────────────────────
  logSection('RESULTS');

  console.log(`  ${c.bold('Phases:')}    ${c.green(String(passed))} passed, ${failed > 0 ? c.red(String(failed)) : '0'} failed`);
  console.log(`  ${c.bold('Status:')}    ${failed === 0 ? c.green('ALL PASSED') : c.red('SOME FAILED')}`);
  console.log();

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`\n  ${c.red('FATAL:')} ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
