# Updates collection-index.md + MAINTAINER_REPORT.md for the v1.4.0 offline-KHQR wave.
# Asserted string replacements only - aborts loudly if the doc text drifted.
import os

os.chdir(os.path.join(os.path.dirname(__file__), '..', '..', 'payway-boilerplate', 'Postman Collection API Testing'))

def apply(path, pairs):
    s = open(path, encoding='utf-8').read()
    for old, new in pairs:
        if old not in s:
            raise SystemExit(f'{path}: anchor not found: {old[:90]!r}')
        s = s.replace(old, new, 1)
    open(path, 'w', encoding='utf-8', newline='\n').write(s)
    print(f'{path}: {len(pairs)} edits applied')

# ---------------------------------------------------------------------------
apply('collection-index.md', [
    (
        "Use this file to find the right folder/request without opening the 218 KB JSON.",
        "Use this file to find the right folder/request without opening the 257 KB JSON.",
    ),
    (
        "**Last verified:** 21 Sep 2026 (stats extracted directly from the shipped collection JSON; official `postman-collection` SDK import check green).",
        "**Last verified:** 22 Sep 2026 (v1.4.0 — folder 09 gained the offline-KHQR generation flow: local TLV+CRC builder + QR render + webhook.site receiver/callback sync + by-ref inquiry; stats extracted directly from the shipped collection JSON; official `postman-collection` SDK import check green).",
    ),
    (
        "| Collection file | `exp-PayWay API — Complete Collection.postman_collection.json` (~218 KB) — **the deliverable** |",
        "| Collection file | `exp-PayWay API — Complete Collection.postman_collection.json` (~257 KB) — **the deliverable** |",
    ),
    (
        "| Folders / requests | 10 folders, 42 requests (37 API calls + 5 doc-only reference GETs) |",
        "| Folders / requests | 10 folders, 45 requests (40 API/flow calls + 5 doc-only reference GETs) |",
    ),
    (
        "| Scripts | 37 API calls with pre-request **and** test scripts (74) + 2 collection-level scripts = 76, 0 syntax errors |",
        "| Scripts | 40 API/flow calls with pre-request **and** test scripts (80) + 2 collection-level scripts = 82, 0 syntax errors |",
    ),
    (
        "| Collection variables | 93 (project sandbox merchant pre-filled; `secret_key` is a Postman Secret type; `__helpers` holds the shared script library) |",
        "| Collection variables | 114 (project sandbox merchant pre-filled; `secret_key` is a Postman Secret type; `__helpers` holds the shared script library; `khqr_*` carries the offline-KHQR merchant identity + flow outputs) |",
    ),
    (
        "5. For callbacks, paste a `https://webhook.site/<uuid>` URL into `callback_url` / `callback_listener` (see folder 10).",
        "5. For callbacks, paste a `https://webhook.site/<uuid>` URL into `callback_url` / `callback_listener` (see folder 10) - or let **09 - KHQR Guideline → 1. Create webhook.site Receiver** create one for you.",
    ),
    (
        "| 09 | KHQR Guideline | Instore lookups by `merchant_ref` | 1 |",
        "| 09 | KHQR Guideline | Offline KHQR generation: local TLV+CRC builder → scan → webhook → by-ref inquiry | 4 |",
    ),
    (
        """### 09 - KHQR Guideline

| Request | Method | Endpoint | Scripts |
|---|---|---|---|
| Get Transactions by Merchant Ref | POST | `{{baseUrl}}/api/payment-gateway/v1/payments/get-transactions-by-mc-ref` | pre+test |""",
        """### 09 - KHQR Guideline *(offline KHQR generation flow)*

| Request | Method | Endpoint | Scripts |
|---|---|---|---|
| 1. Create webhook.site Receiver | POST | `https://webhook.site/token` | pre+test; saves `callback_listener` + `webhook_token` |
| 2. Build Offline KHQR (TLV + CRC + QR) | GET | `https://developer.payway.com.kh/khqr-guideline-3192101f0` (reference vehicle - the build itself is local) | pre (TLV+CRC builder, spec self-tests, unique `khqr_merchant_ref`) + test (QR via `visualizeQr`) |
| 3. Pull webhook.site Callbacks (KHQR) | GET | `https://webhook.site/token/{{webhook_token}}/requests` | pre+test; matches pushbacks by `merchant_ref`, imports `khqr_transaction_id` / status |
| 4. Get Transactions by Merchant Ref | POST | `{{baseUrl}}/api/payment-gateway/v1/payments/get-transactions-by-mc-ref` | pre+test; after step 2 also asserts APPROVED + amount match, sets `khqr_final_status` |

The builder reproduces the KHQR guideline's official sample payload **byte-for-byte (incl. CRC `9FBD`)** on every send as a self-test. PayWay POSTs offline-KHQR payment notifications to the webhook URL provisioned on the merchant account (no per-QR callback field) - point that provisioning at the webhook.site bin; KHQR lookups by reference additionally need KHQR retrieval provisioned on the profile (404 on demo profiles; request itself is docs-verified).""",
    ),
    (
        "| Sync webhook.site -> Postman (pull callbacks) | GET | `https://api.webhook.site/token/{{webhook_token}}/requests` | pre+test; imports `tran_id`/`pwt`/`ctid` from latest callback |",
        "| Sync webhook.site -> Postman (pull callbacks) | GET | `https://webhook.site/token/{{webhook_token}}/requests` | pre+test; imports `tran_id`/`pwt`/`ctid` from latest callback. (v1.4.0: host moved from the retired `api.webhook.site` JSON API; response parsed as legacy array *or* paginated `data`) |",
    ),
    (
        "| Callbacks & polling | `callback_listener`, `webhook_token`, `poll_count`, `max_polls`, `poll_status` | `webhook_token` = UUID from a webhook.site URL |",
        "| Callbacks & polling | `callback_listener`, `webhook_token`, `poll_count`, `max_polls`, `poll_status` | `webhook_token` = UUID from a webhook.site URL |\n| Offline KHQR | `khqr_bakong_id`, `khqr_mid`, `khqr_bank_name`, `khqr_mcc`, `khqr_merchant_name`, `khqr_merchant_city`, `khqr_payway_data`, `khqr_mode`, `khqr_expiry_minutes` | ABA-issued merchant identity for tags 30/52/59/60/62.68 (defaults = guideline example values - replace with your own) |\n| Offline KHQR outputs | `khqr_merchant_ref`, `khqr_payload`, `khqr_selftest`, `khqr_amount_used`, `khqr_currency_used`, `khqr_transaction_id`, `khqr_payment_status(_code)`, `khqr_payment_amount`, `khqr_payment_currency`, `khqr_callback_count`, `khqr_final_status` | Generated per Build Offline KHQR send; pushback + inquiry outputs |",
    ),
    (
        "- **Per-request:** each request description documents its exact hash field order (and PHP samples); 37 API calls carry scenario pre+test scripts (error-code handling, variable chaining, approval-code asserts, JSON-Schema assertions).",
        "- **Per-request:** each request description documents its exact hash field order (and PHP samples); 40 API/flow calls carry scenario pre+test scripts (error-code handling, variable chaining, approval-code asserts, JSON-Schema assertions).",
    ),
    (
        "The merged JSON is generated — edit parts, never the merged file. **Since v1.3.0 the shipped deliverable is `exp-PayWay API — Complete Collection.postman_collection.json`** (the postman-agent's latest export, which `part_00_info.json` does not fully reflect — reconcile before re-merging); `_build/part_05_paymentlink.json` already mirrors the Void request.",
        "The merged JSON is generated — edit parts, never the merged file. **Since v1.3.0 the shipped deliverable is `exp-PayWay API — Complete Collection.postman_collection.json`** (the postman-agent's latest export, which `part_00_info.json` does not fully reflect — reconcile before re-merging). Folder parts are re-synced by the wave patchers for the folders they touch: `part_05` (Void, v1.3.0) and `part_09`/`part_10` (offline KHQR flow + webhook.site host fix, v1.4.0).",
    ),
    (
        "| `part_00_info.json` | `info` + README, 93 variables (incl. `__helpers` library), collection-level events (library loader + test hook) |",
        "| `part_00_info.json` | `info` + README + collection-level events — **legacy since the v1.3.0 import** (76 stale demo-merchant variables; variables are now maintained directly in the shipped JSON) |",
    ),
])

