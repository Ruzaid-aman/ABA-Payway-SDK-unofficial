#!/usr/bin/env node
/**
 * reconcile.cjs — Cron-ready reconciliation against get-transactions-by-mc-ref.
 *
 * The fallback job from the Customer Module guide (§10): because PayWay does
 * NOT retry webhooks, poll this API periodically, dedupe by transaction_id,
 * and emit only NEW transactions since the last run.
 *
 * Correctness model (audit F03, 2026-09-07):
 *   - DEDUP BY TRANSACTION ID is the primary "already seen" mechanism —
 *     durable across restarts, immune to equal timestamps.
 *   - The timestamp watermark only BOUNDS THE LOOK-BACK WINDOW (it is
 *     inclusive, and re-checking an overlap is harmless because IDs dedupe).
 *     A new transaction with transaction_date EQUAL to the watermark is still
 *     emitted; delayed/out-of-order arrivals are caught on later runs.
 *   - The checkpoint (watermark + seen IDs) is ONE file written atomically
 *     (temp + rename) — a crash can never leave watermark and seen-set
 *     disagreeing.
 *   - Saturation: the endpoint returns at most 50 rows and has NO pagination
 *     parameter. When a response holds 50 rows, history may be truncated —
 *     the run reports `possibleGap: true` and NEVER claims complete
 *     reconciliation.
 *
 * Usage:
 *   node reconcile.cjs --merchant-ref "dt-one-8989" --env sandbox
 *   node reconcile.cjs --merchant-ref "dt-one-8989" --watch --interval 300 --csv payments.csv
 *   node reconcile.cjs --merchant-ref "INV-123" --json out.json --state .reconcile-state.json
 *
 * Flags:
 *   --merchant-ref <id>   Customer ID / invoice ref to query (required)
 *   --env sandbox|production   (default: sandbox)
 *   --watch               Run forever every --interval seconds (default 300 = 5 min)
 *   --interval <seconds>  Watch interval; PayWay rate limit is 10 req/min (min 10s)
 *   --state <file>        Checkpoint file: newest date seen + seen IDs (default ./.payway-reconcile-<ref>.json)
 *   --csv <file>          Append new transactions to CSV
 *   --json <file>         Write full latest response to JSON file
 *   --api-key / --merchant-id   Or PAYWAY_API_KEY / PAYWAY_MERCHANT_ID env
 *   --dry-run             Print request that would be sent, do not call the API
 *
 * Exit codes: 0 ok (even when no new rows; a possible gap exits 0 too — check
 * the JSON `possibleGap` field / GAP stderr line), 1 API/network error, 2 usage error.
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
/** Documented maximum number of matches per response (OpenAPI). */
const MAX_ROWS_PER_RESPONSE = 50;
/** Cap on the persisted seen-ID set (bound memory/disk). */
const SEEN_ID_CAP = 5000;

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

/**
 * Whether a row is a candidate for emission. The watermark is INCLUSIVE: a
 * transaction with transaction_date equal to the watermark is a candidate
 * (its ID dedupes it if already seen; equal-time DIFFERENT-ID rows must NOT
 * be dropped — audit F03's core defect). Older-than-watermark rows are also
 * admitted when their ID is unseen: delayed/out-of-order arrivals must be
 * caught on later runs.
 */
function isCandidate(_txn, watermark) {
  if (!watermark) return true;
  return true; // ID-based dedupe below is the sole "seen" gate; the watermark only advances the checkpoint.
}

/**
 * Atomic checkpoint write: temp file + rename in the same directory, so a
 * crash can never leave a torn state (watermark and seen-set always agree).
 */
