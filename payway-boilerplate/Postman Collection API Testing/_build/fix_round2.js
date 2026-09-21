/*
 * fix_round2.js — applies live-test round-2 findings:
 *  - Purchase: HTML 200 = success (checkout page) -> save last_tran_id
 *  - Check Transaction: status.code is the QUERY status; transaction status is
 *    data.payment_status_code (sandbox-verified)
 *  - Transaction List: dates must be 'yyyy-mm-dd hh:mm:ss' (plain date -> code 49)
 *  - Generate QR: response keys are qrString/qrImage; success code "0" (string)
 *  - Flow A2: poll via transaction-detail (check-transaction-2 cannot see QR
 *    transactions on sandbox) and loop on data.payment_status_code === 2
 */
const fs = require('fs');
const path = require('path');

function load(f) { return JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')); }
function save(f, j) { fs.writeFileSync(path.join(__dirname, f), JSON.stringify(j, null, 2) + '\n'); }
function editReq(part, reqName, fn) {
  const it = part.item.find((i) => i.name === reqName);
  if (!it) throw new Error('request not found in part: ' + reqName);
  fn(it);
  return it;
}
function events(it, listen) {
  const ev = (it.event || []).find((e) => e.listen === listen);
  if (!ev) throw new Error('no "' + listen + '" event on ' + it.name);
  return ev.script.exec;
}
function sub(exec, from, to, tag) {
  const i = exec.findIndex((l) => l.includes(from));
  if (i === -1) throw new Error('pattern not found (' + tag + '): ' + from);
  exec[i] = exec[i].split(from).join(to);
}

const SCHEMA_STATUS = JSON.stringify({
  type: 'object', required: ['status'],
  properties: { status: { type: 'object', required: ['code'], properties: { code: { type: ['number', 'string'] }, message: { type: 'string' } } } },
});

// ============ part_03_ecom.json ============
{
  const ecom = load('part_03_ecom.json');

  // Purchase: HTML 200 success path
  editReq(ecom, ecom.item[0].name, (it) => {
    const test = events(it, 'test');
    test.splice(0, test.length,
      "var ct = (pm.response.headers.get('Content-Type') || '').toLowerCase();",
      "if (pm.response.code === 200 && ct.indexOf('html') >= 0) {",
      "  // Hosted checkout flow: success = the checkout PAGE (HTML). Save tran_id for polling/refund.",
      "  pm.collectionVariables.set('last_tran_id', pm.collectionVariables.get('tran_id'));",
      "  pm.test('Purchase accepted - checkout page returned (HTML 200)', function () { pm.expect(pm.response.code).to.eql(200); });",
      "  console.log('HTML checkout page received. tran_id = ' + pm.collectionVariables.get('last_tran_id') + '. Open the page (Postman > Save Response > Save to file / open in browser) to pay.');",
      "} else {",
      "  var j = {};",
      "  try { j = pm.response.json(); } catch (e) {}",
      "  if (okStatus(j)) {",
      "    pm.collectionVariables.set('last_tran_id', pm.collectionVariables.get('tran_id'));",
      "    pm.test('Purchase accepted (status.code 0)', function () { pm.expect(okStatus(j)).to.eql(true); });",
      "  } else if (j.status) {",
      "    console.log('Purchase business error', j.status.code, '-', j.status.message);",
      "    console.log('Compare b4hash (Postman Console) with the docs order; see the error-code table in the collection README.');",
      "  }",
      "  if (j.status) console.log('status.code:', j.status.code, '-', j.status.message);",
      "  assertJsonSchema(" + SCHEMA_STATUS + ");",
      "}"
    );
  });

  // Check Transaction: query status vs payment status
  editReq(ecom, '3. Check Transaction (fast, recent)', (it) => {
    const test = events(it, 'test');
    test.splice(0, test.length,
      "var j = {};",
      "try { j = pm.response.json(); } catch (e) {}",
      "var sc = respCode(j);",
      "pm.collectionVariables.set('poll_status', sc);",
      "// Sandbox-verified: status.code is the QUERY status ('00' = query OK). The TRANSACTION",
      "// status is data.payment_status_code: 0 approved | 2 pending | 3 declined | 4 refunded | 7 cancelled",
      "var pay = j.data && j.data.payment_status_code !== undefined ? String(j.data.payment_status_code) : '';",
      "if (pay) pm.collectionVariables.set('last_pay_status', pay);",
      "pm.test('Check responded (query ' + sc + ', payment ' + (pay || 'n/a') + ')', function () { pm.expect(sc).to.not.be.empty; });",
      "console.log('payment_status:', (j.data && j.data.payment_status) || '-', '(code ' + pay + ') - tran:', j.data && j.data.transaction_id);",
      "console.log('status.code (query):', sc, '-', j.status && j.status.message);",
      "assertJsonSchema(" + SCHEMA_STATUS + ");"
    );
  });

  // Get Transaction Details: surface payment_status
  editReq(ecom, '2. Get Transaction Details', (it) => {
    const test = events(it, 'test');
    sub(test, "    if (j.data) console.log('tran status:', j.data.status, '-', JSON.stringify(j.data).slice(0, 300));",
      "    if (j.data) console.log('payment_status:', j.data.payment_status, '(code', String(j.data.payment_status_code) + ') - apv:', j.data.apv);",
      'detail pay status');
  });

  // Transaction List: datetime format (sandbox-verified)
  editReq(ecom, '6. Transaction List (filter)', (it) => {
    const pre = events(it, 'prerequest');
    const i = pre.findIndex((l) => l.includes("var yyyymmdd = d.getUTCFullYear()"));
    if (i === -1) throw new Error('list date lines not found');
    // replace the 3 date lines (yyyymmdd + 2 ifs) with datetime handling
    let removed = 0;
    while (removed < 3 && i < pre.length && /yyyymmdd|from_date|to_date/.test(pre[i])) { pre.splice(i, 1); removed++; }
    if (removed !== 3) throw new Error('expected 3 date lines, found ' + removed);
    pre.splice(i, 0,
      "// Sandbox-verified: dates must be 'yyyy-mm-dd hh:mm:ss' (plain yyyy-mm-dd -> code 49 'Invalid Start Date')",
      "var day = d.getUTCFullYear() + '-' + _pad(d.getUTCMonth() + 1) + '-' + _pad(d.getUTCDate());",
      "var fromD = C.get('from_date') || day + ' 00:00:00';",
      "var toD = C.get('to_date') || day + ' 23:59:59';",
      "if (fromD.length === 10) fromD += ' 00:00:00';",
      "if (toD.length === 10) toD += ' 23:59:59';",
      "C.set('from_date', fromD); C.set('to_date', toD);"
    );
    it.request.description = String(it.request.description)
      .replace('Dates `yyyy-mm-dd`. Auto-fills `from_date`/`to_date` = today unless already set.',
        'Dates **`yyyy-mm-dd hh:mm:ss`** (sandbox-verified 2026-09 - plain `yyyy-mm-dd` returns code 49 "Invalid Start Date"). Auto-fills today 00:00:00 -> 23:59:59 unless set. Max range 3 days; rate limit 50/min.');
  });

  save('part_03_ecom.json', ecom);
  console.log('part_03_ecom.json patched (round 2)');
}

// ============ part_04_qr.json ============
{
  const qr = load('part_04_qr.json');
  editReq(qr, 'Generate QR', (it) => {
    const test = events(it, 'test');
    test.splice(0, test.length,
      "var j = {};",
      "try { j = pm.response.json(); } catch (e) {}",
      "if (okStatus(j)) {",
      "  pm.collectionVariables.set('last_tran_id', pm.collectionVariables.get('tran_id'));",
      "  pm.test('QR generated (status.code 0)', function () { pm.expect(okStatus(j)).to.eql(true); });",
      "  // Sandbox-verified response keys: qrString (render as QR) + qrImage (base64 data-URL)",
      "  if (j.qrString) console.log('qrString:', String(j.qrString).slice(0, 48) + '...');",
      "  if (j.qrImage) console.log('qrImage: data-URL received (' + String(j.qrImage).length + ' chars) - paste into a browser to view');",
      "} else if (j.status) {",
      "  console.log('QR business error', j.status.code, '-', j.status.message);",
      "}",
      "assertJsonSchema({\"type\":\"object\",\"properties\":{\"status\":{\"type\":\"object\",\"properties\":{\"code\":{\"type\":[\"number\",\"string\"]},\"message\":{\"type\":\"string\"}}},\"qrString\":{\"type\":\"string\"},\"qrImage\":{\"type\":\"string\"}}});"
    );
    it.request.description = String(it.request.description)
      .replace('- Response `qr_data` = string to render as QR image; `qr_image` = optional template image URL.',
        '- Response (sandbox-verified): `qrString` = KHQR string to render as a QR image; `qrImage` = base64 PNG data-URL of the templated QR.');
  });
  save('part_04_qr.json', qr);
  console.log('part_04_qr.json patched (round 2)');
}

// ============ part_11_polling.json ============
{
  const pol = load('part_11_polling.json');

  // A1: fix success test + log qrString
  editReq(pol, 'A1 - Create QR', (it) => {
    const test = events(it, 'test');
    test.splice(0, test.length,
      "var j = {};",
      "try { j = pm.response.json(); } catch (e) {}",
      "if (okStatus(j)) {",
      "  pm.collectionVariables.set('last_tran_id', pm.collectionVariables.get('tran_id'));",
      "  pm.test('QR created (status.code 0)', function () { pm.expect(okStatus(j)).to.eql(true); });",
      "  if (j.qrString) console.log('qrString:', String(j.qrString).slice(0, 48) + '... (scan with the ABA sandbox app, or wait for the auto-callback)');",
      "} else if (j.status) {",
      "  console.log('QR business error', j.status.code, '-', j.status.message);",
      "}"
    );
    it.request.description = String(it.request.description)
      .replace('Simulates the payer completing the transaction in the ABA app (in sandbox, PayWay may auto-approve or you can wait for the callback).',
        'Sandbox note: the KHQR stays PENDING until paid. PayWay may push a callback when it settles; `transaction-detail` always sees the record, unlike check-transaction-2 (recent-window, card transactions).');
  });

  // A2: replace with a transaction-detail poller (universal)
  const a2 = pol.item.find((i) => i.name === 'A2 - Poll Check Transaction (loops)');
  if (!a2) throw new Error('A2 not found');
  a2.name = 'A2 - Poll Transaction Status (loops)';
  a2.request = {
    method: 'POST',
    header: [{ key: 'Content-Type', value: 'application/json' }],
    body: {
      mode: 'raw',
      options: { raw: { language: 'json' } },
      raw: '{\n  "req_time": "{{req_time}}",\n  "merchant_id": "{{merchant_id}}",\n  "tran_id": "{{last_tran_id}}",\n  "hash": "{{computed_hash}}"\n}'
    },
    url: {
      raw: '{{baseUrl}}/api/payment-gateway/v1/payments/transaction-detail',
      host: ['{{baseUrl}}'],
      path: ['api', 'payment-gateway', 'v1', 'payments', 'transaction-detail'],
    },
    description: 'Flow A step 2. **Polling loop** via Get Transaction Details (works for QR *and* card transactions - sandbox-verified that check-transaction-2 cannot see KHQR records). Recomputes the hash every iteration and calls itself via `postman.setNextRequest` while `data.payment_status_code` is `2` (PENDING) or the record is not visible yet, up to `{{max_polls}}` tries. Run in the Collection Runner with delay >= 1000 ms.',
  };
  a2.event = [
    {
      listen: 'prerequest',
      script: {
        type: 'text/javascript',
        exec: [
          "var C = pm.collectionVariables;",
          "var reqTime = utcNow();",
          "var tranId = C.get('last_tran_id') || C.get('tran_id');",
          "if (!tranId) throw new Error('No tran_id to poll - run A1 first (sets {{last_tran_id}}).');",
          "var msg = reqTime + C.get('merchant_id') + tranId;",
          "C.set('req_time', reqTime);",
          "C.set('tran_id', tranId);",
          "C.set('computed_hash', hmac512(msg, C.get('secret_key')));",
          "console.log('poll b4hash:', msg);"
        ],
      },
    },
    {
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: [
          "var C = pm.collectionVariables;",
          "var count = parseInt(C.get('poll_count') || '0', 10) + 1;",
          "var max = parseInt(C.get('max_polls') || '10', 10);",
          "C.set('poll_count', String(count));",
          "var j = {};",
          "try { j = pm.response.json(); } catch (e) {}",
          "var sc = respCode(j);",
          "// transaction status lives in data.payment_status_code (sandbox-verified):",
          "// 0 approved | 2 pending | 3 declined | 4 refunded | 7 cancelled",
          "var pay = j.data && j.data.payment_status_code !== undefined ? String(j.data.payment_status_code) : '';",
          "C.set('poll_status', pay || sc);",
          "pm.test('Poll ' + count + '/' + max + ' - status ' + (pay || sc || 'n/a'), function () { pm.expect(sc).to.not.be.empty; });",
          "var pending = pay === '2' || (sc !== '0' && sc !== '00');",
          "if (pending && count < max) {",
          "  postman.setNextRequest('A2 - Poll Transaction Status (loops)');",
          "  console.log('payment_status:', (j.data && j.data.payment_status) || 'not visible yet', '- polling again (' + count + '/' + max + ')');",
          "} else {",
          "  postman.setNextRequest('A3 - Get Transaction Details');",
          "  console.log('final payment_status:', (j.data && j.data.payment_status) || sc, '- iteration', count + '/' + max);",
          "}"
        ],
      },
    },
  ];

  // README sequence naming
  editReq(pol, 'Flow B - README: run the flows', (it) => {
    it.request.description = String(it.request.description)
      .replace('`A1 Create QR` -> `A2 Poll` (loops on itself via setNextRequest until status 2->0/3/4/7, or 10 tries) -> `A3 Get Details` -> `A4 Refund`',
        '`A1 Create QR` -> `A2 Poll Transaction Status` (loops while `data.payment_status_code` = 2 PENDING, max `{{max_polls}}`) -> `A3 Get Details` -> `A4 Refund`')
      .replace('> Poll loop: `{{poll_count}}` increments each poll; `{{max_polls}}` = 10. Status `2` (PENDING) loops; any other status moves on.',
        '> Poll loop: `{{poll_count}}` increments each poll; `{{max_polls}}` = 10. Payment status `2` (PENDING) or "not visible yet" loops; any settled status moves on.');
  });

  save('part_11_polling.json', pol);
  console.log('part_11_polling.json patched (round 2)');
}
console.log('\nRound-2 patches applied.');
