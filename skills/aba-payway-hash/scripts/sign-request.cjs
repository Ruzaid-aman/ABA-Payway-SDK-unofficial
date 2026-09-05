#!/usr/bin/env node
/**
 * sign-request.cjs — Build a correctly-signed ABA PayWay request payload.
 *
 * Replicates the SDK's signing (src/auth.ts generateHmac):
 *   HMAC-SHA512 over the preset's field values concatenated in exact order,
 *   empty string for missing fields, Base64 digest, keyed by the API key.
 *
 * Usage:
 *   node sign-request.cjs --preset get-mc-ref --merchant-ref "dt-one-8989"
 *   node sign-request.cjs --preset check-transaction --tran-id "order-123"
 *   node sign-request.cjs --preset checkout --tran-id "order-123" --amount 10 --currency USD \
 *        --return-url https://example.com/success
 *   node sign-request.cjs --preset checkout --tran-id order-1 --amount 9.99 --currency USD \
 *        --ctid customer123 --token-flag CITR_FIX --frequency 1M   (subscription)
 *   node sign-request.cjs --fields req_time,merchant_id,merchant_ref \
 *        --data '{"req_time":"20250213084236","merchant_id":"ec000002","merchant_ref":"17394277693"}'
 *
 * Credentials: --merchant-id / --api-key flags or PAYWAY_MERCHANT_ID / PAYWAY_API_KEY env.
 *
 * Presets (field order mirrors src/domains/checkout.ts PURCHASE_HASH_FIELDS):
 *   checkout           req_time..frequency (26 fields, purchase endpoint — live
 *                      order adds token_flag + frequency after skip_success_page;
 *                      omitted fields hash as '' so plain purchases stay identical)
 *   check-transaction  req_time, merchant_id, tran_id
 *   get-mc-ref         req_time, merchant_id, merchant_ref   (get-transactions-by-mc-ref)
 *   exchange-rate      req_time, merchant_id
 */
const crypto = require('node:crypto');

const PRESETS = {
  // Live 27-field purchase order (SANDBOX-FINDINGS §17, 2026-09-05): the
  // gateway signs ctid between items and shipping on the subscription path;
  // the live docs' 26-field list omits it and is rejected with Wrong Hash.
  checkout: [
    'req_time',
    'merchant_id',
    'tran_id',
    'amount',
    'items',
    'ctid',
    'shipping',
    'firstname',
    'lastname',
    'email',
    'phone',
    'type',
    'payment_option',
    'return_url',
    'cancel_url',
    'continue_success_url',
    'return_deeplink',
    'currency',
    'custom_fields',
    'return_params',
    'payout',
    'lifetime',
    'additional_params',
    'google_pay_token',
    'skip_success_page',
    'token_flag',
    'frequency',
  ],
  'check-transaction': ['req_time', 'merchant_id', 'tran_id'],
  'get-mc-ref': ['req_time', 'merchant_id', 'merchant_ref'],
  'exchange-rate': ['req_time', 'merchant_id'],
};

function generateHmac(payload, fieldList, apiKey, encoding = 'base64') {
  const concatenated = fieldList
    .map((f) => {
      const v = payload[f];
      return v === undefined || v === null ? '' : String(v);
    })
    .join('');
  return { concatenated, hash: crypto.createHmac('sha512', apiKey).update(concatenated).digest(encoding) };
}

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

function formatAmount(amount, currency) {
  return currency === 'KHR' ? Math.round(amount).toString() : Number(amount).toFixed(2);
}

function encodeBase64IfNeeded(val) {
  if (typeof val === 'string') {
    return /^(https?:\/\/|\/\/|www\.)/.test(val) ? Buffer.from(val, 'utf8').toString('base64') : val;
  }
  return Buffer.from(JSON.stringify(val), 'utf8').toString('base64');
}

function buildSignedPayload(preset, data, apiKey) {
  const fields = PRESETS[preset];
  if (!fields) throw new Error(`Unknown preset "${preset}". Valid: ${Object.keys(PRESETS).join(', ')}`);
  const payload = {};
  for (const f of fields) {
    if (data[f] !== undefined && data[f] !== null) payload[f] = data[f];
  }
  const { concatenated, hash } = generateHmac(payload, fields, apiKey);
  // ctid HAS a hash position on the purchase path (after items, §17) and is
  // already covered by the checkout preset above when set.
  if (data.ctid !== undefined && data.ctid !== null && !fields.includes('ctid')) payload.ctid = data.ctid;
  return { payload: { ...payload, hash }, concatenated, fields, hash };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const preset = args.preset || 'get-mc-ref';
  const merchantId = args['merchant-id'] || process.env.PAYWAY_MERCHANT_ID;
  const apiKey = args['api-key'] || process.env.PAYWAY_API_KEY;
  if (!merchantId || !apiKey) {
    console.error('Missing credentials. Pass --merchant-id/--api-key or set PAYWAY_MERCHANT_ID / PAYWAY_API_KEY.');
    process.exit(2);
  }

  let data = {};
  if (args.data) {
    try {
      data = JSON.parse(args.data);
    } catch (e) {
      console.error(`--data is not valid JSON: ${e.message}`);
      process.exit(2);
    }
  }
  if (args.fields) {
    const custom = String(args.fields)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (args.preset) {
      console.error('Use --fields alone or --preset alone, not both.');
      process.exit(2);
    }
    PRESETS.__custom = custom;
    args.preset = '__custom';
  }

  data.req_time = args['req-time'] || data.req_time || formatRequestTime();
  data.merchant_id = merchantId;
  if (args['tran-id']) data.tran_id = args['tran-id'];
  if (args['merchant-ref']) data.merchant_ref = args['merchant-ref'];
  if (args.amount !== undefined) {
    const currency = args.currency || 'USD';
    data.amount = formatAmount(Number(args.amount), currency);
    data.currency = currency;
  }
  for (const [flag, field] of [
    ['return-url', 'return_url'],
    ['cancel-url', 'cancel_url'],
    ['payment-option', 'payment_option'],
    ['firstname', 'firstname'],
    ['lastname', 'lastname'],
    ['email', 'email'],
    ['phone', 'phone'],
    ['ctid', 'ctid'],
    ['token-flag', 'token_flag'],
    ['frequency', 'frequency'],
  ]) {
    if (args[flag] !== undefined) data[field] = field.endsWith('_url') ? encodeBase64IfNeeded(args[flag]) : args[flag];
  }

  const { payload, concatenated, fields, hash } = buildSignedPayload(args.preset, data, apiKey);
  console.log('=== SIGNED PAYLOAD ===');
  console.log(JSON.stringify(payload, null, 2));
  console.log('\n=== SIGNATURE DETAIL ===');
  console.log(`preset:      ${args.preset}`);
  console.log(`field order: ${fields.join(' | ')}`);
  if (args['show-string']) console.log(`concat:      "${concatenated}"`);
  console.log(`hash:        ${hash}`);
  if (preset === 'checkout') {
    console.log('\nNext step: POST this JSON to /api/payment-gateway/v1/payments/purchase, or render an');
    console.log('HTML form with these fields to https://checkout.payway.com.kh (see checkout-payload.cjs).');
  }
}

module.exports = { PRESETS, generateHmac, formatRequestTime, formatAmount, encodeBase64IfNeeded, buildSignedPayload };

if (require.main === module) main();
