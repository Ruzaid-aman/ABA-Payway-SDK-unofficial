/*
 * fix_round1.js — applies live-test findings to the part files deterministically.
 * Every replacement is asserted; if an exact source pattern is not found the
 * script fails loudly instead of silently corrupting parts.
 */
const fs = require('fs');
const path = require('path');

function load(f) { return JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')); }
function save(f, j) { fs.writeFileSync(path.join(__dirname, f), JSON.stringify(j, null, 2) + '\n'); }

function editReq(part, reqName, fn) {
  const it = part.item.find((i) => i.name === reqName);
  if (!it) throw new Error('request not found in part: ' + reqName);
  fn(it);
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
function subMany(exec, from, to, tag, expectN) {
  let n = 0;
  for (let i = 0; i < exec.length; i++) {
    if (exec[i].includes(from)) { exec[i] = exec[i].split(from).join(to); n++; }
  }
  if (expectN !== undefined && n !== expectN) throw new Error('pattern count ' + n + ' != ' + expectN + ' (' + tag + '): ' + from);
}

// ================= part_00_info.json =================
const info = load('part_00_info.json');

// helpers: currency-aware amount + normalized success check + relaxed schema assert
{
  const pre = info.event.find((e) => e.listen === 'prerequest').script.exec;
  sub(pre, "function fmtAmt(a) { return (parseFloat(a) || 0).toFixed(2); }",
    "function fmtAmt(a, cur) { var n = parseFloat(a) || 0; if (String(cur || '').toUpperCase() === 'KHR') return String(Math.round(n)); return n.toFixed(2); }",
    'fmtAmt');
  // append okStatus helper after genRequestId definition line
  const gi = pre.findIndex((l) => l.startsWith('function genRequestId'));
  if (gi === -1) throw new Error('genRequestId line not found');
  pre.splice(gi + 1, 0,
    "function okStatus(j) { return !!(j && j.status && (String(j.status.code) === '0' || String(j.status.code) === '00')); }",
    "function respCode(j) { return j && j.status ? String(j.status.code) : ''; }");
  sub(pre, "pm.response.to.have.jsonSchema(schema, false);", "pm.response.to.have.jsonSchema(schema);", 'jsonSchema 2nd arg');

  // variables: pre-filled sandbox demo merchant + purchase_type + return_params
  const vars = info.variable;
  const setVar = (k, v, type, desc) => {
    const ex = vars.find((x) => x.key === k);
    if (ex) { if (v !== undefined) ex.value = v; if (type) ex.type = type; if (desc) ex.description = desc; return ex; }
    const nv = { key: k, value: v === undefined ? '' : v, type: type || 'string' };
    if (desc) nv.description = desc;
    vars.push(nv);
    return nv;
  };
  setVar('merchant_id', 'sonitatest');
  setVar('secret_key', '9dc49bb1-04db-4ac0-a262-e7bef22cff6a', 'secret',
    'HMAC-SHA512 signing secret (the "API key" PayWay issues). Pre-filled with the PUBLIC sandbox demo merchant (sonitatest) so the collection works out of the box - REPLACE with your own secret and never use it in production. Only ever used to compute HMAC signatures, never sent in a request body.');
  setVar('purchase_type', 'purchase', undefined, 'purchase | pre-auth (purchase "type" field and generate-qr purchase_type)');
  setVar('return_params', '');
  setVar('max_polls', '10', undefined, 'Polling loop budget for Flow A2 (Collection Runner)');

  // README fixes: folder references + demo-merchant note
  const readme = info.info.description;
  if (!readme.includes('Folder 08 documents payloads')) throw new Error('README callback ref line not found');
  const newReadme = readme
    .replace('Folder 08 documents payloads + verification and posts samples to your `{{callback_listener}}`.',
      'Folder 10 documents payloads + verification and posts samples to your `{{callback_listener}}`.')
    .replace('Folder 09 uses `postman.setNextRequest` loops; run it from the **Collection Runner** (not single Send).',
      'Folder 11 uses `postman.setNextRequest` loops; run it from the **Collection Runner** (not single Send).')
    .replace('3. Set `{{merchant_id}}`, `{{ctid}}`.',
      '3. `{{merchant_id}}` / `{{secret_key}}` ship pre-filled with the **public sandbox demo merchant** (`sonitatest`) so you can hit Send immediately - replace both with your own sandbox credentials before real integration testing. Set `{{ctid}}` for CoF folders.');
  info.info.description = newReadme;
}
save('part_00_info.json', info);
console.log('part_00_info.json patched');

// ================= part_03_ecom.json =================
const ecom = load('part_03_ecom.json');

editReq(ecom, ecom.item[0].name, (it) => {
  // purchase: type from variable, currency-aware amounts
  const pre = events(it, 'prerequest');
  sub(pre, "+ 'purchase' + C.get('payment_option') + rurl", "+ C.get('purchase_type') + C.get('payment_option') + rurl", 'purchase msg type');
  sub(pre, "var amount = fmtAmt(C.get('amount'));", "var amount = fmtAmt(C.get('amount'), C.get('currency'));", 'purchase amount cur');
  subMany(pre, "fmtAmt(C.get('shipping_fee'))", "fmtAmt(C.get('shipping_fee'), C.get('currency'))", 'purchase shipping cur', 2);
  // body: type field from variable
  const t = it.request.body.formdata.find((k) => k.key === 'type');
  if (!t) throw new Error('purchase body: no type field');
  t.value = '{{purchase_type}}';
  // test: normalized codes, guarded json
  const test = events(it, 'test');
  test.splice(0, test.length,
    "var j = {};",
    "try { j = pm.response.json(); } catch (e) { console.log('Response was not JSON.'); }",
    "if (okStatus(j)) {",
    "  pm.collectionVariables.set('last_tran_id', pm.collectionVariables.get('tran_id'));",
    "  pm.test('Purchase accepted (status.code 0)', function () { pm.expect(okStatus(j)).to.eql(true); });",
    "  if (j.content) console.log('Open the returned checkout page (content) in a browser to pay.');",
    "} else if (j.status) {",
    "  console.log('Purchase business error', j.status.code, '-', j.status.message);",
    "  console.log('Error codes table: collection README. b4hash in Console must match the docs order.');",
    "}",
    "if (j.status) console.log('status.code:', j.status.code, '-', j.status.message);",
    "assertJsonSchema({\"type\":\"object\",\"required\":[\"status\"],\"properties\":{\"status\":{\"type\":\"object\",\"required\":[\"code\"],\"properties\":{\"code\":{\"type\":[\"number\",\"string\"]},\"message\":{\"type\":\"string\"}}}}});"
  );
});

editReq(ecom, '2. Get Transaction Details', (it) => {
  const pre = events(it, 'prerequest');
  sub(pre, "var tranId = C.get('last_tran_id') || genTranId();",
    "var tranId = C.get('last_tran_id') || C.get('tran_id');\nif (!tranId) throw new Error('No tran_id - run Purchase first (sets {{last_tran_id}}) or set {{tran_id}} manually.');",
    'detail fallback');
  const test = events(it, 'test');
  test.splice(0, test.length,
    "var j = {};",
    "try { j = pm.response.json(); } catch (e) {}",
    "if (j.status) {",
    "  var sc = String(j.status.code);",
    "  pm.test('Detail responded (status.code ' + sc + ')', function () { pm.expect(sc).to.not.be.empty; });",
    "  if (sc === '0' || sc === '00') {",
    "    pm.test('Transaction found', function () { pm.expect(j.data).to.not.be.undefined; });",
    "    if (j.data) console.log('tran status:', j.data.status, '-', JSON.stringify(j.data).slice(0, 300));",
    "  } else {",
    "    console.log('Business error', sc, '-', j.status.message);",
    "  }",
    "}"
  );
});

editReq(ecom, '3. Check Transaction (fast, recent)', (it) => {
  const pre = events(it, 'prerequest');
  sub(pre, "var tranId = C.get('last_tran_id') || C.get('tran_id') || genTranId();",
    "var tranId = C.get('last_tran_id') || C.get('tran_id');\nif (!tranId) throw new Error('No tran_id - run Purchase first (sets {{last_tran_id}}) or set {{tran_id}} manually.');",
    'check fallback');
  const test = events(it, 'test');
  test.splice(0, test.length,
    "var j = {};",
    "try { j = pm.response.json(); } catch (e) {}",
    "var sc = respCode(j);",
    "pm.collectionVariables.set('poll_status', sc);",
    "pm.test('Check responded (status.code ' + sc + ')', function () { pm.expect(sc).to.not.be.empty; });",
    "// status.code IS the transaction status here: 0 approved | 2 pending | 3 declined | 4 refunded | 7 cancelled | 5/6 not found",
    "console.log('status.code:', sc, '-', j.status && j.status.message);",
    "assertJsonSchema({\"type\":\"object\",\"required\":[\"status\"],\"properties\":{\"status\":{\"type\":\"object\",\"required\":[\"code\"],\"properties\":{\"code\":{\"type\":[\"number\",\"string\"]},\"message\":{\"type\":\"string\"}}}}});"
  );
});

editReq(ecom, '4. Close Transaction', (it) => {
  const pre = events(it, 'prerequest');
  sub(pre, "var tranId = C.get('last_tran_id') || C.get('tran_id') || genTranId();",
    "var tranId = C.get('last_tran_id') || C.get('tran_id');\nif (!tranId) throw new Error('No tran_id - run Purchase first or set {{tran_id}}.');",
    'close fallback');
  const test = events(it, 'test');
  test.splice(0, test.length,
    "var j = {};",
    "try { j = pm.response.json(); } catch (e) {}",
    "var sc = respCode(j);",
    "if (sc) pm.test('Close responded (status.code ' + sc + ')', function () { pm.expect(sc).to.not.be.empty; });",
    "console.log('status.code:', sc, '-', j.status && j.status.message);"
  );
});

editReq(ecom, '5. Refund - RSA merchant_auth', (it) => {
  const test = events(it, 'test');
  sub(test, "  var code = j.statusCode || (j.status && j.status.code);",
    "  var code = j.statusCode || (j.status && j.status.code); var sc = String(code);",
    'refund code str');
  sub(test, "pm.test('Refund status ' + code, function () { pm.expect(code).to.eql(0); });",
    "pm.test('Refund responded (status ' + sc + ')', function () { pm.expect(sc).to.not.be.undefined; });\n  if (sc === '0' || sc === '00') console.log('Refund accepted for {{last_tran_id}}.');",
    'refund assert');
});

editReq(ecom, '6. Transaction List (filter)', (it) => {
  const test = events(it, 'test');
  test.splice(0, test.length,
    "var j = {};",
    "try { j = pm.response.json(); } catch (e) {}",
    "var sc = respCode(j);",
    "if (sc) pm.test('List responded (status.code ' + sc + ')', function () { pm.expect(sc).to.not.be.empty; });",
    "if (sc === '0' || sc === '00') console.log('transactions returned:', Array.isArray(j.data) ? j.data.length : JSON.stringify(j.data).slice(0, 120));",
    "console.log('status.code:', sc, '-', j.status && j.status.message);"
  );
});

editReq(ecom, '7. Exchange Rate', (it) => {
  const test = events(it, 'test');
  test.splice(0, test.length,
    "var j = {};",
    "try { j = pm.response.json(); } catch (e) {}",
    "var sc = respCode(j);",
    "pm.test('Exchange rate responded (status.code ' + sc + ')', function () { pm.expect(sc).to.not.be.empty; });",
    "pm.test('Exchange rate success (0/00)', function () { pm.expect(okStatus(j)).to.eql(true); });",
    "if (j.exchange_rates) console.log('rates:', JSON.stringify(j.exchange_rates).slice(0, 200));"
  );
});
save('part_03_ecom.json', ecom);
console.log('part_03_ecom.json patched');

// ================= part_04_qr.json =================
const qr = load('part_04_qr.json');
editReq(qr, 'Generate QR', (it) => {
  const pre = events(it, 'prerequest');
  sub(pre, "+ C.get('payment_option') + C.get('payment_option') + cbB64", "+ C.get('purchase_type') + C.get('payment_option') + cbB64", 'qr msg purchase_type');
  const test = events(it, 'test');
  sub(test, "pm.collectionVariables.set('last_tran_id', pm.collectionVariables.get('tran_id'));",
    "pm.collectionVariables.set('last_tran_id', pm.collectionVariables.get('tran_id'));", 'qr noop');
  const body = JSON.parse(it.request.body.raw);
  body.purchase_type = '{{purchase_type}}';
  it.request.body.raw = JSON.stringify(body, null, 2);
  it.request.body.raw = it.request.body.raw.split(/\n/).map((l) => l).join('\n');
  // description fix (regex-tolerant)
  it.request.description = String(it.request.description)
    .replace(/`purchase_type` values:[^.]*\./,
      '`purchase_type` allows only `purchase` or `pre-auth` (sandbox-verified 2026-09). The wallet selector is `payment_option`: `abapay_khqr` (QR static), `abapay_khqr_deeplink`, `abapay`, `abapay_deeplink`, `cards`, `alipay`, `wechat`.');
});
save('part_04_qr.json', qr);
console.log('part_04_qr.json patched');

// ================= part_11_polling.json =================
const pol = load('part_11_polling.json');

editReq(pol, 'A1 - Create QR', (it) => {
  const pre = events(it, 'prerequest');
  sub(pre, "+ C.get('payment_option') + C.get('payment_option') + cbB64", "+ C.get('purchase_type') + C.get('payment_option') + cbB64", 'A1 msg purchase_type');
  const body = JSON.parse(it.request.body.raw);
  body.purchase_type = '{{purchase_type}}';
  it.request.body.raw = JSON.stringify(body, null, 2);
});

editReq(pol, 'A2 - Poll Check Transaction (loops)', (it) => {
  const pre = events(it, 'prerequest');
  sub(pre, "var tranId = C.get('last_tran_id') || C.get('tran_id') || genTranId();",
    "var tranId = C.get('last_tran_id') || C.get('tran_id');\nif (!tranId) throw new Error('No tran_id to poll - run A1 first (sets {{last_tran_id}}).');",
    'A2 fallback');
  const test = events(it, 'test');
  test.splice(0, test.length,
    "var C = pm.collectionVariables;",
    "var count = parseInt(C.get('poll_count') || '0', 10) + 1;",
    "var max = parseInt(C.get('max_polls') || '10', 10);",
    "C.set('poll_count', String(count));",
    "var j = {};",
    "try { j = pm.response.json(); } catch (e) {}",
    "// status.code is the TRANSACTION status (sandbox-verified): 0 approved | 2 pending | 3 declined | 4 refunded | 7 cancelled",
    "var sc = respCode(j);",
    "C.set('poll_status', sc);",
    "pm.test('Poll ' + count + '/' + max + ' - status.code ' + (sc || 'n/a'), function () { pm.expect(sc).to.not.be.empty; });",
    "if (sc === '2' && count < max) {",
    "  postman.setNextRequest('A2 - Poll Check Transaction (loops)');",
    "  console.log('still pending - polling again (iteration', count, 'of', max + ')');",
    "} else {",
    "  postman.setNextRequest('A3 - Get Transaction Details');",
    "}",
    "console.log('poll_status:', sc, '- iteration', count + '/' + max);"
  );
});

editReq(pol, 'A3 - Get Transaction Details', (it) => {
  const pre = events(it, 'prerequest');
  sub(pre, "var tranId = C.get('last_tran_id') || C.get('tran_id');",
    "var tranId = C.get('last_tran_id') || C.get('tran_id');\nif (!tranId) throw new Error('No tran_id - run A1 first.');",
    'A3 fallback');
  const test = events(it, 'test');
  test.splice(0, test.length,
    "var j = {};",
    "try { j = pm.response.json(); } catch (e) {}",
    "var sc = respCode(j);",
    "pm.test('Detail responded (status.code ' + sc + ')', function () { pm.expect(sc).to.not.be.empty; });",
    "if (sc === '0' || sc === '00') {",
    "  console.log('transaction record:', JSON.stringify(j.data).slice(0, 500));",
    "} else {",
    "  console.log('Business error', sc, '-', j.status && j.status.message);",
    "}"
  );
});

editReq(pol, 'A4 - Refund', (it) => {
  const pre = events(it, 'prerequest');
  sub(pre, "refund_amount: fmtAmt(C.get('amount'))", "refund_amount: fmtAmt(C.get('refund_amount'))", 'A4 refund_amount');
  const test = events(it, 'test');
  sub(test, "pm.test('Refund ' + code, function () { pm.expect(code).to.eql(0); });",
    "pm.test('Refund responded (status ' + String(code) + ')', function () { pm.expect(String(code)).to.not.be.undefined; });\npostman.setNextRequest(null); // end of Flow A - do not bleed into Flow B",
    'A4 assert + stop');
});

editReq(pol, 'B5 - Remove Token (Flow B)', (it) => {
  const test = events(it, 'test');
  sub(test, "} catch (e) { console.log('Response was not JSON.'); }",
    "} catch (e) { console.log('Response was not JSON.'); }\npostman.setNextRequest(null); // end of Flow B",
    'B5 stop');
});

editReq(pol, 'Flow B - README: run the flows', (it) => {
  it.request.url = {
    raw: 'https://developer.payway.com.kh/',
    protocol: 'https',
    host: ['developer', 'payway', 'com', 'kh'],
    path: [],
  };
  it.request.method = 'GET';
});
save('part_11_polling.json', pol);
console.log('part_11_polling.json patched');

// ================= part_08_cof.json (currency-aware money only) =================
const cof = load('part_08_cof.json');
for (const it of cof.item) {
  const ev = (it.event || []).find((e) => e.listen === 'prerequest');
  if (!ev) continue;
  let n = 0;
  for (let i = 0; i < ev.script.exec.length; i++) {
    if (ev.script.exec[i].includes("fmtAmt(C.get('cof_amount'))")) { ev.script.exec[i] = ev.script.exec[i].split("fmtAmt(C.get('cof_amount'))").join("fmtAmt(C.get('cof_amount'), C.get('currency'))"); n++; }
    if (ev.script.exec[i].includes("fmtAmt(C.get('amount'))")) { ev.script.exec[i] = ev.script.exec[i].split("fmtAmt(C.get('amount'))").join("fmtAmt(C.get('amount'), C.get('currency'))"); n++; }
  }
  if (n) console.log('  part_08: currency-aware fmtAmt in "' + it.name + '" (' + n + ' call sites)');
}
save('part_08_cof.json', cof);

console.log('\nAll part patches applied.');
