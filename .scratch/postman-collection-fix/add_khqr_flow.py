# Adds the offline-KHQR generation flow to folder 09 of the exp collection:
#   1. Create webhook.site Receiver       (POST api.webhook.site/token)
#   2. Build Offline KHQR (TLV+CRC+QR)    (local builder in scripts; vehicle GET = the guideline page)
#   3. Pull webhook.site Callbacks (KHQR) (GET api.webhook.site/token/{uuid}/requests)
#   4. Get Transactions by Merchant Ref   (existing request, renamed + final-validation added)
# Builder reproduces the PayWay KHQR guideline sample payload byte-for-byte (CRC 9FBD)
# as a per-send self-test. Idempotent: skips if request 2 is already present.
import json, copy, os

os.chdir(os.path.join(os.path.dirname(__file__), '..', '..', 'payway-boilerplate', 'Postman Collection API Testing'))
FN = 'exp-PayWay API — Complete Collection.postman_collection.json'
c = json.load(open(FN, encoding='utf-8'))
f09 = [f for f in c['item'] if f['name'].startswith('09')][0]

LOADER = [
    "// Restore the shared PayWay helper library (Postman runs every script in its own scope):",
    "var __h = pm.collectionVariables.get('__helpers');",
    "if (!__h) throw new Error('The `__helpers` collection variable is missing - re-import the full collection JSON (it holds the shared helper library source).');",
    "eval(__h);",
]

# ---------------------------------------------------------------------------
# Request 1: Create webhook.site Receiver
# ---------------------------------------------------------------------------
R1_PRE = LOADER + [
    "// Creates a throwaway webhook.site bin to catch the offline-KHQR payment pushback.",
    "// Offline KHQR has NO per-QR callback field: PayWay POSTs the payment notification to",
    "// the webhook URL provisioned on your merchant account - point that provisioning at",
    "// the https://webhook.site/<uuid> URL this response produces.",
    "var C = pm.collectionVariables;",
    "console.log('Creating a fresh webhook.site receiver - re-running creates a NEW bin and repoints the callback_listener / webhook_token variables.');",
]

R1_TEST = LOADER + [
    "var C = pm.collectionVariables;",
    "var j = {};",
    "try { j = pm.response.json(); } catch (e) {}",
    "if (pm.response.code === 200 || pm.response.code === 201) {",
    "  pm.test('webhook.site receiver created', function () {",
    "    pm.expect(j.uuid).to.be.a('string');",
    "  });",
    "  C.set('webhook_token', j.uuid);",
    "  C.set('callback_listener', 'https://webhook.site/' + j.uuid);",
    "  console.log('Receiver ready: https://webhook.site/' + j.uuid, '(saved into callback_listener + webhook_token - the same variables folder 10 uses).');",
    "  console.log('NEXT: point your PayWay merchant-account KHQR webhook at this URL (ABA provisioning), then run \"2. Build Offline KHQR (TLV + CRC + QR)\".');",
    "} else {",
    "  pm.test('webhook.site responded (2xx)', function () { pm.expect(pm.response.code).to.be.oneOf([200, 201]); });",
    "  console.log('webhook.site could not create a bin (HTTP ' + pm.response.code + '). Create one manually at https://webhook.site and paste its URL into the callback_listener collection variable, then continue with request 2.');",
    "}",
]

R1_DESC = """## ⚡ Quick test
Send it. The response `uuid` becomes a fresh webhook.site bin: the test script saves `https://webhook.site/<uuid>` into `{{callback_listener}}` and the UUID into `{{webhook_token}}` (the same variables folder 10 uses).

**Why this exists:** an offline KHQR has **no per-QR callback field** - PayWay POSTs the payment notification to the webhook URL provisioned on your merchant account. Create the bin here, point that provisioning at it (ABA), and steps 3-4 of this folder can verify payments end-to-end. Re-running creates a NEW bin and repoints the variables."""

