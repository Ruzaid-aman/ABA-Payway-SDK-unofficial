/*
 * inject_quickstart.js — helper-text pass (18 Sep 2026):
 *  1. Syncs collection info.description = get_started.md (Overview tab)
 *  2. Adds "⚡ Quick test" helper blocks to request descriptions:
 *     - full descriptions for part_03 requests that had none
 *     - prepends to thin descriptions elsewhere (kept below the helper block)
 *     - expands the one-line Flow A/B runner-step descriptions
 *  3. Adds status-aware "NEXT:" console hints to key test scripts
 *     (Purchase, Check Transaction, Generate QR)
 * Idempotent: re-running makes no further changes. Assertions fail loudly
 * if a request name or script anchor is not found exactly once.
 */
const fs = require('fs');
const path = require('path');

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
const save = (f, j) => fs.writeFileSync(path.join(__dirname, f), JSON.stringify(j, null, 2) + '\n');
const changed = [];

// ---------- 1. collection overview = get_started.md ----------
{
  const guide = fs.readFileSync(path.join(__dirname, 'get_started.md'), 'utf8').replace(/\r\n/g, '\n').trim();
  const info = load('part_00_info.json');
  if (info.info.description !== guide) {
    info.info.description = guide;
    save('part_00_info.json', info);
    changed.push('part_00_info.json: overview synced to get_started.md');
  }
}

