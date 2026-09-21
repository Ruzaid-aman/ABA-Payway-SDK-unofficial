# PayWay API Postman Collection — Index

Navigation index for the PayWay merchant-API Postman collection built in this workspace. The collection is a self-contained playground for merchant developers: every API call signs itself (HMAC-SHA512), auto-encrypts RSA payloads when possible, saves the variables the next step needs, and documents its hash order inline. Use this file to find the right folder/request without opening the 212 KB JSON.

**Last verified:** 19 Sep 2026 (stats extracted directly from the merged collection JSON).

## At a glance

| Property | Value |
|---|---|
| Collection file | `PayWay_API_Postman_Collection.postman_collection.json` (~212 KB) |
| Postman name | **PayWay API — Complete Collection** |
| Version / schema | `1.2.1`, collection format v2.1.0 |
| Folders / requests | 10 folders, 41 requests |
| Scripts | 36 API calls with pre-request **and** test scripts (72 scripts, 0 syntax errors); 5 doc-only reference GETs |
| Collection variables | 76 (demo merchant pre-filled; `secret_key` is a Postman Secret type; `__helpers` holds the shared script library) |
| Default `baseUrl` | `https://checkout-sandbox.payway.com.kh` (switch to `https://checkout.payway.com.kh` for production) |
| JSON-Schema assertions | 6 endpoints via shared `assertJsonSchema()` helper |
| Runner flows | Folder 11 (`setNextRequest`: QR polling loop + CoF lifecycle) |

## Workspace file map

| File | Role |
|---|---|
| `PayWay_API_Postman_Collection.postman_collection.json` | **The deliverable** — import this into Postman |
| `PayWay_CoF_Postman_Collection_v4.json` | Proven legacy CoF collection; source of truth for CoF hash orders (keep as regression baseline) |
| `Create Transaction Defualt Checkout.postman_collection.json` | Earlier scratch collection (hosted checkout) |
| `Create Transaction QR.postman_collection.json` | Earlier scratch collection (QR) |
| `Create Transaction QR on API.postman_collection.json` | Earlier scratch collection (QR on API) |
| `collection-index.md` | This index |
| `MAINTAINER_REPORT.md` | Audit findings, incidents, rebuild/validate instructions |
| `Goal.txt.txt` | Original build objective |
| `llms.txt` | Index of PayWay developer docs (Markdown per page) |
| `_build/` | Per-folder JSON "parts" + merge/validate tooling — the source of the merged collection |

## Quick start

1. Import `PayWay_API_Postman_Collection.postman_collection.json` into Postman.
2. Nothing to configure for a first test — the **public sandbox demo merchant is pre-filled**. For your own merchant replace: `secret_key` (HMAC-SHA512 signing secret — store as a Postman *Secret*), `rsa_public_key` (PEM), `merchant_id`, `ctid`; switch `baseUrl` sandbox/production.
3. Recommended: install **node-forge** under *Edit collection → Libraries* so RSA endpoints (`Refund`, Payment Link, Pre-auth, Payout, Whitelist) compute `merchant_auth`/`beneficiaries` for you. Without it, paste pre-encrypted values into the `*_merchant_auth` variables.
4. Start at **03 - Ecommerce Checkout → 1. Purchase**, pay on the hosted page (Visualize tab launcher), then **Check Transaction**. Every request's description starts with a **⚡ Quick test** block: what to set, what to expect, what to send next — and the Console prints `NEXT:` hints after key responses.
5. For callbacks, paste a `https://webhook.site/<uuid>` URL into `callback_url` / `callback_listener` (see folder 10).

## Folder & request index

Folder numbers skip 02; numbering is kept stable to stay aligned with the `_build/part_*.json` filenames.

| # | Folder | Purpose | Requests |
|---|---|---|---|
| 01 | Get Started & Test Cards | 60-second walkthrough, test cards, endpoint list | 3 (doc-only) |
| 03 | Ecommerce Checkout | Hosted checkout, status, close, refund, list, FX | 7 |
| 04 | ABA QR API | Generate ABA KHQR for scan-to-pay | 1 |
| 05 | Payment Link | Create/query shareable payment links (RSA) | 2 |
| 06 | Pre-auth | Capture/complete (± payout split), cancel holds | 3 |
| 07 | Payout | Mass payouts + payee whitelist (RSA) | 3 |
| 08 | Credentials on File (CoF) | Tokenize account/card, charge, renew, remove, subscription | 7 |
| 09 | KHQR Guideline | Instore lookups by `merchant_ref` | 1 |
| 10 | Callbacks & Webhooks | Sample callback senders, webhook.site sync, design notes | 4 |
| 11 | Polling & Lifecycle Flows (Runner) | Composable Flow A / Flow B via `setNextRequest` | 10 |