# ---------------------------------------------------------------------------
# Request 2: Build Offline KHQR (TLV + CRC + QR)
# ---------------------------------------------------------------------------
R2_PRE = LOADER + [
    "// ---- Offline KHQR builder (PayWay KHQR guideline: EMVCo TLV + CRC-16/CCITT-FALSE) ----",
    "// Builds the QR payload 100% locally - no generate-qr API call. The request itself only",
    "// fetches the guideline page as reference context; the payload is built either way.",
    "var C = pm.collectionVariables;",
    "",
    "function khqrTlv(tag, value) {",
    "  if (value.length > 99) throw new Error('KHQR TLV value too long for tag ' + tag + ' (' + value.length + ' chars, max 99).');",
    "  return tag + (value.length < 10 ? '0' + value.length : '' + value.length) + value;",
    "}",
    "function khqrCrc16(str) { // CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF",
    "  var crc = 0xFFFF;",
    "  for (var i = 0; i < str.length; i++) {",
    "    crc ^= (str.charCodeAt(i) & 0xFF) << 8;",
    "    for (var b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;",
    "  }",
    "  var hex = crc.toString(16).toUpperCase();",
    "  while (hex.length < 4) hex = '0' + hex;",
    "  return hex;",
    "}",
    "function khqrNormalizeAmount(v, khr) {",
    "  v = String(v == null ? '' : v).trim();",
    "  if (!v) return '';",
    "  if (khr) return String(Math.round(parseFloat(v))); // guideline: no decimal places for KHR",
    "  var p = v.split('.');",
    "  var intPart = p[0].replace(/^0+(?=\\d)/, '');",
    "  if (intPart === '') intPart = '0';",
    "  var dec = (p[1] || '').slice(0, 2);",
    "  return dec ? intPart + '.' + dec : intPart;",
    "}",
    "",
    "// Spec self-tests - run on every send; fail loudly if the builder ever drifts.",
    "(function khqrSelfTest() {",
    "  if (khqrCrc16('123456789') !== '29B1') throw new Error('KHQR self-test failed: CRC-16/CCITT-FALSE canonical vector (123456789 expected 29B1).');",
    "  var st30 = khqrTlv('00', 'abaakhppxxx@abaa') + khqrTlv('01', '125021214532846') + khqrTlv('02', 'ABA Bank');",
    "  var st62 = khqrTlv('01', 'MC-REF-KH-15000') + khqrTlv('68', '0010PAYWAY@ABA0208104514230604A227');",
    "  var st99 = khqrTlv('00', '1759805345337') + khqrTlv('01', '1759805525337');",
    "  var sbase = khqrTlv('00', '01') + khqrTlv('01', '12') + khqrTlv('30', st30) + khqrTlv('52', '5987') +",
    "    khqrTlv('53', '116') + khqrTlv('54', '100') + khqrTlv('58', 'KH') +",
    "    khqrTlv('59', 'OLD ME 25 CHAR WINNER IP2') + khqrTlv('60', 'Phnom Penh') +",
    "    khqrTlv('62', st62) + khqrTlv('99', st99) + '6304';",
    "  var official = '00020101021230510016abaakhppxxx@abaa01151250212145328460208ABA Bank52045987530311654031005802KH5925OLD ME 25 CHAR WINNER IP26010Phnom Penh62570115MC-REF-KH-1500068340010PAYWAY@ABA0208104514230604A2279934001317598053453370113175980552533763049FBD';",
    "  if (sbase + khqrCrc16(sbase) !== official) throw new Error('KHQR self-test failed: rebuilt payload does not match the guideline official sample byte-for-byte.');",
    "})();",
    "",
    "// ---- Gather merchant + payment inputs ----",
    "var bakong = (C.get('khqr_bakong_id') || '').trim();",
    "var mid = (C.get('khqr_mid') || '').trim();",
    "var bankName = (C.get('khqr_bank_name') || '').trim();",
    "var mcc = (C.get('khqr_mcc') || '').trim();",
    "var mName = (C.get('khqr_merchant_name') || '').trim().toUpperCase();",
    "var mCity = (C.get('khqr_merchant_city') || '').trim().toUpperCase();",
    "var paywayData = (C.get('khqr_payway_data') || '').trim();",
    "var mode = (C.get('khqr_mode') || 'dynamic').trim().toLowerCase();",
    "var expiryMin = parseInt(C.get('khqr_expiry_minutes') || '30', 10);",
    "var currency = (C.get('currency') || 'USD').trim().toUpperCase();",
    "var amount = (C.get('amount') || '').trim();",
    "",
    "var missing = [];",
    "if (!bakong) missing.push('khqr_bakong_id (tag 30.00, ABA-issued Bakong ID)');",
    "if (!mid) missing.push('khqr_mid (tag 30.01, ABA-issued merchant ID)');",
    "if (!bankName) missing.push('khqr_bank_name (tag 30.02)');",
    "if (!mcc) missing.push('khqr_mcc (tag 52)');",
    "if (!mName) missing.push('khqr_merchant_name (tag 59)');",
    "if (!mCity) missing.push('khqr_merchant_city (tag 60)');",
    "if (!paywayData) missing.push('khqr_payway_data (tag 62.68, provided by ABA)');",
    "if (missing.length) throw new Error('Missing KHQR inputs - set these collection variables: ' + missing.join('; '));",
    "if (!/^\\d{4}$/.test(mcc)) throw new Error('khqr_mcc must be exactly 4 digits (got: ' + mcc + ').');",
    "if (mName.length < 3 || mName.length > 25) throw new Error('khqr_merchant_name must be 3-25 chars (guideline tag 59); got ' + mName.length + '.');",
    "if (mCity.length < 2 || mCity.length > 15) throw new Error('khqr_merchant_city must be 2-15 chars (guideline tag 60); got ' + mCity.length + '.');",
    "var pim = mode === 'static' ? '11' : '12'; // 11 = static/open amount, 12 = dynamic/fixed amount",
    "var curNum = currency === 'KHR' ? '116' : currency === 'USD' ? '840' : currency;",
    "if (!/^\\d{3}$/.test(curNum)) throw new Error('Unsupported currency - set the currency collection variable to USD or KHR (got: ' + currency + ').');",
    "var khr = curNum === '116';",
    "if (pim === '12') {",
    "  if (!amount) throw new Error('Set the amount collection variable (KHQR tag 54), or switch khqr_mode to static for an open-amount QR.');",
    "  amount = khqrNormalizeAmount(amount, khr);",
    "  if (!/^\\d{1,11}(\\.\\d{1,2})?$/.test(amount)) throw new Error('Amount must be numeric with up to 2 decimals for USD (got: ' + amount + ').');",
    "}",
    "",
    "// Unique merchant reference (tag 62.01, max 25 chars) - the reconciliation key",
    "// PayWay echoes back in the payment webhook and the by-ref inquiry.",
    "var ref = ('KHQR-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(Math.random() * 1296).toString(36).toUpperCase()).slice(0, 25);",
    "",
    "// Bakong timestamps (tag 99): creation now, expiry now + N minutes (13-digit ms).",
    "var created = String(Date.now());",
    "var expiry = String(Date.now() + (expiryMin > 0 ? expiryMin : 30) * 60000);",
    "",
    "// ---- Assemble the payload ----",
    "var t30 = khqrTlv('00', bakong) + khqrTlv('01', mid) + khqrTlv('02', bankName);",
    "var t62 = khqrTlv('01', ref) + khqrTlv('68', paywayData);",
    "var t99 = khqrTlv('00', created) + khqrTlv('01', expiry);",
    "var payload = khqrTlv('00', '01') + khqrTlv('01', pim) + khqrTlv('30', t30) + khqrTlv('52', mcc) +",
    "  khqrTlv('53', curNum) +",
    "  (pim === '12' ? khqrTlv('54', amount) : '') +",
    "  khqrTlv('58', 'KH') + khqrTlv('59', mName) + khqrTlv('60', mCity) +",
    "  khqrTlv('62', t62) + khqrTlv('99', t99) + '6304';",
    "payload += khqrCrc16(payload);",
    "",
    "C.set('khqr_merchant_ref', ref);",
    "C.set('merchant_ref', ref); // chain into Get Transactions by Merchant Ref (request 4)",
    "C.set('khqr_payload', payload);",
    "C.set('khqr_selftest', 'pass');",
    "C.set('khqr_amount_used', pim === '12' ? amount : '');",
    "C.set('khqr_currency_used', khr ? 'KHR' : 'USD');",
    "C.set('khqr_transaction_id', '');",
    "C.set('khqr_payment_status', '');",
    "C.set('khqr_payment_status_code', '');",
    "C.set('khqr_callback_count', '');",
    "C.set('khqr_final_status', '');",
    "",
    "console.log('KHQR built for merchant_ref: ' + ref + ' | mode: ' + (pim === '12' ? 'dynamic (fixed amount)' : 'static (open amount)') + ' | amount: ' + (pim === '12' ? amount + ' ' + (khr ? 'KHR' : 'USD') : 'payer-entered'));",
    "console.log('TLV breakdown: 00=01 | 01=' + pim + ' | 30=' + t30 + ' | 52=' + mcc + ' | 53=' + curNum + (pim === '12' ? ' | 54=' + amount : ' | 54 omitted (static)') + ' | 58=KH | 59=' + mName + ' | 60=' + mCity + ' | 62=' + t62 + ' | 99=' + t99);",
    "console.log('PAYLOAD: ' + payload);",
    "console.log('merchant_ref synced into the merchant_ref variable for request 4 (overwrites any manual value).');",
]

