/**
 * Purchase API test campaign — Wave 1, Route R1 (SDK checkout.purchase()).
 * Negative/validation scenarios D-1…D-12 per .scratch/purchase-api-test-plan/TEST-PLAN.md.
 *
 * Local scenarios run without network; D-8 (missing return_url), D-9-advisory
 * and D-10 (subscription trio) perform real sandbox calls (PENDING-safe).
 *
 * Run from repo root:
 *   NODE_TLS_REJECT_UNAUTHORIZED='0' npx tsx .scratch/purchase-api-test-plan/wave1-r1-sdk.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { PayWay, PayWayConfigError, PayWayBusinessError, PayWaySignatureError } from '../../src/index.js';

// --- .env loader (repo root) ---
const envPath = path.resolve(import.meta.dirname, '../../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}

const OUT_DIR = path.resolve(import.meta.dirname, '../../test-output/purchase-test-campaign');
fs.mkdirSync(OUT_DIR, { recursive: true });

const evidence: Record<string, unknown>[] = [];

// Capture advisory console.warn text per scenario.
let warnings: string[] = [];
const origWarn = console.warn;
console.warn = (...args: unknown[]) => {
  warnings.push(args.map(String).join(' '));
  origWarn(...args);
};

const RETURN_URL = 'https://example.com/checkout/return';

function client(): PayWay {
  return new PayWay({
    merchantId: process.env.PAYWAY_MERCHANT_ID,
    apiKey: process.env.PAYWAY_API_KEY,
    publicKeyPem: process.env.PAYWAY_RSA_PUBLIC_KEY,
    environment: 'sandbox',
  });
}

function strictClient(): PayWay {
  return new PayWay({
    merchantId: process.env.PAYWAY_MERCHANT_ID,
    apiKey: process.env.PAYWAY_API_KEY,
    publicKeyPem: process.env.PAYWAY_RSA_PUBLIC_KEY,
    environment: 'sandbox',
    strictValidation: true,
  });
}

interface ScenarioResult {
  id: string;
  mode: 'local' | 'network';
  thrown: string | null; // error class name
  message: string;
  warnings: string[];
  response_shape: string[] | null; // top-level field names on success
  response_excerpt?: unknown;
}

async function runLocal(id: string, fn: () => unknown | Promise<unknown>): Promise<ScenarioResult> {
  warnings = [];
  try {
    const result = await fn();
    return {
      id,
      mode: 'local',
      thrown: null,
      message: 'NO ERROR THROWN (unexpected)',
      warnings: [...warnings],
      response_shape: result && typeof result === 'object' ? Object.keys(result as object) : null,
    };
  } catch (err) {
    return {
      id,
      mode: 'local',
      thrown: err instanceof Error ? err.constructor.name : typeof err,
      message: err instanceof Error ? err.message : String(err),
      warnings: [...warnings],
      response_shape: null,
    };
  }
}

async function runNetwork(id: string, fn: () => Promise<unknown>): Promise<ScenarioResult> {
  warnings = [];
  try {
    const result = await fn();
    const shape = result && typeof result === 'object' ? Object.keys(result as object) : [typeof result];
    return {
      id,
      mode: 'network',
      thrown: null,
      message: 'OK',
      warnings: [...warnings],
      response_shape: shape,
      response_excerpt: redact(result),
    };
  } catch (err) {
    const excerpt =
      err instanceof PayWayBusinessError || err instanceof PayWaySignatureError
        ? redact((err as PayWayBusinessError).rawBody ?? null)
        : undefined;
    return {
      id,
      mode: 'network',
      thrown: err instanceof Error ? err.constructor.name : typeof err,
      message: err instanceof Error ? err.message : String(err),
      warnings: [...warnings],
      response_shape: null,
      response_excerpt: excerpt,
    };
  }
}

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 300) : value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/^(hash|qr_string|qr_image|abapay_deeplink|qrString|qrImage|abapay Deeplink)$/i.test(k.replace(/_/g, ''))) {
      out[k] = `<redacted:${String(v).length} chars>`;
    } else if (typeof v === 'string' && v.length > 300) {
      out[k] = `${v.slice(0, 300)}…`;
    } else {
      out[k] = redact(v);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const results: ScenarioResult[] = [];

  // D-1: amount 0 / -5
  results.push(await runLocal('D-1a-amount-0', () => client().checkout.purchase({ transactionId: 'd1a001', amount: 0, currency: 'USD', paymentOption: 'abapay_khqr', returnUrl: RETURN_URL, lifetime: 10 })));
  results.push(await runLocal('D-1b-amount-neg', () => client().checkout.purchase({ transactionId: 'd1b001', amount: -5, currency: 'USD', paymentOption: 'abapay_khqr', returnUrl: RETURN_URL, lifetime: 10 })));

  // D-2: USD 3 decimals / KHR non-integer
  results.push(await runLocal('D-2a-usd-3dp', () => client().checkout.purchase({ transactionId: 'd2a001', amount: 1.999, currency: 'USD', paymentOption: 'abapay_khqr', returnUrl: RETURN_URL, lifetime: 10 })));
  results.push(await runLocal('D-2b-khr-nonint', () => client().checkout.purchase({ transactionId: 'd2b001', amount: 4000.5, currency: 'KHR', paymentOption: 'abapay_khqr', returnUrl: RETURN_URL, lifetime: 10 })));

  // D-3: currency EUR
  results.push(await runLocal('D-3-currency-eur', () => client().checkout.purchase({ transactionId: 'd3001', amount: 1.0, currency: 'EUR' as 'USD', paymentOption: 'abapay_khqr', returnUrl: RETURN_URL, lifetime: 10 })));

  // D-4: lifetime 2 (below min 3)
  results.push(await runLocal('D-4-lifetime-2', () => client().checkout.purchase({ transactionId: 'd4001', amount: 1.0, currency: 'USD', paymentOption: 'abapay_khqr', returnUrl: RETURN_URL, lifetime: 2 })));

  // D-5: lifetime 43201 (above max 43200) — code shows advisory warn, not throw
  results.push(await runLocal('D-5-lifetime-43201', () => client().checkout.purchase({ transactionId: 'd5001', amount: 1.0, currency: 'USD', paymentOption: 'abapay_khqr', returnUrl: RETURN_URL, lifetime: 43201 })));

  // D-6: tran_id 21+ chars / spaces / symbols
  results.push(await runLocal('D-6a-tranid-21chars', () => client().checkout.purchase({ transactionId: 'abcdefghijklmnopqrstu', amount: 1.0, currency: 'USD', paymentOption: 'abapay_khqr', returnUrl: RETURN_URL, lifetime: 10 })));
  results.push(await runLocal('D-6b-tranid-space', () => client().checkout.purchase({ transactionId: 'has space', amount: 1.0, currency: 'USD', paymentOption: 'abapay_khqr', returnUrl: RETURN_URL, lifetime: 10 })));
  results.push(await runLocal('D-6c-tranid-symbol', () => client().checkout.purchase({ transactionId: 'a@b#c', amount: 1.0, currency: 'USD', paymentOption: 'abapay_khqr', returnUrl: RETURN_URL, lifetime: 10 })));

  // D-8: missing return_url — real network call (PENDING-safe)
  results.push(await runNetwork('D-8-missing-return-url', () => client().checkout.purchase({ transactionId: 'd8nortn001', amount: 1.23, currency: 'USD', paymentOption: 'abapay_khqr', lifetime: 10 })));

  // D-9: names >100 chars / items >10 entries — strict (throw) then advisory (warn + network)
  const longName = 'N'.repeat(120);
  const manyItems = Array.from({ length: 11 }, (_, i) => ({ name: `item${i}`, quantity: 1, price: 0.1 }));
  results.push(await runLocal('D-9a-longname-strict', () => strictClient().checkout.purchase({ transactionId: 'd9a001', amount: 1.0, currency: 'USD', paymentOption: 'abapay_khqr', returnUrl: RETURN_URL, lifetime: 10, firstname: longName })));
  results.push(await runLocal('D-9b-manyitems-strict', () => strictClient().checkout.purchase({ transactionId: 'd9b001', amount: 1.1, currency: 'USD', paymentOption: 'abapay_khqr', returnUrl: RETURN_URL, lifetime: 10, items: manyItems })));
  results.push(await runNetwork('D-9c-longname-advisory', () => client().checkout.purchase({ transactionId: 'd9cadv001', amount: 1.0, currency: 'USD', paymentOption: 'abapay_khqr', returnUrl: RETURN_URL, lifetime: 10, firstname: longName })));
  results.push(await runNetwork('D-9d-manyitems-advisory', () => client().checkout.purchase({ transactionId: 'd9dadv001', amount: 1.1, currency: 'USD', paymentOption: 'abapay_khqr', returnUrl: RETURN_URL, lifetime: 10, items: manyItems })));

  // D-10: subscription trio — hash correct post-§17-fix, expect 104 (F2)
  results.push(await runNetwork('D-10-subscription-trio', () => client().checkout.purchase({ transactionId: 'd10trio001', amount: 1.0, currency: 'USD', paymentOption: 'abapay_khqr', returnUrl: RETURN_URL, lifetime: 10, ctid: 'customer123', tokenFlag: 'CITR_FIX', frequency: '1M' })));

  // D-11: payout wrong keys {account, amount} on purchase path
  results.push(await runLocal('D-11-payout-wrong-keys', () => client().checkout.purchase({ transactionId: 'd11001', amount: 1.0, currency: 'USD', paymentOption: 'abapay_khqr', returnUrl: RETURN_URL, lifetime: 10, payout: [{ account: '500000001', amount: 1.0 } as unknown as { acc: string; amt: number }] })));

  // D-12: google_pay without token
  results.push(await runLocal('D-12-googlepay-no-token', () => client().checkout.purchase({ transactionId: 'd12001', amount: 1.0, currency: 'USD', paymentOption: 'google_pay', returnUrl: RETURN_URL, lifetime: 10 })));

  // Baseline sanity: a minimal valid purchase (also feeds P1 checks for D-8-style txns)
  results.push(await runNetwork('BASELINE-valid-json', () => client().checkout.purchase({ transactionId: 'w1base001', amount: 2.22, currency: 'USD', paymentOption: 'abapay_khqr', returnUrl: RETURN_URL, lifetime: 10 })));

  console.warn = origWarn;
  evidence.push(...results);
  fs.writeFileSync(path.join(OUT_DIR, 'wave1-r1-sdk.json'), JSON.stringify(results, null, 2));

  for (const r of results) {
    console.log(`\n=== ${r.id} (${r.mode}) ===`);
    console.log(`  thrown: ${r.thrown ?? '—'}`);
    console.log(`  message: ${r.message}`);
    if (r.warnings.length) console.log(`  warnings: ${JSON.stringify(r.warnings, null, 2)}`);
    if (r.response_shape) console.log(`  response_shape: ${r.response_shape.join(', ')}`);
    if (r.response_excerpt !== undefined) console.log(`  response: ${JSON.stringify(r.response_excerpt, null, 2)}`);
  }
  console.log(`\nEvidence: ${path.join(OUT_DIR, 'wave1-r1-sdk.json')}`);
}

main().catch((err) => {
  console.error('Runner failed:', err);
  process.exit(1);
});
