# PayWay API Postman Collection — Maintainer Report

## Current source and release gate (29 Sep 2026)

The canonical collection is the Postman YAML workspace at `postman/collections/PayWay API — Complete Collection/`, mapped by `.postman/resources.yaml`; the generated dist export and `Refrence-copy-PayWay API — Complete Collection-1/` are distribution/historical artifacts only. Current YAML expectations are **46 requests and 125 collection variables**. The design includes the offline-KHQR flow, webhook.site receiver/callback synchronization, Payment Link voiding, portable RSA encryption, helper migration loaders, and Runner flows.

The release gate is **green**: the full `test:yaml` suite (structure · script syntax · import shape · KHQR simulation · OpenAPI spec parity) passes, and the same suite runs in CI (`.github/workflows/ci.yml`, job `postman-collection`, added 2026-09-28). The dist export `dist/PayWay API — Complete Collection.postman_collection.json` (single-file v2.1 with 49 saved response examples across 26 requests) is freshness-gated by `node _build/export_json.js --check` in the same CI job.

Updated: 28 Sep 2026 (v1.5.0 — **distribution, examples, and AI-tooling wave**: fixed the broken release gate — `__helpers_v20260923_portable_v2` shipped as an empty `""` scalar so every request threw "The shared PayWay helper is missing" on fresh import; `sync_portable_helper.js` now handles the empty-scalar state idempotently; rewrote `postman/documents/README.md` around artifacts that actually exist (the eight planned guides are now explicitly listed as not-yet-written) and replaced the deleted-legacy-file map in `collection-index.md`; added `_build/examples.json` + `_build/export_json.js` producing `dist/PayWay API — Complete Collection.postman_collection.json` — v2.1 JSON, SDK-import-verified, 49 saved response examples across 26 requests grounded in live captures and the SDK OpenAPI spec (success + common business-error shapes incl. the mixed `status.code` typing, the HTML-success purchase, PTL188-already-voided, code-09 not-linked); added `postman/environments/` Sandbox + Production environment files (env overrides collection vars once selected — Production carries placeholders); bundled the SDK's OpenAPI 3.1 spec into `postman/specs/payway-openapi.yaml` with `_build/spec_parity.js` enforcing spec ⊆ collection and documenting the one collection-only path (payment-link void, undocumented-but-live-verified); copied the SDK error registry (83 codes, 8 families) into `postman/documents/error-codes.json` with provenance; added the `postman-collection` CI job (suite + dist freshness); extended `llms.txt` with workspace pointers; `postman-collection` SDK import of the dist export verified — 10 folders, 45 requests, 49 examples, 122 variables, `secret_key` secret-typed; v1.4.0 — **offline KHQR generation flow in folder 09**: the KHQR payload is now built entirely in Postman scripts per the developer.payway.com.kh KHQR guideline — EMVCo TLV + CRC-16/CCITT-FALSE with a per-send self-test that rebuilds the guideline's official sample payload byte-for-byte (incl. CRC `9FBD`) — rendering a scannable QR on the Visualize tab, generating a unique `khqr_merchant_ref` per send, creating a webhook.site receiver via API, syncing the payment pushback back into variables, and finishing with Get Transactions by Merchant Ref which cross-checks APPROVED status + amount; folder 10's webhook.site sync request was found silently broken (the `api.webhook.site` JSON API now serves an unrelated app) and was re-pointed at `webhook.site` with both response shapes parsed — fix live-verified through Newman; 45 requests, 82 scripts, 114 variables, 0 syntax errors, official SDK import check green; v1.3.1 — **second-pass script-compliance review**: every script object now carries the `packages` field current Postman exports emit, and the 11 RSA pre-requests declare `node-forge@1.3.1` via Postman's script package-import so the dependency loads automatically (no manual Libraries step); audit confirmed 58/58 helper-consuming scripts keep the `__helpers` eval loader, zero deprecated APIs (`pm.environment`/`pm.globals`/`tests[`/`setTimeout`/`fetch`), `require` limited to `crypto-js` (sandbox built-in) and the now-declared `node-forge`, and every `{{var}}` inside scripts is instructional text — Postman does not substitute collection variables in scripts, and none is read functionally; v1.3.0 — **workspace import + Void Payment Link + project credentials**: the collection now lives in the SDK repo at `payway-boilerplate/Postman Collection API Testing/exp-PayWay API — Complete Collection.postman_collection.json`; credential variables re-pointed from the public demo merchant to this project's sandbox merchant (merchant `ec476910`, `secret_key` Postman **Secret** type, full RSA public PEM, seeded beneficiary `500000001`, `ctid customer123`); folder 05 gains **Void Payment Link** — the live-verified (§23) permanently-cancel-an-unpaid-link endpoint — plus the create→`payment_link_id` chaining fix; 42 requests, 76 scripts, 0 syntax errors, official SDK import check green; v1.2.1 — **visualizer launcher fix**: "Open payment page" now opens the PayWay checkout in a new browser tab (`target="_blank"`) instead of navigating inside Postman's sandboxed Visualize iframe; v1.2.0 — **script-scope fix**: Postman runs every script in its own scope, so the collection-level helper library was invisible to all 60 request scripts; library moved to the `__helpers` collection variable + `eval` loaders, live-verified with Newman; v1.1.1 — helper-text pass: ⚡ Quick-test description blocks, `NEXT:` console hints, 60-second-fixes guide section; v1.1.0 — first live-tested release, Postman-Visualizer response rendering, SDK-verified importability)