// ---------- 2. description helper blocks ----------
// "full" replaces an undefined description; "prepend" goes above existing text.
const QUICK = {
  'part_03_ecom.json': {
    '1. Purchase (Hosted Checkout) - multipart': { full: [
      '## ⚡ Quick test',
      '1. Just hit **Send** — the demo merchant is pre-filled, nothing to configure.',
      '2. Success = **HTTP 200 HTML** (the hosted checkout page). A JSON `status` body = business error — check `b4hash:` in the Console first.',
      '3. Open the **Visualize** tab → click **Open payment page →** → pay with a sandbox test card (folder 01).',
      '4. Then send **3. Check Transaction** — the tran_id was auto-saved to `{{last_tran_id}}`.',
      '',
      '**Tune:** `{{amount}}` (USD 2 decimals / KHR integer), `{{currency}}`, `{{payment_option}}`, buyer fields — all collection variables.',
      '**Hash order:** req_time, merchant_id, tran_id, amount, items, shipping, first/last name, email, phone, type, payment_option, return_url, cancel_url, continue_success_url, return_deeplink, currency, custom_fields, return_params, payout, lifetime, additional_params, google_pay_token, skip_success_page.',
    ].join('\n') },
    '2. Get Transaction Details': { full: [
      '## ⚡ Quick test',
      '1. **Send** after any purchase/QR — reads `{{last_tran_id}}` (or set `{{tran_id}}`).',
      '2. Expect `status.code "00"` + the full record in `data` (`payment_status_code`: 0 approved · 2 pending · 3 declined · 4 refunded · 7 cancelled). This is also the endpoint Flow A2 polls.',
      '',
      '**Hash:** `req_time + merchant_id + tran_id`',
    ].join('\n') },
    '3. Check Transaction (fast, recent)': { full: [
      '## ⚡ Quick test',
      '1. **Send** — reads `{{last_tran_id}}` and logs the transaction\'s `payment_status`; saves it to `{{poll_status}}`.',
      '2. `2 (PENDING)`? Keep sending, or let **Flow A2 (folder 11)** loop for you in the Collection Runner.',
      '3. Only sees the **last 7 days**, and **cannot see KHQR/QR transactions** — for those use **2. Get Transaction Details** (sandbox-verified).',
      '',
      '**Hash:** `req_time + merchant_id + tran_id`',
    ].join('\n') },
    '4. Close Transaction': { full: [
      '## ⚡ Quick test',
      '1. **Send** — closes/voids the transaction in `{{last_tran_id}}` (e.g. an unpaid pending purchase).',
      '2. Expect `status.code "00"`. A fresh/unknown id returns business code `5` (Transaction not found) — correct behaviour, not a bug.',
      '',
      '**Hash:** `req_time + merchant_id + tran_id`',
    ].join('\n') },
    '5. Refund - RSA merchant_auth': { prepend: [
      '## ⚡ Quick test',
      '1. Refunds `{{last_tran_id}}` by `{{refund_amount}}`. Needs RSA — install **node-forge** (collection → Libraries) or paste `{{refund_merchant_auth}}`; without it the test reports a friendly **SKIPPED**.',
      '2. After a successful refund, re-send **3. Check Transaction** — status becomes `4 (REFUNDED)`.',
      '',
    ].join('\n') },
    '6. Transaction List (filter)': { prepend: [
      '## ⚡ Quick test',
      '1. Just hit **Send** — `{{from_date}}`/`{{to_date}}` auto-fill to today (`yyyy-mm-dd hh:mm:ss` is mandatory; plain dates get code 49).',
      '2. Filter with `{{tran_status_filter}}`: 0 approved · 2 pending · 3 declined · 4 refunded · 7 cancelled.',
      '',
    ].join('\n') },
    '7. Exchange Rate': { full: [
      '## ⚡ Quick test',
      '1. Just hit **Send** — zero setup; returns today\'s `exchange_rates` (USD ↔ KHR).',
      '',
      '**Hash:** `req_time + merchant_id`',
    ].join('\n') },
  },
  'part_04_qr.json': {
    'Generate QR': { prepend: [
      '## ⚡ Quick test',
      '1. Just hit **Send** → the **Visualize** tab renders the scannable KHQR + raw `qrString`.',
      '2. Scan with the ABA Mobile app, then poll **Flow A (folder 11)** or use **2. Get Transaction Details** — *Check Transaction cannot see QR transactions*.',
      '',
    ].join('\n') },
  },
  'part_05_paymentlink.json': {
    'Get Payment Link Details': { prepend: [
      '## ⚡ Quick test',
      '1. Run **Create Payment Link** first — its `payment_link_id` is auto-saved and consumed here.',
      '2. RSA needed (node-forge or `{{pl_merchant_auth}}`); without it the test reports **SKIPPED**.',
      '',
    ].join('\n') },
  },
  'part_06_preauth.json': {
    '1. Complete Pre-auth': { prepend: [
      '## ⚡ Quick test',
      '1. Create the hold first: set `{{purchase_type}}` = `pre-auth` → run **03 → 1. Purchase** → then send this (it reads `{{last_tran_id}}` and captures `{{amount}}`).',
      '2. RSA needed (node-forge or `{{preauth_merchant_auth}}`). Prefer releasing the funds? Use **3. Cancel Pre-auth** instead.',
      '',
    ].join('\n') },
    '2. Complete Pre-auth with Payout': { prepend: [
      '## ⚡ Quick test',
      '1. Same setup as request 1, but the captured amount is split to beneficiaries — set `{{payout_json}}` (`[{"acc":"...","amt":0.05}]`) first.',
      '2. RSA needed (node-forge or `{{preauth_payout_merchant_auth}}`).',
      '',
    ].join('\n') },
    '3. Cancel Pre-auth': { prepend: [
      '## ⚡ Quick test',
      '1. Releases the hold from a `pre-auth` purchase (reads `{{last_tran_id}}`) — funds return to the cardholder.',
      '2. RSA needed (node-forge or `{{cancel_preauth_merchant_auth}}`).',
      '',
    ].join('\n') },
  },
  'part_07_payout.json': {
    '1. Payout (to beneficiaries)': { prepend: [
      '## ⚡ Quick test',
      '1. Whitelist each payee first (request 2), then set `{{payout_json}}` = `[{"acc":"...","amt":0.05}]` and **Send**.',
      '2. RSA needed (node-forge or `{{payout_beneficiaries}}`); per-beneficiary minimum USD 0.01 / KHR 100.',
      '',
    ].join('\n') },
    '2. Add Account to Payout Whitelist - RSA': { prepend: [
      '## ⚡ Quick test',
      '1. Set `{{whitelist_payee}}` to the payee\'s account number and **Send** — it becomes payout-eligible (request 1).',
      '2. RSA needed (node-forge or `{{add_whitelist_merchant_auth}}`).',
      '',
    ].join('\n') },
    '3. Update Payser Status - RSA': { prepend: [
      '## ⚡ Quick test',
      '1. Set `{{whitelist_payee}}` and **Send** — flips the payee\'s whitelist status on (the pre-script sends `enable`; edit it for `disable`).',
      '2. RSA needed (node-forge or `{{update_whitelist_merchant_auth}}`).',
      '',
    ].join('\n') },
  },
  'part_08_cof.json': {
    '1. Link Account (ABA Account)': { prepend: [
      '## ⚡ Quick test',
      '1. Just hit **Send** — it generates `{{request_id}}` and returns a deeplink + QR (Visualize tab) to approve in the ABA Mobile app.',
      '2. After approving, run **3. Get Token Details** (code 09 until the link is completed) or watch for the callback.',
      '',
    ].join('\n') },
    '2. Link Card (Credit/Debit)': { prepend: [
      '## ⚡ Quick test',
      '1. Just hit **Send** — the **Visualize** tab shows a launcher for the card-entry page; complete it with a sandbox test card.',
      '2. The card token arrives via callback; meanwhile poll **3. Get Token Details** with the logged `{{request_id}}`.',
      '',
    ].join('\n') },
    '3. Get Token Details': { prepend: [
      '## ⚡ Quick test',
      '1. **Send** after Link Account/Card — uses the auto-saved `{{request_id}}`; on success saves `{{pwt}}`/`{{ctid}}` for Payment/Renew/Remove.',
      '2. `code 09 Data not found` = the customer hasn\'t completed the link yet — expected; approve the deeplink/QR first, then re-send.',
      '',
    ].join('\n') },
    '4. Payment (Using Token)': { prepend: [
      '## ⚡ Quick test',
      '1. Needs `{{pwt}}` + `{{ctid}}` (saved by Get Token Details) — then just **Send**; it charges `{{amount}}` to the stored credential.',
      '',
    ].join('\n') },
    '5. Renew Token (ABA account)': { prepend: [
      '## ⚡ Quick test',
      '1. ABA **account** tokens only — needs `{{pwt}}`; extends validity by 90 days from today.',
      '',
    ].join('\n') },
    '6. Remove Token (irreversible)': { prepend: [
      '## ⚡ Quick test',
      '1. ⚠️ **Irreversible** — deletes the token in `{{pwt}}` (and clears the variable). Test this last.',
      '',
    ].join('\n') },
    '7. Subscription (Scheduled Payment)': { prepend: [
      '## ⚡ Quick test',
      '1. Just hit **Send** — creates a recurring `CITR_FIX` subscription and returns the first-payment QR (Visualize tab); pay it to activate the token via callback.',
      '2. Tune with `{{sub_frequency}}` (1W/1M/2M), `{{sub_lifetime}}`, `{{sub_payment_option}}`.',
      '',
    ].join('\n') },
  },
  'part_09_khqr.json': {
    'Get Transactions by Merchant Ref': { prepend: [
      '## ⚡ Quick test',
      '1. Set `{{merchant_ref}}` and **Send**. On the sandbox demo profile expect **404/empty** (informational — KHQR retrieval needs a dedicated `…instore` merchant profile); the path, hash and limits are docs-verified.',
      '',
    ].join('\n') },
  },
  'part_11_polling.json': {
    'A3 - Get Transaction Details': { full: 'Flow A step 3. Pulls the full transaction record for `{{last_tran_id}}` (works for QR *and* card transactions). In the Runner it follows A2 automatically; standalone, just **Send**.' },
    'A4 - Refund': { full: 'Flow A step 4 (final). Refunds `{{last_tran_id}}` for `{{refund_amount}}` (RSA — node-forge or `{{refund_merchant_auth}}`). Ends Flow A: the Runner stops here (`setNextRequest(null)`).' },
    'B1 - Link Account (Flow B)': { full: 'Flow B step 1. Starts CoF account linking — generates `{{request_id}}` and returns a deeplink/QR (Visualize tab). Approve it in the ABA Mobile app, then let the Runner continue to B2 (or send B2 yourself).' },
    'B2 - Get Token Details (Flow B)': { full: 'Flow B step 2. Looks up the token with `{{request_id}}`; on success saves `{{pwt}}`/`{{ctid}}` for B3+. `code 09` = the link isn\'t approved yet — finish the ABA-app step, then re-send.' },
    'B3 - Payment using Token (Flow B)': { full: 'Flow B step 3. Charges `{{amount}}` to the stored credential (`{{pwt}}` + `{{ctid}}` from B2).' },
    'B4 - Renew Token (Flow B)': { full: 'Flow B step 4. Renews the ABA account token (+90 days) so `{{pwt}}` stays alive.' },
    'B5 - Remove Token (Flow B)': { full: 'Flow B step 5 (final). ⚠️ Irreversibly removes the token and clears `{{pwt}}`. Ends Flow B.' },
  },
};