R2_TEST = LOADER + [
    "var C = pm.collectionVariables;",
    "var payload = C.get('khqr_payload') || '';",
    "var ref = C.get('khqr_merchant_ref') || '';",
    "pm.test('Spec self-tests passed (CRC vectors + guideline official sample byte-exact)', function () {",
    "  pm.expect(C.get('khqr_selftest')).to.eql('pass');",
    "});",
    "pm.test('KHQR payload well-formed (TLV header, merchant_ref present, CRC trailer)', function () {",
    "  pm.expect(payload).to.match(/^0002010102(11|12)/);",
    "  pm.expect(payload.indexOf(ref)).to.be.above(-1);",
    "  pm.expect(payload).to.match(/6304[0-9A-F]{4}$/);",
    "});",
    "// Render the QR on the Visualize tab (CDN qrcodejs; no-op in Newman/CI).",
    "var amountLabel = C.get('khqr_amount_used') ? C.get('khqr_amount_used') + ' ' + C.get('khqr_currency_used') : 'any amount';",
    "visualizeQr('', payload, 'Offline KHQR - scan to pay ' + amountLabel + ' | ref: ' + ref);",
    "pm.test('KHQR built (guideline page fetch: HTTP ' + pm.response.code + ')', function () {",
    "  pm.expect(payload).to.not.be.empty;",
    "});",
    "if (pm.response.code !== 200) console.log('The guideline page did not load (HTTP ' + pm.response.code + ') - reference context only; the KHQR payload was still built locally.');",
    "console.log('NEXT: open the Visualize tab and scan the QR with any KHQR app (ABA Mobile etc.). Then run \"3. Pull webhook.site Callbacks (KHQR)\" after paying, and \"4. Get Transactions by Merchant Ref\" to verify.');",
    "console.log('Reminder: PayWay POSTs the payment notification to the webhook URL provisioned on your merchant account - point it at your webhook.site receiver (request 1). A KHQR can be paid MULTIPLE times - dedupe by transaction id.');",
]

