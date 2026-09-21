/*
 * fix_visualizer_tab.js — v1.2.1: launch the form-POST launcher in a NEW page.
 *
 * BUG (reported 19 Sep 2026): clicking "Open payment page →" in the Visualize tab
 * navigated INSIDE Postman's sandboxed visualizer iframe — the hosted-checkout page
 * half-loaded in the pane (its own JS fetched the QR session, e.g. GET
 * checkout-sandbox.payway.com.kh/<base64 session json>) but could not be used to pay.
 *
 * FIX: the launcher form now posts with target="_blank" so the checkout opens in a
 * new tab/window; button text and an on-card hint say so.
 * Idempotent; edits part_00_info.json — run merge.js afterwards.
 */
const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, 'part_00_info.json');
const info = JSON.parse(fs.readFileSync(p, 'utf8'));
const v = (info.variable || []).find((x) => x.key === '__helpers');
if (!v) throw new Error('__helpers variable missing from part_00_info.json');

if (v.value.includes('target="_blank"')) {
  console.log('already patched — nothing to do');
} else {
  const swaps = [
    // 1. form opens its POST result in a new tab/window
    ['<form method="POST" action="{{action}}">',
     '<form method="POST" action="{{action}}" target="_blank">'],
    // 2. say what the button does
    ['<button type="submit">Open payment page &rarr;</button>',
     '<button type="submit">Open payment page in a new tab &rarr;</button>'],
    // 3. hint under the note (popup blockers are the one way this can no-op)
    ['<p>{{note}}</p>',
     '<p>{{note}}</p><p style="margin:-6px 0 16px;color:#8a8f98;font-size:12px">The checkout opens in a new browser tab. If nothing opens, allow pop-ups for Postman and click again.</p>'],
  ];
  for (const [from, to] of swaps) {
    if (!v.value.includes(from)) throw new Error('expected snippet not found: ' + from);
    v.value = v.value.replace(from, to);
  }
  console.log('visualizeFormPost launcher: target="_blank" + new-tab label + hint applied');
}

if (info.info.version === '1.2.0') { info.info.version = '1.2.1'; console.log('version -> 1.2.1'); }

fs.writeFileSync(p, JSON.stringify(info, null, 2) + '\n', 'utf8');
console.log('OK: ' + p);
