# Adds the live-verified (SANDBOX-FINDINGS §23) void-payment-link request to the
# exp Postman collection folder 05, chains payment_link_id from Create, syncs
# _build/part_05_paymentlink.json. Idempotent: skips if Void already present.
import json, copy, os

os.chdir(os.path.join(os.path.dirname(__file__), '..', '..', 'payway-boilerplate', 'Postman Collection API Testing'))
FN = 'exp-PayWay API — Complete Collection.postman_collection.json'
c = json.load(open(FN, encoding='utf-8'))
f05 = [f for f in c['item'] if f['name'].startswith('05')][0]

PRE = [
"// Restore the shared PayWay helper library (Postman runs every script in its own scope):",
"var __h = pm.collectionVariables.get('__helpers');",
"if (!__h) throw new Error('The `__helpers` collection variable is missing - re-import the full collection JSON (it holds the shared helper library source).');",
"eval(__h);",
"// Void Payment Link - PERMANENT and IRREVERSIBLE. Signs like detail: RSA({mc_id,id}); hash: request_time+merchant_id+merchant_auth",
"var C = pm.collectionVariables;",
"var linkId = (C.get('payment_link_id') || '').trim();",
"if (!linkId) {",
"  throw new Error('No {{payment_link_id}}. Send \"Create Payment Link\" first (its test saves data.id automatically), or paste a Link ID into the payment_link_id collection variable. The id is the create response data.id - NOT the hosted slug, NOT tran_id.');",
"}",
"var reqTime = utcNow();",
"var payload = { mc_id: C.get('merchant_id'), id: linkId };",
"var auth = rsaFallback(JSON.stringify(payload), C.get('rsa_public_key'), 'pl_merchant_auth');",
"if (!auth) {",
"  throw new Error('merchant_auth could not be computed: node-forge is unavailable and {{pl_merchant_auth}} is empty. Install node-forge (Edit collection > Libraries) or paste a pre-encrypted {mc_id,id} value.');",
"}",
"var msg = reqTime + C.get('merchant_id') + auth;",
"C.set('request_time', reqTime);",
"C.set('computed_merchant_auth', auth);",
"C.set('computed_hash', hmac512(msg, C.get('secret_key')));",
"console.log('VOIDING link', linkId, '- this is IRREVERSIBLE. RSA payload:', JSON.stringify(payload));",
"console.log('b4hash:', msg);",
]

TEST = [
"// Restore the shared PayWay helper library (Postman runs every script in its own scope):",
"var __h = pm.collectionVariables.get('__helpers');",
"if (!__h) throw new Error('The `__helpers` collection variable is missing - re-import the full collection JSON (it holds the shared helper library source).');",
"eval(__h);",
"var j = {};",
"try { j = pm.response.json(); } catch (e) {}",
"var http = pm.response.code;",
"var code = String(j.statusCode || (j.status && j.status.code) || j.code || '');",
"var msgTxt = (j.status && j.status.message) || j.message || j.title || '';",
"if (rsaMissing(j)) {",
"  pm.test('SKIPPED - RSA payload not configured', function () { pm.expect(true).to.eql(true); });",
"  console.log('SKIPPED: the gateway needs an RSA-encrypted merchant_auth. Install the node-forge library (collection > Libraries) or paste a pre-computed value into {{pl_merchant_auth}} - see the request description.');",
"} else if (http === 200 && (code === '0' || code === '00')) {",
"  pm.test('Payment link VOIDED (status 00)', function () {",
"    pm.expect(code).to.be.oneOf(['0', '00']);",
"  });",
"  console.log('Link permanently voided. Gateway log id (tran_id):', j.tran_id, '(numeric - a log id, not a payment).');",
"  console.log('NEXT: re-send \"Get Payment Link Details\" - status now reads \"VOIDED\" and the hosted page renders the invalid-data shell (code 07): the customer-facing form is dead.');",
"} else if (http === 403 && code === 'PTL188') {",
"  pm.test('Already voided (PTL188) - terminal state, not an error', function () {",
"    pm.expect(code).to.eql('PTL188');",
"  });",
"  console.log('PTL188:', msgTxt || 'The payment link is already voided.');",
"  console.log('Treat as success: the link is already in the desired terminal state. Void is NOT idempotent - do not retry.');",
"} else if (http === 403 && code === '96') {",
"  pm.test('Unknown link id (96) - check {{payment_link_id}}', function () {",
"    pm.expect(code).to.eql('96');",
"  });",
"  console.log('Code 96 \"Invalid merchant data\": the id is not a known Link ID. Use the create response data.id (NOT the hosted slug, NOT tran_id).');",
"} else {",
"  pm.test('Void endpoint responded (HTTP ' + http + ', code ' + (code || 'none') + ')', function () {",
"    pm.expect(http).to.be.a('number');",
"  });",
"  console.log('Unexpected void response - HTTP', http, 'code', code, '-', msgTxt);",
"}",
]