### 01 - Get Started & Test Cards *(doc-only GETs)*

| Request | Method | URL |
|---|---|---|
| 0. Get Started (60-second walkthrough) | GET | `https://developer.payway.com.kh/overview-865678m0` |
| Sandbox Test Cards | GET | `https://developer.payway.com.kh/resources-3305682f0` |
| Reference - API Endpoints List (doc) | GET | `https://developer.payway.com.kh/api-endpoints-984508m0` |

### 03 - Ecommerce Checkout

| Request | Method | Endpoint | Scripts |
|---|---|---|---|
| 1. Purchase (Hosted Checkout) - multipart | POST | `{{baseUrl}}/api/payment-gateway/v1/payments/purchase` | pre+test, JSON-Schema |
| 2. Get Transaction Details | POST | `{{baseUrl}}/api/payment-gateway/v1/payments/transaction-detail` | pre+test |
| 3. Check Transaction (fast, recent) | POST | `{{baseUrl}}/api/payment-gateway/v1/payments/check-transaction-2` | pre+test, JSON-Schema |
| 4. Close Transaction | POST | `{{baseUrl}}/api/payment-gateway/v1/payments/close-transaction` | pre+test |
| 5. Refund - RSA merchant_auth | POST | `{{baseUrl}}/api/merchant-portal/merchant-access/online-transaction/refund` | pre+test, JSON-Schema, RSA |
| 6. Transaction List (filter) | POST | `{{baseUrl}}/api/payment-gateway/v1/payments/transaction-list-2` | pre+test |
| 7. Exchange Rate | POST | `{{baseUrl}}/api/payment-gateway/v1/exchange-rate` | pre+test |

### 04 - ABA QR API

| Request | Method | Endpoint | Scripts |
|---|---|---|---|
| Generate QR | POST | `{{baseUrl}}/api/payment-gateway/v1/payments/generate-qr` | pre+test, JSON-Schema |

### 05 - Payment Link *(portal APIs — RSA `merchant_auth`)*

| Request | Method | Endpoint | Scripts |
|---|---|---|---|
| Create Payment Link | POST | `{{baseUrl}}/api/merchant-portal/merchant-access/payment-link/create` | pre+test, RSA |
| Get Payment Link Details | POST | `{{baseUrl}}/api/merchant-portal/merchant-access/payment-link/detail` | pre+test, RSA |

### 06 - Pre-auth

| Request | Method | Endpoint | Scripts |
|---|---|---|---|
| 1. Complete Pre-auth | POST | `{{baseUrl}}/api/merchant-portal/merchant-access/online-transaction/pre-auth-completion` | pre+test, RSA |
| 2. Complete Pre-auth with Payout | POST | `{{baseUrl}}/api/merchant-portal/merchant-access/online-transaction/pre-auth-completion` | pre+test, RSA |
| 3. Cancel Pre-auth | POST | `{{baseUrl}}/api/merchant-portal/merchant-access/online-transaction/pre-auth-cancellation` | pre+test, RSA |

### 07 - Payout *(whitelist the payee first; hash computed after RSA encryption)*

| Request | Method | Endpoint | Scripts |
|---|---|---|---|
| 1. Payout (to beneficiaries) | POST | `{{baseUrl}}/api/payment-gateway/v2/direct-payment/merchant/payout` | pre+test, RSA |
| 2. Add Account to Payout Whitelist - RSA | POST | `{{baseUrl}}/api/merchant-portal/merchant-access/whitelist-account/add-whitelist-payout` | pre+test, RSA |
| 3. Update Payser Status - RSA | POST | `{{baseUrl}}/api/merchant-portal/merchant-access/whitelist-account/update-whitelist-status` | pre+test, RSA |

### 08 - Credentials on File (CoF)

