/*
 * fix_round6.js — replaces the broken "Save Response -> open .html in browser"
 * fallback (checkout page XHRs are origin-bound -> CORS from file://, observed)
 * with the real merchant integration flow: a Visualizer launcher that form-POSTs
 * the signed fields to PayWay. The page is then served BY PayWay, so every
 * request it makes is same-origin and works.
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

const LAUNCHER = (title) => [
  "  // Merchant-style launcher: form-POST the signed fields so the checkout page is",
  "  // SERVED BY PayWay (its own origin) - saved .html opened from disk CORS-fails.",
  "  var fields = {};",
  "  if (pm.request.body && pm.request.body.formdata) {",
  "    pm.request.body.formdata.each(function (p) { if (!p.disabled) fields[p.key] = pm.variables.replaceIn(String(p.value)); });",
  "  }",
  "  visualizeFormPost(pm.variables.replaceIn(pm.request.url.toString()), fields, '" + title + "',",
  "    'How real integrations open PayWay: a form POST with these signed fields. Click the button - the checkout page is served by PayWay itself (no CORS issues). Pay with the sandbox test cards, then re-send Check Transaction here to see APPROVED.');"
];

// ---------- part_00: swap visualizeHtml for visualizeFormPost ----------
{
  const info = load('part_00_info.json');
  const pre = info.event.find((e) => e.listen === 'prerequest').script.exec;
  const si = pre.findIndex((l) => l.includes('function visualizeHtml'));
  if (si === -1) throw new Error('visualizeHtml helper not found');
  const ei = pre.findIndex((l, i) => i > si && l.trim() === '}');
  if (ei === -1) throw new Error('visualizeHtml closing brace not found');
  pre.splice(si, ei - si + 1,
    "function visualizeFormPost(action, fields, title, note) {",
    "  if (typeof pm.visualizer === 'undefined' || !pm.visualizer.set) return;",
    "  var inputs = '';",
    "  for (var k in fields) {",
    "    inputs += '<input type=\"hidden\" name=\"' + escHtml(k) + '\" value=\"' + escHtml(fields[k]) + '\">';",
    "  }",
    "  var tpl = '<html><head><meta charset=\"utf-8\"><style>body{font:14px/1.5 sans-serif;margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#fafafa;color:#222}.card{max-width:560px;background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,.06)}h4{margin:0 0 8px}p{margin:0 0 16px;color:#555;font-size:13px}button{font:600 14px sans-serif;padding:10px 18px;border:0;border-radius:8px;background:#0a7d38;color:#fff;cursor:pointer}</style></head><body><div class=\"card\"><h4>{{title}}</h4><p>{{note}}</p><form method=\"POST\" action=\"{{action}}\">{{{inputs}}}<button type=\"submit\">Open payment page &rarr;</button></form></div></body></html>';",
    "  pm.visualizer.set(tpl, { title: String(title || ''), note: String(note || ''), action: String(action || ''), inputs: inputs });",
    "}"
  );
  save('part_00_info.json', info);
  console.log('part_00_info.json: visualizeFormPost helper installed (visualizeHtml removed)');
}

// ---------- part_03: purchase launcher ----------
{
  const ecom = load('part_03_ecom.json');
  const test = exec(ecom.item[0], 'test');
  const vi = test.findIndex((l) => l.includes('visualizeHtml(pm.response.text()'));
  if (vi === -1) throw new Error('purchase visualizeHtml call not found');
  test.splice(vi, 1, ...LAUNCHER('PayWay hosted checkout'));
  save('part_03_ecom.json', ecom);
  console.log('part_03_ecom.json: purchase launcher wired');
}

// ---------- part_08: link card launcher ----------
{
  const cof = load('part_08_cof.json');
  const test = exec(findItem(cof, '2. Link Card'), 'test');
  const vi = test.findIndex((l) => l.includes('visualizeHtml(pm.response.text()'));
  if (vi === -1) throw new Error('link-card visualizeHtml call not found');
  test.splice(vi, 1, ...LAUNCHER('PayWay card linking'));
  save('part_08_cof.json', cof);
  console.log('part_08_cof.json: link-card launcher wired');
}

console.log('\nRound-6 patches applied.');