R2_DESC = """## ⚡ Quick test
1. (Once) run **1. Create webhook.site Receiver** so the pushback has somewhere to land.
2. Set `{{amount}}` / `{{currency}}` (USD or KHR) and **Send**. The pre-request script builds the KHQR payload **locally** - TLV + CRC-16, no QR API call.
3. Open the **Visualize** tab: a scannable QR renders from the payload. Pay with any KHQR app (ABA Mobile, etc.).
4. Then run **3. Pull webhook.site Callbacks (KHQR)** and **4. Get Transactions by Merchant Ref**.

## What this builds (PayWay KHQR guideline)
EMVCo merchant-presented TLV: `00` payload format `01` - `01` point of initiation (`12` dynamic/fixed amount, `11` static/open amount) - `30` ABA merchant account (sub-tags `00` Bakong ID, `01` MID, `02` bank name) - `52` MCC - `53` currency (840 USD / 116 KHR) - `54` amount (KHR carries **no decimals**) - `58` KH - `59` merchant name (3-25 chars) - `60` city (2-15 chars) - `62` additional data (`62.01` **merchant reference**, the reconciliation key PayWay echoes in the webhook; `62.68` PayWay data field) - `99` Bakong timestamps (creation + expiry) - `63` CRC-16/CCITT-FALSE.

Every send rebuilds the guideline's **official sample payload byte-for-byte (incl. CRC 9FBD)** as a self-test and fails loudly on drift. A fresh unique `khqr_merchant_ref` is generated per send and synced into `{{merchant_ref}}` for request 4.

## Variables (replace with the values ABA issued for YOUR merchant)
| Variable | TLV tag | Notes |
|---|---|---|
| `khqr_bakong_id` | 30.00 | ABA-issued Bakong ID (e.g. `name@abaa`) |
| `khqr_mid` | 30.01 | ABA-issued merchant ID (digits) |
| `khqr_bank_name` | 30.02 | e.g. `ABA Bank` |
| `khqr_mcc` | 52 | 4-digit merchant category code |
| `khqr_merchant_name` / `khqr_merchant_city` | 59 / 60 | shown when scanned; uppercase enforced |
| `khqr_payway_data` | 62.68 | PayWay data field, provided by ABA |
| `khqr_mode` | 01 | `dynamic` (fixed amount) or `static` (payer enters amount) |
| `khqr_expiry_minutes` | 99.01 | QR validity window from build time |

> **Account-level caveats (offline KHQR):** there is **no per-QR callback field** - PayWay POSTs payment notifications to the webhook URL provisioned on your merchant account (ask ABA to point it at your webhook.site bin). And **one KHQR can be paid multiple times** - reconcile by `merchant_ref`, deduplicate by `transaction_id`. The defaults here are the guideline's published example values: safe to build/scan for testing, but real payments land on the merchant account the payload encodes."""