| Request | Method | Endpoint | Scripts |
|---|---|---|---|
| 1. Link Account (ABA Account) | POST | `{{baseUrl}}/api/payment-credential/v3/aof/link-account` | pre+test |
| 2. Link Card (Credit/Debit) | POST | `{{baseUrl}}/api/payment-credential/v3/cof/link-card` | pre+test |
| 3. Get Token Details | POST | `{{baseUrl}}/api/payment-credential/v3/token-management/get-token-details` | pre+test, JSON-Schema; saves `pwt`/`ctid` |
| 4. Payment (Using Token) | POST | `{{baseUrl}}/api/payment-gateway/v3/purchase/payment-credential` | pre+test |
| 5. Renew Token (ABA account) | POST | `{{baseUrl}}/api/payment-credential/v3/token-management/renew-expired-account-token` | pre+test |
| 6. Remove Token (irreversible) | POST | `{{baseUrl}}/api/payment-credential/v3/token-management/remove-token` | pre+test; clears `pwt` |
| 7. Subscription (Scheduled Payment) | POST | `{{baseUrl}}/api/payment-gateway/v1/payments/purchase` | pre+test (CITR_FIX recurring) |

### 09 - KHQR Guideline

| Request | Method | Endpoint | Scripts |
|---|---|---|---|
| Get Transactions by Merchant Ref | POST | `{{baseUrl}}/api/payment-gateway/v1/payments/get-transactions-by-mc-ref` | pre+test |

### 10 - Callbacks & Webhooks

| Request | Method | URL | Scripts |
|---|---|---|---|
| Payment Result Callback - Sample Sender | POST | `{{callback_listener}}` | pre (signs `X-PayWay-Hmac-Sha512`) + test |
| Token Result Callback (CoF) - Sample Sender | POST | `{{callback_listener}}` | pre + test |
| Sync webhook.site -> Postman (pull callbacks) | GET | `https://api.webhook.site/token/{{webhook_token}}/requests` | pre+test; imports `tran_id`/`pwt`/`ctid` from latest callback |
| Webhook Design Notes | GET | `https://developer.payway.com.kh/resources/webhooks` | doc-only |

The folder description documents three ways to get an inbound callback URL: webhook.site (with the REST sync trick above), a Postman Mock Server, or ngrok + local listener.

### 11 - Polling & Lifecycle Flows (Runner)

Run the whole folder in **Collection Runner** (delay ≈ 1000 ms). Each step also saves the variables the next step needs when run as a single request.

| Request | Method | Endpoint | Notes |
|---|---|---|---|
| Flow B - README: run the flows | GET | `{{baseUrl}}/api/payment-gateway/v1/exchange-rate` | Doc-only placeholder |
| A1 - Create QR | POST | `.../v1/payments/generate-qr` | Starts Flow A |
| A2 - Poll Transaction Status (loops) | POST | `.../v1/payments/transaction-detail` | `setNextRequest` loops on itself up to `max_polls`, then advances |
| A3 - Get Transaction Details | POST | `.../v1/payments/transaction-detail` | |
| A4 - Refund | POST | `.../online-transaction/refund` | Ends Flow A (RSA) |
| B1 - Link Account (Flow B) | POST | `.../v3/aof/link-account` | Starts Flow B |
| B2 - Get Token Details (Flow B) | POST | `.../v3/token-management/get-token-details` | JSON-Schema; saves `pwt`/`ctid` |
| B3 - Payment using Token (Flow B) | POST | `.../v3/purchase/payment-credential` | |
| B4 - Renew Token (Flow B) | POST | `.../v3/token-management/renew-expired-account-token` | |
| B5 - Remove Token (Flow B) | POST | `.../v3/token-management/remove-token` | Ends Flow B |

## Core flows

- **Checkout lifecycle (03):** Purchase → pay → Check Transaction / Get Transaction Details → Close or Refund → Transaction List / Exchange Rate.
- **QR scan-to-pay (04 + 09):** Generate QR → payer scans → verify via Check Transaction or Get Transactions by Merchant Ref.
- **Pre-auth (06):** Purchase as pre-auth → Complete (optionally with payout split) or Cancel.
- **CoF lifecycle (08 / Flow B):** Link Account or Link Card → callback (or Get Token Details fallback) → Payment with token → Renew → Remove. Account tokens (`CITI_FLEX`/`CITO_FLEX`) expire 90 days after last use; renew via B4/05.
- **Payout (07):** Add payee to whitelist → Payout to up to 250 beneficiaries.
- **Transaction pooling (11):** Flow A polls Check Transaction until settled before details/refund.

## Collection variables (76, grouped)

