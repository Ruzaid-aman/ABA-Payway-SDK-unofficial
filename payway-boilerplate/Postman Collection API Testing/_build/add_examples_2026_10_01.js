// One-off (2026-10-01): raise saved-example coverage to every API/flow request
// (41/41), per postman/documents/postman-authoring-standards.md §2. New entries
// mirror live-verified shapes already in examples.json; error shapes come from
// postman/documents/error-codes.json families (messages are close paraphrases
// where not live-captured — see examples.json _meta).
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, 'examples.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const ex = data.examples;

const clone = (key, i) => JSON.parse(JSON.stringify(ex[key][i]));
const K = {
  purchase: '03 - Ecommerce Checkout/1. Purchase (Hosted Checkout) - purchase.request.yaml',
  txnDetail: '03 - Ecommerce Checkout/2. Get Transaction Details.request.yaml',
  check: '03 - Ecommerce Checkout/3. Check Transaction (fast, recent).request.yaml',
  refund: '03 - Ecommerce Checkout/5. Refund - RSA merchant_auth.request.yaml',
  qr: '04 - ABA QR API/Generate QR.request.yaml',
  preauth: '06 - Pre-auth/1. Complete Pre-auth.request.yaml',
  linkAccount: '08 - Credentials on File (CoF)/1. Link Account (ABA Account).request.yaml',
  tokenDetails: '08 - Credentials on File (CoF)/3. Get Token Details.request.yaml',
  payToken: '08 - Credentials on File (CoF)/4. Payment (Using Token).request.yaml',
};

const add = (key, entry) => {
  if (!ex[key]) ex[key] = [];
  ex[key].push(entry);
};

// 06 - Pre-auth/1.1 Purchase (Hosted Checkout) - pre-auth: same endpoint/page as the plain purchase.
const preauthPurchase = clone(K.purchase, 0);
preauthPurchase.description =
  'Same hosted page as the plain purchase — success is NOT JSON (HTTP 200 text/html). This run carries the pre-auth type: paying places a hold on the card (default capture window 30 days; auto-release has NO webhook). Complete it with 1. Complete Pre-auth or 2. Complete Pre-auth with Payout; the Visualize tab renders the form-POST launcher.';
add('06 - Pre-auth/1.1 Purchase (Hosted Checkout) - pre-auth.request.yaml', preauthPurchase);

// 06 - Pre-auth/2. Complete Pre-auth with Payout: same endpoint/envelope as plain completion.
add('06 - Pre-auth/2. Complete Pre-auth with Payout.request.yaml', {
  name: 'Success — funds captured + split (code 00)',
  code: 200,
  status: 'OK',
  language: 'json',
  description:
    'Same envelope as the plain completion. The `payout` array inside the RSA payload must total the completed amount; splits settle immediately — there is NO standard refund after a payout, so verify `{{payout_json}}` before sending.',
  body: '{\n  "status": {\n    "code": "00",\n    "message": "Success."\n  }\n}',
});
const preauthPayoutErr = clone(K.preauth, 1);
preauthPayoutErr.description =
  '(observed on the plain completion) The transaction is not capturable or the completion amount is wrong — with a payout split, also check that the split total equals the completed amount.';
add('06 - Pre-auth/2. Complete Pre-auth with Payout.request.yaml', preauthPayoutErr);

// 07 - Payout/3. Update Payser Status - RSA: BeneficiaryResponse per the OpenAPI spec.
add('07 - Payout/3. Update Payser Status - RSA.request.yaml', {
  name: 'Success — whitelist status updated (code 00)',
  code: 200,
  status: 'OK',
  language: 'json',
  description:
    'Flips `{{whitelist_payee}}` between enable/disable. Disabled payees reject payouts with code 37 until re-enabled. The test script accepts numeric `0` or string `"00"` — normalize both (same convention as the payout endpoint).',
  body: '{\n  "status": {\n    "code": "00",\n    "message": "Success."\n  }\n}',
});
add('07 - Payout/3. Update Payser Status - RSA.request.yaml', {
  name: 'Unknown payee (code 96)',
  code: 200,
  status: 'OK',
  language: 'json',
  description:
    '(paraphrase of registry 96 — payee/merchant data) Add the payee first (request 2 in this folder) before flipping its status.',
  body: '{\n  "status": {\n    "code": 96,\n    "message": "Payee is not in whitelist."\n  }\n}',
});