## 1. Executive summary

A single, self-contained Postman Collection (originally `PayWay_API_Postman_Collection.postman_collection.json`; since v1.3.0 this repo carries it as `exp-PayWay API — Complete Collection.postman_collection.json`, schema v2.1.0) covering the full PayWay merchant API surface: checkout/REST, QR, Payment Link, pre-auth, payout, CoF/subscriptions, KHQR, callbacks/webhooks, plus Collection-Runner polling flows. Built from per-folder JSON parts in `_build/` and merged by `_build/merge.js` (Node).

**This release is the first one executed against the live sandbox** (`https://checkout-sandbox.payway.com.kh`) with a Postman-faithful script runtime. Result: **17 live requests, 0 failures**, every reachable endpoint verified, and a series of real bugs found and fixed (see §4).

### 1.2 v1.2.0 — script-scope fix (Postman "utcNow is not defined")

**Symptom (first observed in the Postman app, 19 Sep 2026):** sending **03 → 1. Purchase (Hosted Checkout) - multipart** (and in fact every request with scripts) failed with `ReferenceError: utcNow is not defined` in the pre-request script and `ReferenceError: okStatus is not defined` in the test script; the request went out **unsigned** and the sandbox answered 400/`04`.

**Root cause:** Postman executes *every* script — collection-level, folder-level, request-level, pre-request **and** test — in its **own scope**. Top-level functions declared in the collection pre-request (the 18-helper library) are therefore **not visible** to request scripts. The v1.0–v1.1 QA missed this because `smoketest.js` ran all scripts of a request in one shared `vm` context (an incorrect model of Postman). `_build/scope_audit.js` mapped the blast radius: **60 of 72 scripts** (35 pre-request + 25 test) referenced the helpers.

**Rejected alternative:** Postman AI's suggestion to move each request's logic into the collection script behind `if (pm.info.requestName === '…')` guards. It only patches one request, still leaves the 25 test scripts broken, couples logic to exact request names, and would grow two collection-level monoliths with ~60 guarded blocks. The eval-library pattern is the standard Postman solution and also works in Newman/Postman CLI.

**Fix (via idempotent `_build/fix_scope.js`, no request logic moved):**
- The helper library now ships **once** as the `__helpers` collection variable (source of truth, editable in the Variables tab, travels with the JSON).
- The collection pre-request is an 8-line loader that evals it (guarded with a clear error if the variable is missing).
- All **60** helper-consuming scripts (pre-request *and* test) start with the same 4-line loader: `eval(pm.collectionVariables.get('__helpers'))`.
- `smoketest.js` rewritten to run **each script in its own `vm` context** (variables shared, declarations not) — the faithful Postman model, so this bug class can never pass QA again.
- Collection version → 1.2.0; variables 75 → 76.

**QA (all green):** `merge.js`, `syntaxcheck.js` (72 scripts, 0 errors), `validate.js`, `verify_postman_import.js` (importable; 76 variables), `smoketest.js` sim (41/41 execute under isolated scopes; the 16 stops are the intentional prerequisite guards), `standards.js`, `verify_index.js`. Newman live re-run (same `postman-runtime` engine as the app and Postman CLI): Purchase **HTTP 200** checkout page + all assertions passing (was ReferenceError + 400); a 15-request live pass over folders 03/04/08 executed **60/60 scripts with zero ReferenceErrors** — success endpoints (Purchase, Transaction List, Exchange Rate, Generate QR, Link Account, Link Card, Subscription, Close) all 2xx, RSA Refund showing its designed friendly `SKIPPED` branch, CoF token ops stopping on their intentional `{{pwt}}` guards.