# ---------------------------------------------------------------------------
# Request 3: Pull webhook.site Callbacks (KHQR)
# ---------------------------------------------------------------------------
R3_PRE = LOADER + [
    "// Pulls captured requests from the webhook.site receiver and looks for the PayWay",
    "// offline-KHQR payment pushback for the last generated merchant reference.",
    "var C = pm.collectionVariables;",
    "if (!C.get('webhook_token')) {",
    "  var m = (C.get('callback_listener') || '').match(/webhook\\.site\\/([0-9a-fA-F-]{8,})/);",
    "  if (m) C.set('webhook_token', m[1]);",
    "}",
    "if (!C.get('webhook_token')) {",
    "  throw new Error('No webhook.site receiver: run \"1. Create webhook.site Receiver\" first (or paste your bin URL into the callback_listener collection variable). Remember PayWay must ALSO be provisioned to POST KHQR notifications there.');",
    "}",
    "console.log('Polling webhook.site for KHQR pushbacks; matching merchant_ref:', C.get('khqr_merchant_ref') || C.get('merchant_ref'));",
]

R3_TEST = LOADER + [
    "var C = pm.collectionVariables;",
    "var j = {};",
    "try { j = pm.response.json(); } catch (e) {}",
    "pm.test('webhook.site API responded (JSON)', function () {",
    "  pm.response.to.have.status(200);",
    "  pm.expect(j).to.be.an('object');",
    "});",
    "// webhook.site returns a legacy top-level array or a paginated object with .data.",
    "var list = Array.isArray(j) ? j : (j && j.data) || [];",
    "var ref = C.get('khqr_merchant_ref') || C.get('merchant_ref') || '';",
    "var matches = [];",
    "list.forEach(function (r) {",
    "  var body = null;",
    "  try { body = JSON.parse(r.content); } catch (e) { return; }",
    "  if (!body || typeof body !== 'object') return;",
    "  var tid = String(body.transaction_id || body.tran_id || '');",
    "  if (!tid) return; // not a payment pushback",
    "  var bref = String(body.merchant_ref || '');",
    "  if (!ref || !bref || bref === ref) matches.push({ at: String(r.created_at || ''), body: body });",
    "});",
    "// newest first (webhook.site returns latest-first, but do not rely on it)",
    "matches.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });",
    "C.set('khqr_callback_count', String(matches.length));",
    "if (matches.length) {",
    "  var latest = matches[0].body;",
    "  var sc = String(latest.payment_status_code !== undefined ? latest.payment_status_code : '');",
    "  C.set('khqr_transaction_id', String(latest.transaction_id || latest.tran_id || ''));",
    "  C.set('khqr_payment_status', String(latest.payment_status || ''));",
    "  C.set('khqr_payment_status_code', sc);",
    "  C.set('khqr_payment_amount', String(latest.payment_amount !== undefined ? latest.payment_amount : ''));",
    "  C.set('khqr_payment_currency', String(latest.payment_currency || ''));",
    "  pm.test('KHQR callback received for merchant_ref ' + ref + ' (payment status: ' + (C.get('khqr_payment_status') || sc || 'unknown') + ')', function () {",
    "    pm.expect(matches.length).to.be.above(0);",
    "  });",
    "  console.log('Pushback captured:', JSON.stringify(latest).slice(0, 500));",
    "  console.log('NEXT: run \"4. Get Transactions by Merchant Ref\" to confirm via the inquiry API.');",
    "  if (matches.length > 1) console.log('NOTE: ' + matches.length + ' payments matched this reference - a KHQR can be PAID MULTIPLE TIMES (guideline). Store every transaction_id; deduplicate by transaction id, never by merchant_ref.');",
    "} else {",
    "  pm.test('KHQR callback captured for merchant_ref ' + ref, function () {",
    "    pm.expect(matches.length).to.be.above(0, 'No payment pushback yet. Pay the QR, wait a few seconds, re-run this request. Also check that your merchant-account KHQR webhook is provisioned to THIS webhook.site bin (ABA provisioning).');",
    "  });",
    "  console.log('No recognizable KHQR pushback yet (looked for JSON bodies with transaction_id + matching merchant_ref). Captured entries in bin:', list.length, '| response shape keys:', Object.keys(j).join(', '));",
    "}",
]

