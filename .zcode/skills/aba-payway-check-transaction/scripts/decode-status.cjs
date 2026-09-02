#!/usr/bin/env node
/**
 * decode-status.cjs — Decode an ABA PayWay callback or API response into a
 * human-readable verdict.
 *
 * Accepts a callback JSON, a check-transaction response, a
 * get-transactions-by-mc-ref response, or a refund/error response via
 * --body, --body-file, or stdin.
 *
 * Status-code maps mirror src/constants.ts (sandbox-verified):
 *   payment_status_code: 0 APPROVED / PRE_AUTH, 2 PENDING, 3 DECLINED,
 *                        4 REFUNDED, 7 CANCELLED
 *   gateway status.code: '1' wrong hash, '15' invalid merchant, 'PTL02' invalid
 *                        hash (refund), 'PTL37' refund exceeds original, ...
 *
 * Usage:
 *   node decode-status.cjs --body '{"payment_status_code":0,...}'
 *   node decode-status.cjs --body-file webhook-payload.json
 *   cat response.json | node decode-status.cjs
 */
const STATUS_LABELS = {
  0: 'APPROVED (or PRE_AUTH — distinguish via payment_status string)',
  2: 'PENDING — awaiting customer action',
  3: 'DECLINED — rejected by issuer/gateway',
  4: 'REFUNDED — fully refunded',
  7: 'CANCELLED — cancelled or expired',
};

const TERMINAL = new Set(['APPROVED', 'DECLINED', 'CANCELLED', 'REFUNDED']);

const GATEWAY_CODE_HINTS = {
  1: 'Wrong Hash — HMAC mismatch: check API key, field ordering, base64 vs hex.',
  4: 'Invalid Data — server validation failed; check errors map in raw body.',
  5: 'Transaction Not Found — verify tran_id.',
  6: 'tran_id not found (check-transaction).',
  7: 'Invalid Request Data — missing/malformed field.',
  15: 'Invalid Merchant — merchant_id not recognized in this environment.',
  16: 'Invalid Amount — use USD 2dp / KHR integer formatting.',
  17: "Invalid Currency — must be 'USD' or 'KHR'.",
  22: 'Expired Transaction — create a new one.',
  23: 'Transaction Not Found (may have been closed).',
  37: 'Payout Whitelist — call addBeneficiary() first.',
  49: 'Invalid Request — for transaction-list dates use "YYYY-MM-DD HH:mm:ss".',
  96: 'Payee/Merchant Data — beneficiary payee unknown or payment-link id invalid.',
  PTL02: 'Invalid hash (refund endpoint).',
  PTL04: 'Parameter validation — refund_amount must be ≥ 0.01 USD / ≥ 1 KHR.',
  PTL36: 'Refund target not found — original transaction does not exist.',
  PTL37: 'Refund amount exceeds the original transaction amount.',
  PTL57: 'Unable to refund.',
  PTL58: 'Refund failed.',
  PTL59: 'Unable to complete pre-auth — status invalid for capture.',
  PTL62: 'Merchant information invalid (e.g. lacks permission).',
  PTL168: 'Concurrent request rejected.',
  PTL170: 'Unable to cancel pre-auth — status invalid.',
  PTL181: 'Insufficient available balance.',
};

function decodeStatus(body) {
  const lines = [];
  const pick = (obj, keys) => keys.map((k) => obj?.[k]).find((v) => v !== undefined);

  const data = Array.isArray(body?.data)
    ? body.data[0]
    : body?.data && typeof body.data === 'object'
      ? body.data
      : body;
  const statusCode = pick(data, ['payment_status_code']);
  const statusStr = pick(data, ['payment_status']);
  const gateway = body?.status && typeof body.status === 'object' ? body.status : undefined;

  lines.push('=== STATUS DECODE ===');
  if (statusCode !== undefined || statusStr !== undefined) {
    const label =
      STATUS_LABELS[statusCode] || (statusCode === undefined ? '(code absent)' : `UNKNOWN code ${statusCode}`);
    lines.push(`payment_status_code: ${statusCode}  →  ${label}`);
    if (statusStr)
      lines.push(
        `payment_status:      ${statusStr}${TERMINAL.has(String(statusStr).toUpperCase()) ? '  [TERMINAL — safe to finalize]' : '  [NON-TERMINAL — keep polling / await callback]'}`,
      );
    if (statusCode === 0 && String(statusStr).toUpperCase() === 'PRE_AUTH') {
      lines.push('note: PRE_AUTH holds funds — capture via pre-auth-completion or release via cancellation.');
    }
  }
  if (gateway) {
    const code = String(gateway.code);
    lines.push(`gateway status.code: ${code} (${gateway.message || ''})`);
    if (GATEWAY_CODE_HINTS[code]) lines.push(`hint: ${GATEWAY_CODE_HINTS[code]}`);
    if (code === '00') lines.push('verdict: request accepted (code 00 = Success).');
  }
  if (!gateway && statusCode === undefined && statusStr === undefined) {
    lines.push('No recognizable status fields found — is this a PayWay callback/API response?');
  }

  lines.push('\n=== KEY FIELDS ===');
  for (const k of [
    'transaction_id',
    'tran_id',
    'merchant_ref',
    'payment_amount',
    'payment_currency',
    'original_amount',
    'original_currency',
    'apv',
    'bank_ref',
    'payer_account',
    'payer_name',
    'transaction_date',
    'refund_amount',
  ]) {
    const v = data?.[k];
    if (v !== undefined) lines.push(`  ${k}: ${v}`);
  }
  const customer = data && typeof data.customer === 'object' ? data.customer : null;
  if (customer) lines.push(`  customer: ${customer.customer_name || ''} (id=${customer.customer_id || ''})`);
  return lines.join('\n');
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let raw = args.body;
  if (!raw && args['body-file']) raw = require('node:fs').readFileSync(args['body-file'], 'utf8');
  if (!raw) {
    raw = await new Promise((resolve) => {
      if (process.stdin.isTTY) return resolve('');
      let s = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (c) => (s += c));
      process.stdin.on('end', () => resolve(s));
    });
  }
  if (!raw?.trim()) {
    console.error("Usage: decode-status.cjs --body '<json>' | --body-file <path> | stdin");
    process.exit(2);
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch (e) {
    console.error(`Not valid JSON: ${e.message}`);
    process.exit(2);
  }
  console.log(decodeStatus(body));
}

module.exports = { STATUS_LABELS, GATEWAY_CODE_HINTS, TERMINAL, decodeStatus };

if (require.main === module) main();