### 1.3 v1.2.1 — visualizer launcher opens the checkout in a new tab

**Symptom (19 Sep 2026):** clicking **"Open payment page →"** in the Purchase (and CoF Link Card) Visualize tab navigated **inside Postman's sandboxed visualizer iframe** — the hosted-checkout page half-loaded in the pane (its own JS fetched the QR session, e.g. `GET checkout-sandbox.payway.com.kh/<base64 session json>`, `step: abapay_khqr_request_qr`) but could not be used to pay.

**Fix (idempotent `_build/fix_visualizer_tab.js`):** the shared `visualizeFormPost` launcher form now posts with `target="_blank"`, the button reads "Open payment page in a new tab →", and the card carries a hint ("The checkout opens in a new browser tab. If nothing opens, allow pop-ups for Postman and click again."). Same helper serves folder 08's Link Card launcher, so both benefit. QA: merge, syntaxcheck (72/0), SDK import check, live Purchase re-run HTTP 200. Version → 1.2.1.

### 1.4 v1.1.1 — helper-text pass (documentation only, no script logic changed)

Review outcome: the pre/post scripts already carried strong inline guidance (`b4hash:` logging, prerequisite guards, error-code logging), but request-level helper text was missing exactly where developers start. Changes, all via the new idempotent `_build/inject_quickstart.js` (edit parts → `merge.js`):

- **Request descriptions** — 24 requests now start with a **⚡ Quick test** block (what to set → what to expect → what to send next), kept above the existing hash/RSA notes. Five folder-03 requests (Purchase, Get Transaction Details, Check Transaction, Close Transaction, Exchange Rate) had **no description at all** — full helper descriptions written; thin stubs elsewhere (pre-auth, whitelist, CoF token ops, runner steps A3–B5) expanded. Coverage is now 41/41 requests, 10/10 folders.
- **`NEXT:` console hints** — status-aware hints added to the test scripts on the critical first path: Purchase (both success branches), Check Transaction (APPROVED / PENDING / DECLINED / code-5), Generate QR. Pure `console.log` additions; no assertions or chaining logic touched.
- **Get Started guide** (`_build/get_started.md`, auto-synced into the Overview tab) — added a "helper text everywhere" callout in §1 and a new **§6 · 60-second fixes** troubleshooting table (Wrong hash, RSA SKIPPED, code 5, code 49, code 23); Environments renumbered to §7.
- **`collection-index.md`** — brought up to date with the collection (folder 01 name, request names/URLs, `purchase_type` variable, version, sizes) so `verify_index.js` passes again; documents the helper-text architecture and all `_build` tooling files.

QA after the pass: `merge.js`, `syntaxcheck.js` (72 scripts, 0 errors), `validate.js`, `verify_postman_import.js` (SDK verdict: importable), `smoketest.js` sim (41/41 execute; the 16 reported guard-throws are the intentional prerequisite stops), `standards.js` (41/41 descriptions), `verify_index.js` (all checks passed). The legacy `PayWay_CoF_Postman_Collection_v4.json` (regression baseline) and the three `Create Transaction *.postman_collection.json` scratch exports were deliberately left untouched.

### 1.5 v1.3.0 — workspace import, project credentials, Void Payment Link (21 Sep 2026)

The collection was imported from the standalone `D:\PayWay_Postman` workspace into the PayWay SDK repo (`payway-boilerplate/Postman Collection API Testing/`). Changes, all verified by `.scratch/postman-collection-fix/` tooling (script parse in per-script vm scopes + variable resolution + official `postman-collection` SDK import):

