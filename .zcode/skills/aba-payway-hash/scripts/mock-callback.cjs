#!/usr/bin/env node
/**
 * mock-callback.cjs — Send a correctly-signed fake ABA PayWay callback to a
 * local webhook endpoint, so you can test your handler without the ABA
 * Simulator app.
 *
 * The payload is signed with the SAME algorithm PayWay uses (sorted-key
 * concat → HMAC-SHA512 → Base64) so a correct handler will accept it, and a
 * broken one will reject it.
 *
 * Usage:
 *   node mock-callback.cjs --url http://localhost:3000/payway/callback --tran-id order-123 --amount 10
 *   node mock-callback.cjs --url http://localhost:3000/cb --status PENDING --currency KHR --amount 40000
 *   node mock-callback.cjs --example          # print a sample payload and exit
 *
 * Flags: --tran-id, --merchant-ref, --amount, --currency USD|KHR,
 *        --status APPROVED|PENDING|DECLINED|REFUNDED|CANCELLED,
 *        --api-key (or PAYWAY_API_KEY), --customer-name, --timeout <ms>
 *
 * Exit codes (bundled-script contract, skills/README.md):
 *   0 — the handler answered 2xx (acknowledged), or --example printed.
 *   1 — runtime failure at execution time: network error, timeout, or the
 *       handler answered non-2xx ("did NOT acknowledge" is a FAILURE result).
 *   2 — usage/environment error: bad flags, invalid --status/--currency/
 *       --amount, missing API key.
 */
const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');

const STATUS_CODES = { APPROVED: 0, PENDING: 2, DECLINED: 3, REFUNDED: 4, CANCELLED: 7 };
const SUPPORTED_CURRENCIES = ['USD', 'KHR'];

function formatRequestTime(date) {
  const d = date || new Date();
  const p = (n) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear() +
    p(d.getUTCMonth() + 1) +
    p(d.getUTCDate()) +
    p(d.getUTCHours()) +
    p(d.getUTCMinutes()) +
    p(d.getUTCSeconds())
  );
}

function buildConcatenated(body) {
  return Object.keys(body)
    .sort()
    .map((key) => {
      const val = body[key];
      if (val === undefined || val === null) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    })
    .join('');
}

function signBody(body, apiKey) {
  return crypto.createHmac('sha512', apiKey).update(buildConcatenated(body)).digest('base64');
}

function buildCallbackBody(opts) {
  const status = (opts.status || 'APPROVED').toUpperCase();
  if (!(status in STATUS_CODES)) {
    throw new Error(`Invalid --status "${status}". Valid: ${Object.keys(STATUS_CODES).join(', ')}`);
  }
  const currency = (opts.currency || 'USD').toUpperCase();
  // D09 (publishing-DX audit): unsupported currencies and malformed amounts
  // used to slip through (EUR shipped USD-formatted; bad numbers coerced to a
  // literal "NaN" in the payload). Reject both before anything is signed.
  if (!SUPPORTED_CURRENCIES.includes(currency)) {
    throw new Error(`Invalid --currency "${currency}". Valid: ${SUPPORTED_CURRENCIES.join(', ')}`);
  }
  const rawAmount = Number(
    opts.amount === undefined || opts.amount === '' ? (currency === 'KHR' ? 40000 : 10) : opts.amount,
  );
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    throw new Error(`Invalid --amount "${String(opts.amount)}". Use a positive number.`);
  }
  const amount = currency === 'KHR' ? String(Math.round(rawAmount)) : rawAmount.toFixed(2);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const tranId = opts['tran-id'] || `mock-${Math.floor(Math.random() * 1e9)}`;
  const merchantRef = opts['merchant-ref'] || tranId;
  return {
    apv: String(Math.floor(100000 + Math.random() * 899999)),
    bank_name: 'ABA Bank',
    bank_ref: `100SB${Date.now()}`,
    merchant_ref: merchantRef,
    original_amount: amount,
    original_currency: currency,
    payment_amount: amount,
    payment_currency: currency,
    payment_status: status,
    payment_status_code: STATUS_CODES[status],
    payment_timestamp: formatRequestTime(now),
    payment_type: 'ABA Pay',
    payer_account: `*${String(Math.floor(100 + Math.random() * 899))}`,
    payer_name: opts['customer-name'] || 'Mock Payer',
    transaction_date: `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`,
    transaction_id: String(BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 999))),
    tran_id: tranId,
  };
}

function postJson(url, body, headers, options = {}) {
  const timeoutMs = options.timeoutMs ?? 10000;
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(
      url,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        timeout: timeoutMs,
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (raw += c));
        res.on('end', () => resolve({ statusCode: res.statusCode, body: raw.slice(0, 500) }));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`timeout after ${timeoutMs}ms`));
    });
    req.write(data);
    req.end();
  });
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

/** Minimal .env loader (same semantics as the CLI: cwd/.env, never overrides real env). */
function loadDotEnv() {
  try {
    const raw = require('node:fs').readFileSync(require('node:path').join(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* no .env — flags or exported env still work */
  }
}

async function main() {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.example) {
    console.log(JSON.stringify(buildCallbackBody({ 'tran-id': 'order-123', amount: 10 }), null, 2));
    return;
  }
  if (!args.url) {
    console.error(
      'Usage: node mock-callback.cjs --url <http(s)://host/path> [--tran-id x] [--amount 10] [--status APPROVED]',
    );
    process.exit(2);
  }
  const apiKey = args['api-key'] || process.env.PAYWAY_API_KEY;
  if (!apiKey) {
    console.error('Missing API key. Pass --api-key or set PAYWAY_API_KEY (your handler verifies with the same key).');
    process.exit(2);
  }
  const timeoutMs = Number(args.timeout ?? '') || 10000;

  let body;
  try {
    body = buildCallbackBody(args);
  } catch (e) {
    // Bad flag values (--status, ...) are usage errors: clean message, exit 2.
    console.error(e.message);
    console.error(
      'Usage: node mock-callback.cjs --url <http(s)://host/path> [--tran-id x] [--amount 10] [--status APPROVED]',
    );
    process.exit(2);
  }
  const sig = signBody(body, apiKey);
  console.log('=== SENDING MOCK CALLBACK ===');
  console.log(`url:    ${args.url}`);
  console.log(
    `status: ${body.payment_status} (${body.payment_status_code})  amount: ${body.payment_amount} ${body.payment_currency}`,
  );
  console.log(`tran_id: ${body.tran_id}  merchant_ref: ${body.merchant_ref}`);
  console.log(`signature: ${sig}`);
  try {
    const res = await postJson(args.url, body, { 'X-PAYWAY-HMAC-SHA512': sig }, { timeoutMs });
    console.log(`\n=== RESPONSE ===`);
    console.log(`HTTP ${res.statusCode}`);
    if (res.body) console.log(res.body);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('\nHandler acknowledged (2xx).');
    } else {
      // D09: a non-2xx answer is a runtime failure (exit 1 per the
      // bundled-script contract) — never a successful smoke check.
      console.log('\nHandler did NOT acknowledge with 2xx — check your handler logs.');
      process.exitCode = 1;
    }
  } catch (e) {
    console.error(`Request failed: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { STATUS_CODES, buildCallbackBody, buildConcatenated, signBody };

if (require.main === module) main();
