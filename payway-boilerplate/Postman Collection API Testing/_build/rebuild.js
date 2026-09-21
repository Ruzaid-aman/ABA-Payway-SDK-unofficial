const fs = require('fs');
const path = require('path');

const build = 'D:\\PayWay_Postman\\_build';
const base = 'D:\\PayWay_Postman\\PayWay_API_Postman_Collection.postman_collection.json';

const c = JSON.parse(fs.readFileSync(base, 'utf8'));

// ---------------------------------------------------------------------------
// Folder descriptions
// ---------------------------------------------------------------------------
const folderDescs = {
  '01 - Setup & Test Cards': "## How to use this collection\n1. Set the collection variables: `{{secret_key}}`, `{{rsa_public_key}}`, `{{merchant_id}}`, `{{ctid}}`, and switch `{{baseUrl}}` sandbox/production.\n2. (Recommended) install the **node-forge** library (Edit collection > Libraries) so RSA endpoints compute `merchant_auth` / `beneficiaries` for you.\n3. Test cards and sandbox behaviour are below.\n4. Then start with folder **03 Ecommerce Checkout** -> Purchase -> open checkout page -> pay -> use **Check Transaction** to verify.\n\n> Every pre-request logs `b4hash:` to the Postman Console so you can verify the hashed string matches the official docs.",
  '03 - Ecommerce Checkout': "## Ecommerce Checkout\nREST endpoints for the standard hosted-checkout flow (cards, ABA KHQR, wallets).\n\n**Suggested order:**\n1. **Purchase** - creates a transaction and returns a hosted page; save the `tran_id` (auto-stored in `{{last_tran_id}}`).\n2. **Check Transaction** - fast status check while a customer pays (great for polling).\n3. **Get Transaction Details** - full record.\n4. **Close Transaction** / **Refund** - close or money-back (Refund needs RSA).\n5. **Transaction List** / **Exchange Rate** - admin views.\n\nAll hashes follow `req_time + merchant_id + tran_id + ...` per endpoint (see each description).",
  '04 - ABA QR API': "## ABA QR API\n`POST /generate-qr` creates an ABA KHQR for static/dynamic payment. Render `qr_data` as a QR image, or show `qr_image`. The payer scans with the ABA app.\n\nAfter payment, verify via **Check Transaction** or the callback. The purchase_type/payment_option both default to `{{payment_option}}`.",
  '05 - Payment Link': "## Payment Link\nCreate a shareable payment link (sent via WhatsApp/email/SMS) and query its stats.\n\n> These are **portal APIs**: instead of a plain hash they require `merchant_auth` = base64 of the RSA-encrypted payload. Install node-forge or paste a pre-encrypted value into `{{pl_merchant_auth}}`.",
  '06 - Pre-auth': "## Pre-auth (Card holds)\nPre-authorisation flow: after a `purchase`, complete (capture) or cancel the hold. Use `pre-auth-completion` optionally with a **payout** split.\n\nOrder of fields in the hash differs per request - read the description before editing values.",
  '07 - Payout': "## Payout\nMass payouts (up to 250 beneficiaries) plus the whitelist that authorities them.\n\n**Sequence:** whitelist the payee account first, then send a payout. Both need RSA (folder 06 variables). Payout hashes use the **body beneficiaries ciphertext** as a hash input, so the hash must be computed AFTER encryption.",
  '08 - Credentials on File (CoF)': "## Credentials on File (CoF) / Subscriptions\nTokenize a card or ABA account, then charge it later without re-entering credentials.\n\n**Typical flow:** `1. Link Account` (or `2. Link Card`) -> wait for callback -> `3. Get Token Details` (auto-saves `{{pwt}}`/`{{ctid}}`) -> `4. Payment` -> `6. Remove` at the end.\n\n`callback_url` must be base64-encoded in the hash/body - the scripts do that automatically for https URLs. Run `7. Subscription` to test recurring CITR_FIX payments.",
  '09 - KHQR Guideline': "## KHQR guideline\nUse a dedicated `instore` QR merchant account. Generate a QR (folder 04), have the payer scan it, and look up the matched inbound transaction with the merchant reference you set.",
  '10 - Callbacks & Webhooks': "## Callbacks & Webhooks\nEverything PayWay POSTs back to **your** server, plus how to verify it.\n\n- Set `{{callback_listener}}` (e.g. webhook.site) and these sample senders will POST real-looking payloads to it.\n- The `X-PayWay-Hmac-Sha512` header is computed with the same ksort+concat rule PayWay uses, so you can test your verifier end-to-end.\n- 'Webhook Design Notes' summarises idempotency / retry / response guidance.",
  '11 - Polling & Lifecycle Flows (Runner)': "## Polling & Lifecycle Flows (Collection Runner)\nComposable flows via `postman.setNextRequest` - run these from the **Collection Runner** (set delay 1000 ms).\n\n- **Flow A:** Generate QR -> poll until settled -> get details -> refund.\n- **Flow B:** Link account -> get token -> charge -> renew -> remove.\n\nFallback: when run as single requests, each step still saves the variables the next step needs (`{{last_tran_id}}`, `{{pwt}}`, `{{request_id}}`)."
};