- **Credentials re-pointed to this project's sandbox merchant (user-directed).** `merchant_id` `sonitatest` → `ec476910`; `secret_key` → the repo `.env` API key, kept as a Postman **secret**-type variable (masked in UI/exports); `rsa_public_key` placeholder → the project's full multi-line public-key PEM (first patch attempt had silently stored only the `-----BEGIN PUBLIC KEY-----` header — the `.env` value spans lines and a line-based parser truncates it); `whitelist_payee` docs sample `318111358120004` → **`500000001`** (a seeded sandbox beneficiary; the docs example is not in this merchant's whitelist); the payout pre-request's default fallback beneficiary → `500000001`; CoF `ctid` `TESTCONSUMER01` → `customer123`. Everything is seeded as **collection variables** — no external Postman environment is required.
- **NEW request — folder 05 "Void Payment Link"**: `POST /api/merchant-portal/merchant-access/payment-link/void`, the undocumented permanently-cancel-an-unpaid-link endpoint. Contract learned from the SDK implementation (`src/domains/payment-link.ts`) and SANDBOX-FINDINGS §23: signs like detail — `merchant_auth` = RSA `{mc_id, id}` (id = create's `data.id`), hash = base64 HMAC over `request_time + merchant_id + merchant_auth`, JSON body accepted. Test script maps all four live-observed outcomes: 200 "00" (VOIDED; `tran_id` is the numeric gateway log id), 403 `PTL188` already-voided (terminal state, treated as success — void is NOT idempotent), 403 `96` unknown id, plus the standard RSA-skip branch and a hard pre-request guard explaining `{{payment_link_id}}`. Description carries the ⚡ Quick test, the response table and the rules of thumb (irreversible; unpaid links only; post-void detail reads `VOIDED`, hosted page renders the invalid-data shell code 07).
- **Chaining bug fixed (see §6 #17):** create's test never saved `payment_link_id` although the index promised "Saved by Create" — Details ran on a `'1'` placeholder. Create's test now saves `data.id` and prints a `NEXT:` hint; the Create → Details → Void chain works end-to-end.
- **Docs counters refreshed** in `collection-index.md` (42 requests, 93 variables, 37 pre+test pairs, 5 schema assertions) and the demo-merchant wording in the overview/folder descriptions replaced with the project-credentials wording. `_build/part_05_paymentlink.json` mirrors the new request so a future merge keeps it.

Second-pass QA (v1.3.1): `audit_postman_compliance.cjs` — 76/76 scripts carry `type`/`packages`/string-array `exec`; 58/58 helper consumers have the loader; no deprecated or blocked APIs; 11 RSA pre-requests declare `node-forge@1.3.1`; official SDK import re-check green (42 items, 74 request scripts with packages, 11 forge declarations). Earlier v1.3.0 QA: collection validator — 10 folders, **42 requests, 76 scripts, 0 parse errors**, all `{{variables}}` resolve; postman-faithful simulation of the void scripts with real crypto backends — the pre-request's `hash` is byte-identical to `HMAC-SHA512(req_time + merchant_id + merchant_auth)` under the project secret, `merchant_auth` encrypts to a correct 128-byte RSA block for the project's 1024-bit key, the missing-id guard throws its clear message, and all four test branches pass; official `postman-collection` SDK import check — importable, 42 items, 93 variables, 0 malformed hosts, `secret_key` secret-typed.

### 1.6 v1.4.0 — offline KHQR generation in Postman (folder 09, 22 Sep 2026)

Implements the guideline flow *Generate merchant reference → build KHQR payload → display QR → user scans & pays → receive/check webhook → query by merchant reference → validate final status* **without any QR-generation API call**:

- **1. Create webhook.site Receiver** — `POST https://webhook.site/token` (the JSON API moved off `api.webhook.site`); saves `callback_listener` + `webhook_token`, the same variables folder 10 uses.
- **2. Build Offline KHQR (TLV + CRC + QR)** — pre-request builds `00/01/30(00-02)/52/53/54/58/59/60/62(01,68)/99/63` per the guideline: KHR amounts integer-only (116), USD ≤2dp (840), static mode omits tag 54, tag 62.01 gets a unique ≤25-char `khqr_merchant_ref` (synced into `merchant_ref` for step 4), tag 99 carries creation/expiry ms timestamps. Every send re-runs the spec self-test (CRC canonical `123456789 → 29B1` + the guideline's official sample byte-exact incl. `9FBD`) and throws on drift. The test script renders the QR via the existing `visualizeQr` helper (CDN qrcodejs, Visualize tab). Defaults ship with the guideline's example merchant identity (`khqr_*` variables) — merchants replace them with their ABA-issued values.
- **3. Pull webhook.site Callbacks (KHQR)** — pulls `token/{uuid}/requests`, parses legacy-array *and* paginated `{data}` shapes, matches JSON pushbacks by `merchant_ref`, imports `khqr_transaction_id`/`payment_status(_code)`/amounts, counts multiple payments (the guideline: a KHQR can be paid multiple times).
- **4. Get Transactions by Merchant Ref** (existing request, renamed into the numbered flow) — when a QR has been built, the test now scans the inquiry response for transaction objects, matches the reference, asserts ≥1 APPROVED (`payment_status_code 0`), cross-checks the amount against the QR, and stores `khqr_final_status`; the demo-profile 404 branch stays informational.

**Incident found by live Newman testing (fixed in the same wave):** `api.webhook.site` no longer serves the JSON API — `POST/GET /token*` there returns an unrelated app's JSON (`{"status":"success","translated_text":...}`) with HTTP 200. Folder 09's two webhook.site calls and folder 10's **Sync webhook.site → Postman** were re-pointed at `https://webhook.site`, and the sync's test now parses both response shapes (it previously assumed a top-level array). Live-verified: receiver creation, pull, and a seeded-callback sync ("SYNC OK") all green through Newman against the real webhook.site; the collection's own folder-09 run passes end-to-end with only the designed "no pushback yet" signal (nothing had paid the QR).

Tooling: `.scratch/postman-collection-fix/add_khqr_flow.py` (idempotent flow patcher), `fix_khqr_hosts.py` (webhook.site host/shape fix), `_build/sim_khqr_flow.js` (37-check offline runtime simulation of the whole flow in Postman-faithful per-script vm scopes). QA: `validate_exp.cjs` 82 scripts / 0 parse errors / no undefined vars; `audit_postman_compliance.cjs` 59/59 helper consumers keep the loader, zero new findings (23 pre-existing instructional-text notes unchanged); `prove_selfcontained.cjs` 40/43 both-scripts (3 doc-only pages unchanged), self-contained; official SDK import green (45 requests, 114 vars).

## 2. Live verification matrix (sandbox — v1.3.0 uses this project's merchant `ec476910`; earlier rows ran on the demo merchants `sonitatest` / `sonitatestinstore`)

| Endpoint | Live result | Notes |
|---|---|---|
| Purchase (hosted checkout) | ✅ HTTP 200 | Returns the HTML checkout page; `last_tran_id` auto-saved |
| Get Transaction Details | ✅ HTTP 200 | Query `status.code "00"`; full record in `data` |
| Check Transaction (fast) | ✅ HTTP 200 | `status.code` is the **query** status; transaction status is `data.payment_status_code` |
| Close Transaction | ✅ | Correct business error (5 "Transaction not found") on a fresh ID |
| Refund (RSA) | ⚠️ SKIP | Requires RSA `merchant_auth`; friendly skip + WARN without node-forge (see §5) |
| Transaction List | ✅ HTTP 200 | Date format fix (below); lists live transactions |
| Exchange Rate | ✅ HTTP 200 | `code "00"`, `exchange_rates` |
| Generate QR (folder 04) | ✅ HTTP 200 | `qrString` + `qrImage` (data-URL) |
| CoF Link Account | ✅ HTTP 200 | `code "00"`, returns `data.deeplink` + `data.qr_string` |
| CoF Link Card | ✅ HTTP 200 | Returns the card-entry HTML page |
| CoF Get Token Details | ✅ (business) | `code 09 "Data not found"` until the ABA-app link is completed — expected; test is informational |
| CoF Subscription | ✅ HTTP 200 | Full v1 purchase hash accepted; `qrString` returned, success code `"00"` |
| Flow A polling loop | ✅ | A1 → A2 polls `transaction-detail`, sees PENDING, loops, exits to A3 at `max_polls` |
| KHQR get-transactions-by-mc-ref (folder 09 #4) | ⚠️ 404/empty | Path + hash are docs-verified; sandbox demo profiles return 404/empty (needs dedicated KHQR profile). Guarded, informational |
| webhook.site receiver + pull + sync (folders 09/10) | ✅ live (Newman, 2026-09-22) | Bin created via `POST https://webhook.site/token`; pull + seeded-callback sync green after the `api.webhook.site` retirement fix |
| **Offline KHQR builder** (folder 09 #2, v1.4.0) | ✅ live (Newman) | Guideline page fetch 200; spec self-tests pass; payload built + QR rendered; phone scan-and-pay remains human-only |
| Payout / Whitelist / Pre-auth / Payment Link (RSA) | ⚠️ SKIP | Same RSA skip handling as Refund |
| **Void Payment Link** (v1.3.0) | ✅ contract-verified | Contract live-verified through the SDK/CLI e2e (SANDBOX-FINDINGS §23 addendum, all six legs green); the Postman request itself was verified by simulation — its computed hash is byte-identical to the SDK's composition and all four response branches (00 / PTL188 / 96 / other) pass their assertions. Not yet fired live **from Postman** |

Not live-verifiable without a human: paying the checkout page / scanning KHQR / completing the CoF link in the ABA app (sandbox auto-approval was not observed), and RSA endpoints without a merchant RSA key.

## 3. Response handling (post-response automation)

**Every API request has a test script** that: normalizes the mixed string/number `status.code` (`okStatus`/`respCode`), chains state for the next request (`last_tran_id`, `pwt`, `ctid`, `request_id`, `payment_link_id`, `poll_status`, `last_pay_status`), logs human-readable error codes, and asserts a JSON schema where the shape is stable.

**Postman Visualizer** (`pm.visualizer.set`, no-ops under newman/CI) renders interactive responses in the **Visualize tab**:

| Request | What renders |
|---|---|
| 1. Purchase (hosted checkout) | **Merchant-style launcher**: a button that form-POSTs the already-signed fields (incl. `hash`) to the purchase endpoint — the browser then navigates to the checkout page **served by PayWay itself**, and payment happens with the sandbox test cards |
| CoF Link Card | Same form-POST launcher for the card-linking page |
| Generate QR / Flow A1 / Subscription | The KHQR as a scannable image (`qrImage` data-URL) + the raw `qrString` |
| CoF Link Account (folder 08 + Flow B1) | `qr_string` rendered as a QR (CDN QR lib, computed locally — no data leaves Postman) + request_id guidance |

**Why a form-POST launcher instead of showing/saving the returned HTML:** the checkout page's own JavaScript calls back to PayWay from the page origin — opened from `file://` (Save Response → open in browser) those calls CORS-fail and the page never loads (observed). The form POST is the actual merchant integration pattern: the browser navigates to the checkout URL, PayWay serves the page on its own origin, everything is same-origin and works. After paying, re-sending **Check Transaction** in Postman shows APPROVED. Sandbox-verified: a plain urlencoded form POST with the collection's field set (`view_type=hosted_view`, `payment_gate=0`) returns the full checkout HTML page (probe: `_build/probe_purchase_urlencoded.js`).

**Other automation already in place:** Flow A2 `postman.setNextRequest` polling loop on `data.payment_status_code`; webhook.site "pull callbacks" sync that imports `tran_id`/`pwt`/`ctid` into collection variables; RSA endpoints auto-skip with setup guidance when `merchant_auth` cannot be computed.

## 4. Importability (verified with the official Postman SDK)

`_build/verify_postman_import.js` loads the **legacy JSON export** with **`postman-collection`** — the same parser the Postman app uses on import. The following is a historical v1.3.0 snapshot, not the current YAML collection:

```
JSON.parse: OK (218 KB) — sdk.Collection instantiated
10 folders, 42 requests, 93 collection variables
request prerequest=37, request test=37, collection prerequest=1, collection test=1
URL issues: none — secret-typed variables: secret_key
VERDICT: importable in Postman (re-run 2026-09-21 after the v1.3.0 import)
```

Historical import path: Postman → **Import** → select `PayWay_API_Postman_Collection.postman_collection.json`. For the current project, use the YAML workspace at `postman/collections/PayWay API — Complete Collection/` mapped by `.postman/resources.yaml`.

## 5. Sandbox behaviours discovered (documented in the collection)

1. **`status.code` types are mixed.** Success comes back as `"00"` (string), business errors as `"5"`, `"1"`, `6` (string *or* number). All test scripts now normalize via `okStatus(j)` / `respCode(j)` (accept `0`/`"0"`/`"00"`).
2. **check-transaction-2 has a 7-day window and does not see KHQR transactions** (docs confirm the 7-day limit; sandbox confirmed QR-created trans return `code 6` while transaction-detail finds them). Polling therefore uses **transaction-detail**, which works for both.
3. **The transaction status lives in `data.payment_status_code` / `data.payment_status`**, not in `status.code` (`2`/`PENDING`, `0`/`APPROVED`, `3`/`DECLINED`, `4`/`REFUNDED`, `7`/`CANCELLED`).
4. **Transaction List dates must be `yyyy-mm-dd hh:mm:ss`** — plain `yyyy-mm-dd` is rejected with code 49 "Invalid Start Date". Auto-filled today 00:00:00 → 23:59:59.
5. **generate-qr `purchase_type` only allows `purchase` | `pre-auth`** (the wallet selector is `payment_option`).
6. **Purchase success = the HTML checkout page** (HTTP 200, `text/html`) — the test detects this and saves `last_tran_id`; JSON paths still handled.
7. **CoF Link Account works with the public demo merchant** and returns deeplink + QR immediately; the token (`pwt`) only exists after the customer completes the link (Get Token Details then returns code 09).
8. **webhook.site moved its JSON API off `api.webhook.site`** (observed 2026-09-22): the old host still answers HTTP 200 with an unrelated app's JSON, so failures are silent. Use `https://webhook.site/token` (create) and `https://webhook.site/token/{uuid}/requests` (pull, paginated `{data: [...]}`); folders 09/10 do.

## 6. Bugs found by live testing and fixed (v1.0.0 → v1.1.0)

| # | Bug | Fix |
|---|---|---|
| 1 | Numeric `status.code` assertions everywhere (`eql(0)`, `typeof === 'number'`) failed against string codes | `okStatus()`/`respCode()` normalization in all test scripts |
| 2 | Polling loop compared numeric `status.code === 2` and polled the *query* status, not the payment status | Flow A2 rewritten: polls `transaction-detail`, loops on `data.payment_status_code === 2`, budgeted by `{{max_polls}}` |
| 3 | `purchase_type` on generate-qr carried the payment option → sandbox rejected (`04`) | New `{{purchase_type}}` variable (`purchase`), hash + body + docs updated |
| 4 | Transaction List sent `yyyy-mm-dd` → code 49 | `yyyy-mm-dd hh:mm:ss` auto-fill + description |
| 5 | Purchase test assumed a JSON response; success is HTML | HTML-200 success path saving `last_tran_id` |
| 6 | QR response keys logged as `qr_data`/`qr_image`; real keys are `qrString`/`qrImage` | Tests + docs updated |
| 7 | Subscription success code is `"00"` but the test expected `'0'` | `okStatus` |
| 8 | RSA endpoints failed loudly without node-forge | `rsaMissing(j)` helper + friendly `SKIPPED` tests (8 requests) |
| 9 | KHQR lookup crashed on the sandbox 404/empty body | Guarded, informational, sandbox note added |
| 10 | Callback senders crashed with `Failed to parse URL from ''` when `{{callback_listener}}` empty | Pre-request guards with setup instructions |
| 11 | Doc-only "README" request in folder 11 actually fired a hashless API call | Now points to the docs site |
| 12 | Sandbox Test Cards doc link 404 | Points to `resources-3305682f0` |
| 13 | Collection README referenced wrong folder numbers (08/09) | Corrected (10 callbacks, 11 polling) |
| 14 | Runner flows bled into each other (A4 → B1) | `postman.setNextRequest(null)` at end of Flow A / Flow B |
| 15 | `fmtAmt` forced 2 decimals (breaks KHR integer amounts) | `fmtAmt(a, cur)` — KHR rounds to integer; wired into purchase/QR/CoF money fields |
| 16 | Missing `{{return_params}}` seed broke the callback sample sender | Seeded in collection variables |
| 17 | Create's test never saved `payment_link_id` although the index said "Saved by Create" — Details ran on a `'1'` placeholder (found when adding Void, v1.3.0) | Create's test appends the save: `payment_link_id` = create response `data.id`, plus a `NEXT:` hint pointing at Details/Void |

DX/security changes: since v1.3.0 `merchant_id`/`secret_key`/`rsa_public_key` are pre-filled with **this project's sandbox merchant** (`ec476910` + repo `.env` API key + full public PEM) so the collection works on first Send; `secret_key` stays a Postman **secret**-type variable with a replace-me description; `whitelist_payee` and the payout pre-request fallback use the seeded sandbox beneficiary `500000001`; every prerequisite throws a clear, actionable message instead of a cryptic failure.

## 7. Build architecture & QA tooling

- `part_00_info.json` — **legacy JSON source** retained for historical patch analysis. Current descriptions and helper state live in the YAML collection resources; the active helper key is `__helpers_v20260923_portable_v2` with legacy migration fallbacks.
- `part_01…part_11` — one part per folder (`{ folder, description, item }`).
- `merge.js` — merges parts, preserves collection-level `event`, checks the global pre-request survives.
- Validators: `syntaxcheck.js` (parses every script), `validate.js` (folders, setNextRequest targets, undefined vars, helpers), `audit.js`, `standards.js`.
- **`smoketest.js`** — Postman-faithful simulator + live smoke test. Runs the collection's actual scripts in `node:vm` sandboxes with **one fresh scope per script** (collection pre / request pre / collection test / request test), matching Postman's scoping rules — only `pm` variables are shared — then optionally fires real HTTP calls. `node smoketest.js` = sim-only (no HTTP); `node smoketest.js live` = full live pass against the sandbox using the collection's pre-filled merchant (project `ec476910` since v1.3.0). (`scope_audit.js` maps helper definition/usage across all scripts; `fix_scope.js` is the idempotent v1.2.0 patcher.)
- Fix scripts (`fix_round1-4.js`, `probe_*.js`, `inspect_parts.js`) — deterministic, asserted patches applied during live-test debugging; kept as history of *why* each change exists.
- **`sim_khqr_flow.js`** (v1.4.0) — 37-check offline simulation of the folder-09 flow (builder self-tests, static/KHR variants, guards, callback sync, by-ref validation incl. the 404 branch) in Postman-faithful per-script `node:vm` scopes with real crypto-js. `node _build/sim_khqr_flow.js`.

## 8. Rebuild & validate

```powershell
cd "payway-boilerplate/Postman Collection API Testing"   # from the repo root
node _build\merge.js                     # parts -> merged collection (legacy deliverable name)
node _build\syntaxcheck.js               # every script parses
node _build\validate.js                  # structure, vars, setNextRequest targets
node _build\verify_postman_import.js     # official postman-collection SDK import check (needs postman-collection + @faker-js/faker in _build)
node _build\smoketest.js                 # sim pass: all scripts execute, all body vars set
node _build\smoketest.js live            # LIVE pass against sandbox (safe endpoints only)

# repo-side validator (no _build dependency):
node .scratch/postman-collection-fix/validate_exp.cjs "exp-PayWay API — Complete Collection.postman_collection.json"
```

Deliverable in this repo: `payway-boilerplate/Postman Collection API Testing/exp-PayWay API — Complete Collection.postman_collection.json` (~257 KB, 10 folders, 45 requests, 82 scripts — every request and folder documented, ⚡ Quick-test blocks; helper library in the `__helpers` variable; folder 09 builds offline KHQR end-to-end). NOTE: `_build/merge.js` still writes the legacy `PayWay_API_Postman_Collection.postman_collection.json` name and legacy variable set — reconcile part_00 with the shipped export before re-merging (the shipped `exp-` file is the source of truth).

## 9. Remaining known gaps (not bugs)

1. **RSA endpoints cannot be fully verified** without a merchant RSA key — hash *orders* are implemented per docs and validated up to the RSA-payload check; with node-forge installed the scripts compute `merchant_auth`/`beneficiaries` automatically.
2. **Payment completion** (paying the hosted page, scanning KHQR, completing the CoF link in the ABA app) needs a human; polling and callback paths are wired and sandbox-verified up to that point.
3. **KHQR retrieval** returns 404/empty for demo profiles — keep the informational note; retest with a real KHQR profile.
4. OpenAPI spec generation remains a manual Postman UI step (Spec Hub).
5. Credential placement (decided 2026-09-21): the project sandbox credentials stay **in the collection** (`secret_key` is Postman Secret-typed) so the file stays self-contained — switching to Sandbox/Prod Postman environments remains optional hardening. Still open: `newman run` in CI with the `smoketest.js` sim pass as pre-commit.

## 10. Command/URL reference

- PayWay sandbox: `https://checkout-sandbox.payway.com.kh` (live-tested 2026-09-18; project merchant `ec476910` since v1.3.0)
- PayWay prod: `https://checkout.payway.com.kh`
- Docs index: `llms.txt` in this folder (each `*.md` doc is fetchable — used to verify the KHQR endpoint)
- Sandbox merchants: this project `ec476910` (ctid `customer123` for CoF); public demo merchants `sonitatest` (ecommerce) / `sonitatestinstore` (QR/in-store) remain available for read-only doc demos
- Transaction status codes: `0` APPROVED/PRE-AUTH, `2` PENDING, `3` DECLINED, `4` REFUNDED, `7` CANCELLED
- Postman collection schema: `https://schema.getpostman.com/json/collection/v2.1.0/collection.json`
- Full audit, incidents and roadmap (pre-import history): `MAINTAINER_REPORT.md` in this folder; repo-side SDK contract: `docs/17-payment-link.md` §17.4 + `docs/internal/SANDBOX-FINDINGS.md` §23 for the void endpoint