# ---------------------------------------------------------------------------
apply('MAINTAINER_REPORT.md', [
    (
        "Updated: 21 Sep 2026 (v1.3.1 —",
        "Updated: 22 Sep 2026 (v1.4.0 — **offline KHQR generation flow in folder 09**: the KHQR payload is now built entirely in Postman scripts per the developer.payway.com.kh KHQR guideline — EMVCo TLV + CRC-16/CCITT-FALSE with a per-send self-test that rebuilds the guideline's official sample payload byte-for-byte (incl. CRC `9FBD`) — rendering a scannable QR on the Visualize tab, generating a unique `khqr_merchant_ref` per send, creating a webhook.site receiver via API, syncing the payment pushback back into variables, and finishing with Get Transactions by Merchant Ref which cross-checks APPROVED status + amount; folder 10's webhook.site sync request was found silently broken (the `api.webhook.site` JSON API now serves an unrelated app) and was re-pointed at `webhook.site` with both response shapes parsed — fix live-verified through Newman; 45 requests, 82 scripts, 114 variables, 0 syntax errors, official SDK import check green; v1.3.1 —",
    ),
    (
        "## 2. Live verification matrix",
        """### 1.6 v1.4.0 — offline KHQR generation in Postman (folder 09, 22 Sep 2026)

Implements the guideline flow *Generate merchant reference → build KHQR payload → display QR → user scans & pays → receive/check webhook → query by merchant reference → validate final status* **without any QR-generation API call**:

- **1. Create webhook.site Receiver** — `POST https://webhook.site/token` (the JSON API moved off `api.webhook.site`); saves `callback_listener` + `webhook_token`, the same variables folder 10 uses.
- **2. Build Offline KHQR (TLV + CRC + QR)** — pre-request builds `00/01/30(00-02)/52/53/54/58/59/60/62(01,68)/99/63` per the guideline: KHR amounts integer-only (116), USD ≤2dp (840), static mode omits tag 54, tag 62.01 gets a unique ≤25-char `khqr_merchant_ref` (synced into `merchant_ref` for step 4), tag 99 carries creation/expiry ms timestamps. Every send re-runs the spec self-test (CRC canonical `123456789 → 29B1` + the guideline's official sample byte-exact incl. `9FBD`) and throws on drift. The test script renders the QR via the existing `visualizeQr` helper (CDN qrcodejs, Visualize tab). Defaults ship with the guideline's example merchant identity (`khqr_*` variables) — merchants replace them with their ABA-issued values.
- **3. Pull webhook.site Callbacks (KHQR)** — pulls `token/{uuid}/requests`, parses legacy-array *and* paginated `{data}` shapes, matches JSON pushbacks by `merchant_ref`, imports `khqr_transaction_id`/`payment_status(_code)`/amounts, counts multiple payments (the guideline: a KHQR can be paid multiple times).
- **4. Get Transactions by Merchant Ref** (existing request, renamed into the numbered flow) — when a QR has been built, the test now scans the inquiry response for transaction objects, matches the reference, asserts ≥1 APPROVED (`payment_status_code 0`), cross-checks the amount against the QR, and stores `khqr_final_status`; the demo-profile 404 branch stays informational.

**Incident found by live Newman testing (fixed in the same wave):** `api.webhook.site` no longer serves the JSON API — `POST/GET /token*` there returns an unrelated app's JSON (`{"status":"success","translated_text":...}`) with HTTP 200. Folder 09's two webhook.site calls and folder 10's **Sync webhook.site → Postman** were re-pointed at `https://webhook.site`, and the sync's test now parses both response shapes (it previously assumed a top-level array). Live-verified: receiver creation, pull, and a seeded-callback sync ("SYNC OK") all green through Newman against the real webhook.site; the collection's own folder-09 run passes end-to-end with only the designed "no pushback yet" signal (nothing had paid the QR).

Tooling: `.scratch/postman-collection-fix/add_khqr_flow.py` (idempotent flow patcher), `fix_khqr_hosts.py` (webhook.site host/shape fix), `_build/sim_khqr_flow.js` (37-check offline runtime simulation of the whole flow in Postman-faithful per-script vm scopes). QA: `validate_exp.cjs` 82 scripts / 0 parse errors / no undefined vars; `audit_postman_compliance.cjs` 59/59 helper consumers keep the loader, zero new findings (23 pre-existing instructional-text notes unchanged); `prove_selfcontained.cjs` 40/43 both-scripts (3 doc-only pages unchanged), self-contained; official SDK import green (45 requests, 114 vars).

## 2. Live verification matrix""",
    ),
    (
        "| KHQR get-transactions-by-mc-ref | ⚠️ 404/empty | Path + hash are docs-verified; sandbox demo profiles return 404/empty (needs dedicated KHQR profile). Guarded, informational |",
        "| KHQR get-transactions-by-mc-ref (folder 09 #4) | ⚠️ 404/empty | Path + hash are docs-verified; sandbox demo profiles return 404/empty (needs dedicated KHQR profile). Guarded, informational |\n| webhook.site receiver + pull + sync (folders 09/10) | ✅ live (Newman, 2026-09-22) | Bin created via `POST https://webhook.site/token`; pull + seeded-callback sync green after the `api.webhook.site` retirement fix |\n| **Offline KHQR builder** (folder 09 #2, v1.4.0) | ✅ live (Newman) | Guideline page fetch 200; spec self-tests pass; payload built + QR rendered; phone scan-and-pay remains human-only |",
    ),
    (
        "7. **CoF Link Account works with the public demo merchant** and returns deeplink + QR immediately; the token (`pwt`) only exists after the customer completes the link (Get Token Details then returns code 09).",
        "7. **CoF Link Account works with the public demo merchant** and returns deeplink + QR immediately; the token (`pwt`) only exists after the customer completes the link (Get Token Details then returns code 09).\n8. **webhook.site moved its JSON API off `api.webhook.site`** (observed 2026-09-22): the old host still answers HTTP 200 with an unrelated app's JSON, so failures are silent. Use `https://webhook.site/token` (create) and `https://webhook.site/token/{uuid}/requests` (pull, paginated `{data: [...]}`); folders 09/10 do.",
    ),
    (
        "- Fix scripts (`fix_round1-4.js`, `probe_*.js`, `inspect_parts.js`) — deterministic, asserted patches applied during live-test debugging; kept as history of *why* each change exists.",
        "- Fix scripts (`fix_round1-4.js`, `probe_*.js`, `inspect_parts.js`) — deterministic, asserted patches applied during live-test debugging; kept as history of *why* each change exists.\n- **`sim_khqr_flow.js`** (v1.4.0) — 37-check offline simulation of the folder-09 flow (builder self-tests, static/KHR variants, guards, callback sync, by-ref validation incl. the 404 branch) in Postman-faithful per-script `node:vm` scopes with real crypto-js. `node _build/sim_khqr_flow.js`.",
    ),
    (
        "Deliverable in this repo: `payway-boilerplate/Postman Collection API Testing/exp-PayWay API — Complete Collection.postman_collection.json` (~218 KB, 10 folders, 42 requests, 76 scripts — every request and folder documented, ⚡ Quick-test blocks; helper library in the `__helpers` variable).",
        "Deliverable in this repo: `payway-boilerplate/Postman Collection API Testing/exp-PayWay API — Complete Collection.postman_collection.json` (~257 KB, 10 folders, 45 requests, 82 scripts — every request and folder documented, ⚡ Quick-test blocks; helper library in the `__helpers` variable; folder 09 builds offline KHQR end-to-end).",
    ),
])
print('docs updated')