// ---------------------------------------------------------------------------
// Stricter CoF test scripts
// ---------------------------------------------------------------------------
function test(exec) { return [{ listen: 'test', script: { type: 'text/javascript', exec } }]; }

const TEST_LINK_ACCOUNT = [
  "pm.test('HTTP 200', function () { pm.response.to.have.status(200); });",
  "try {",
  "  var j = pm.response.json();",
  "  if (j.status) {",
  "    pm.test('status.code present', function () { pm.expect(j.status.code).to.not.be.empty; });",
  "    console.log('status.code:', j.status.code, '-', j.status.message || '');",
  "    if (String(j.status.code) === '00') {",
  "      console.log('Link approved. request_id =', pm.collectionVariables.get('request_id'), '(watch the callback for pwt)');",
  "    } else {",
  "      console.log('Non-success code. See error-code table in description. request_id =', pm.collectionVariables.get('request_id'));",
  "    }",
  "  }",
  "} catch (e) { console.log('Response is not JSON; likely a redirect page.'); }"
];

const TEST_LINK_CARD = [
  "pm.test('HTTP 200', function () { pm.response.to.have.status(200); });",
  "var ct = (pm.response.headers.get('Content-Type') || '').toLowerCase();",
  "if (ct.indexOf('html') >= 0) {",
  "  console.log('HTML received - open the response in a new tab/window to complete card linking.');",
  "  pm.test('Received HTML card page', function () { pm.expect(ct).to.include('html'); });",
  "} else {",
  "  try {",
  "    var j = pm.response.json();",
  "    if (j.status) {",
  "      pm.test('status.code present', function () { pm.expect(j.status.code).to.not.be.empty; });",
  "      console.log('status.code:', j.status.code, '-', j.status.message || '');",
  "      if (String(j.status.code) !== '00') {",
  "        console.log('Non-success code. See error-code table in description. request_id =', pm.collectionVariables.get('request_id'));",
  "      }",
  "    }",
  "  } catch (e) { console.log('Unexpected response type:', ct); }",
  "}"
];

const TEST_TOKEN_DETAILS = [
  "pm.test('HTTP 200', function () { pm.response.to.have.status(200); });",
  "try {",
  "  var j = pm.response.json();",
  "  if (j.status) {",
  "    pm.test('status.code present', function () { pm.expect(j.status.code).to.not.be.empty; });",
  "    console.log('status.code:', j.status.code, '-', j.status.message || '');",
  "    if (String(j.status.code) === '00' && j.data) {",
  "      if (j.data.pwt)  { pm.collectionVariables.set('pwt', j.data.pwt);  console.log('pwt saved:', j.data.pwt); }",
  "      if (j.data.ctid) { pm.collectionVariables.set('ctid', j.data.ctid); console.log('ctid saved:', j.data.ctid); }",
  "      pm.test('pwt available for Payment/Renew/Remove', function () { pm.expect(pm.collectionVariables.get('pwt')).to.not.be.empty; });",
  "    } else {",
  "      console.log('Token not found/ready. Re-run Link Account / Link Card, check the callback, then retry with SAME request_id.');",
  "    }",
  "  }",
  "} catch (e) { console.log('Response was not JSON.'); }"
];

const TEST_PAYMENT = [
  "pm.test('HTTP 200', function () { pm.response.to.have.status(200); });",
  "try {",
  "  var j = pm.response.json();",
  "  if (j.status) {",
  "    pm.test('status.code = 0 (approved)', function () { pm.expect(String(j.status.code)).to.eql('0'); });",
  "    console.log('status.code:', j.status.code, '-', j.status.message || '');",
  "    pm.collectionVariables.set('last_tran_id', pm.collectionVariables.get('tran_id'));",
  "    if (j.data) console.log('approved:', JSON.stringify(j.data).slice(0, 400));",
  "  }",
  "} catch (e) { console.log('Response was not JSON.'); }"
];

const TEST_RENEW = [
  "pm.test('HTTP 200', function () { pm.response.to.have.status(200); });",
  "try {",
  "  var j = pm.response.json();",
  "  if (j.status) {",
  "    pm.test('status.code present', function () { pm.expect(j.status.code).to.not.be.empty; });",
  "    console.log('status.code:', j.status.code, '-', j.status.message || '');",
  "    if (String(j.status.code) === '00') console.log('Token renewed (+90 days) - new request_id =', pm.collectionVariables.get('request_id'));",
  "  }",
  "} catch (e) { console.log('Response was not JSON.'); }"
];