// 08 - CoF/5. Renew Token: RenewTokenResponse per the OpenAPI spec (status + optional new_token).
add('08 - Credentials on File (CoF)/5. Renew Token (ABA account).request.yaml', {
  name: 'Success — token renewed +90 days (code 00)',
  code: 200,
  status: 'OK',
  language: 'json',
  description:
    'Spec adds `new_token` — store it if the gateway returns one; the linked account/card is unchanged. Account tokens only (card tokens are not renewable); the ~90-day window restarts from today.',
  body: '{\n  "status": {\n    "code": "00",\n    "message": "Success."\n  },\n  "new_token": "b6138a89f26e45c7a0d94f31e07…"\n}',
});
add('08 - Credentials on File (CoF)/5. Renew Token (ABA account).request.yaml', {
  name: 'Invalid or expired token (code 105)',
  code: 200,
  status: 'OK',
  language: 'json',
  description:
    '(registry 105, observed on Payment Using Token) The token in `{{pwt}}` is unknown to this merchant — re-link (B1 / request 1 in this folder) instead of renewing.',
  body: '{\n  "status": {\n    "code": 105,\n    "message": "Invalid pwt or ctid."\n  }\n}',
});

// 08 - CoF/6. Remove Token: RemoveTokenResponse per the OpenAPI spec.
add('08 - Credentials on File (CoF)/6. Remove Token (irreversible).request.yaml', {
  name: 'Success — token removed (code 00)',
  code: 200,
  status: 'OK',
  language: 'json',
  description:
    'Irreversible: the token can no longer pay or renew, and the test script clears `{{pwt}}`. A Get Token Details call afterwards answers code 09 (Data not found).',
  body: '{\n  "status": {\n    "code": "00",\n    "message": "Success."\n  }\n}',
});
add('08 - Credentials on File (CoF)/6. Remove Token (irreversible).request.yaml', {
  name: 'Token not found (code 09)',
  code: 200,
  status: 'OK',
  language: 'json',
  description:
    '(observed envelope on Get Token Details) Nothing to remove — `{{pwt}}` was already removed or never linked.',
  body: '{\n  "status": {\n    "code": "09",\n    "message": "Data not found"\n  }\n}',
});

// 09 - KHQR Guideline/2. Build Offline KHQR: the HTTP call fetches the guideline page; the payload is local.
add('09 - KHQR Guideline/2. Build Offline KHQR (TLV + CRC + QR).request.yaml', {
  name: '200 — guideline page; payload built locally (Console + Visualize)',
  code: 200,
  status: 'OK',
  language: 'html',
  description:
    'The HTTP call only fetches the guideline page — the deliverable is built locally: the Console prints the TLV breakdown and the byte-for-byte self-test against the guideline\'s official sample (CRC 9FBD), and the Visualize tab renders the scannable QR. Reconcile payments by `{{khqr_merchant_ref}}` (request 4); one KHQR can be paid multiple times.',
  body: '<!DOCTYPE html>\n…(developer.payway.com.kh KHQR guideline page — truncated; the KHQR payload prints to the Console and renders in the Visualize tab)…',
});

// 11 - Runner flows: mirror the live-verified shapes of the endpoints they wrap, with flow context.
const a1 = clone(K.qr, 0);
a1.description =
  'Flow A step 1. Saves `{{last_tran_id}}`; the Runner continues to A2 (poll loop). Sandbox note: the KHQR record stays PENDING until paid — transaction-detail sees it, the 7-day-window check-transaction cannot.';
add('11 - Polling & Lifecycle Flows (Runner)/A1 - Create QR.request.yaml', a1);

