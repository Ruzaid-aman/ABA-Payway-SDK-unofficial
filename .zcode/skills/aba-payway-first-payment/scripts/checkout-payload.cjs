#!/usr/bin/env node
/**
 * checkout-payload.cjs — Build the locally-signed ABA PayWay checkout payload
 * and optionally emit a ready-to-open HTML auto-post form. No network call —
 * this is the fastest path to a first payment (see aba-payway-first-payment).
 *
 * Field order and formatting mirror the SDK (src/domains/checkout.ts):
 *   - req_time: UTC YYYYMMDDHHmmss
 *   - amount:   USD → 2dp string, KHR → integer string
 *   - URLs/items/objects → Base64 (encodeBase64IfNeeded)
 *   - hash: HMAC-SHA512 Base64 over 24 preset fields (missing → '')
 *
 * Usage:
 *   node checkout-payload.cjs --tran-id order-123 --amount 10 --currency USD --return-url https://example.com/success
 *   node checkout-payload.cjs --tran-id order-124 --amount 40000 --currency KHR --html checkout.html
 *
 * Flags: --tran-id (≤20 chars [a-zA-Z0-9-], auto-generated if absent), --amount (required),
 *   --currency USD|KHR, --return-url, --cancel-url, --payment-option cards|abapay_khqr|...,
 *   --firstname --lastname --email --phone --lifetime <minutes> (min 3 — purchase lifetime is MINUTES, unlike the QR domain's seconds),
 *   --ctid --token-flag CITR_FIX --frequency 1W|1M|2M (subscription registration),
 *   --env sandbox|production (for the form action URL), --html <file> (write form), --api-key/--merchant-id or env.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');

// Live 27-field purchase order (src/domains/checkout.ts PURCHASE_HASH_FIELDS):
// ctid sits between items and shipping (the gateway signs it on the
// subscription path — SANDBOX-FINDINGS §17, 2026-09-05; the live docs' list
// omits it), token_flag + frequency are appended after skip_success_page;
// omitted fields hash as '' so plain purchases are byte-identical to the
// legacy 24-field HMAC.
const FIELD_ORDER = [
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
];
const CHECKOUT_URLS = {
  sandbox: 'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase',
  production: 'https://checkout.payway.com.kh/api/payment-gateway/v1/payments/purchase',
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

function formatAmount(amount, currency) {
  return currency === 'KHR' ? Math.round(amount).toString() : Number(amount).toFixed(2);
}

function encodeBase64IfNeeded(val) {
  if (typeof val === 'string') {
    return /^(https?:\/\/|\/\/|www\.)/.test(val) ? Buffer.from(val, 'utf8').toString('base64') : val;
  }
  return Buffer.from(JSON.stringify(val), 'utf8').toString('base64');
}

function validateTranId(id) {
  if (!id || id.length === 0) throw new Error('tran_id is required');
  if (id.length > 20) throw new Error(`tran_id must be ≤ 20 characters, received ${id.length}`);
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('tran_id may only contain letters, digits, and hyphens');
}

function buildCheckoutPayload(params) {
  validateTranId(params.tranId);
  const currency = params.currency || 'USD';
  if (!Number.isFinite(Number(params.amount)) || Number(params.amount) <= 0)
    throw new Error('amount must be a positive number');
  if (currency === 'USD' && Math.abs(Number(params.amount) * 100 - Math.round(Number(params.amount) * 100)) > 1e-9) {
    throw new Error('USD amount must have at most 2 decimal places');
  }
  if (currency === 'KHR' && !Number.isInteger(Number(params.amount))) throw new Error('KHR amount must be an integer');

  const data = {
    req_time: params.reqTime || formatRequestTime(),
    merchant_id: params.merchantId,
    tran_id: params.tranId,
    amount: formatAmount(Number(params.amount), currency),
    currency,
    type: 'purchase',
  };
  if (params.firstname) data.firstname = params.firstname;
  if (params.lastname) data.lastname = params.lastname;
  if (params.email) data.email = params.email;
  if (params.phone) data.phone = params.phone;
  if (params.paymentOption) data.payment_option = params.paymentOption;
  if (params.returnUrl) data.return_url = encodeBase64IfNeeded(params.returnUrl);
  if (params.cancelUrl) data.cancel_url = encodeBase64IfNeeded(params.cancelUrl);
  if (params.lifetime) {
    const minutes = Number(params.lifetime);
    if (!Number.isFinite(minutes) || minutes < 3)
      throw new Error('lifetime is in MINUTES (min 3 — the purchase path rejects less; the QR domain is the seconds-based one)');
    data.lifetime = String(minutes);
  }
  // Subscription registration (live docs): tokenFlag implies ctid, and
  // frequency is required iff tokenFlag is CITR_FIX. Mirrors SDK validation.
  if (params.tokenFlag) {
    if (!params.ctid) throw new Error('ctid is required when token-flag is set (subscription registration)');
    if (params.tokenFlag !== 'CITR_FIX')
      throw new Error('token-flag on the purchase path supports CITR_FIX only (other linking flags belong to cof link-account/link-card)');
    if (!params.frequency) throw new Error("frequency is required when token-flag=CITR_FIX (1W | 1M | 2M)");
    data.ctid = params.ctid;
    data.token_flag = params.tokenFlag;
    data.frequency = params.frequency;
  } else if (params.frequency) {
    throw new Error('frequency requires token-flag (subscription registration)');
  }

  const concatenated = FIELD_ORDER.map((f) => (data[f] === undefined ? '' : String(data[f]))).join('');
  const hash = crypto.createHmac('sha512', params.apiKey).update(concatenated).digest('base64');
  const payload = {};
  for (const f of FIELD_ORDER) if (data[f] !== undefined) payload[f] = data[f];
  // ctid HAS a hash position on the purchase path (after items — §17) and is
  // already included above when set.
  return { payload: { ...payload, hash }, concatenated };
}

function buildHtmlForm(payload, checkoutUrl) {
  const inputs = Object.entries(payload)
    .map(
      ([k, v]) =>
        `    <input type="hidden" name="${k}" value="${String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"/>`,
    )
    .join('\n');
  return `<!DOCTYPE html>
<html>
  <body onload="document.forms[0].submit()">
    <form action="${checkoutUrl}" method="POST">
${inputs}
      <noscript><button type="submit">Continue to PayWay</button></noscript>
    </form>
    <p>Redirecting to ABA PayWay secure checkout...</p>
  </body>
</html>
`;
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const merchantId = args['merchant-id'] || process.env.PAYWAY_MERCHANT_ID;
  const apiKey = args['api-key'] || process.env.PAYWAY_API_KEY;
  if (!merchantId || !apiKey) {
    console.error('Missing credentials. Pass --merchant-id/--api-key or set PAYWAY_MERCHANT_ID / PAYWAY_API_KEY.');
    process.exit(2);
  }
  if (args.amount === undefined) {
    console.error(
      'Usage: node checkout-payload.cjs --amount 10 [--tran-id order-123] [--currency USD] [--return-url https://...] [--html out.html]',
    );
    process.exit(2);
  }

  const env = args.env === 'production' ? 'production' : 'sandbox';
  const tranId = typeof args['tran-id'] === 'string' ? args['tran-id'] : `order-${Date.now()}`.slice(0, 20);

  let result;
  try {
    result = buildCheckoutPayload({
      tranId,
      amount: Number(args.amount),
      currency: args.currency,
      merchantId,
      apiKey,
      returnUrl: typeof args['return-url'] === 'string' ? args['return-url'] : undefined,
      cancelUrl: typeof args['cancel-url'] === 'string' ? args['cancel-url'] : undefined,
      paymentOption: typeof args['payment-option'] === 'string' ? args['payment-option'] : undefined,
      firstname: typeof args.firstname === 'string' ? args.firstname : undefined,
      lastname: typeof args.lastname === 'string' ? args.lastname : undefined,
      email: typeof args.email === 'string' ? args.email : undefined,
      phone: typeof args.phone === 'string' ? args.phone : undefined,
      lifetime: args.lifetime ? Number(args.lifetime) : undefined,
      ctid: typeof args.ctid === 'string' ? args.ctid : undefined,
      tokenFlag: typeof args['token-flag'] === 'string' ? args['token-flag'] : undefined,
      frequency: typeof args.frequency === 'string' ? args.frequency : undefined,
    });
  } catch (e) {
    console.error(`Validation error: ${e.message}`);
    process.exit(2);
  }

  console.log('=== SIGNED CHECKOUT PAYLOAD (no network call) ===');
  console.log(JSON.stringify(result.payload, null, 2));
  console.log('\nNext: POST these fields to the PayWay checkout URL, or open the HTML form.');
  console.log('The webhook callback (HMAC-verified) is the ONLY proof of payment.');

  if (typeof args.html === 'string') {
    fs.writeFileSync(args.html, buildHtmlForm(result.payload, CHECKOUT_URLS[env]));
    console.log(`\nHTML form written to: ${args.html} (action=${CHECKOUT_URLS[env]})`);
    console.log('Open it in a browser to complete a sandbox payment.');
  }
}

module.exports = {
  FIELD_ORDER,
  CHECKOUT_URLS,
  formatRequestTime,
  formatAmount,
  encodeBase64IfNeeded,
  validateTranId,
  buildCheckoutPayload,
  buildHtmlForm,
};

if (require.main === module) main();
