// One-off (2026-10-01): per-field `description` on every formdata row of the
// high-traffic requests (purchase ×2, subscription, payment-link create,
// link-card) — postman/documents/postman-authoring-standards.md §1/§3.
// Line-targeted YAML insertion: appends `description:` under each row's value
// line, skipping rows that already document one. Idempotent.
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const collDir = path.join(__dirname, '..', 'postman', 'collections', 'PayWay API — Complete Collection');

// Shared by the purchase-shaped requests (03/1, 03/5-subscription where present).
const PURCHASE = {
  req_time: 'UTC now, YYYYMMDDHHmmss (auto)',
  merchant_id: 'PayWay merchant ID (sandbox demo pre-filled)',
  tran_id: 'Unique per transaction — reusing one answers code 4 (auto-generated)',
  firstname: 'Buyer first name (sandbox demo value)',
  lastname: 'Buyer last name (sandbox demo value)',
  email: 'Buyer email (sandbox demo value)',
  phone: 'Buyer phone (sandbox demo value)',
  type: 'purchase | pre-auth (pre-auth places a hold for later completion)',
  payment_option: 'cards | abapay | abapay_khqr | abapay_khqr_deeplink | abapay_deeplink | alipay | wechat | google_pay',
  items: 'Base64 of the items JSON (auto)',
  shipping: 'Shipping fee added to the amount (0.00 if none)',
  amount: 'USD 2 decimals / KHR integer (e.g. 6.12)',
  return_url: 'Where PayWay POSTs the payment result (base64-encoded by the helper when https)',
  cancel_url: 'Browser redirect when the buyer cancels (base64-encoded by the helper when https)',
  continue_success_url: 'Post-payment browser continuation — fires with skip_success_page 0 (base64 by helper)',
  return_deeplink: 'Mobile-app deeplink that receives the payment result (base64 by helper)',
  currency: 'USD (2 decimals) | KHR (integer)',
  custom_fields: 'Base64 of a JSON object echoed back with the payment result (auto)',
  return_params: 'Optional pass-through data returned with the payment result (base64 by helper)',
  payout: 'Base64 of the split-payout array [{"acc":"...","amt":...}] — total must equal amount (auto)',
  view_type: 'Hosted-page view switch (hosted_view with payment_gate 0); leave the default unless ABA advises otherwise',
  payment_gate: '0 = return the hosted checkout HTML page (sandbox-verified); empty = gateway default routing',
  additional_params: 'Base64 JSON passed through to callbacks (auto)',
  google_pay_token: 'Google Pay payment payload (optional; online Google Pay reported unavailable — confirm with ABA)',
  skip_success_page: '0 + continue_success_url moves the buyer browser to your success URL after payment',
  lifetime: 'Checkout session lifetime in seconds (sandbox hosted sessions: abapay_khqr ~5 min, cards/deeplink ~3 min)',
  hash: 'HMAC-SHA512 over the fields listed in the request Hash order (auto)',
};

const TARGETS = [
  {
    file: '03 - Ecommerce Checkout/1. Purchase (Hosted Checkout) - purchase.request.yaml',
    map: PURCHASE,
  },
  {
    file: '03 - Ecommerce Checkout/1.1 Purchase (Hosted Checkout) - pre-auth.request.yaml',
    map: PURCHASE,
    // 1.1 lives under 06 - Pre-auth; resolved below by basename.
  },
  {
    file: '08 - Credentials on File (CoF)/7. Subscription (Scheduled Payment).request.yaml',
    map: {
      ...PURCHASE,
      ctid: 'Your stable per-customer key — the stored credential links to it after the first payment',
      token_flag: 'CITI_FLEX | CITO_FLEX — the stored-credential flag to link with this subscription',
      frequency: 'Recurring frequency: 1W | 1M | 2M',
    },
  },
  {
    file: '05 - Payment Link/Create Payment Link.request.yaml',
    map: {
      request_time: 'UTC now, YYYYMMDDHHmmss (auto)',
      merchant_id: 'PayWay merchant ID (sandbox demo pre-filled)',
      merchant_auth: 'Base64 of the RSA-encrypted JSON payload (mc_id, title, amount, currency, description, payment_limit, expired_date, return_url, merchant_ref_no, payout) — built automatically; manual fallback {{pl_merchant_auth}}',
      hash: 'HMAC-SHA512 over request_time + merchant_id + merchant_auth (auto)',
    },
  },
  {
    file: '08 - Credentials on File (CoF)/2. Link Card (Credit-Debit).request.yaml',
    map: {
      request_id: 'Unique per linking request (auto-generated) — the token outcome references it',
      request_time: 'UTC now, YYYYMMDDHHmmss (auto)',
      merchant_id: 'PayWay merchant ID (sandbox demo pre-filled)',
      ctid: 'Your stable per-customer key (e.g. customer123)',
      token_flag: 'CITI_FLEX | CITO_FLEX — profile must be enabled, else the hosted page reports error 104',
      currency: 'USD | KHR',
      callback_url: 'Where the token result (pwt) is pushed (base64-encoded by the helper when https)',
      continue_success_url: 'Browser redirect after the hosted card-entry page',
      hash: 'HMAC-SHA512 over merchant_id + request_time + ctid + callback_url + request_id + token_flag + frequency + amount + currency + continue_success_url (auto)',
    },
  },
];

// The pre-auth purchase lives in folder 06 — fix its path.
const files = TARGETS.map((t) => {
  if (t.file.startsWith('03 - Ecommerce Checkout/1.1')) {
    return path.join(collDir, '06 - Pre-auth', '1.1 Purchase (Hosted Checkout) - pre-auth.request.yaml');
  }
  return path.join(collDir, t.file);
});

function scalarToYaml(text) {
  return yaml.dump(text, { lineWidth: -1 }).trimEnd();
}

let inserted = 0;
const report = [];
TARGETS.forEach((target, i) => {
  const file = files[i];
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const out = [];
  let currentKey = null;
  let inFormdata = false;
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (/^body:/.test(line)) inFormdata = true;
    if (inFormdata && /^    - type: text$/.test(line)) {
      currentKey = (lines[idx + 1] || '').match(/^ {6}key: (.+)$/)?.[1] || null;
    }
    out.push(line);
    // After a formdata row's value line, insert the description if missing.
    const valueMatch = inFormdata && currentKey && line.match(/^ {6}value: /);
    if (valueMatch) {
      const next = lines[idx + 1] || '';
      if (!/^ {6}description:/.test(next) && target.map[currentKey]) {
        out.push(`      description: ${scalarToYaml(target.map[currentKey])}`);
        inserted++;
        report.push(`${path.basename(file)} :: ${currentKey}`);
        currentKey = null;
      }
    }
  }
  fs.writeFileSync(file, out.join('\n'));
});
console.log(`inserted ${inserted} field descriptions`);
console.log(report.join('\n'));
