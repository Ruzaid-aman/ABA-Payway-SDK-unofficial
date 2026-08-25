#!/usr/bin/env npx tsx
/**
 * checkout-cards-close.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Card-payment checkout lifecycle using the OFFICIAL PayWay web integration
 * (https://developer.payway.com.kh/ecommerce-checkout-3158159f0):
 *
 *   1. Build the signed payload LOCALLY via checkout.createTransaction()
 *      (no network request) with paymentOption 'cards'.
 *   2. Generate a checkout page embedding the payload as hidden form fields,
 *      loading https://checkout.payway.com.kh/plugins/checkout2-0.js, and
 *      triggering AbaPayway.checkout() -> PayWay's HTML checkout renders in a
 *      modal (iframe form POST — avoids CORS entirely).
 *   3. Open the page in the default browser; wait until check-transaction
 *      reports the new transaction (creation happens on form submit).
 *   4. Close (void) the transaction before payment via closeTransaction.
 *   5. Re-check status afterwards (closed-but-unpaid keeps reporting PENDING).
 *
 * Usage:
 *   npx tsx scripts/checkout-cards-close.ts [amount] [currency]
 *
 * Defaults: amount = 7.77 USD. Requires PAYWAY_MERCHANT_ID / PAYWAY_API_KEY.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolve } from 'node:path';
import { PayWay } from '../src/client.js';
import { closeAndVerify } from './close-transaction-verify.js';

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

const AMOUNT = Number.parseFloat(process.argv[2] ?? '7.77');
const CURRENCY = (process.argv[3] ?? 'USD').toUpperCase() as 'USD' | 'KHR';
const NO_CLOSE = process.argv.includes('--no-close');
const PURCHASE_ACTION = 'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase';

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

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function openInBrowser(target: string): void {
  try {
    if (process.platform === 'win32') {
      spawnSync('cmd', ['/c', 'start', '', target], { detached: true, stdio: 'ignore' });
    } else if (process.platform === 'darwin') {
      spawnSync('open', [target], { detached: true, stdio: 'ignore' });
    } else {
      spawnSync('xdg-open', [target], { detached: true, stdio: 'ignore' });
    }
  } catch {
    console.log(`  ${c.yellow('⚠')} Could not auto-open — open this file manually.`);
  }
}

async function statusOf(payway: PayWay, txId: string): Promise<string> {
  try {
    const result = await payway.checkout.checkTransaction(txId);
    const data = (result as Record<string, unknown>).data as Record<string, unknown> | undefined;
    return String(data?.payment_status ?? 'UNKNOWN');
  } catch (err) {
    const e = err as { paywayCode?: string };
    return e.paywayCode === '6' ? 'NOT_CREATED_YET' : `ERROR (${err instanceof Error ? err.message.slice(0, 50) : '?'})`;
  }
}

function renderCheckoutPage(payload: Record<string, unknown>): string {
  const inputs = Object.entries(payload)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `    <input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(String(v))}" />`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<title>PayWay Cards Checkout — ${escapeHtml(String(payload.tran_id))}</title>
<script src="https://checkout.payway.com.kh/plugins/checkout2-0.js" defer></script>
<style>
  body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 90vh; margin: 0; }
  .box { text-align: center; }
  button { font-size: 1rem; padding: 12px 28px; border-radius: 8px; border: 0;
           background: #00bcd4; color: #fff; cursor: pointer; margin: 6px; }
  button[disabled] { opacity: .5; cursor: not-allowed; }
  button.secondary { background: #455a64; }
  p { color: #555; }
</style>
</head>
<body>
  <div class="box">
    <h2>ABA PayWay — Card Checkout</h2>
    <p>Transaction <strong>${escapeHtml(String(payload.tran_id))}</strong> · ${escapeHtml(
      String(payload.currency),
    )} ${escapeHtml(String(payload.amount))}</p>
    <noscript><p style="color:#b00020">JavaScript is required for the PayWay checkout.</p></noscript>

    <div>
      <button id="pay-modal-btn" type="button" disabled title="Renders PayWay's HTML in an in-page modal via checkout2-0.js">Pay in modal</button>
      <button id="pay-hosted-btn" type="button" class="secondary" title="Full-page redirect to PayWay's hosted checkout">Open hosted checkout</button>
    </div>
    <p id="status">Waiting for PayWay plugin…</p>
  </div>

  <form method="POST" target="aba_webservice" id="aba_merchant_request" action="${PURCHASE_ACTION}">
${inputs}
  </form>

  <script>
    (function () {
      var form = document.getElementById('aba_merchant_request');
      var statusEl = document.getElementById('status');
      var modalBtn = document.getElementById('pay-modal-btn');
      var hostedBtn = document.getElementById('pay-hosted-btn');
      var started = false;

      function pluginReady() {
        return !!(window.AbaPayway && typeof window.AbaPayway.checkout === 'function');
      }

      function startModal() {
        if (started || !pluginReady()) return;
        started = true;
        statusEl.textContent = 'Opening PayWay modal…';
        try {
          AbaPayway.checkout(); // modal popup on desktop / bottom sheet on mobile
          statusEl.textContent = 'Modal open — complete the card form there.';
        } catch (e) {
          started = false;
          statusEl.textContent = 'Modal failed (' + e.message + ') — use hosted checkout.';
        }
      }

      function startHosted() {
        if (started) return;
        started = true;
        statusEl.textContent = 'Redirecting to PayWay hosted checkout…';
        // Hosted view = normal top-level navigation, so drop the iframe target.
        form.removeAttribute('target');
        form.submit();
      }

      modalBtn.addEventListener('click', startModal);
      hostedBtn.addEventListener('click', startHosted);

      // Enable modal as soon as the deferred plugin attaches (poll up to ~8s).
      var tries = 0;
      var timer = setInterval(function () {
        tries++;
        if (pluginReady()) {
          clearInterval(timer);
          modalBtn.disabled = false;
          statusEl.textContent = 'Choose a mode — modal is ready.';
          if (!started) startModal(); // auto-open the modal once
        } else if (tries > 80) {
          clearInterval(timer);
          statusEl.textContent = 'Plugin did not load — use hosted checkout.';
        }
      }, 100);
    })();
  </script>
</body>
</html>
`;
}

async function main(): Promise<void> {
  if (!MERCHANT_ID || !API_KEY) {
    console.error(`${c.red('ERROR:')} PAYWAY_MERCHANT_ID and PAYWAY_API_KEY are required.`);
    process.exit(1);
  }

  const txId = makeTxId();
  const outputDir = resolve(process.cwd(), 'test-output');
  const pagePath = path.join(outputDir, `${txId}-checkout-page.html`);

  console.log(`\n${c.bold('=== ABA PayWay — Cards Checkout (modal) -> Close ===')}\n`);
  console.log(`  ${c.dim('Transaction ID:')} ${txId}`);
  console.log(`  ${c.dim('Amount:')}         ${CURRENCY} ${AMOUNT.toFixed(CURRENCY === 'USD' ? 2 : 0)}`);
  console.log(`  ${c.dim('Payment option:')} cards\n`);

  const payway = new PayWay({
    merchantId: MERCHANT_ID,
    apiKey: API_KEY,
    environment: 'sandbox',
    debug: false,
    rateLimitThrottling: false,
  });

  // ── Step 1: build the signed payload locally (official web integration) ─
  console.log(`${c.bold('STEP 1')} build signed payload (createTransaction — local, no network)\n`);
  const payload = payway.checkout.createTransaction({
    transactionId: txId,
    amount: AMOUNT,
    currency: CURRENCY,
    paymentOption: 'cards',
    viewType: 'hosted_view',
    paymentGate: 0,
    lifetime: 600,
  });
  console.log(`  ${c.green('✓')} signed fields: ${Object.keys(payload).join(', ')}`);

  // ── Step 2: generate + open the checkout page ───────────────────────────
  console.log(`\n${c.bold('STEP 2')} generate checkout page (modal OR hosted — your choice)\n`);
  writeFileSync(pagePath, renderCheckoutPage(payload));
  console.log(`  ${c.green('✓')} saved: ${c.bold(path.relative(process.cwd(), pagePath))}`);
  openInBrowser(pagePath);
  console.log(`  ${c.dim('Page offers both modes: "Pay in modal" (checkout2-0.js) or "Open hosted checkout".')}`);
  console.log(`  ${c.yellow('⚠')} Sandbox: paying works EVEN AFTER this script closes the txn — do not pay unless intended.`);

  // ── Step 3: wait for server-side creation, verify PENDING ───────────────
  console.log(`\n${c.bold('STEP 3')} waiting for check-transaction to see the transaction\n`);
  let preClose = 'NOT_CREATED_YET';
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    preClose = await statusOf(payway, txId);
    process.stdout.write(`  poll: ${preClose}\n`);
    if (preClose !== 'NOT_CREATED_YET' && !preClose.startsWith('ERROR')) break;
  }
  console.log('');

  // ── Step 4+5: close and verify via the reusable tool helpers ────────────
  if (NO_CLOSE) {
    console.log(`${c.bold('STEP 4+5')} skipped (--no-close) — transaction stays open for payment.\n`);
    console.log(`  ${c.dim('Verify later with: npx tsx scripts/close-transaction-verify.ts ' + txId + ' --status-only')}`);
    console.log(`  ${c.dim('Or close later with:          npx tsx scripts/close-transaction-verify.ts ' + txId)}\n`);
    writeFileSync(
      path.join(outputDir, `${txId}-lifecycle.json`),
      JSON.stringify({ txId, amount: AMOUNT, currency: CURRENCY, preClose, closedVia: null }, null, 2),
    );
    return;
  }

  console.log(`${c.bold('STEP 4+5')} closeTransaction + post-close verification\n`);
  const summary = await closeAndVerify(payway, txId);
  if (summary.close.accepted) {
    console.log(`  ${c.green('✓')} close accepted: code=${summary.close.code} ${JSON.stringify(summary.close.message)}`);
  } else {
    console.log(
      `  ${c.yellow('⚠')} close not accepted: code=${summary.close.code ?? '-'} ${summary.close.error ?? ''} ${summary.close.message ?? ''}`,
    );
  }
  console.log(`  status now: ${summary.immediateStatus}`);
  console.log(`  status +3s: ${summary.delayedStatus}`);

  console.log(`\n  ${c.dim('Sandbox facts: closed-but-unpaid txns keep reporting PENDING, and close does NOT block')}`);
  console.log(`  ${c.dim('payment — a paid-after-close txn becomes APPROVED (verified 2026-08-25). Track state locally.')}\n`);

  writeFileSync(
    path.join(outputDir, `${txId}-lifecycle.json`),
    JSON.stringify({ txId, amount: AMOUNT, currency: CURRENCY, preClose, summary }, null, 2),
  );
  console.log(`  ${c.dim(`Evidence: test-output/${txId}-*`)}\n`);
}

main().catch((error) => {
  console.error(`\n\x1b[31mFATAL:\x1b[0m ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