| Group | Keys | Notes |
|---|---|---|
| **Must set** | `baseUrl`, `merchant_id`, `secret_key`, `rsa_public_key`, `ctid` | `secret_key` = HMAC-SHA512 secret (store as Postman Secret, not an API key); `rsa_public_key` = PEM for portal APIs |
| Shared script library | `__helpers` | The helper-library **JavaScript source** (single source of truth). Postman runs every script in its own scope, so each script evals this variable to restore the helpers — see Scripting architecture |
| Buyer defaults | `buyer_first_name`, `buyer_last_name`, `buyer_email`, `buyer_phone` | |
| Amount & currency | `currency` (USD/KHR), `amount` (USD min 0.01, KHR min 100) | |
| Checkout options | `payment_option`, `purchase_type` (`purchase` \| `pre-auth`), `return_url`, `cancel_url`, `continue_success_url`, `return_params_raw`, `return_deeplink_raw`, `callback_url`, `items_json`, `custom_fields_json`, `payout_json`, `additional_params_json`, `google_pay_token`, `skip_success_page`, `view_type`, `payment_gate`, `lifetime`, `shipping_fee`, `qr_image_template` | `payment_option`: `cards`, `abapay_khqr`, `abapay_khqr_deeplink`, `abapay`, `abapay_deeplink`, `alipay`, `wechat`, `google_pay` |
| Runtime-managed | `tran_id`, `last_tran_id`, `request_time`, `request_id`, `computed_hash`, `merchant_ref` | Set by pre-requests/tests; don't hand-edit mid-flow |
| CoF & subscriptions | `pwt`, `token_flag`, `sub_frequency` (1W/1M/2M), `sub_lifetime`, `sub_payment_option`, `sub_firstname`, `sub_lastname`, `sub_email`, `sub_phone`, `cof_return_deeplink`, `cof_callback_url`, `cof_continue_success_url`, `cof_amount` | `pwt`/`ctid` auto-saved by token endpoints |
| Payment Link | `payment_link_id` | Saved by Create, consumed by Details |
| Callbacks & polling | `callback_listener`, `webhook_token`, `poll_count`, `max_polls`, `poll_status` | `webhook_token` = UUID from a webhook.site URL |
| RSA paste fallbacks | `refund_merchant_auth`, `pl_merchant_auth`, `preauth_merchant_auth`, `preauth_payout_merchant_auth`, `cancel_preauth_merchant_auth`, `payout_beneficiaries`, `add_whitelist_merchant_auth`, `update_whitelist_merchant_auth` | Only needed without node-forge |
| Payout whitelist | `whitelist_payee` | |
| List filters | `from_date`, `to_date`, `tran_status_filter` (0 approved, 2 pending, 3 declined, 4 refunded, 7 cancelled) | Dates auto-fill as today |
| Refund | `refund_amount` | |
| Sandbox test cards | `test_mc_success`, `test_visa_success`, `test_mc_declined`, `test_visa_declined`, `test_expiry` (01/30), `test_cvv` (123) | |

## Scripting architecture

- **Shared helper library (v1.2.0 — Postman script scopes):** the 18 helpers (`_pad`, `utcNow`, `hmac512`, `b64`, `b64json`, `ensureB64`, `fmtAmt`, `genTranId`, `genRequestId`, `okStatus`, `respCode`, `rsaMissing`, `openSslEncrypt`, `rsaFallback`, `escHtml`, `visualizeFormPost`, `visualizeQr`, `assertJsonSchema`) live **once** as the `__helpers` collection variable. Postman executes every script (collection / request-level, pre-request and test) in its **own scope**, so functions declared in one script are invisible to the next — until v1.2.0 the library sat in the collection pre-request and all 60 consuming scripts failed with "utcNow is not defined". Now every script that needs helpers starts with a 4-line loader: `eval(pm.collectionVariables.get('__helpers'))`. Every API pre-request also logs `b4hash:` to the Postman Console so the hashed string can be verified against the official docs.
- **Per-request helper text:** every request description starts with a **⚡ Quick test** block (what to set → what to expect → what to send next) above the technical hash/RSA notes; key test scripts print status-aware **`NEXT:`** console hints (Purchase, Check Transaction, Generate QR). Sources live in `get_started.md` (overview) and the `⚡ Quick test` blocks (injected into parts by `inject_quickstart.js`).
- **Per-request:** each request description documents its exact hash field order (and PHP samples); 36 API calls carry scenario pre+test scripts (error-code handling, variable chaining, approval-code asserts, JSON-Schema assertions).
- **JSON-Schema assertions (6):** Purchase, Check Transaction, Refund, Generate QR, Get Token Details (folder 08) and B2 Get Token Details (Flow B).
- **`setNextRequest`:** only inside folder 11 (A2 self-loop → A3; Flow B is linear).