R3_DESC = """## ⚡ Quick test
1. Pay the QR from request 2 (scan it on the Visualize tab).
2. Send this request a few seconds later. A matching pushback (same `merchant_ref`) is imported into `khqr_transaction_id` / `khqr_payment_status` / `khqr_payment_status_code` / amount variables.
3. Re-run as needed - webhook.site keeps every captured request. In the Collection Runner add a delay and send this again if the pushback lags (PayWay callbacks are single best-effort deliveries).

Pulls `GET /token/{uuid}/requests` (both the legacy top-level-array and the paginated `{data: [...]}` response shapes are supported) and matches JSON bodies carrying `transaction_id` plus your `merchant_ref`. KHQR pushback fields per the guideline: `transaction_id`, `merchant_ref`, `payment_status_code` (**0 = approved**), `payment_status`, `payment_amount`, `payment_currency`, `apv`, `bank_ref`, `payment_type`, `payer_account`, `bank_name`.

> If nothing matches: pay first, then check that the merchant-account KHQR webhook is provisioned to THIS bin."""

# ---------------------------------------------------------------------------
# Folder description + apply
# ---------------------------------------------------------------------------
FOLDER_DESC = """## KHQR Guideline - offline KHQR generation (local build -> scan -> webhook -> inquiry)
Build the KHQR payload **entirely in Postman scripts** per the PayWay KHQR guideline (EMVCo TLV + CRC-16/CCITT-FALSE) - no generate-qr call, no per-QR API dependency. Full flow:

1. **Create webhook.site Receiver** - fresh pushback catcher (or paste your own bin into `{{callback_listener}}`).
2. **Build Offline KHQR (TLV + CRC + QR)** - unique merchant reference per send, payload self-tested against the guideline's official sample, QR rendered on the **Visualize** tab. Pay with any KHQR app.
3. **Pull webhook.site Callbacks (KHQR)** - import the pushback (transaction id + payment status).
4. **Get Transactions by Merchant Ref** - inquiry/recovery path by the same reference (works even when the callback is missed).

> **Caveats:** offline KHQR has **no per-QR callback** - the pushback goes to the webhook URL provisioned on your merchant account (point it at webhook.site); KHQR lookups by reference need KHQR retrieval provisioned on the profile (demo profiles observe 404 - the request itself is docs-verified); a KHQR **can be paid multiple times** - deduplicate by `transaction_id`, reconcile by `merchant_ref`."""

OLD_BYREF_NAME = 'Get Transactions by Merchant Ref'
NEW_BYREF_NAME = '4. Get Transactions by Merchant Ref'

BYREF_VALIDATION_BLOCK = [
    "",
    "// ---- Offline-KHQR flow: final validation (runs when \"2. Build Offline KHQR\" has been sent) ----",
    "var C = pm.collectionVariables;",
    "var khqrPayload = C.get('khqr_payload') || '';",
    "if (khqrPayload) {",
    "  var khqrRef = C.get('khqr_merchant_ref') || C.get('merchant_ref') || '';",
    "  var found = [];",
    "  (function scan(node, depth) {",
    "    if (!node || typeof node !== 'object' || depth > 6) return;",
    "    if (Array.isArray(node)) { node.forEach(function (n) { scan(n, depth + 1); }); return; }",
    "    if ((node.transaction_id || node.tran_id) && node.payment_status_code !== undefined) { found.push(node); return; }",
    "    Object.keys(node).forEach(function (k) { scan(node[k], depth + 1); });",
    "  })(j, 0);",
    "  var mine = found.filter(function (t) { return String(t.merchant_ref || '') === String(khqrRef); });",
    "  if (found.length && !mine.length) {",
    "    console.log('Inquiry returned ' + found.length + ' transaction(s) but none matches merchant_ref ' + khqrRef + ' - the QR may be unpaid yet, or this profile resolves a different reference.');",
    "  }",
    "  if (mine.length) {",
    "    var approved = mine.filter(function (t) { return String(t.payment_status_code) === '0'; });",
    "    C.set('khqr_final_status', approved.length ? 'APPROVED' : String(mine[0].payment_status || ('code ' + mine[0].payment_status_code)));",
    "    pm.test('Inquiry confirms payment for merchant_ref ' + khqrRef + ' (' + approved.length + '/' + mine.length + ' APPROVED)', function () {",
    "      pm.expect(approved.length).to.be.above(0);",
    "    });",
    "    var expectedAmt = C.get('khqr_amount_used');",
    "    if (expectedAmt && mine[0].payment_amount !== undefined) {",
    "      var paidAmt = parseFloat(mine[0].payment_amount);",
    "      pm.test('Payment amount matches the QR amount (' + expectedAmt + ')', function () {",
    "        pm.expect(paidAmt).to.eql(parseFloat(expectedAmt));",
    "      });",
    "    }",
    "    console.log('RECONCILED:', JSON.stringify(mine[0]).slice(0, 400));",
    "    console.log('Reminder: merchant_ref identifies the business reference, NOT a unique payment - a KHQR can be paid multiple times. Deduplicate by transaction id.');",
    "  } else if (!found.length) {",
    "    console.log('No transaction objects recognized in the inquiry response (KHQR retrieval may be unprovisioned on this profile - see the 404 note above). Rely on the webhook callback (request 3) until ABA enables lookups.');",
    "  }",
    "}",
]