const a2ok = clone(K.check, 0);
a2ok.name = 'APPROVED (payment_status_code 0) — loop ends';
a2ok.description =
  'Settled — the test script stops looping and moves on to A3. The record lives in `data`; A2 re-computes the hash and calls itself on every iteration.';
add('11 - Polling & Lifecycle Flows (Runner)/A2 - Poll Transaction Status (loops).request.yaml', a2ok);
const a2pending = clone(K.check, 1);
a2pending.name = 'PENDING (payment_status_code 2) — keep looping';
a2pending.description =
  'The loop re-sends this request (max `{{max_polls}}` tries, Runner delay ≥ 1000 ms) while PENDING or not yet visible. PENDING can persist up to ~24h; a missing callback is NOT proof of non-payment.';
add('11 - Polling & Lifecycle Flows (Runner)/A2 - Poll Transaction Status (loops).request.yaml', a2pending);

const a3 = clone(K.txnDetail, 0);
a3.description =
  'Flow A step 3: the full record for `{{last_tran_id}}` — payment_status_code: 0=APPROVED/PRE-AUTH, 2=PENDING, 3=DECLINED, 4=REFUNDED, 7=CANCELLED. In the Runner it follows A2 automatically.';
add('11 - Polling & Lifecycle Flows (Runner)/A3 - Get Transaction Details.request.yaml', a3);

const a4 = clone(K.refund, 0);
a4.description =
  'Flow A final step: refunds `{{last_tran_id}}` for `{{refund_amount}}` and ends Flow A (`setNextRequest(null)`). ABA PAY and KHQR refunds are immediate; card/WeChat/Alipay follow your agreement.';
add('11 - Polling & Lifecycle Flows (Runner)/A4 - Refund.request.yaml', a4);

const b1 = clone(K.linkAccount, 0);
b1.description =
  'Flow B step 1. The token does NOT come back here — approve the link in ABA Mobile; the pwt arrives via callback_url or B2. The Visualize tab renders the linking QR/deeplink.';
add('11 - Polling & Lifecycle Flows (Runner)/B1 - Link Account (Flow B).request.yaml', b1);

const b2 = clone(K.tokenDetails, 0);
b2.description =
  'Flow B step 2, expected until the customer approves the link in ABA Mobile — finish that step, then re-send; on success the test script saves `{{pwt}}`/`{{ctid}}` for B3+.';
add('11 - Polling & Lifecycle Flows (Runner)/B2 - Get Token Details (Flow B).request.yaml', b2);

const b3 = clone(K.payToken, 0);
b3.description =
  'Flow B step 3: charges `{{amount}}` to the stored credential (`{{pwt}}` + `{{ctid}}` saved by B2).';
add('11 - Polling & Lifecycle Flows (Runner)/B3 - Payment using Token (Flow B).request.yaml', b3);

add('11 - Polling & Lifecycle Flows (Runner)/B4 - Renew Token (Flow B).request.yaml', {
  name: 'Success — token renewed +90 days (code 00)',
  code: 200,
  status: 'OK',
  language: 'json',
  description:
    'Flow B step 4: keeps `{{pwt}}` alive (+90 days from today, account tokens only); the linked account/card is unchanged.',
  body: '{\n  "status": {\n    "code": "00",\n    "message": "Success."\n  },\n  "new_token": "b6138a89f26e45c7a0d94f31e07…"\n}',
});

add('11 - Polling & Lifecycle Flows (Runner)/B5 - Remove Token (Flow B).request.yaml', {
  name: 'Success — token removed (code 00)',
  code: 200,
  status: 'OK',
  language: 'json',
  description:
    'Flow B final step: irreversibly removes the token and clears `{{pwt}}`; ends Flow B (`setNextRequest(null)`).',
  body: '{\n  "status": {\n    "code": "00",\n    "message": "Success."\n  }\n}',
});

fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
const total = Object.values(ex).reduce((n, v) => n + v.length, 0);
console.log(`examples: ${total} across ${Object.keys(ex).length} requests`);
