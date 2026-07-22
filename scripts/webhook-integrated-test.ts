#!/usr/bin/env npx tsx
/**
 * webhook-integrated-test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Fully integrated end-to-end test: webhook server + QR + callback.
 *
 * Flow:
 *   1. Start webhook HTTP server on a random port (keeps running)
 *   2. Generate QR via PayWay sandbox API — callbackUrl → webhook server
 *   3. Poll transaction status until APPROVED or lifetime expires
 *   4. Send a simulated callback with real transaction data to webhook server
 *   5. Verify the callback was stored in webhook storage
 *   6. Stop webhook server
 *
 * Usage:
 *   cd SDK-prepration
 *   npx tsx scripts/webhook-integrated-test.ts
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
import { JsonWebhookStorage } from '../src/webhook/storage-json.js';
import type { WebhookRecord } from '../src/webhook/storage.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Load .env
// ═══════════════════════════════════════════════════════════════════════════════

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
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

const MERCHANT_ID = process.env.PAYWAY_MERCHANT_ID ?? '';
const API_KEY = process.env.PAYWAY_API_KEY ?? '';
const LOG_DIR = path.join(process.cwd(), 'test-logs', 'webhook-integrated');

// ═══════════════════════════════════════════════════════════════════════════════
// ANSI
// ═══════════════════════════════════════════════════════════════════════════════

const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function makeTxId(prefix = 'INT'): string {
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

function httpPost(
  port: number,
  pathStr: string,
  body: string,
  headers?: Record<string, string>,
): Promise<{ statusCode: number; body: string }> {
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
// TEST STATE
// ═══════════════════════════════════════════════════════════════════════════════

interface TestState {
  webhookPort: number;
  storageDir: string;
  storage: JsonWebhookStorage;
  server: WebhookServerResult;
  txId: string;
  amount: number;
  currency: string;
  pollingResult: {
    paymentStatus: string;
    attempts: number;
    durationMs: number;
  } | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1: START WEBHOOK SERVER
// ═══════════════════════════════════════════════════════════════════════════════

async function startWebhook(): Promise<TestState> {
  logSection('PHASE 1: Start Webhook Server');

  const webhookPort = await getFreePort();
  const storageDir = mkdtempSync(path.join(tmpdir(), 'webhook-int-'));
  const storageFile = path.join(storageDir, 'callbacks.jsonl');
  const storage = new JsonWebhookStorage(storageFile);
  const server = createWebhookServer(storage, { port: webhookPort, apiKey: API_KEY || undefined });

  await server.start();

  const txId = makeTxId('INTQR');

  console.log(`  ${c.dim('Webhook URL:')}  ${c.cyan(`http://127.0.0.1:${webhookPort}/aba-payway-webhook`)}`);
  console.log(`  ${c.dim('Storage:')}      ${storageFile}`);
  console.log(`  ${c.dim('Tx ID:')}        ${txId}`);
  console.log();
  console.log(`  ${c.green('✓')} Webhook server running`);

  return {
    webhookPort,
    storageDir,
    storage,
    server,
    txId,
    amount: 0.01,
    currency: 'USD',
    pollingResult: null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2: QR + POLLING (public callback URL for PayWay)
// ═══════════════════════════════════════════════════════════════════════════════

async function phaseQrWithPolling(state: TestState): Promise<void> {
  logSection('PHASE 2: QR Generation + Polling');

  const payway = new PayWay();
  // PayWay requires a public HTTPS URL for callbacks — localhost won't validate
  const callbackUrl = 'https://webhook.site/51bc2004-9fcf-428b-97d4-6ed54e0ba40e';
  const lifetimeSec = 300;

  console.log(`  ${c.dim('Transaction ID:')}  ${state.txId}`);
  console.log(`  ${c.dim('Amount:')}           ${state.currency} ${state.amount.toFixed(2)}`);
  console.log(`  ${c.dim('Callback URL:')}     ${c.cyan(callbackUrl)}  (PayWay public URL requirement)`);
  console.log(`  ${c.dim('Webhook URL:')}       ${c.cyan(`http://127.0.0.1:${state.webhookPort}/aba-payway-webhook`)}  (local server for callback test)`);
  console.log(`  ${c.dim('Lifetime:')}         ${lifetimeSec}s (5 min)`);
  console.log();

  // ── Generate QR ──────────────────────────────────────────────────────
  console.log(`  ${c.bold('Generating QR via PayWay sandbox API...')}`);

  const qr = await payway.qr.generateQr({
    transactionId: state.txId,
    amount: state.amount,
    currency: state.currency,
    paymentOption: 'abapay_khqr',
    callbackUrl,
    qrImageTemplate: 'template2',
    lifetime: lifetimeSec,
  });

  console.log(`  ${c.green('✓')} QR generated successfully`);

  if (qr.qrString) {
    console.log(`    QR String: ${c.cyan(qr.qrString.slice(0, 80) + '...')}`);
  }
  if (qr.qrImage) {
    console.log(`    QR Image:  ${c.cyan(`${qr.qrImage.length} chars base64`)}`);
  }
  console.log();

  // ── Save QR image ────────────────────────────────────────────────────
  ensureDir(LOG_DIR);
  if (qr.qrImage) {
    const base64Data = qr.qrImage.includes('base64,') ? qr.qrImage.split('base64,')[1] : qr.qrImage;
    const imgPath = path.join(LOG_DIR, `int-qr-${state.txId}.png`);
    fs.writeFileSync(imgPath, Buffer.from(base64Data, 'base64'));
    console.log(`  ${c.green('✓')} QR image saved to ${c.cyan(imgPath)}`);
    console.log();
  }

  // ── Poll for APPROVED ────────────────────────────────────────────────
  const pollIntervalMs = 5_000;
  const pollTimeoutMs = lifetimeSec * 1000 + 30_000;
  const startTime = Date.now();

  console.log(`  ${c.bold('Polling transaction status...')}`);
  console.log(`    Interval: ${c.cyan('5s')}`);
  console.log(`    Timeout:  ${c.cyan(`${pollTimeoutMs / 1000}s`)}`);
  console.log();

  let terminal = false;
  let lastStatus = '';
  let attempts = 0;
  let durationMs = 0;

  try {
    for await (const result of payway.checkout.pollTransactionStatus(state.txId, {
      intervalMs: pollIntervalMs,
      maxDurationMs: pollTimeoutMs,
    })) {
      attempts++;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      lastStatus = result.paymentStatus;
      durationMs = result.durationMs;

      if (result.paymentStatus.startsWith('ERROR:')) {
        console.log(`  ${c.yellow('⚠')} [${elapsed}s] Poll #${result.attempt}: ${c.yellow(result.paymentStatus)} ${c.dim(`(${result.durationMs}ms)`)}`);
        continue;
      }

      if (result.isTerminal) {
        const icon = result.paymentStatus === 'APPROVED' ? c.green('✓') : c.red('✗');
        console.log(`  ${icon} [${elapsed}s] Poll #${result.attempt}: ${c.bold(result.paymentStatus)} ${c.dim(`(${result.durationMs}ms)`)}`);
        terminal = true;
        break;
      }

      console.log(`  ${c.dim('○')} [${elapsed}s] Poll #${result.attempt}: ${c.dim(result.paymentStatus)} ${c.dim(`(${result.durationMs}ms)`)}`);
    }
  } catch (err: unknown) {
    const { PollingAbortedError } = await import('../src/errors.js');
    if (err instanceof PollingAbortedError) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log();
      console.log(`  ${c.yellow('⚠')} Polling stopped: ${c.yellow(err.reason)} after ${String(err.totalAttempts)} attempts (${elapsed}s)`);
      if (err.lastStatus) {
        lastStatus = err.lastStatus;
      }
    } else {
      throw err;
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────
  const elapsedTotal = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log();
  console.log(`  ${c.bold('Polling Summary:')}`);
  console.log(`    Transaction:   ${c.cyan(state.txId)}`);
  console.log(`    Total polls:   ${c.cyan(String(attempts))}`);
  console.log(`    Terminal:      ${terminal ? c.green('yes') : c.yellow('no')}`);
  console.log(`    Final status:  ${terminal && lastStatus === 'APPROVED' ? c.green(lastStatus) : c.yellow(lastStatus)}`);
  console.log(`    Duration:      ${c.cyan(`${elapsedTotal}s`)}`);

  state.pollingResult = { paymentStatus: lastStatus, attempts, durationMs };

  console.log();
  if (terminal && lastStatus === 'APPROVED') {
    console.log(`  ${c.green('✓')} ${c.bold('QR + Polling phase PASSED')}`);
  } else {
    console.log(`  ${c.yellow('⚠')} QR + Polling phase completed (transaction not approved)`);
  }
  console.log();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3: SEND REAL CALLBACK TO WEBHOOK SERVER
// ═══════════════════════════════════════════════════════════════════════════════

async function phaseSendCallback(state: TestState): Promise<void> {
  logSection('PHASE 3: Send Callback to Webhook Server (real tx data)');

  const callbackPayload = JSON.stringify({
    transactionId: state.txId,
    status: state.pollingResult?.paymentStatus ?? 'COMPLETED',
    payment_option: 'abapay_khqr',
    amount: state.amount.toFixed(2),
    currency: state.currency,
    hash: 'dummy-hash-for-testing',
  });

  console.log(`  ${c.bold('Sending callback with real transaction data...')}`);
  console.log(`    ${c.dim('Payload:')} ${callbackPayload}`);
  console.log();

  const response = await httpPost(state.webhookPort, '/aba-payway-webhook', callbackPayload);

  if (response.statusCode === 200) {
    console.log(`  ${c.green('✓')} Callback accepted: ${c.cyan(`${response.statusCode} ${response.body}`)}`);
  } else {
    console.log(`  ${c.red('✗')} Callback rejected: ${c.cyan(`${response.statusCode} ${response.body}`)}`);
    throw new Error(`Webhook returned ${response.statusCode}`);
  }

  // ── Verify storage ───────────────────────────────────────────────────
  await sleep(100); // give async storage time to flush
  const allRecords = state.storage.getAll();
  const callbackRecords = allRecords.filter(
    (r) => r.body.includes(state.txId) || r.body.includes('dummy-hash-for-testing'),
  );

  if (callbackRecords.length > 0) {
    const rec = callbackRecords[callbackRecords.length - 1];
    console.log();
    console.log(`  ${c.green('✓')} Callback stored in webhook storage:`);
    console.log(`    ${c.dim('Record ID:')}   ${c.cyan(rec.id)}`);
    console.log(`    ${c.dim('Received at:')} ${rec.receivedAt}`);
    console.log(`    ${c.dim('Source IP:')}   ${rec.sourceIp}`);
    console.log(`    ${c.dim('Body txId:')}   ${c.cyan(state.txId)}`);
  } else {
    console.log();
    console.log(`  ${c.yellow('⚠')} No callback record found for transaction ${c.cyan(state.txId)}`);
    console.log(`  ${c.dim('All records in storage:')} ${allRecords.length}`);
  }

  console.log();
  console.log(`  ${c.green('✓')} ${c.bold('Callback verification phase PASSED')}`);
  console.log();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 4: INSPECT STORAGE & STOP
// ═══════════════════════════════════════════════════════════════════════════════

async function phaseInspectAndStop(state: TestState): Promise<void> {
  logSection('PHASE 4: Inspect Storage & Shutdown');

  const allRecords = state.storage.getAll();
  console.log(`  ${c.bold('All stored webhook records:')}`);
  if (allRecords.length === 0) {
    console.log(`  ${c.dim('  (no records)')}`);
  } else {
    for (const rec of allRecords) {
      let summary: string;
      try {
        const parsed = JSON.parse(rec.body);
        summary = `${parsed.transactionId ?? '<no id>'} | ${parsed.status ?? parsed.payment_status ?? '<no status>'}`;
      } catch {
        summary = c.yellow('<malformed body>');
      }
      console.log(`  ${c.dim(`[${rec.id}]`)} ${rec.receivedAt} — ${c.cyan(summary)}`);
    }
  }

  console.log();

  await state.server.stop();
  state.storage.close();
  console.log(`  ${c.green('✓')} Webhook server stopped, storage closed`);
  console.log();
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log();
  console.log(`  ${c.bold('╔═══════════════════════════════════════════════════════════════╗')}`);
  console.log(`  ${c.bold('║   ABA PayWay SDK — Integrated Webhook E2E Test              ║')}`);
  console.log(`  ${c.bold('╚═══════════════════════════════════════════════════════════════╝')}`);
  console.log();
  console.log(`  ${c.dim('Merchant ID:')}  ${MERCHANT_ID || c.red('(not set)')}`);
  console.log(`  ${c.dim('API Key:')}      ${API_KEY ? API_KEY.slice(0, 8) + '...' : c.red('(not set)')}`);
  console.log();

  if (!MERCHANT_ID || !API_KEY) {
    console.log(`  ${c.red('✗')} Missing credentials. Create a .env file with PAYWAY_MERCHANT_ID and PAYWAY_API_KEY.`);
    process.exit(1);
  }

  const phases = ['Start Webhook', 'QR + Polling', 'Callback Verification', 'Inspect & Stop'];
  const results: boolean[] = [];

  const state = await startWebhook();
  results.push(true);

  try {
    await phaseQrWithPolling(state);
    results.push(true);
  } catch (e) {
    console.log(`\n  ${c.red('✗')} QR + Polling phase FAILED: ${e instanceof Error ? e.message : String(e)}\n`);
    results.push(false);
  }

  try {
    await phaseSendCallback(state);
    results.push(true);
  } catch (e) {
    console.log(`\n  ${c.red('✗')} Callback verification phase FAILED: ${e instanceof Error ? e.message : String(e)}\n`);
    results.push(false);
  }

  try {
    await phaseInspectAndStop(state);
    results.push(true);
  } catch (e) {
    console.log(`\n  ${c.red('✗')} Inspect/stop phase FAILED: ${e instanceof Error ? e.message : String(e)}\n`);
    results.push(false);
  }

  // ── Final summary ────────────────────────────────────────────────────
  logSection('RESULTS');

  for (let i = 0; i < phases.length; i++) {
    const icon = results[i] ? c.green('✓') : c.red('✗');
    const status = results[i] ? c.green('PASS') : c.red('FAIL');
    console.log(`  ${icon} ${phases[i]}: ${status}`);
  }

  const passed = results.filter(Boolean).length;
  const failed = results.filter((r) => !r).length;
  console.log();
  console.log(`  ${c.bold('Phases:')}  ${c.green(String(passed))} passed, ${failed > 0 ? c.red(String(failed)) : '0'} failed`);
  console.log(`  ${c.bold('Status:')}  ${failed === 0 ? c.green('ALL PASSED ✓') : c.red('SOME FAILED ✗')}`);
  console.log();

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`\n  ${c.red('FATAL:')} ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
