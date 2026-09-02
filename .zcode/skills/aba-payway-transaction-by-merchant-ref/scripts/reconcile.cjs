#!/usr/bin/env node
/**
 * reconcile.cjs — Cron-ready reconciliation against get-transactions-by-mc-ref.
 *
 * The fallback job from the Customer Module guide (§10): because PayWay does
 * NOT retry webhooks, poll this API periodically, dedupe by transaction_id,
 * and emit only NEW transactions since the last run (watermark file).
 *
 * Usage:
 *   node reconcile.cjs --merchant-ref "dt-one-8989" --env sandbox
 *   node reconcile.cjs --merchant-ref "dt-one-8989" --watch --interval 300 --csv payments.csv
 *   node reconcile.cjs --merchant-ref "INV-123" --json out.json --watermark .reconcile-state.json
 *
 * Flags:
 *   --merchant-ref <id>   Customer ID / invoice ref to query (required)
 *   --env sandbox|production   (default: sandbox)
 *   --watch               Run forever every --interval seconds (default 300 = 5 min)
 *   --interval <seconds>  Watch interval; PayWay rate limit is 10 req/min (min 10s)
 *   --watermark <file>    State file storing newest transaction_date seen (default ./.payway-reconcile-<ref>.json)
 *   --csv <file>          Append new transactions to CSV
 *   --json <file>         Write full latest response to JSON file
 *   --api-key / --merchant-id   Or PAYWAY_API_KEY / PAYWAY_MERCHANT_ID env
 *   --dry-run             Print request that would be sent, do not call the API
 *
 * Exit codes: 0 ok (even when no new rows), 1 API/network error, 2 usage error.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');

const ENDPOINT = '/api/payment-gateway/v1/payments/get-transactions-by-mc-ref';
const BASE_URLS = {
  sandbox: 'https://checkout-sandbox.payway.com.kh',
  production: 'https://checkout.payway.com.kh',
};

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

function signRequest(reqTime, merchantId, merchantRef, apiKey) {
  const concatenated = `${reqTime}${merchantId}${merchantRef}`;
  return crypto.createHmac('sha512', apiKey).update(concatenated).digest('base64');
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        timeout: 15000,
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, json: JSON.parse(raw) });
          } catch {
            reject(new Error(`HTTP ${res.statusCode} with non-JSON body: ${raw.slice(0, 200)}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout after 15s')));
    req.write(data);
    req.end();
  });
}

/** transaction_date format: "YYYY-MM-DD HH:mm:ss" (string compare works lexicographically) */
function isNewerThan(txn, watermark) {
  if (!watermark) return true;
  return String(txn.transaction_date || '') > watermark;
}

function loadWatermark(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).last_transaction_date || null;
  } catch {
    return null;
  }
}

function saveWatermark(file, txns) {
  const newest = txns.reduce((m, t) => (String(t.transaction_date || '') > m ? String(t.transaction_date) : m), '');
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ last_transaction_date: newest, updated_at: new Date().toISOString() }, null, 2),
  );
  return newest;
}

const CSV_COLUMNS = [
  'transaction_id',
  'transaction_date',
  'merchant_ref',
  'payment_status',
  'payment_status_code',
  'payment_amount',
  'payment_currency',
  'original_amount',
  'original_currency',
  'payment_type',
  'apv',
  'bank_ref',
  'payer_account',
  'bank_name',
  'refund_amount',
];