for (const [file, reqs] of Object.entries(QUICK)) {
  const part = load(file);
  let touched = 0;
  for (const it of part.item || []) {
    const spec = reqs[it.name];
    if (!spec) continue;
    const cur = it.request.description;
    if (spec.full !== undefined) {
      if (cur === spec.full) continue; // already applied
      if (cur === undefined || cur === '') {
        it.request.description = spec.full;
        touched++; changed.push(file + ' :: "' + it.name + '" full helper description added');
      } else if (cur.length < 200) {
        // replace a one-line stub (runner steps) with the expanded helper text
        it.request.description = spec.full;
        touched++; changed.push(file + ' :: "' + it.name + '" stub replaced by expanded helper description (was ' + cur.length + 'ch)');
      } else {
        throw new Error(file + ' :: "' + it.name + '" has a substantial existing description (' + cur.length + 'ch) - refusing to replace');
      }
    } else {
      if (cur === undefined || cur === '') throw new Error(file + ' :: "' + it.name + '" expected an existing description to prepend to');
      if (cur.includes('⚡ Quick test')) continue; // already injected
      it.request.description = spec.prepend + '\n' + cur;
      touched++; changed.push(file + ' :: "' + it.name + '" Quick-test block prepended');
    }
  }
  const missing = Object.keys(reqs).filter(n => !(part.item || []).some(it => it.name === n));
  if (missing.length) throw new Error(file + ' :: requests not found: ' + missing.join(', '));
  if (touched) save(file, part);
}

