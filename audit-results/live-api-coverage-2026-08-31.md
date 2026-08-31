# Live-Source API Coverage Audit — aba-payway-ts v1.3.0 vs developer.payway.com.kh

**Date:** 2026-08-31 · **Auditor:** agent (feat/live-api-parity) · **Method:** every official spec page on
developer.payway.com.kh fetched via its `.md` URL (each page embeds the full Apidog OpenAPI 3.0.1 spec) and diffed
against the SDK source (`src/domains/*`, `src/client.ts`, `src/utils.ts`) and CLI (`src/cli.ts`) on `main` @ `9c8d81c`.
Sandbox-verified facts were taken from `docs/SANDBOX-FINDINGS.md` §1–§14 and are marked **[verified]** where they
override the live doc.

## 1. Executive summary

- The live docs define **24 operations over 22 unique endpoint paths** (Subscription reuses the purchase path;
  Complete-pre-auth-with-payout reuses the pre-auth-completion path).
- **The SDK implements all 22 paths** — endpoint-path coverage is 100%.
- Gaps are concentrated in: **(a)** subscription/recurring parameters on purchase (R-07, live-confirmed),
  **(b)** the v3 token-management trio HMAC compositions — now published in the live docs and different per endpoint,
  **(c)** ~21 optional request parameters missing across QR/CoF/payment-link,
  **(d)** a long tail of missing client-side validations, and **(e)** COF/QR error families not parsed or explained.

## 2. Master matrix (24 live operations)