function toCsvRow(t) {
  return CSV_COLUMNS.map((c) => {
    const v = t[c] === undefined || t[c] === null ? '' : String(t[c]);
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',');
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

async function runOnce(opts) {
  const { merchantRef, merchantId, apiKey, baseUrl, watermarkFile, csvFile, jsonFile, dryRun } = opts;
  const reqTime = formatRequestTime();
  const hash = signRequest(reqTime, merchantId, merchantRef, apiKey);
  const body = { req_time: reqTime, merchant_id: merchantId, merchant_ref: merchantRef, hash };

  if (dryRun) {
    console.log('=== DRY RUN (no network call) ===');
    console.log(`POST ${baseUrl}${ENDPOINT}`);
    console.log(JSON.stringify({ ...body, hash: `${hash.slice(0, 12)}...` }, null, 2));
    return 0;
  }

  const res = await postJson(`${baseUrl}${ENDPOINT}`, body);
  if (jsonFile) fs.writeFileSync(jsonFile, JSON.stringify(res.json, null, 2));

  const status = res.json?.status;
  if (status?.code !== '00') {
    console.error(`API error: code=${status?.code} message=${status?.message}`);
    return 1;
  }

  const all = Array.isArray(res.json.data) ? res.json.data : [];
  const watermark = loadWatermark(watermarkFile);
  const seen = loadSeen(watermarkFile);
  const fresh = all.filter((t) => isNewerThan(t, watermark) && !seen.has(String(t.transaction_id)));

  console.log(
    `[${new Date().toISOString()}] merchant_ref=${merchantRef} fetched=${all.length} new=${fresh.length} watermark=${watermark || '(none)'}`,
  );
  for (const t of fresh) {
    console.log(
      `  NEW ${t.transaction_date}  ${t.transaction_id}  ${t.payment_status}  ${t.payment_amount} ${t.payment_currency}  ref=${t.merchant_ref}`,
    );
  }

  if (csvFile) {
    const writeHeader = !fs.existsSync(csvFile);
    if (fresh.length > 0) {
      fs.mkdirSync(path.dirname(path.resolve(csvFile)), { recursive: true });
      if (writeHeader) fs.appendFileSync(csvFile, `${CSV_COLUMNS.join(',')}\n`);
      fs.appendFileSync(csvFile, `${fresh.map(toCsvRow).join('\n')}\n`);
    }
  }

  saveWatermark(watermarkFile, all);
  saveSeen(watermarkFile, all);
  return 0;
}

function stateFileFor(file) {
  return `${file.replace(/\.json$/, '')}.seen.json`;
}
function loadSeen(file) {
  try {
    return new Set(JSON.parse(fs.readFileSync(stateFileFor(file), 'utf8')).transaction_ids || []);
  } catch {
    return new Set();
  }
}
function saveSeen(file, txns) {
  const seen = loadSeen(file);
  for (const t of txns) seen.add(String(t.transaction_id));
  const capped = Array.from(seen).slice(-5000); // bound memory/disk
  fs.writeFileSync(stateFileFor(file), JSON.stringify({ transaction_ids: capped }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const merchantRef = args['merchant-ref'] || args['customer-id'];
  if (!merchantRef) {
    console.error(
      'Usage: node reconcile.cjs --merchant-ref <id> [--env sandbox] [--watch] [--interval 300] [--csv out.csv]',
    );
    process.exit(2);
  }
  const merchantId = args['merchant-id'] || process.env.PAYWAY_MERCHANT_ID;
  const apiKey = args['api-key'] || process.env.PAYWAY_API_KEY;
  if (!merchantId || !apiKey) {
    console.error('Missing credentials. Pass --merchant-id/--api-key or set PAYWAY_MERCHANT_ID / PAYWAY_API_KEY.');
    process.exit(2);
  }
  const env = args.env === 'production' ? 'production' : 'sandbox';
  const baseUrl = args['base-url'] || BASE_URLS[env];
  const interval = Math.max(10, Number(args.interval || 300));
  const watermarkFile = args.watermark || `.payway-reconcile-${merchantRef}.json`;

  const opts = {
    merchantRef,
    merchantId,
    apiKey,
    baseUrl,
    watermarkFile,
    csvFile: typeof args.csv === 'string' ? args.csv : undefined,
    jsonFile: typeof args.json === 'string' ? args.json : undefined,
    dryRun: Boolean(args['dry-run']),
  };

  if (!args.watch) {
    process.exit(await runOnce(opts));
  }

  console.log(`Watching ${baseUrl} every ${interval}s for merchant_ref=${merchantRef}. Ctrl+C to stop.`);
  while (true) {
    try {
      await runOnce(opts);
    } catch (e) {
      console.error(`[${new Date().toISOString()}] poll failed: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, interval * 1000));
  }
}

module.exports = {
  ENDPOINT,
  BASE_URLS,
  formatRequestTime,
  signRequest,
  isNewerThan,
  loadWatermark,
  saveWatermark,
  toCsvRow,
  CSV_COLUMNS,
};

if (require.main === module) main();