BYREF_DESC_ADD = """

**Offline-KHQR flow:** when sent after **2. Build Offline KHQR (TLV + CRC + QR)** (which syncs the generated reference into `{{merchant_ref}}`), the test script additionally cross-checks the returned transactions against that reference and the QR amount, asserts at least one APPROVED (`payment_status_code 0`), and stores `khqr_final_status`. This is the recovery path when the webhook (request 3) was missed."""

if any(it['name'].startswith('2. Build Offline KHQR') for it in f09['item']):
    print('KHQR flow already present - nothing to do')
    raise SystemExit(0)

byref = [it for it in f09['item'] if it['name'] == OLD_BYREF_NAME][0]
idx = f09['item'].index(byref)

r1 = {
    'name': '1. Create webhook.site Receiver',
    'request': {
        'method': 'POST',
        'header': [{'key': 'Content-Type', 'value': 'application/json'}],
        'body': {'mode': 'raw', 'options': {'raw': {'language': 'json'}}, 'raw': '{}'},
        'url': {'raw': 'https://api.webhook.site/token', 'protocol': 'https',
                'host': ['api', 'webhook', 'site'], 'path': ['token']},
        'description': R1_DESC,
    },
    'event': [
        {'listen': 'prerequest', 'script': {'type': 'text/javascript', 'packages': {}, 'exec': R1_PRE}},
        {'listen': 'test', 'script': {'type': 'text/javascript', 'packages': {}, 'exec': R1_TEST}},
    ],
}
r2 = {
    'name': '2. Build Offline KHQR (TLV + CRC + QR)',
    'request': {
        'method': 'GET',
        'header': [],
        'url': {'raw': 'https://developer.payway.com.kh/khqr-guideline-3192101f0', 'protocol': 'https',
                'host': ['developer', 'payway', 'com', 'kh'], 'path': ['khqr-guideline-3192101f0']},
        'description': R2_DESC,
    },
    'event': [
        {'listen': 'prerequest', 'script': {'type': 'text/javascript', 'packages': {}, 'exec': R2_PRE}},
        {'listen': 'test', 'script': {'type': 'text/javascript', 'packages': {}, 'exec': R2_TEST}},
    ],
}
r3 = {
    'name': '3. Pull webhook.site Callbacks (KHQR)',
    'request': {
        'method': 'GET',
        'header': [],
        'url': {'raw': 'https://api.webhook.site/token/{{webhook_token}}/requests', 'protocol': 'https',
                'host': ['api', 'webhook', 'site'], 'path': ['token', '{{webhook_token}}', 'requests']},
        'description': R3_DESC,
    },
    'event': [
        {'listen': 'prerequest', 'script': {'type': 'text/javascript', 'packages': {}, 'exec': R3_PRE}},
        {'listen': 'test', 'script': {'type': 'text/javascript', 'packages': {}, 'exec': R3_TEST}},
    ],
}

# Rename the existing by-ref request so the folder reads as an ordered flow.
byref['name'] = NEW_BYREF_NAME
byref['description'] = byref.get('description', '') + BYREF_DESC_ADD
texec = byref['event'][1]['script']['exec']
if len(texec) == 1:
    texec = texec[0].split('\n')