| # | Live page (slug) | Endpoint | SDK method | Params | Notes |
|---|---|---|---|---|---|
| 1 | `purchase-14530820e0` | POST `/api/payment-gateway/v1/payments/purchase` | `checkout.purchase` | ✅ all 24 hash fields | JSON vs spec `multipart/form-data` **[verified §8]**; missing validations (§5) |
| 2 | `get-a-transaction-details-14530824e0` | POST `…/payments/transaction-detail` | `checkout.getTransactionDetail` | ✅ complete | 10/min **[verified §11]** |
| 3 | `close-transaction-14530822e0` | POST `…/payments/close-transaction` | `checkout.closeTransaction` | ✅ complete | advisory in sandbox **[verified §12]** |
| 4 | `check-transaction-14530826e0` | POST `…/payments/check-transaction-2` | `checkout.checkTransaction` | ✅ complete | 600/s **[verified §7c]** |
| 5 | `refund-api-14530821e0` | POST `/api/merchant-portal/merchant-access/online-transaction/refund` | `checkout.refund` | ✅ complete | RSA blob + `request_time` hash match |
| 6 | `get-transaction-list-14530825e0` | POST `…/payments/transaction-list-2` | `checkout.getTransactionList` | ✅ all 9 fields | no ≤3-day/pagination≤1000 pre-validation |
| 7 | `exchange-rate-14530823e0` | POST `/api/payment-gateway/v1/exchange-rate` | `checkout.getExchangeRate` | ✅ complete | — |
| 8 | `link-account-19336820e0` | POST `/api/payment-credential/v3/aof/link-account` | `credentialsOnFile.linkAccount` | ⚠️ | live **requires** `ctid`, `currency`, `token_flag`; SDK all optional; hash-order conflict (§7) |
| 9 | `link-card-19336819e0` | POST `/api/payment-credential/v3/cof/link-card` | `credentialsOnFile.linkCard` | ⚠️ | missing `continue_success_url`; live returns HTML always (ungraceful today); form-urlencoded vs spec multipart **[verified §9a]** |
| 10 | `payment-19336821e0` | POST `/api/payment-gateway/v3/purchase/payment-credential` | `credentialsOnFile.payment` | ⚠️ | missing 10 optional params; `request_id` sent but absent from live doc; hash-order conflict (§7) |
| 11 | `renew-token-19336823e0` | POST `…/token-management/renew-expired-account-token` | `credentialsOnFile.renewToken` | ⛔ gated | live hash `ctid.request_time.pwt.merchant_id.request_id` |
| 12 | `get-token-details-19336824e0` | POST `…/token-management/get-token-details` | `credentialsOnFile.getTokenDetails` | ⛔ gated | live: **only** `request_time, merchant_id, request_id` (no ctid/pwt!); hash `merchant_id.request_time.request_id` |
| 13 | `remove-token-19336822e0` | POST `…/token-management/remove-token` | `credentialsOnFile.removeToken` | ⛔ gated | live params `request_time, merchant_id, ctid, pwt`; hash `merchant_id.ctid.request_time.pwt` |
| 14 | `subscription-21402227e0` | POST `…/payments/purchase` (same path as #1) | ❌ **no parameter support** | ⛔ | needs `ctid` + `token_flag=CITR_FIX` + `frequency` (1W/1M/2M); payment_option enum `cards,abapay,abapay_deeplink`; names ≤20; hash appends `token_flag.frequency` (R-07) |
| 15 | `qr-api-14530840e0` | POST `…/payments/generate-qr` | `qr.generateQr` | ⚠️ | 9 optional params missing; hash = live order restricted to sent subset **[verified §5]**; `lifetime`/`qr_image_template` spec-required (SDK always sends template, lifetime optional) |
| 16 | `create-payment-link-14530837e0` | POST `…/payment-link/create` | `paymentLink.create` | ⚠️ | missing `payout` + `image` (≤3MB, multipart); `title` ≤250 unvalidated; `merchant_ref_no` optional per live (SDK stricter — keep, document) |
| 17 | `get-payment-link-details-14530838e0` | POST `…/payment-link/detail` | `paymentLink.getDetails` | ✅ complete | — |
| 18 | `complete-pre-auth-transactions-14530835e0` | POST `…/online-transaction/pre-auth-completion` | `preAuth.complete` | ✅ | hash `merchant_auth.request_time.merchant_id` matches; `idempotency_key` is SDK extension |
| 19 | `complete-pre-auh-transaction-with-payout-14666701e0` | POST (same path as #18) | `preAuth.completeWithPayout` | ✅ | +10% over-capture matches live cards rule **[verified]** |
| 20 | `cancel-pre-purchase-transaction-14530836e0` | POST `…/online-transaction/pre-auth-cancellation` | `preAuth.cancel` | ✅ | hash `merchant_id.merchant_auth.request_time` matches; `reason` is SDK extension |
| 21 | `payout-14530816e0` | POST `/api/payment-gateway/v2/direct-payment/merchant/payout` | `payout.payout` | ✅ | hex hash, RSA beneficiaries, plain-JSON custom_fields all match; missing KHR≥100/USD≥0.01 min |
| 22 | `add-a-beneficiary-to-whitelist-14530818e0` | POST `…/whitelist-account/add-whitelist-payout` | `payout.addBeneficiary` | ✅ | **no CLI command** |
| 23 | `update-a-beneficiary-status-14530817e0` | POST `…/whitelist-account/update-whitelist-status` | `payout.updateBeneficiaryStatus` | ✅ | **no CLI command** |
| 24 | `get-transactions-22366268e0` | POST `…/payments/get-transactions-by-mc-ref` | `khqr.getTransactionsByMerchantRef` | ✅ | `merchant_ref ≤ 20` unvalidated; missing 10/min throttle rule |

## 3. Hash-composition reference (live docs, exact order) vs SDK

| Endpoint | Live-documented hash order | SDK today |
|---|---|---|
| purchase / subscription | `req_time.merchant_id.tran_id.amount.items.shipping.firstname.lastname.email.phone.type.payment_option.return_url.cancel_url.continue_success_url.return_deeplink.currency.custom_fields.return_params.payout.lifetime.additional_params.google_pay_token.skip_success_page` (+subscription: `.token_flag.frequency` before… see §7 note) | ✅ identical (subscription fields missing) |
| check/close/detail | `req_time.merchant_id.tran_id` | ✅ |
| transaction-list-2 | `req_time.merchant_id.from_date.to_date.from_amount.to_amount.status.page.pagination` | ✅ |
| refund | `request_time.merchant_id.merchant_auth` | ✅ |
| exchange-rate | `req_time.merchant_id` | ✅ |
| generate-qr | `req_time.merchant_id.tran_id.amount.items.first_name.last_name.email.phone.purchase_type.payment_option.callback_url.return_deeplink.currency.custom_fields.return_params.payout.lifetime.qr_image_template` | ✅ for the 10-field subset it sends (subsequence) — extend to 19 |
| link-account | `merchant_id.request_time.ctid.return_deeplink.callback_url.request_id.token_flag.currency` | ⚠️ SDK `request_time.merchant_id.request_id.ctid.return_deeplink.token_flag.currency.callback_url` **[verified §9a — keep until probed]** |
| link-card | `merchant_id.request_time.ctid.callback_url.request_id.token_flag.frequency.amount.currency.continue_success_url` (amount/frequency referenced but not request fields → pass empty) | ⚠️ SDK different **[verified §9a]** |
| CoF payment | `request_time.merchant_id.tran_id.amount.currency.items.ctid.pwt.first_name.last_name.email.phone.purchase_type.callback_url.custom_fields.return_params.payout.token_flag.shipping_fee` | ⚠️ SDK different (no items/names; has `request_id`) **[verified §9a]** |
| renew-token | `ctid.request_time.pwt.merchant_id.request_id` | ❌ `request_time.merchant_id.request_id.ctid.pwt` |
| get-token-details | `merchant_id.request_time.request_id` | ❌ sends/hashes ctid+pwt too |
| remove-token | `merchant_id.ctid.request_time.pwt` | ❌ `request_time.merchant_id.request_id.ctid.pwt` |
| pre-auth completion | `merchant_auth.request_time.merchant_id` | ✅ |
| pre-auth cancellation | `merchant_id.merchant_auth.request_time` | ✅ |
| payout | `merchant_id.tran_id.beneficiaries.amount.custom_fields.currency` — **hex** | ✅ |
| add/update whitelist | `request_time.merchant_auth` (no merchant_id) | ✅ |
| get-transactions-by-mc-ref | `req_time.merchant_id.merchant_ref` | ✅ |

**Backward-compatibility invariant:** `generateHmac` pads omitted fields with `''`, and empty strings vanish under
concatenation — extending a hash list to the full live order is hash-identical for callers that don't pass the new
fields. Pin with before/after unit tests before relying on it.

## 4. Parameter gaps (additive)

- **QR (#15):** `items` (≤500 chars, ≤10 items, base64 JSON), `first_name`/`last_name` (≤20), `email` (≤50), `phone` (≤20), `return_deeplink` (≤255, base64 JSON schemes), `custom_fields` (≤255), `return_params`, `payout` (≤255, base64 JSON `[{account,amount}]`). Response also carries `app_store`, `play_store` (SDK types lack them).
- **CoF payment (#10):** `first_name`/`last_name` (≤20), `email` (≤50), `phone` (≤20), `purchase_type` (`purchase|pre-auth`), `items` (≤500), `return_params` (≤500), `payout` (≤500), `custom_fields` (≤500), `shipping_fee` (number). Live amount floor: KHR ≥ 100, USD ≥ 0.01.
- **Link card (#9):** `continue_success_url` (base64; the "Done" button target).
- **Payment link create (#16):** `payout` (JSON inside `merchant_auth`; total payout must equal link amount), `image` (binary ≤3MB JPG/JPEG/PNG — multipart only). `title` ≤250.
- **Subscription (#14):** `ctid`, `token_flag=CITR_FIX`, `frequency` (required iff CITR_FIX; `1W|1M|2M`), `payment_option` enum `cards|abapay|abapay_deeplink`, names ≤20.
- **QR/other response fields:** token details `data{source_of_fund,type,status,expired_at,token_flag,frequency,amount_limit_per_tran,ctid,pwt,subscribed_amount,currency}` (SDK `GetTokenDetailsResponse` shape should be checked against this).

## 5. Validation gaps (advisory → warn; required → enforce)

1. Link account: `ctid`, `currency`, `token_flag` are documented **required** (SDK: optional) → enforce.
2. Subscription trio: `frequency` required iff `token_flag=CITR_FIX` → enforce; `token_flag` restricted to `CITR_FIX` → enforce.
3. `google_pay_token` required iff `payment_option=google_pay` (purchase) → enforce.
4. Name lengths: purchase ≤100 (no digits/specials, gateway err 16/17), QR/subscription/CoF ≤20; email ≤50 (err 19); phone ≤20 (err 18) → warn (strictValidation escalates).
5. `items` ≤500 chars and ≤10 entries (err 13) → warn.
6. purchase `lifetime` max 43200 min (30 days; err 21) → warn (min 3 already enforced).
7. transaction-list: date range ≤3 days (err 52), `pagination` ≤1000, status case-insensitive enum → warn + CLI pre-validation (exit 1 with hint).
8. `merchant_ref` ≤20 (#24) → warn.
9. Min amounts KHR≥100 / USD≥0.01 for payout (#21), CoF payment (#10), QR (#15), payment-link (#16) → warn.
10. `payment_option` enum membership (`PAYMENT_OPTIONS` exists but unenforced) → warn; wechat/alipay USD-only (QR) → warn.
11. `request_id`/`ctid` 5–24 alnum — already validated ✅; `pwt` non-empty ✅.

## 6. Error-handling gaps

- COF family (`link-account`/`link-card`/payment/token mgmt): 200-wrapped `status.code "04"` **with `errors{}` field map** (Laravel-style binding layer, HTTP 400) — SDK throws a generic error; parse `errors{}` into `fieldErrors` and a field-level message. Codes `98` (merchant id not found), `104` (merchant not enabled token flag), `105` (invalid payment credential token) unmapped.
- `PayWaySignatureError` is defined/exported but **never thrown** — code `1` / `01` / `PTL02` (wrong hash) should throw it with an endpoint-specific hash-field hint.
- QR string-code family (`1,6,12,16,17,18,19,21,23,32,35,44,47,96,102,403,429`) not in `explain-code` (no `qr` family); no `cof` family either.
- `get-transactions-by-mc-ref` documented at 10/min (hard) — no token-bucket rule (detail/list/refund have rules).
- `link-card` returns **HTML on success and error** — needs structured handling/hint instead of a JSON-parse failure.
- Rate-limit shapes (403 + numeric 429) already handled **[verified §11]**.

## 7. Docs-vs-sandbox conflicts (do NOT change hash orders without probe evidence)

1. **link-account / link-card / CoF payment hash orders**: live Apidog pages differ from the sandbox-verified SDK orders (SANDBOX-FINDINGS §9a "all 6 CoF endpoints live"). Resolution: probe sandbox with live-doc compositions (`scripts/probe-token-trio.ts` extended), record §15, align only on evidence.
2. **Live-doc sample quirks** (do not replicate): get-transaction-list PHP `$to_date + $from_amount` typo (§2); QR `$last_name+ email` typo; link-card hash references `$frequency`/`$amount` that are not request fields (pass empty values in those hash positions); subscription hash includes `additional_params` position though no property row exists.
3. **merchant_id maxLength varies per page** (30 purchase/QR, 20 elsewhere, 255 payout) — SDK sends config value as-is; no action.
4. **`phone_country_code`** appears only in a Postman collection, not in live docs — out of scope.

## 8. CLI coverage gaps

- Zero CLI surface for the 6 CoF endpoints and both beneficiary endpoints.
- `generate-checkout` exposes ~7 of purchase's ~24 params; no subscription trio (`--ctid --token-flag --frequency`), no `type=pre-auth`.
- `generate-qr` exposes none of the 9 missing QR params.
- `transaction-list` doesn't pre-validate the 3-day window / pagination cap (gateway 403 message has a typo — pre-validate locally, exit 1).
- `explain` lacks `cof` + `qr` code families.

## 9. Remediation mapping

| Gap class | Batch |
|---|---|
| Audit artifact + spec refresh + types | B0 |
| QR params/hash/response + validations | B1 |
| CoF required fields, continueSuccessUrl, CoF payment params, subscription trio | B2 |
| Token-trio compositions probe → align → un-gate; CoF payment composition probe | B3 |
| Validation framework (`warnAdvisory`, `strictValidation`) | B4 |
| COF/QR error parsing, PayWaySignatureError, throttle rule, explain families | B5 |
| CLI `cof`/`beneficiary` commands, generate-checkout/qr flags, list pre-validation | B6 |
| Docs sync (CHANGELOG, HANDOFF, docs/09, docs/12) | B7 |