function saveCheckpoint(file, state) {
  const resolved = path.resolve(file);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const tmp = `${resolved}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, resolved);
}

/**
 * Load the checkpoint. Legacy layouts are MIGRATED in memory (and persisted on
 * the next saveCheckpoint) before processing — the pre-F03 script stored the
 * seen-ID set in a SIBLING file next to the timestamp file, and loading only
 * the timestamp file re-emitted every previously seen transaction the moment
 * the inclusive-watermark policy made ID dedupe the sole gate (second-pass
 * audit R6). Sibling shapes covered: `<state>.seen.json`,
 * `<state>-seen.json`, and `<state-without-.json>.seen.json` (e.g.
 * `legacy.seen.json` next to `legacy.json`). A crash/restart is safe either
 * way: both sources are read before any row is filtered.
 */
function loadCheckpoint(file) {
  const readIds = (idFile) => {
    try {
      const parsed = JSON.parse(fs.readFileSync(idFile, 'utf8'));
      const ids = parsed?.transaction_ids ?? parsed?.seen ?? parsed;
      return Array.isArray(ids) ? ids.map(String) : [];
    } catch {
      return [];
    }
  };
  const legacyIds = () => {
    const candidates = [`${file}.seen.json`, `${file}-seen.json`, `${file.replace(/\.json$/, '')}.seen.json`];
    for (const candidate of candidates) {
      const ids = readIds(candidate);
      if (ids.length > 0) return ids;
    }
    return [];
  };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ids = Array.isArray(parsed?.transaction_ids) ? parsed.transaction_ids.map(String) : legacyIds();
    return {
      last_transaction_date: typeof parsed.last_transaction_date === 'string' ? parsed.last_transaction_date : null,
      transaction_ids: ids,
    };
  } catch {
    // No modern checkpoint at all: still try the legacy timestamp file +
    // sibling seen files — a bare legacy timestamp file must not silently
    // produce an EMPTY id set.
    let watermark = null;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (typeof parsed?.last_transaction_date === 'string') watermark = parsed.last_transaction_date;
    } catch {
      /* not even the timestamp file — fresh start */
    }
    const ids = legacyIds();
    if (watermark === null && ids.length === 0) return { last_transaction_date: null, transaction_ids: [] };
    return { last_transaction_date: watermark, transaction_ids: ids };
  }
}

/**
 * Advance the checkpoint from a batch of rows: newest date + merged seen IDs
 * (capped). Returns the new state WITHOUT writing — the caller persists it
 * only after the batch's side effects (CSV append) succeeded, keeping the
 * checkpoint crash-consistent with the output.
 */
function buildCheckpoint(previous, txns) {
  let newest = previous.last_transaction_date || '';
  const seen = new Set(previous.transaction_ids);
  for (const t of txns) {
    const date = String(t.transaction_date || '');
    if (date > newest) newest = date;
    seen.add(String(t.transaction_id));
  }
  const all = Array.from(seen);
  const capped = all.length > SEEN_ID_CAP ? all.slice(all.length - SEEN_ID_CAP) : all;
  return { last_transaction_date: newest || null, transaction_ids: capped };
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
  const { merchantRef, merchantId, apiKey, baseUrl, stateFile, csvFile, jsonFile, dryRun } = opts;
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
  const previous = loadCheckpoint(stateFile);
  const seen = new Set(previous.transaction_ids);
  // Durable ID dedupe is the ONLY "already emitted" gate (F03): equal-time
  // new IDs and delayed arrivals are emitted; repeats are suppressed.
  const fresh = all.filter((t) => isCandidate(t, previous.last_transaction_date) && !seen.has(String(t.transaction_id)));
  // Saturation signal: 50 rows = the endpoint cap; older history may exist
  // beyond this response and there is NO pagination parameter to reach it.
  const possibleGap = all.length >= MAX_ROWS_PER_RESPONSE;

  console.log(
    `[${new Date().toISOString()}] merchant_ref=${merchantRef} fetched=${all.length} new=${fresh.length} watermark=${previous.last_transaction_date || '(none)'}`,
  );
  for (const t of fresh) {
    console.log(
      `  NEW ${t.transaction_date}  ${t.transaction_id}  ${t.payment_status}  ${t.payment_amount} ${t.payment_currency}  ref=${t.merchant_ref}`,
    );
  }
  if (possibleGap) {
    console.error(
      `GAP: response returned ${all.length} rows (endpoint cap ${MAX_ROWS_PER_RESPONSE}, no pagination parameter) — history may be truncated; do NOT treat this run as complete reconciliation. Cross-check against your own records.`,
    );
  }

  if (csvFile && fresh.length > 0) {
    const writeHeader = !fs.existsSync(csvFile);
    fs.mkdirSync(path.dirname(path.resolve(csvFile)), { recursive: true });
    if (writeHeader) fs.appendFileSync(csvFile, `${CSV_COLUMNS.join(',')}\n`);
    fs.appendFileSync(csvFile, `${fresh.map(toCsvRow).join('\n')}\n`);
  }

  // Single atomic checkpoint AFTER the batch's side effects.
  saveCheckpoint(stateFile, buildCheckpoint(previous, all));
  return 0;
}

/** Minimal .env loader (same semantics as the CLI: cwd/.env, never overrides real env). */
function loadDotEnv() {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
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
  const stateFile = args.state || args.watermark || `.payway-reconcile-${merchantRef}.json`;

  const opts = {
    merchantRef,
    merchantId,
    apiKey,
    baseUrl,
    stateFile,
    csvFile: typeof args.csv === 'string' ? args.csv : undefined,
    jsonFile: typeof args.json === 'string' ? args.json : undefined,
    dryRun: Boolean(args['dry-run']),
  };

  if (!args.watch) {
    try {
      process.exit(await runOnce(opts));
    } catch (e) {
      // One-shot runtime/API failure (network, non-JSON body, unhandled):
      // clean message + exit 1 — the watch loop's catch semantics, without the loop.
      console.error(`reconcile failed: ${e.message}`);
      process.exit(1);
    }
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
  MAX_ROWS_PER_RESPONSE,
  SEEN_ID_CAP,
  formatRequestTime,
  signRequest,
  isCandidate,
  loadCheckpoint,
  saveCheckpoint,
  buildCheckpoint,
  toCsvRow,
  CSV_COLUMNS,
};

if (require.main === module) main();