byref['event'][1]['script']['exec'] = texec + BYREF_VALIDATION_BLOCK

f09['item'] = [r1, r2, r3, byref]
f09['description'] = FOLDER_DESC

# ---------------------------------------------------------------------------
# New collection variables (KHQR merchant identity + flow outputs)
# ---------------------------------------------------------------------------
VARS = [
    ('khqr_bakong_id', 'abaakhppxxx@abaa', 'string', 'KHQR tag 30.00 - ABA-issued Bakong ID. Defaults to the guideline example value; replace with the ID ABA issued for your merchant.'),
    ('khqr_mid', '323080411495479', 'string', 'KHQR tag 30.01 - ABA-issued KHQR merchant ID (digits). Guideline example default; replace with your own.'),
    ('khqr_bank_name', 'ABA Bank', 'string', 'KHQR tag 30.02 - name of the acquiring bank.'),
    ('khqr_mcc', '5544', 'string', 'KHQR tag 52 - 4-digit merchant category code.'),
    ('khqr_merchant_name', 'LUCKY SUPER MARKET 102', 'string', 'KHQR tag 59 - display name when scanned (3-25 chars). Should match your ABA-registered profile.'),
    ('khqr_merchant_city', 'PHNOM PENH', 'string', 'KHQR tag 60 - merchant city (2-15 chars, from the guideline city list).'),
    ('khqr_payway_data', '0010PAYWAY@ABA020610259006049E4C', 'string', 'KHQR tag 62.68 - PayWay data field, provided by ABA. Guideline example default.'),
    ('khqr_mode', 'dynamic', 'string', 'dynamic = fixed-amount QR (tag 01=12, amount embedded); static = open amount (01=11, tag 54 omitted).'),
    ('khqr_expiry_minutes', '30', 'string', 'KHQR tag 99.01 - QR validity window in minutes from build time.'),
    ('khqr_merchant_ref', '', 'string', 'Generated per Build Offline KHQR send - the reconciliation key echoed in the webhook and by-ref inquiry.'),
    ('khqr_payload', '', 'string', 'Latest locally-built KHQR payload (TLV + CRC). Scan it from the Visualize tab of request 2.'),
    ('khqr_selftest', '', 'string', 'pass after the builder self-test (CRC vectors + guideline official sample) succeeded on the last send.'),
    ('khqr_amount_used', '', 'string', 'Amount embedded in the last built QR (empty for static mode).'),
    ('khqr_currency_used', '', 'string', 'Currency embedded in the last built QR (USD/KHR).'),
    ('khqr_transaction_id', '', 'string', 'transaction_id imported from the latest matching webhook.site pushback.'),
    ('khqr_payment_status', '', 'string', 'payment_status imported from the latest matching pushback.'),
    ('khqr_payment_status_code', '', 'string', 'payment_status_code from the pushback (0 = approved).'),
    ('khqr_payment_amount', '', 'string', 'payment_amount from the latest matching pushback.'),
    ('khqr_payment_currency', '', 'string', 'payment_currency from the latest matching pushback.'),
    ('khqr_callback_count', '', 'string', 'How many pushbacks matched the reference on the last pull (a KHQR can be paid multiple times).'),
    ('khqr_final_status', '', 'string', 'Final status asserted by the by-ref inquiry when run after building a QR (APPROVED or the raw status).'),
]
existing = {v['key'] for v in c['variable']}
mref_idx = next(i for i, v in enumerate(c['variable']) if v['key'] == 'merchant_ref')
added = 0
for offset, (key, value, vtype, desc) in enumerate(VARS, start=1):
    if key in existing:
        continue
    c['variable'].insert(mref_idx + offset, {'key': key, 'value': value, 'type': vtype, 'description': desc})
    added += 1

json.dump(c, open(FN, 'w', encoding='utf-8', newline='\n'), ensure_ascii=False, indent=2)
open(FN, 'a', encoding='utf-8', newline='\n').write('\n')
print(f'exp collection: folder 09 flow applied ({added} new variables)')

# Sync the folder-09 part so _build stays current for this folder.
part = {'folder': f09['name'], 'description': f09['description'], 'item': copy.deepcopy(f09['item'])}
with open('_build/part_09_khqr.json', 'w', encoding='utf-8', newline='\n') as fh:
    json.dump(part, fh, ensure_ascii=False, indent=2)
    fh.write('\n')
print('part_09 synced:', [it['name'] for it in part['item']])
