/*
 * fix_round5.js — response rendering via Postman Visualizer + URL structure fixes.
 *
 * Visualizer additions (all guarded so newman/CI runtimes are unaffected):
 *  - Purchase / Link Card: render the returned hosted page in the Visualize tab (srcdoc iframe)
 *  - Generate QR / A1 / Subscription: render the KHQR image (qrImage data-URL) + qrString
 *  - CoF Link Account / B1: render qr_string as a QR (CDN lib fallback, no data leaves the machine)
 *  - Global helper library: escHtml / visualizeHtml / visualizeQr
 */
const fs = require('fs');
const path = require('path');

function load(f) { return JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')); }
function save(f, j) { fs.writeFileSync(path.join(__dirname, f), JSON.stringify(j, null, 2) + '\n'); }
function findItem(part, prefix) {
  const it = part.item.find((i) => i.name.startsWith(prefix));
  if (!it) throw new Error('request not found in part: ' + prefix);
  return it;
}
function exec(it, listen) {
  const ev = (it.event || []).find((e) => e.listen === listen);
  if (!ev) throw new Error('no "' + listen + '" event on ' + it.name);
  return ev.script.exec;
}
function sub(execArr, from, to, tag) {
  const i = execArr.findIndex((l) => l.includes(from));
  if (i === -1) throw new Error('pattern not found (' + tag + '): ' + from);
  execArr[i] = execArr[i].split(from).join(to);
}
function docUrl(raw, pathSeg) {
  return { raw, protocol: 'https', host: ['developer', 'payway', 'com', 'kh'], path: [pathSeg] };
}

// ---------- part_00: visualizer helpers + clean collection id ----------
{
  const info = load('part_00_info.json');
  info.info._postman_id = 'a2f6a97a-1a67-4a2e-9c66-5bd5c9f1f7e2';
  const pre = info.event.find((e) => e.listen === 'prerequest').script.exec;
  if (pre.some((l) => l.includes('function visualizeHtml'))) throw new Error('visualizer helpers already present');
  pre.push(
    "function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/\"/g, '&quot;').replace(/</g, '&lt;'); }",
    "// ---- Postman Visualizer helpers (no-ops in newman/CI) ----",
    "function visualizeHtml(html, note) {",
    "  if (typeof pm.visualizer === 'undefined' || !pm.visualizer.set) return;",
    "  var tpl = '<html><head><meta charset=\"utf-8\"><style>body{margin:0}#bar{font:12px sans-serif;padding:6px 10px;background:#fffbe6;border-bottom:1px solid #eee}iframe{width:100%;height:calc(100vh - 29px);border:0}</style></head><body><div id=\"bar\">{{note}}</div><iframe srcdoc=\"{{{doc}}}\"></iframe></body></html>';",
    "  pm.visualizer.set(tpl, { note: String(note || ''), doc: escHtml(html) });",
    "}",
    "function visualizeQr(dataUrl, qrText, title) {",
    "  if (typeof pm.visualizer === 'undefined' || !pm.visualizer.set) return;",
    "  var img = dataUrl",
    "    ? '<img alt=\"QR code\" style=\"width:300px;height:300px\" src=\"' + dataUrl + '\">'",
    "    : '<div id=\"qrbox\">Rendering QR...</div>' +",
    "      '<script src=\"https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs/qrcode.min.js\"><\\/script>' +",
    "      '<script>try { new QRCode(document.getElementById(\"qrbox\"), { text: ' + JSON.stringify(String(qrText || '')).replace(/</g, '\\\\u003c') + ', width: 300, height: 300 }); } catch (e) { document.getElementById(\"qrbox\").textContent = \"QR render failed - copy the string below into any QR tool.\"; }<\\/script>';",
    "  var tpl = '<html><head><meta charset=\"utf-8\"><style>body{font:14px sans-serif;margin:16px;color:#222}code{display:block;white-space:pre-wrap;word-break:break-all;background:#f4f4f5;padding:10px;border-radius:6px;margin-top:14px;font-size:11px}h4{margin:0 0 12px}</style></head><body><h4>{{title}}</h4>{{{img}}}{{#if qrText}}<code>{{qrText}}</code>{{/if}}</body></html>';",
    "  pm.visualizer.set(tpl, { title: String(title || 'Scan with the ABA Mobile app'), img: img, qrText: String(qrText || '') });",
    "}"
  );
  save('part_00_info.json', info);
  console.log('part_00_info.json: visualizer helpers + UUID');
}

// ---------- part_01: doc URL structures ----------
{
  const setup = load('part_01_setup.json');
  const s1 = findItem(setup, 'Setup Guide');
  s1.request.url = docUrl('https://developer.payway.com.kh/overview-865678m0', 'overview-865678m0');
  const s2 = findItem(setup, 'Reference - API Endpoints List');
  s2.request.url = docUrl('https://developer.payway.com.kh/api-endpoints-984508m0', 'api-endpoints-984508m0');
  save('part_01_setup.json', setup);
  console.log('part_01_setup.json: doc URLs normalized');
}

// ---------- part_03: purchase visualizer ----------
{
  const ecom = load('part_03_ecom.json');
  const purchase = ecom.item[0];
  const test = exec(purchase, 'test');
  sub(test, "console.log('HTML checkout page received. tran_id = ' + pm.collectionVariables.get('last_tran_id') + '. Open the page (Postman > Save Response > Save to file / open in browser) to pay.');",
    "console.log('HTML checkout page received. tran_id = ' + pm.collectionVariables.get('last_tran_id') + '.');\n  visualizeHtml(pm.response.text(), 'PayWay hosted checkout - pay with the sandbox test cards. If this pane stays blank (sandboxed preview), use Save Response > Save to file and open the .html in a browser.');",
    'purchase visualizer');
  save('part_03_ecom.json', ecom);
  console.log('part_03_ecom.json: purchase visualizer wired');
}

// ---------- part_04 + part_11 A1 + part_08 subscription: QR visualizer ----------
{
  const qr = load('part_04_qr.json');
  exec(findItem(qr, 'Generate QR'), 'test').push(
    "var vj = {}; try { vj = pm.response.json(); } catch (e) {}",
    "if (vj.qrImage || vj.qrString) visualizeQr(vj.qrImage, vj.qrString, 'Scan with the ABA Mobile app (sandbox). tran_id: ' + pm.collectionVariables.get('tran_id'));"
  );
  save('part_04_qr.json', qr);

  const pol = load('part_11_polling.json');
  exec(findItem(pol, 'A1 - Create QR'), 'test').push(
    "var vj = {}; try { vj = pm.response.json(); } catch (e) {}",
    "if (vj.qrImage || vj.qrString) visualizeQr(vj.qrImage, vj.qrString, 'Flow A - scan with the ABA Mobile app (sandbox). A2 will poll this transaction. tran_id: ' + pm.collectionVariables.get('tran_id'));"
  );
  save('part_11_polling.json', pol);

  const cof = load('part_08_cof.json');
  exec(findItem(cof, '7. Subscription'), 'test').push(
    "var vj = {}; try { vj = pm.response.json(); } catch (e) {}",
    "if (vj.qrImage || vj.qrString) visualizeQr(vj.qrImage, vj.qrString, 'Subscription first payment - scan with the ABA Mobile app (sandbox). tran_id: ' + pm.collectionVariables.get('tran_id'));"
  );
  save('part_08_cof.json', cof);
  console.log('part_04/11/08: QR visualizers wired');
}

// ---------- part_08: link account (QR from string) + link card (HTML) ----------
{
  const cof = load('part_08_cof.json');
  exec(findItem(cof, '1. Link Account'), 'test').push(
    "var vj = {}; try { vj = pm.response.json(); } catch (e) {}",
    "if (vj.data && (vj.data.qr_string || vj.data.qrString)) visualizeQr('', vj.data.qr_string || vj.data.qrString, 'Link Account - scan in ABA Mobile, approve, then run Get Token Details with request_id ' + pm.collectionVariables.get('request_id'));"
  );

  const card = findItem(cof, '2. Link Card');
  exec(card, 'test').splice(0, exec(card, 'test').length,
    "var ct = (pm.response.headers.get('Content-Type') || '').toLowerCase();",
    "pm.test('Link Card returned the card-entry page (HTML)', function () {",
    "  pm.expect(pm.response.code).to.eql(200);",
    "  pm.expect(ct).to.include('html');",
    "});",
    "console.log('Card-entry page received. Complete the card form (sandbox test cards); the token arrives via {{callback_url}} or Get Token Details with {{request_id}}.');",
    "visualizeHtml(pm.response.text(), 'PayWay card linking page - if this pane stays blank (sandboxed preview), use Save Response > Save to file and open the .html in a browser.');"
  );
  save('part_08_cof.json', cof);
  console.log('part_08_cof.json: link account/card visualizers wired');
}

// ---------- part_11: B1 link account ----------
{
  const pol = load('part_11_polling.json');
  exec(findItem(pol, 'B1 - Link Account'), 'test').push(
    "var vj = {}; try { vj = pm.response.json(); } catch (e) {}",
    "if (vj.data && (vj.data.qr_string || vj.data.qrString)) visualizeQr('', vj.data.qr_string || vj.data.qrString, 'Flow B - scan in ABA Mobile, approve, then B2 with request_id ' + pm.collectionVariables.get('request_id'));"
  );
  save('part_11_polling.json', pol);
  console.log('part_11_polling.json: B1 visualizer wired');
}

// ---------- part_10: webhooks doc URL structure ----------
{
  const cb = load('part_10_callbacks.json');
  const notes = findItem(cb, 'Webhook Design Notes');
  notes.request.url = docUrl('https://developer.payway.com.kh/overview-865678m0', 'overview-865678m0');
  save('part_10_callbacks.json', cb);
  console.log('part_10_callbacks.json: doc URL normalized');
}

console.log('\nRound-5 patches applied.');