const TEST_REMOVE = [
  "pm.test('HTTP 200', function () { pm.response.to.have.status(200); });",
  "try {",
  "  var j = pm.response.json();",
  "  if (j.status) {",
  "    pm.test('status.code present', function () { pm.expect(j.status.code).to.not.be.empty; });",
  "    console.log('status.code:', j.status.code, '-', j.status.message || '');",
  "    if (String(j.status.code) === '00') {",
  "      console.log('Token removed. Clear {{pwt}} to avoid reusing a dead token.');",
  "      pm.collectionVariables.set('pwt', '');",
  "    }",
  "  }",
  "} catch (e) { console.log('Response was not JSON.'); }"
];

const TEST_SUBSCRIPTION = [
  "pm.test('HTTP 200', function () { pm.response.to.have.status(200); });",
  "try {",
  "  var j = pm.response.json();",
  "  if (j.status) {",
  "    pm.test('status.code = 0', function () { pm.expect(String(j.status.code)).to.eql('0'); });",
  "    console.log('status.code:', j.status.code, '-', j.status.message || '');",
  "    pm.collectionVariables.set('last_tran_id', pm.collectionVariables.get('tran_id'));",
  "  }",
  "} catch (e) { console.log('Response was not JSON (may be HTML redirect - open in browser).'); }"
];

// Flow B: B1 mirrors Link Account; B2 mirrors Get Token Details...
const requestTests = {
  '1. Link Account (ABA Account)': TEST_LINK_ACCOUNT,
  '2. Link Card (Credit/Debit)': TEST_LINK_CARD,
  '3. Get Token Details': TEST_TOKEN_DETAILS,
  '4. Payment (Using Token)': TEST_PAYMENT,
  '5. Renew Token (ABA account)': TEST_RENEW,
  '6. Remove Token (irreversible)': TEST_REMOVE,
  '7. Subscription (Scheduled Payment)': TEST_SUBSCRIPTION,
  'B1 - Link Account (Flow B)': TEST_LINK_ACCOUNT,
  'B2 - Get Token Details (Flow B)': TEST_TOKEN_DETAILS,
  'B3 - Payment using Token (Flow B)': TEST_PAYMENT,
  'B4 - Renew Token (Flow B)': TEST_RENEW,
  'B5 - Remove Token (Flow B)': TEST_REMOVE
};

// Map folder -> single part filename (one part per folder, no splits)
const folderToPart = {
  '01 - Setup & Test Cards': 'part_01_setup.json',
  '03 - Ecommerce Checkout': 'part_03_ecom.json',
  '04 - ABA QR API': 'part_04_qr.json',
  '05 - Payment Link': 'part_05_paymentlink.json',
  '06 - Pre-auth': 'part_06_preauth.json',
  '07 - Payout': 'part_07_payout.json',
  '08 - Credentials on File (CoF)': 'part_08_cof.json',
  '09 - KHQR Guideline': 'part_09_khqr.json',
  '10 - Callbacks & Webhooks': 'part_10_callbacks.json',
  '11 - Polling & Lifecycle Flows (Runner)': 'part_11_polling.json'
};

let replaced = 0;
for (const folder of c.item) {
  const fname = folder.name;
  const partFile = folderToPart[fname];
  if (!partFile) { console.log('SKIP folder (not mapped):', fname); continue; }

  const items = JSON.parse(JSON.stringify(folder.item));
  for (const it of items) {
    if (requestTests[it.name]) {
      it.event = it.event.filter((e) => e.listen !== 'test');
      it.event = it.event.concat(test(requestTests[it.name]));
      replaced++;
    }
  }

  const part = { folder: fname };
  if (folderDescs[fname]) part.description = folderDescs[fname];
  part.item = items;

  fs.writeFileSync(path.join(build, partFile), JSON.stringify(part, null, 2), 'utf8');
  console.log('rebuilt:', partFile);
}

// part_00 untouched (never corrupted).
const infoCheck = JSON.parse(fs.readFileSync(path.join(build, 'part_00_info.json'), 'utf8'));
console.log('part_00 intact:', !!infoCheck.info, !!infoCheck.variable, !!infoCheck.event);
console.log('test scripts replaced:', replaced);

// Remaining old part files that now duplicate folders -> list for deletion
const stale = ['part_02_setup.json', 'part_03a_ecom.json', 'part_03b_ecom.json', 'part_08a_cof.json', 'part_08b_cof.json'];
for (const s of stale) {
  if (fs.existsSync(path.join(build, s))) console.log('STALE (should be deleted):', s);
}