## Build system (`_build/`)

The merged JSON is generated — edit parts, never the merged file.

| Part | Folder |
|---|---|
| `part_00_info.json` | `info` + README, 76 variables (incl. `__helpers` library), collection-level events (library loader + test hook) |
| `part_01_setup.json` | 01 - Setup & Test Cards |
| `part_03_ecom.json` | 03 - Ecommerce Checkout |
| `part_04_qr.json` | 04 - ABA QR API |
| `part_05_paymentlink.json` | 05 - Payment Link |
| `part_06_preauth.json` | 06 - Pre-auth |
| `part_07_payout.json` | 07 - Payout |
| `part_08_cof.json` | 08 - Credentials on File (CoF) |
| `part_09_khqr.json` | 09 - KHQR Guideline |
| `part_10_callbacks.json` | 10 - Callbacks & Webhooks |
| `part_11_polling.json` | 11 - Polling & Lifecycle Flows (Runner) |

Tooling: `merge.js` (merge all parts → deliverable; checks the global pre-request survives), `validate.js`, `syntaxcheck.js`, `audit.js`, `standards.js`, `wire_schemas.js`, `rebuild.js`, `inject_descs.js` (injects folder descriptions into parts), `inject_quickstart.js` (helper-text pass: overview sync, ⚡ Quick test description blocks, `NEXT:` console hints), `verify_postman_import.js` (official SDK import check), `inspect.js` / `inspect_parts.js` (per-request coverage and per-part hash-line dumps for review), `smoketest.js` (runs the collection's real scripts in mock `pm` sandboxes with **per-script scopes**, matching Postman; `node smoketest.js live` also hits safe sandbox endpoints), `scope_audit.js` (maps which scripts define/reference the shared helpers — used to diagnose the v1.2.0 scope bug), `fix_scope.js` (the idempotent v1.2.0 patch: library → `__helpers` variable, eval loader into every consuming script) and `fix_visualizer_tab.js` (the idempotent v1.2.1 patch: the form-POST launcher opens the checkout in a new tab via `target="_blank"`). Review/dump utilities: `dump_structure.js` (+ `dump_structure.json`), `count_helpers.js`, `verify_index.js`, `index_diff.js`, `dump_scripts.js`, `dump_folder_descs.js`, `dump_one.js` (print one request's pre/test scripts by name), `survey_descs.js`, `review_helpers.js`, `inspect_desc_format.js`, `inspect_guide_sync.js`, `probe_khqr.js`, `probe_khqr2.js`, `probe_list_date.js`, `probe_purchase_urlencoded.js`, and `fix_round1.js`, `fix_round2.js`, `fix_round3.js`, `fix_round4.js`, `fix_round5.js`, `fix_round6.js`, `fix_round7.js` (deterministic patch history). `package.json` / `package-lock.json` declare `crypto-js` (Node tooling) and `newman` (headless collection runner used for live QA). Legacy `merge.ps1` is superseded — do not use.

```powershell
node D:\PayWay_Postman\_build\merge.js
node D:\PayWay_Postman\_build\syntaxcheck.js
node D:\PayWay_Postman\_build\validate.js
node D:\PayWay_Postman\_build\audit.js
node D:\PayWay_Postman\_build\standards.js
```

Index generators (added 18 Sep 2026): `dump_structure.js` (writes the `dump_structure.json` reference), `count_helpers.js` (lists JSON-Schema-asserted endpoints) and `verify_index.js` — the last one re-checks every folder, request, URL, variable and `_build` file name in this index against the collection; rerun it after edits.

## Source docs

- PayWay developer portal: https://developer.payway.com.kh/ — sections: Ecommerce Checkout, ABA QR API, Payment Link, Pre-auth, Payout, Credentials on File, KHQR Guideline, Resources.
- Per-page Markdown index: `D:\PayWay_Postman\llms.txt`.
- Full audit, incidents and roadmap: `D:\PayWay_Postman\MAINTAINER_REPORT.md`.