DESC = """## ⚡ Quick test
1. Send **Create Payment Link** first — its test script saves the new link's `data.id` into `{{payment_link_id}}` (or paste a Link ID you own into that variable).
2. Send this request. **Heads-up: void is PERMANENT and IRREVERSIBLE** — the link can never receive payments again.
3. Expect **HTTP 200** `status.code "00"`. Then re-send **Get Payment Link Details**: the status now reads **VOIDED**, and the hosted page shows customers an invalid-data shell (code 07) instead of the payment form.

## Void Payment Link — permanently cancel an unpaid link
**Undocumented endpoint** (contract live-verified on the PayWay sandbox, 2026-09-11): `POST /api/merchant-portal/merchant-access/payment-link/void`. Signs exactly like detail — `merchant_auth` is the RSA-encrypted `{mc_id, id}` where **`id` is the create-response `data.id`** (NOT the hosted slug, NOT `tran_id`); `hash` = base64(HMAC-SHA512(`request_time + merchant_id + merchant_auth`, `{{secret_key}}`)). Content-Type is lenient (JSON and form-urlencoded both accepted; this request sends JSON).

| Response | Meaning |
|---|---|
| 200 `status.code "00"` | Voided. The response `tran_id` is the gateway LOG id (arrives numeric) — not a transaction |
| 403 `PTL188` | **Already voided** — terminal state, treat as success; void is NOT idempotent, do not retry |
| 403 `96` | Unknown link id — check `{{payment_link_id}}` |
| other 4xx, `PTL04`-family | Validation rejection — see the folder notes |

**Rules of thumb**
- Void **unpaid** links only — for paid transactions use the Refund endpoint instead.
- After a void: detail reports `status: "VOIDED"` with an advanced `updated_at`; `total_trxn`/`total_amount` stay 0.
- This family has **no EXPIRED status** — expiry leaves the hosted page alive; void is the only way to kill the customer-facing form early.

`b4hash:` in the Postman Console shows the exact hash input before each Send."""

if any(it['name'] == 'Void Payment Link' for it in f05['item']):
    print('void already present - nothing to do')
    raise SystemExit(0)

det = [it for it in f05['item'] if 'Details' in it['name']][0]
void = copy.deepcopy(det)
void['name'] = 'Void Payment Link'
void['description'] = DESC
void['event'] = [
    {"listen": "prerequest", "script": {"exec": PRE, "type": "text/javascript", "packages": {}}},
    {"listen": "test", "script": {"exec": TEST, "type": "text/javascript", "packages": {}}},
]
u = void['request']['url']
u['raw'] = u['raw'].rsplit('/', 1)[0] + '/void'
u['path'] = u['path'][:-1] + ['void']

f05['item'].insert(f05['item'].index(det) + 1, void)

cr = [it for it in f05['item'] if it['name'] == 'Create Payment Link'][0]
t = cr['event'][1]['script']['exec']
assert isinstance(t, list) and len(t) == 1
if 'payment_link_id' not in t[0]:
    t[0] += ("\n\n// Chain: save the created link id for Details/Void (payment_link_id = create response data.id)\n"
             "try {\n"
             "  var __cj = pm.response.json();\n"
             "  if (__cj && __cj.data && __cj.data.id) {\n"
             "    pm.collectionVariables.set('payment_link_id', String(__cj.data.id));\n"
             "    console.log('payment_link_id saved:', String(__cj.data.id), '- NEXT: \"Get Payment Link Details\", or \"Void Payment Link\" (irreversible).');\n"
             "  }\n"
             "} catch (e) {}")

OLD_D = "Create a shareable payment link (sent via WhatsApp/email/SMS) and query its stats."
NEW_D = ("Create a shareable payment link (sent via WhatsApp/email/SMS), query its stats, "
         "and void (permanently cancel) an unpaid link - void is IRREVERSIBLE and kills the "
         "hosted page for customers (code 07 shell).")
assert OLD_D in f05['description']
f05['description'] = f05['description'].replace(OLD_D, NEW_D)

json.dump(c, open(FN, 'w', encoding='utf-8', newline='\n'), ensure_ascii=False, indent=2)
open(FN, 'a', encoding='utf-8', newline='\n').write('\n')
print('exp collection: void added, create chains id, folder desc updated')

p = json.load(open('_build/part_05_paymentlink.json', encoding='utf-8'))
assert p['folder'] == f05['name']
if OLD_D in p['description']:
    p['description'] = p['description'].replace(OLD_D, NEW_D)
if not any(it['name'] == 'Void Payment Link' for it in p['item']):
    p['item'].append(copy.deepcopy(void))
json.dump(p, open('_build/part_05_paymentlink.json', 'w', encoding='utf-8', newline='\n'), ensure_ascii=False, indent=2)
open('_build/part_05_paymentlink.json', 'a', encoding='utf-8', newline='\n').write('\n')
print('part_05 synced:', [it['name'] for it in p['item']])