// ---------- 3. status-aware NEXT: console hints in key test scripts ----------
const HINTS = {
  'part_03_ecom.json': [
    { req: '1. Purchase (Hosted Checkout) - multipart', listen: 'test',
      after: "pm.test('Purchase accepted - checkout page returned (HTML 200)', function () { pm.expect(pm.response.code).to.eql(200); });",
      lines: ['console.log(\'NEXT: open the Visualize tab -> "Open payment page" -> pay with a sandbox card (folder 01), then send 3. Check Transaction.\');'] },
    { req: '1. Purchase (Hosted Checkout) - multipart', listen: 'test',
      after: "pm.test('Purchase accepted (status.code 0)', function () { pm.expect(okStatus(j)).to.eql(true); });",
      lines: ['console.log(\'NEXT: tran_id saved to {{last_tran_id}} - verify with 3. Check Transaction.\');'] },
    { req: '3. Check Transaction (fast, recent)', listen: 'test',
      after: "console.log('status.code (query):', sc, '-', j.status && j.status.message);",
      lines: [
        "if (pay === '0') console.log('NEXT: APPROVED - try Refund (5), Close (4), Transaction List (6), or run Flow A in folder 11.');",
        "else if (pay === '2') console.log('NEXT: still PENDING - pay the hosted page (Purchase -> Visualize tab) or poll with Flow A2 (folder 11).');",
        "else if (pay === '3') console.log('NEXT: DECLINED - re-run Purchase and pay with a success test card (folder 01).');",
        "else if (!pay && sc === '5') console.log('NEXT: code 5 - check-transaction-2 only sees the last 7 days and not KHQR; use 2. Get Transaction Details.');",
      ] },
  ],
  'part_04_qr.json': [
    { req: 'Generate QR', listen: 'test',
      after: "if (j.qrImage) console.log('qrImage: data-URL received (' + String(j.qrImage).length + ' chars) - paste into a browser to view');",
      lines: ['console.log(\'NEXT: scan the QR (Visualize tab) with the ABA Mobile app, then poll Flow A (folder 11) or use 2. Get Transaction Details.\');'] },
  ],
};

for (const [file, specs] of Object.entries(HINTS)) {
  const part = load(file);
  for (const spec of specs) {
    const it = (part.item || []).find(x => x.name === spec.req);
    if (!it) throw new Error(file + ' :: request not found: ' + spec.req);
    const ev = (it.event || []).find(e => e.listen === spec.listen);
    if (!ev) throw new Error(file + ' :: "' + spec.req + '" has no ' + spec.listen + ' script');
    const exec = ev.script.exec;
    const hits = exec.filter(l => l.trim() === spec.after.trim()).length;
    if (hits !== 1) throw new Error(file + ' :: "' + spec.req + '" anchor found ' + hits + 'x (need exactly 1): ' + spec.after);
    const idx = exec.findIndex(l => l.trim() === spec.after.trim());
    const next = exec[idx + 1] || '';
    if (spec.lines.every(l => exec.includes(l))) continue; // already injected
    if (next.includes('NEXT:')) continue; // already injected
    exec.splice(idx + 1, 0, ...spec.lines);
    changed.push(file + ' :: "' + spec.req + '" ' + spec.listen + ' +' + spec.lines.length + ' NEXT hint line(s)');
  }
  save(file, part);
}

console.log(changed.length ? changed.map(c => '  - ' + c).join('\n') + '\nDONE: ' + changed.length + ' change(s)' : 'No changes (already injected).');
