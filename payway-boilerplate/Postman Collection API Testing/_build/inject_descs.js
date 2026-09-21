const fs = require('fs');
const path = require('path');
const build = 'D:\\PayWay_Postman\\_build';

const descs = {
  'part_02_setup.json': "## How to use this collection\n1. Set the collection variables: `{{secret_key}}`, `{{rsa_public_key}}`, `{{merchant_id}}`, `{{ctid}}`, and switch `{{baseUrl}}` sandbox/production.\n2. (Recommended) install the **node-forge** library (Edit collection > Libraries) so RSA endpoints compute `merchant_auth` / `beneficiaries` for you.\n3. Test cards and sandbox behaviour are below.\n4. Then start with folder **03 Ecommerce Checkout** -> Purchase -> open checkout page -> pay -> use **Check Transaction** to verify.\n\n> Every pre-request logs `b4hash:` to the Postman Console so you can verify the hashed string matches the official docs.",
  'part_03a_ecom.json': "## Ecommerce Checkout\nREST endpoints for the standard hosted-checkout flow (cards, ABA KHQR, wallets).\n\n**Suggested order:**\n1. **Purchase** - creates a transaction and returns a hosted page; save the `tran_id` (auto-stored in `{{last_tran_id}}`).\n2. **Check Transaction** - fast status check while a customer pays (great for polling).\n3. **Get Transaction Details** - full record.\n4. **Close Transaction** / **Refund** - close or money-back (Refund needs RSA).\n5. **Transaction List** / **Exchange Rate** - admin views.\n\nAll hashes follow `req_time + merchant_id + tran_id + ...` per endpoint (see each description).",
  'part_04_qr.json': "## ABA QR API\n`POST /generate-qr` creates an ABA KHQR for static/dynamic payment. Render `qr_data` as a QR image, or show `qr_image`. The payer scans with the ABA app.\n\nAfter payment, verify via **Check Transaction** or the callback. The purchase_type/payment_option both default to `{{payment_option}}`.",
  'part_05_paymentlink.json': "## Payment Link\nCreate a shareable payment link (sent via WhatsApp/email/SMS) and query its stats.\n\n> These are **portal APIs**: instead of a plain hash they require `merchant_auth` = base64 of the RSA-encrypted payload. Install node-forge or paste a pre-encrypted value into `{{pl_merchant_auth}}`.",
  'part_06_preauth.json': "## Pre-auth (Card holds)\nPre-authorisation flow: after a `purchase`, complete (capture) or cancel the hold. Use `pre-auth-completion` optionally with a **payout** split.\n\nOrder of fields in the hash differs per request - read the description before editing values.",
  'part_07_payout.json': "## Payout\nMass payouts (up to 250 beneficiaries) plus the whitelist that authorities them.\n\n**Sequence:** whitelist the payee account first, then send a payout. Both need RSA (folder 06 variables). Payout hashes use the **body beneficiaries ciphertext** as a hash input, so the hash must be computed AFTER encryption.",
  'part_08a_cof.json': "## Credentials on File (CoF) / Subscriptions\nTokenize a card or ABA account, then charge it later without re-entering credentials.\n\n**Typical flow:** `1. Link Account` (or `2. Link Card`) -> wait for callback -> `3. Get Token Details` (auto-saves `{{pwt}}`/`{{ctid}}`) -> `4. Payment` -> `6. Remove` at the end.\n\nOptional middleware: **node-forge is NOT required here**, but `callback_url` must be base64-encoded in the hash/body - the scripts do that automatically for https URLs.\n\nRun `7. Subscription` to test recurring CITR_FIX payments.",
  'part_09_khqr.json': "## KHQR guideline\nUse a dedicated `instore` QR merchant account. Generate a QR (folder 04), have the payer scan it, and look up the matched inbound transaction with the merchant reference you set.",
  'part_10_callbacks.json': "## Callbacks & Webhooks\nEverything PayWay POSTs back to **your** server, plus how to verify it.\n\n- Set `{{callback_listener}}` (e.g. webhook.site) and these sample senders will POST real-looking payloads to it.\n- The `X-PayWay-Hmac-Sha512` header is computed with the same ksort+concat rule PayWay uses, so you can test your verifier end-to-end.\n- 'Webhook Design Notes' summarises idempotency / retry / response guidance.",
  'part_11_polling.json': "## Polling & Lifecycle Flows (Collection Runner)\nComposable flows via `postman.setNextRequest` - run these from the **Collection Runner** (set delay 1000 ms).\n\n- **Flow A:** Generate QR -> poll until settled -> get details -> refund.\n- **Flow B:** Link account -> get token -> charge -> renew -> remove.\n\nFallback: when run as single requests, each step still saves the variables the next step needs (`{{last_tran_id}}`, `{{pwt}}`, `{{request_id}}`)."
};

let ins = 0;
for (const f of Object.keys(descs)) {
  const fp = path.join(build, f);
  const raw = fs.readFileSync(fp, 'utf8');
  const m = raw.match(/^(\{\n\s*"folder":\s*"[^"]+",\n)(\s*"item":)/);
  if (!m) { console.log('skip (has folder desc or pattern fail):', f); continue; }
  const descJson = JSON.stringify(descs[f]);
  const patched = m[1] + '  "description": ' + descJson + ',\n' + m[2];
  fs.writeFileSync(fp, patched, 'utf8');
  ins++;
  console.log('injected:', f);
}
console.log('injected count:', ins);