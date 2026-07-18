/**
 * qr-payment-test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive QR payment test using the ABA PayWay SDK.
 *
 * Generates a QR code, saves it as a PNG file for scanning,
 * then polls for transaction status until payment is confirmed
 * or the QR expires (10 minutes).
 *
 * Flow:
 *   1. Create SDK instance with logging
 *   2. Generate QR via sdk.qr.generateQr() — saves QR PNG + shows deeplink
 *   3. Optionally try checkout.purchase() for comparison
 *   4. Poll checkTransaction() every 5s until terminal status or timeout
 *   5. Print final summary
 *
 * Usage:
 *   cd SDK-prepration
 *   npx tsx scripts/qr-payment-test.ts          # defaults: $0.01 USD
 *   npx tsx scripts/qr-payment-test.ts 1.00      # $1.00 USD
 *   npx tsx scripts/qr-payment-test.ts 0.50 KHR  # 0.50 KHR
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

// Callback must be public HTTPS — sandbox can't reach localhost
const CALLBACK_URL = process.env.PAYWAY_CALLBACK_URL ?? 'https://webhook.site/51bc2004-9fcf-428b-97d4-6ed54e0ba40e';

const OUTPUT_DIR = path.join(process.cwd(), 'test-logs', 'qr-payment');

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_SECONDS = 600; // 10 minutes (QR lifetime)
const QR_TEMPLATE = 'template2_color';
const QR_LIFETIME_SECONDS = 600;

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
  bgGreen: (s: string) => `\x1b[42m${s}\x1b[0m`,
  bgRed: (s: string) => `\x1b[41m${s}\x1b[0m`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSACTION ID HELPER (≤20 chars)
// ═══════════════════════════════════════════════════════════════════════════════

function makeTxId(): string {
  const ts = Date.now().toString(36).slice(-6);
  const rand = Math.random().toString(36).slice(2, 5);
  return `PAY${ts}${rand}`.slice(0, 20);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  // Parse CLI args
  const amount = parseFloat(process.argv[2] ?? '0.01');
  const currency = (process.argv[3] ?? 'USD').toUpperCase() as 'USD' | 'KHR';
  const txId = makeTxId();

  console.log(`\n${c.bold('╔═══════════════════════════════════════════════════════════════╗')}`);
  console.log(`${c.bold('║   ABA PayWay — QR Payment Test                              ║')}`);
  console.log(`${c.bold('╚═══════════════════════════════════════════════════════════════╝')}\n`);
  console.log(`  ${c.dim('Merchant ID:')}  ${MERCHANT_ID}`);
  console.log(`  ${c.dim('Transaction:')}  ${txId}`);
  console.log(`  ${c.dim('Amount:')}       ${currency} ${amount.toFixed(currency === 'USD' ? 2 : 0)}`);
  console.log(`  ${c.dim('QR Template:')}  ${QR_TEMPLATE}`);
  console.log(`  ${c.dim('QR Lifetime:')}  ${QR_LIFETIME_SECONDS}s (${QR_LIFETIME_SECONDS / 60} min)`);
  console.log(`  ${c.dim('Callback URL:')} ${CALLBACK_URL}`);
  console.log('');

  if (!MERCHANT_ID || !API_KEY) {
    console.error(`${c.red('ERROR:')} PAYWAY_MERCHANT_ID and PAYWAY_API_KEY are required.`);
    process.exit(1);
  }

  // Ensure output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // ─── Create SDK with full logging ───────────────────────────────────────

  const requestLog: { ts: string; endpoint: string; payload: unknown }[] = [];
  const responseLog: { ts: string; endpoint: string; status: number; body: unknown; durationMs: number }[] = [];

  const payway = new PayWay({
    merchantId: MERCHANT_ID,
    apiKey: API_KEY,
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

  // ─── Step 1: Generate QR via qr.generateQr() ──────────────────────────

  console.log(`${c.bold('━━━ STEP 1: Generate QR (qr.generateQr) ━━━')}\n`);

  let qrResult: any;
  try {
    qrResult = await payway.qr.generateQr({
      transactionId: txId,
      amount,
      paymentOption: 'abapay_khqr',
      callbackUrl: CALLBACK_URL,
      currency,
      qrImageTemplate: QR_TEMPLATE,
    });

    console.log(`\n  ${c.green('✓')} QR generated successfully\n`);

    // Parse response — camelCase field names from GenerateQrResponse type
    const qrString = qrResult.qrString ?? qrResult.qr_string;
    const qrImage = qrResult.qrImage ?? qrResult.qr_image;
    const deeplink = qrResult.abapay_deeplink;

    // Show QR string (truncated)
    if (qrString) {
      console.log(`  ${c.cyan('QR String (KHQR payload):')}`);
      console.log(`  ${c.dim(qrString.slice(0, 80))}...`);
      console.log(`  ${c.dim(`Length: ${qrString.length} chars`)}`);
      // Save raw KHQR string
      fs.writeFileSync(path.join(OUTPUT_DIR, `${txId}-qr-string.txt`), qrString);
      console.log(`  ${c.dim(`Saved: test-logs/qr-payment/${txId}-qr-string.txt`)}\n`);
    }

    // Save QR image
    if (qrImage) {
      // Extract base64 data from data URL
      const base64Match = qrImage.match(/^data:image\/(\w+);base64,(.+)$/);
      if (base64Match) {
        const ext = base64Match[1] === 'jpeg' ? 'jpg' : base64Match[1];
        const imgBuffer = Buffer.from(base64Match[2], 'base64');
        const imgPath = path.join(OUTPUT_DIR, `${txId}-qr.${ext}`);
        fs.writeFileSync(imgPath, imgBuffer);

        console.log(`  ${c.cyan('QR Image:')}`);
        console.log(`  ${c.green('✓')} Saved to: ${c.bold(`test-logs/qr-payment/${txId}-qr.${ext}`)}`);
        console.log(`  ${c.dim(`Size: ${(imgBuffer.length / 1024).toFixed(1)} KB`)}`);
        console.log(`  ${c.dim('Open this file to scan with ABA Pay app')}\n`);
      } else {
        console.log(`  ${c.yellow('⚠')} QR image received but could not parse data URL\n`);
      }
    } else {
      console.log(`  ${c.yellow('⚠')} No QR image in response\n`);
    }

    // Show deeplink
    if (deeplink) {
      console.log(`  ${c.cyan('ABA Deeplink:')}`);
      console.log(`  ${c.magenta(deeplink.slice(0, 100))}${deeplink.length > 100 ? '...' : ''}`);
      console.log(`  ${c.dim(`Length: ${deeplink.length} chars`)}`);
      // Save deeplink
      fs.writeFileSync(path.join(OUTPUT_DIR, `${txId}-deeplink.txt`), deeplink);
      console.log(`  ${c.dim(`Saved: test-logs/qr-payment/${txId}-deeplink.txt`)}\n`);
    }

    // Show full response
    console.log(`  ${c.cyan('Full Response (truncated):')}`);
    const responsePreview = JSON.stringify(qrResult, null, 2);
    const lines = responsePreview.split('\n');
    if (lines.length > 20) {
      console.log(`  ${c.dim(lines.slice(0, 10).join('\n  '))}`);
      console.log(`  ${c.dim(`... (${lines.length - 20} more lines)`)}`);
      console.log(`  ${c.dim(lines.slice(-10).join('\n  '))}`);
    } else {
      console.log(`  ${c.dim(responsePreview)}`);
    }
  } catch (err: any) {
    console.log(`\n  ${c.red('✗')} QR generation failed:`);
    console.log(`    ${c.red(err.message)}`);
    if (err.paywayCode) console.log(`    ${c.dim(`PayWay code: ${err.paywayCode}`)}`);
    if (err.rawBody) console.log(`    ${c.dim(`Raw: ${JSON.stringify(err.rawBody).slice(0, 300)}`)}`);

    // Still save the error for reference
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `${txId}-error.json`),
      JSON.stringify({ error: err.message, code: err.paywayCode, rawBody: err.rawBody }, null, 2),
    );
  }

  // ─── Step 2: Generate via checkout.purchase() for comparison ──────────

  console.log(`\n${c.bold('━━━ STEP 2: Generate via checkout.purchase() (with lifetime) ━━━')}\n`);

  const txId2 = makeTxId();
  try {
    const purchaseResult = await payway.checkout.purchase({
      transactionId: txId2,
      amount,
      paymentOption: 'abapay_khqr',
      currency,
      lifetime: QR_LIFETIME_SECONDS,
    });

    console.log(`\n  ${c.green('✓')} Purchase QR generated\n`);

    // PurchaseQrResponse has snake_case: qr_string, abapay_deeplink, checkout_qr_url
    const qrString2 = (purchaseResult as any).qrString ?? (purchaseResult as any).qr_string;
    const qrImage2 = (purchaseResult as any).qrImage ?? (purchaseResult as any).qr_image;
    const deeplink2 = (purchaseResult as any).abapay_deeplink;
    const checkoutUrl = (purchaseResult as any).checkout_qr_url;

    if (qrString2) {
      console.log(`  ${c.cyan('QR String:')}`);
      console.log(`  ${c.dim(qrString2.slice(0, 80))}...`);
      console.log(`  ${c.dim(`Length: ${qrString2.length} chars`)}`);
      fs.writeFileSync(path.join(OUTPUT_DIR, `${txId2}-qr-string.txt`), qrString2);
      console.log(`  ${c.dim(`Saved: test-logs/qr-payment/${txId2}-qr-string.txt`)}\n`);
    }

    if (qrImage2) {
      const base64Match = qrImage2.match(/^data:image\/(\w+);base64,(.+)$/);
      if (base64Match) {
        const ext = base64Match[1] === 'jpeg' ? 'jpg' : base64Match[1];
        const imgBuffer = Buffer.from(base64Match[2], 'base64');
        const imgPath = path.join(OUTPUT_DIR, `${txId2}-qr.${ext}`);
        fs.writeFileSync(imgPath, imgBuffer);
        console.log(`  ${c.green('✓')} QR Image saved: ${c.bold(`test-logs/qr-payment/${txId2}-qr.${ext}`)}`);
        console.log(`  ${c.dim(`Size: ${(imgBuffer.length / 1024).toFixed(1)} KB`)}\n`);
      }
    }

    if (deeplink2) {
      console.log(`  ${c.cyan('ABA Deeplink:')}`);
      console.log(`  ${c.magenta(deeplink2.slice(0, 100))}${deeplink2.length > 100 ? '...' : ''}\n`);
    }

    if (checkoutUrl) {
      console.log(`  ${c.cyan('Checkout QR URL:')}`);
      console.log(`  ${c.white(checkoutUrl)}\n`);
    }

    console.log(`  ${c.cyan('Transaction ID (purchase):')} ${txId2}`);
  } catch (err: any) {
    console.log(`  ${c.red('✗')} Purchase failed: ${err.message}`);
    if (err.paywayCode) console.log(`    ${c.dim(`PayWay code: ${err.paywayCode}`)}`);
    if (err.rawBody) console.log(`    ${c.dim(`Raw: ${JSON.stringify(err.rawBody).slice(0, 300)}`)}`);
  }

  // ─── Step 3: Poll Transaction Status ─────────────────────────────────

  console.log(`\n${c.bold('━━━ STEP 3: Poll Transaction Status ━━━')}\n`);

  // We'll poll both transactions (the QR one and the purchase one)
  const pollTargets = [
    { id: txId, source: 'qr.generateQr' },
    { id: txId2, source: 'checkout.purchase' },
  ];

  const pollResults: {
    txId: string;
    source: string;
    attempts: number;
    finalStatus: string;
    history: { attempt: number; status: string; durationMs: number; timestamp: string }[];
  }[] = [];

  const startPolling = Date.now();
  const maxPollTimeMs = MAX_POLL_SECONDS * 1000;

  console.log(`  Polling every ${POLL_INTERVAL_MS / 1000}s for up to ${MAX_POLL_SECONDS}s...\n`);

  let attempt = 0;
  const completedTxIds = new Set<string>();

  while ((Date.now() - startPolling) < maxPollTimeMs && completedTxIds.size < pollTargets.length) {
    attempt++;

    for (const target of pollTargets) {
      if (completedTxIds.has(target.id)) continue;

      try {
        const start = Date.now();
        const result = await payway.checkout.checkTransaction(target.id);
        const durationMs = Date.now() - start;

        const data = (result as any).data ?? result;
        const status = data?.payment_status ?? (result as any)?.status ?? 'UNKNOWN';
        const statusStr = typeof status === 'string' ? status : JSON.stringify(status);

        const elapsed = ((Date.now() - startPolling) / 1000).toFixed(0);
        const statusColor = statusStr === 'APPROVED' ? c.green :
                           statusStr === 'PENDING' ? c.yellow :
                           statusStr === 'DECLINED' ? c.red : c.white;

        console.log(`  ${c.dim(`[${elapsed}s]`)} ${c.cyan(target.source)} #${target.id}: ${statusColor(statusStr)} ${c.dim(`(${durationMs}ms)`)}`);

        // Track in poll results
        let existing = pollResults.find(r => r.txId === target.id);
        if (!existing) {
          existing = { txId: target.id, source: target.source, attempts: 0, finalStatus: statusStr, history: [] };
          pollResults.push(existing);
        }
        existing.attempts++;
        existing.finalStatus = statusStr;
        existing.history.push({ attempt, status: statusStr, durationMs, timestamp: new Date().toISOString() });

        // Terminal status → stop polling this one
        if (['APPROVED', 'DECLINED', 'CANCELLED', 'REFUNDED', 'EXPIRED'].includes(statusStr.toUpperCase())) {
          const emoji = statusStr === 'APPROVED' ? c.green('✓✓✓') : c.red('✗✗✗');
          console.log(`\n  ${emoji} ${target.source} #${target.id}: ${statusColor(statusStr)} — TERMINAL\n`);
          completedTxIds.add(target.id);
        }
      } catch (err: any) {
        const statusStr = err.paywayCode ?? err.message ?? 'ERROR';
        console.log(`  ${c.dim(`[${((Date.now() - startPolling) / 1000).toFixed(0)}s]`)} ${c.cyan(target.source)} #${target.id}: ${c.red(String(statusStr).slice(0, 60))}`);

        let existing = pollResults.find(r => r.txId === target.id);
        if (!existing) {
          existing = { txId: target.id, source: target.source, attempts: 0, finalStatus: String(statusStr), history: [] };
          pollResults.push(existing);
        }
        existing.attempts++;
        existing.finalStatus = String(statusStr);
      }
    }

    // Wait before next poll (if not all complete)
    if (completedTxIds.size < pollTargets.length) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  const elapsed = ((Date.now() - startPolling) / 1000).toFixed(1);

  // ─── Step 4: Summary ───────────────────────────────────────────────────

  console.log(`\n${c.bold('╔═══════════════════════════════════════════════════════════════╗')}`);
  console.log(`${c.bold('║   PAYMENT TEST SUMMARY                                      ║')}`);
  console.log(`${c.bold('╚═══════════════════════════════════════════════════════════════╝')}\n`);

  console.log(`  ${c.dim('Total polling time:')} ${elapsed}s`);
  console.log(`  ${c.dim('Total poll attempts:')} ${attempt}`);
  console.log('');

  for (const result of pollResults) {
    const statusColor = result.finalStatus === 'APPROVED' ? c.green :
                       result.finalStatus === 'PENDING' ? c.yellow : c.red;
    console.log(`  ${c.bold(result.source)} #${result.txId}`);
    console.log(`    Status:  ${statusColor(result.finalStatus)}`);
    console.log(`    Polls:   ${result.attempts}`);
    console.log(`    History: ${result.history.map(h => `${h.status}(${h.durationMs}ms)`).join(' → ')}`);
    console.log('');
  }

  // Save full log
  const fullLog = {
    test: {
      transactionId: txId,
      transactionId2: txId2,
      amount,
      currency,
      template: QR_TEMPLATE,
      lifetime: QR_LIFETIME_SECONDS,
    },
    requests: requestLog,
    responses: responseLog,
    polling: pollResults,
    summary: {
      elapsedSeconds: parseFloat(elapsed),
      pollAttempts: attempt,
      finalStatuses: pollResults.map(r => ({ txId: r.txId, source: r.source, status: r.finalStatus })),
    },
  };

  const logPath = path.join(OUTPUT_DIR, `${txId}-full-log.json`);
  fs.writeFileSync(logPath, JSON.stringify(fullLog, null, 2));
  console.log(`  ${c.dim('Full log:')} ${logPath}`);

  // ─── QR Files ───────────────────────────────────────────────────────

  console.log(`\n  ${c.bold('Generated files:')}`);
  const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.startsWith(txId) || f.startsWith(txId2));
  for (const file of files) {
    console.log(`    ${c.cyan(file)}`);
  }

  console.log(`\n  ${c.bold('How to pay:')}`);
  console.log(`    1. Open the ${c.bold(`${txId}-qr.png`)} file`);
  console.log(`    2. Scan with ABA Pay app or any KHQR-compatible banking app`);
  console.log(`    3. Complete the payment in the app`);
  console.log(`    4. Watch the terminal for status updates\n`);

  console.log(`  ${c.dim('Press Ctrl+C to stop polling early.\n')}`);
}

main().catch((error) => {
  console.error(`\n\x1b[31mFATAL:\x1b[0m ${error.message}\n${error.stack}`);
  process.exit(1);
});
