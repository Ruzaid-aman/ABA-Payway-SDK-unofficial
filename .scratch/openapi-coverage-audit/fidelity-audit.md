# Field-Level Fidelity Audit — Pass 2 (FIDELITY-DEEPDIVE)

- **Scope**: field-level fidelity of the 22 implemented endpoints (request fields, HMAC hash orders, validation rules, response fields, v1/v3 naming, payout-key shapes). Endpoint-level coverage (which of the 33 spec paths we implement) is the other Pass 2 agent's report.
- **Inputs**: `.scratch/openapi-coverage-audit/spec-inventory.md` (fields extracted from `docs/archive/Default module.openapi.json`), `.scratch/openapi-coverage-audit/sdk-inventory.md` (implemented endpoints + option names), plus direct re-verification against `src/domains/*.ts`, `src/client.ts`, `src/constants.ts`, `src/types.ts`, `src/utils.ts`, `src/auth.ts`, `src/cli.ts`, and `docs/SANDBOX-FINDINGS.md`.
- **Trust rule**: where code and spec disagree on hash orders, CODE is authoritative — every code order was live-verified in the sandbox (SANDBOX-FINDINGS §2, §5, §6, §9, §16, §17); the spec is treated as potentially stale and every disagreement is reported below.
- **Date**: 2026-09-11.

---

## 1. Summary counts

| Category | Count | Detail |
|---|---|---|
| **Hash orders: MATCH** | **20 / 22** | All read endpoints, exchange-rate, generate-qr, refund, all 6 v3 CoF endpoints, both payment-link endpoints, both pre-auth endpoints, payout (hex), both beneficiary endpoints, mc-ref |
| **Hash orders: DIFFERS** | **2 / 22** | `purchase` (code adds `ctid` + `google_pay_token` positions), `cof/link-card` (code adds `amount` + `continue_success_url` positions). Both differences are code-correct per live docs/sandbox; spec is stale (see §3.1, §3.11) |
| **Request fields: spec-only / genuine SDK miss** | **0** | Every request field of every implemented endpoint has an SDK option or is auto-injected (`req_time`, `request_time`, `merchant_id`, `hash`, `merchant_auth`) |
| **Request fields: SDK extension (not in archived spec schema)** | **7 fields / 6 endpoints** | purchase: `google_pay_token`, `additional_params`; link-card: `frequency`, `continue_success_url`; pre-auth complete: `idempotency_key`; pre-auth cancel: `idempotency_key`, `reason`; payout: auto-injected `req_time`. 5 of 7 live-evidenced; 2 (`idempotency_key`, `reason`) forwarded-unverified — flagged in §6.4 |
| **Validation: spec constraint enforced hard locally** | 10 | tran_id ≤20 + charset; request_id/ctid `[a-zA-Z0-9]{5,24}`; token_flag enums (linking/charging); currency KHR/USD; QR lifetime ≥180s; purchase lifetime ≥3 min; refund USD ≥0.01 / KHR integer ≥1; description ≤250 (create link); URL-encoding/amount-format rules |
| **Validation: spec constraint enforced advisory-only** | 15 | amount floors (100 KHR / 0.01 USD); name/email/phone caps; items ≤10 / ≤500 chars; pagination ≤1000; 3-day list window; status enum; wechat/alipay USD-only; image ≤3MB + JPG/PNG; title ≤250; merchant_ref_no ≤50; merchant_ref ≤20; expired_date window; QR/purchase lifetime maxima |
| **Validation: spec constraint NOT enforced locally** | 4 | beneficiaries max 10 (spec code 25); merchant_id maxLengths (20/30/255 — config-level only); lifetime maxima (spec max not hard-gated; W1-1 sandbox-verified gateway accepted 43201 min); `ctid` required on v3 CoF charge per spec (SDK makes it optional) |
| **Validation: SDK-enforced beyond spec (live-derived)** | 7 | public-HTTPS callback/return URL guard; `googlePayToken` required with `payment_option: google_pay`; subscription path CITR_FIX-only + `frequency` coupling; KHR-integer / USD-2-decimals amount rules; 110% over-capture guard; sandbox beneficiary registry; `merchantRefNo` required on payment-link create (stricter than spec's optional) |
| **Response fields: fully modeled (MATCH)** | 14 endpoints | check-transaction, close-transaction, transaction-detail, transaction-list, exchange-rate, generate-qr, refund, link-account, cof payment, renew, token-details, remove-token, payment-link create, payment-link detail |
| **Response fields: gaps (SDK types model less/differently than spec)** | **6 endpoints** | get-transactions-by-mc-ref (structural: `transactions` vs `data`, `status: number` vs object), payout (8 of ~11 fields unmodeled), add-beneficiary + update-beneficiary-status (`data` object unmodeled — 6 fields each), pre-auth-complete (`total_amount` vs spec `grand_total`; `currency` unmodeled), pre-auth-cancel (`grand_total`, `currency` unmodeled) |
| **Response fields: SDK live-discovered extensions** | 7 | `lang`/`trace_id` on status block; `tran_id` in COF payment + renew status; `new_token` (renew); `tran_id: number\|string` on payment-link; `hosted_checkout` HTML result (link-card); `bank_ref` on payout (SDK-only, spec lacks it) |
| **Spec errors / stale-doc findings (report to ABA)** | **21** | see §5 |

---

## 2. Cross-cutting verifications

### 2.1 The v1-vs-v3 naming quirk — VERIFIED CORRECT in code (22/22, one caveat)

Rule: payment-gateway v1 + aof v1 use `req_time`/`firstname`; merchant-portal + v3 + self-activation use `request_time`/`first_name`.

| Endpoint | Time field sent | Name fields sent | Verdict |
|---|---|---|---|
| purchase (v1) | `req_time` (`PURCHASE_HASH_FIELDS[0]`, checkout.ts:64; timeFieldName `'req_time'` checkout.ts:425) | `firstname`/`lastname` (checkout.ts:372-373) | MATCH |
| check-transaction-2 / close-transaction / transaction-detail / transaction-list-2 / exchange-rate / get-transactions-by-mc-ref / generate-qr (all v1) | `req_time` (checkout.ts:539/551/568/635/670, khqr.ts:63, qr.ts default) | generate-qr sends `first_name`/`last_name` (qr.ts:115-116) — v1 path but spec uses `first_name` there | MATCH |
| refund (merchant-portal) | `request_time` (requestWithMerchantAuth, client.ts:1701) | n/a | MATCH |
| link-account / link-card / payment-credential / renew / token-details / remove-token (v3) | `request_time` (credentials-on-file.ts:295/309/449/475/496/521) | CoF charge sends `first_name`/`last_name` (credentials-on-file.ts:413-414) — v3 spec uses `first_name` | MATCH |
| payment-link create/detail, pre-auth complete/cancel, whitelist add/update (merchant-portal) | `request_time` (requestWithMerchantAuth always stamps it, client.ts:1689-1701) | n/a | MATCH |
| payout (v2 direct-payment) | **`req_time` auto-injected** — but the spec has **NO time field** on this endpoint (payout.ts:94 passes `'req_time'` as timeFieldName → client.ts:1641-1643 injects it) | n/a | **CAVEAT**: SDK sends a field the spec doesn't define. Harmless — the injected `req_time` is NOT in the payout hash order and the gateway accepted such bodies live (§6: hex-signed probes reached business code 24/37). Cosmetic fidelity deviation only. |

Every endpoint sends the right time-field name. The only deviation is payout's extra `req_time` (field not in spec, not hashed, live-accepted).

### 2.2 Payout key shapes — CONFIRMED (matches spec AND AGENTS.md)

| Path | Spec keys | SDK type | Enforced in code? | Verdict |
|---|---|---|---|---|
| `generate-qr` `payout` | `{account, amount}` | `GenerateQrParams.payout?: string \| Array<{account: string; amount: number}>` (client.ts:437) | Sent base64-encoded raw (qr.ts:126) — no local shape check (QR path has no `validatePayoutEntryShape`) | **CONFIRMED** |
| purchase `payout` | `{acc, amt}` | `CreateTransactionParams.payout?: string \| {acc: string; amt: number}[]` (client.ts:260) | `validatePayoutEntryShape` per entry — wrong keys throw locally (checkout.ts:331-335, W1-5) | **CONFIRMED** |
| `cof charge` `payout` | `{acc, amt}` | `CofPaymentParams.payout` (client.ts:361) | `validatePayoutEntryShape` (credentials-on-file.ts:397-401) | **CONFIRMED** |
| `pre-auth-completion` `payout` | `{acc, amt}` | `completeWithPayout(..., payout: {acc: string; amt: number}[])` (pre-auth.ts:37, :105) | per-entry `validatePositiveAmount` + sandbox registry (pre-auth.ts:127-130) | **CONFIRMED** |
| `payment-link create` `payout` (inside merchant_auth) | `{acc, amt}` | `CreatePaymentLinkParams.payout` (client.ts:473) | `validatePayoutEntryShape` + total-equals-amount advisory (payment-link.ts:111-125) | **CONFIRMED** |
| payout domain `beneficiaries` | `{account, amount}` | `PayoutParams.beneficiaries: {account: string; amount: number}[]` (client.ts:481) | `validateBeneficiaries` sum check + RSA encrypt (payout.ts:69, :85) | **CONFIRMED** |

AGENTS.md's claim is accurate: purchase-path keys are `{acc, amt}` everywhere; the QR path and the standalone payout domain use `{account, amount}`.

### 2.3 Content-type divergences (spec vs wire, all live-verified in SDK's favor)

| Endpoint | Spec content-type | SDK sends | Live evidence |
|---|---|---|---|
| purchase | `multipart/form-data` | `application/json` (checkout.ts:421-426); the local `checkout-form` path produces the browser multipart form | §21 W5-4: JSON POST without gate → JSON; gateway accepts JSON |
| cof/link-card (v3) | `multipart/form-data` | `application/x-www-form-urlencoded` (credentials-on-file.ts:310) | §4/§9a: link-card REJECTS JSON; the hosted form is a urlencoded browser POST |
| payment-link create | `multipart/form-data` | urlencoded when no image; true multipart (with `image` part, undici boundary) when image attached (client.ts:1706-1718) | §15a (multipart + image accepted), §23 W-V6 (urlencoded accepted) |
| refund | `application/json` | `application/x-www-form-urlencoded` (default of `requestWithMerchantAuth`, checkout.ts:656-663 passes no contentType) | §6/§18: full refund lifecycle worked over the wire |
| pre-auth complete/cancel, whitelist add/update | `application/json` | `application/json` (explicit, pre-auth.ts:96/153, payout.ts:106/114) | — matches |

These are spec-staleness items (the gateway is media-lenient on the merchant-portal family), not SDK bugs — but the archived spec's `requestBody.content` keys do not describe the accepted reality.

### 2.4 Hash engine mechanics (shared)

`generateHmac` (auth.ts:8-25): concatenates `String(value)` of each field in the given order, substituting `''` for undefined/null, then HMAC-SHA512 → base64 (or hex for payout only). Because omitted fields vanish under concatenation, a longer-than-spec field list that only inserts positions for optional fields produces byte-identical HMACs for callers that don't use those fields — this is why the purchase 27-field order is backward-compatible with the documented 25-field order for plain purchases (pinned by tests per checkout.ts:57-61).

`requestWithMerchantAuth` (client.ts:1663-1735): builds `{merchant_id, merchant_auth (RSA-encrypted {mc_id, ...payload}), request_time}`, hashes with caller-provided `hmacFields` or `MERCHANT_AUTH_DEFAULT_HASH_FIELDS = ['request_time','merchant_id','merchant_auth']` (client.ts:514). RSA: 117-byte chunks, PKCS1 (auth.ts:32-51).

---

## 3. Per-endpoint fidelity (all 22 implemented endpoints)

Hash-order evidence codes: **SF§n** = `docs/SANDBOX-FINDINGS.md` section n.

### 3.1 `/api/payment-gateway/v1/payments/purchase` (checkout.purchase / purchaseHosted)

**Request fields** (spec 28 incl. hash; code coverage):

| Spec field | SDK option (CreateTransactionParams) | Status |
|---|---|---|
| req_time | auto (`formatRequestTime`, checkout.ts:368/397) | sent |
| merchant_id | config.merchantId (auto) | sent |
| tran_id | transactionId | sent (≤20 charset-validated) |
| firstname / lastname | firstname / lastname | sent (spec maxLength 20; SDK advisory at 100 — live docs say 100, spec says 20; see §5.14) |
| email / phone | email / phone | sent (advisory 50/20) |
| type | type (`'purchase'\|'pre-auth'`, default 'purchase') | sent; spec description mentions only `purchase` — `'pre-auth'` is live-verified (SF§9c real pre-auth hold) |
| payment_option | paymentOption | sent (spec enum cards/abapay/abapay_deeplink; SDK enum adds abapay_khqr, abapay_khqr_deeplink, alipay, wechat, google_pay — live-supported, see §5.10) |
| items / shipping / amount / currency | items / shipping / amount / currency | sent |
| return_url / cancel_url / skip_success_page / continue_success_url / return_deeplink / custom_fields / return_params / view_type / payment_gate / payout / lifetime | returnUrl / cancelUrl / skipSuccessPage / continueSuccessUrl / returnDeeplink / customFields / returnParams / viewType / paymentGate / payout({acc,amt}) / lifetime | sent (URL-ish values base64-encoded) |
| ctid / token_flag / frequency | ctid / tokenFlag (CITR_FIX only) / frequency (1W\|1M\|2M) | sent; subscription coupling enforced (checkout.ts:346-366) |
| hash | computed | computed |
| — (not in spec schema) | **additionalParams → `additional_params`** | SDK extension, but the field IS present in the spec's own b4hash line (spec schema/`hash` doc inconsistency) |
| — (not in spec at all) | **googlePayToken → `google_pay_token`** | SDK extension — live-documented (Google Pay purchase flow; `google_pay` paymentOption), required when paymentOption is google_pay (checkout.ts:338-340) |

**Spec-required vs SDK-optional note**: the spec marks `ctid` REQUIRED on purchase — the SDK treats it optional (required only when tokenFlag set). The spec is provably stale: every plain sandbox purchase without ctid succeeds (SF§9/§10/§18/§21 campaigns).

**Hash order — DIFFERS (code correct, live-verified)**:
- Spec b4hash (25 fields): `req_time . merchant_id . tran_id . amount . items . shipping . firstname . lastname . email . phone . type . payment_option . return_url . cancel_url . continue_success_url . return_deeplink . currency . custom_fields . return_params . payout . lifetime . additional_params . skip_success_page . token_flag . frequency` (note: includes `additional_params` which has NO request-field entry in the spec schema; omits `ctid`; SF§17 refers to "the documented 26-field order" from the live subscription page — the archived spec string counts 25).
- Code `PURCHASE_HASH_FIELDS` (27, checkout.ts:63-91): `req_time, merchant_id, tran_id, amount, items, ctid, shipping, firstname, lastname, email, phone, type, payment_option, return_url, cancel_url, continue_success_url, return_deeplink, currency, custom_fields, return_params, payout, lifetime, additional_params, google_pay_token, skip_success_page, token_flag, frequency`.
- Deltas: code inserts **`ctid` after `items`** and **`google_pay_token` after `additional_params`**.
- Evidence: SF§17 (2026-09-05) — the documented order (ctid omitted) is REJECTED "Wrong Hash" when the subscription trio is present; ctid-after-items is ACCEPTED (business code observed); the gateway's own wrong-hash hint prints the doc list (26 fields, no ctid) while enforcement includes ctid. For plain purchases the 27-field HMAC is byte-identical to the 25-field one (omitted fields hash as ''). `google_pay_token` position is aligned on family consistency (live docs) — no dedicated sandbox pin found for a google-pay + subscription combined case (extremely narrow); flagged as low-risk in §6.1.
- **Verdict: DIFFERS — code is the live contract; spec b4hash is wrong (missing ctid; and it references a field the schema doesn't define).**

**Validation vs spec**: min lifetime 3 min — hard (error 69 documented); max 43200 — advisory only (W1-1: sandbox accepted 43201, so the documented max is not gateway-enforced); payment_option membership — advisory; google_pay token requirement — SDK-only (live docs). Spec's `type` maxLength 20 — not locally enforced (harmless).

**Response**: spec models the 200 as empty `text/html` schema with a junk `required: ["01JME5PQ…"]` and two examples (hosted page / QR JSON). SDK types model the JSON shape (`PurchaseQrResponse`: qr_string, abapay_deeplink, checkout_qr_url), `ErrorStatus`, and the hosted-HTML success (`PurchaseHostedHtmlResult` — live-discovered W2-1/W2-2). SDK richer than spec; spec response schema is malformed.

### 3.2 check-transaction-2

**Request**: `tran_id`, `req_time` + auto `merchant_id`, `hash` (checkout.ts:534-545). Full spec coverage (4/4).
**Hash**: spec PHP sample `req_time . merchant_id . tran_id` = code `['req_time','merchant_id','tran_id']` (checkout.ts:538). **MATCH** — note the spec's PROSE contradicts its own sample ("concatenates values `merchant_id`, and `tran_id`" — omits req_time); the sample is right (SF§2-era probes; the SDK's order live-verified on every campaign).
**Validation**: tran_id ≤20 charset hard.
**Response**: spec `data` props (10: payment_status_code, total_amount, original_amount, refund_amount, discount_amount, payment_amount, payment_currency, apv, payment_status, transaction_date) + status — all modeled in `CheckTransactionResponse` (types.ts:623-646), plus live-discovered `lang`/`trace_id` on the status block (types.ts:574-577, live probe 2026-07-16). **Two spec structural errors**: (a) spec nests `status` INSIDE `data`; live responses carry `status` as a top-level sibling (SDK matches live — see types.ts example); (b) the spec's hash description says "with `public_key`" where the HMAC key is the api_key.

### 3.3 close-transaction

**Request**: 4/4 spec fields (checkout.ts:547-558). **Hash**: spec `req_time . merchant_id . tran_id` = code (checkout.ts:551). **MATCH**.
**Response**: spec `status{code, message, tran_id}` → `CloseTransactionResponse` → shared `ecommerce-checkout_StatusBlock{code, message, tran_id?}`. **MATCH** (`tran_id` relaxed to optional — spec says required; live bodies vary; safe).
Live-fidelity note (beyond spec): no CLOSED status exists in any read API; channel-dependent enforcement (SF§19/§21 W5-2/W5-8) — SDK documents this in code comments; nothing in spec contradicts (spec's "status becomes CANCELLED" is not observable remotely on unpaid transactions).

### 3.4 transaction-detail

**Request**: 4/4 (checkout.ts:564-575). **Hash**: spec `req_time . merchant_id . tran_id` = code (checkout.ts:568). **MATCH**.
**Response**: spec `data` props — transaction_id, payment_status_code, payment_status, original_amount, original_currency, payment_amount, payment_currency, total_amount, refund_amount, discount_amount, apv, transaction_date, first_name, last_name, email, phone, bank_ref, payment_type, payer_account, bank_name, card_source, transaction_operations, + nested status. SDK `TransactionDetailResponse` (types.ts:662-706) models **all 22** incl. `transaction_operations` (status/amount/transaction_date/bank_ref) with live-extended enums (payment_type incl. KHQR/VISA/MC/JCB/CUP; card_source). **MATCH** (plus live notes: 10/min rate limit as HTTP 403 code 429 — SF§11c; ~5s indexing lag).

### 3.5 transaction-list-2

**Request**: all 7 optional spec filters + auto (checkout.ts:589-641). Spec required = req_time/merchant_id/hash only. Full coverage.
**Hash**: spec (verbatim, with the `+` typo): `$req_time . $merchant_id . $from_date . $to_date + $from_amount . $to_amount . $status . $page . $pagination`. Code: `['req_time','merchant_id','from_date','to_date','from_amount','to_amount','status','page','pagination']` (checkout.ts:635). **MATCH** on field sequence — SF§2 live-proved the `+` is a typo in PayWay's own PHP sample (string-concat accepted reaching business code 49; literal `+` rejected code 1).
**Validation**: date format + 3-day cap (err 52) + pagination ≤1000 + status enum — all advisory, all live-verified (SF§14a: >3 days → HTTP 403). SDK allowed status list includes BOTH `DECLINED` and `DECLINDED` (checkout.ts:615) — handles the spec/gateway's own typo plus the correct spelling. Spec defaults (page=1, pagination=40) are NOT injected by the SDK (omitted keys → gateway defaults).
**Response**: spec data item props (21) + page/pagination/status. SDK `TransactionListItem` models all 21 (adds live `payment_type: 'N/A'` member for pending rows). `status.code` typed string in SDK; spec says `anyOf string|integer` — live is string (SF§1: the legacy non-`-2` path uses integer). **MATCH**.

### 3.6 get-transactions-by-mc-ref

**Request**: `merchant_ref`, `req_time` + auto (khqr.ts:52-69). 4/4 spec fields. merchant_ref ≤20 advisory (spec maxLength 20).
**Hash**: spec `req_time . merchant_id . merchant_ref` = code (khqr.ts:63). **MATCH** (never sandbox-verified — endpoint 404s under this sandbox profile, SF§6/§9e).
**Response — GENUINE SDK GAP**: spec models `{ data: [17-prop items], status: {code, message, merchant_ref} }`. SDK `GetTransactionsByMcRefResponse` (types.ts:1312-1316) models `{ status?: number, transactions?: KhqrTransaction[] }` — the item props (17/17 incl. merchant_ref) are all modeled inside `KhqrTransaction`, but: (a) the array key is `transactions`, spec says `data`; (b) `status` is typed as a NUMBER where the spec (and every other -2 endpoint live shape) is an OBJECT `{code, message, merchant_ref}`. This endpoint is untestable in the sandbox (404), so the SDK's shape was never live-corrected. **Flag: SDK response type diverges from spec on 2 structural points — fix opportunistically (rename to `data`, model status object) or verify live when the endpoint becomes available.**

### 3.7 exchange-rate

**Request**: 3/3 (checkout.ts:666-677). **Hash**: spec `req_time . merchant_id` = code (checkout.ts:670). **MATCH** (shortest hash in the API).
**Response**: SDK `ExchangeRateResponse`: `status{code,message}` + `exchange_rates` with `additionalProperties` CurrencyRate `{sell, buy}` (types.ts:819-829). **Spec is structurally malformed here**: in the raw spec only `aud`/`sgd` live inside `exchange_rates.properties`, while `eur, gbp, myr, thb, hkd, cny, cad, krw, jpy, vnd` sit at the TOP LEVEL of the response schema (with a `required` array mixing all of them). Live behavior (SF§8b: "`status.code: '00'` with `exchange_rates` object") nests all currencies under `exchange_rates` — the SDK's open `additionalProperties` map is the correct, future-proof model. **MATCH-to-live / spec error (§5.4).**

### 3.8 generate-qr

**Request** (spec 20 fields; 9 required): full coverage — transactionId→tran_id, amount, paymentOption (default `abapay_khqr`), callbackUrl (base64, REQUIRED in SDK — spec optional-but-real), purchaseType (default 'purchase'), currency, qrImageTemplate (default `template2`, always sent — satisfies spec REQUIRED), requestTime, lifetime (seconds → floored to whole minutes), items, firstName→`first_name`, lastName→`last_name`, email, phone, returnDeeplink, customFields, returnParams, payout (`{account, amount}`) (qr.ts:109-142). No spec-only field missed. No SDK extension fields.
**Hash**: spec b4hash (typo'd verbatim): `$req_time . $merchant_id . $tran_id . $amount . $items . $first_name . $last_name+ email\n. $phone . $purchase_type . $payment_option . $callback_url . $return_deeplink . $currency .\n$custom_fields . $return_params . $payout . $lifetime . $qr_image_template`. Code `GENERATE_QR_HASH_FIELDS` (qr.ts:36-56): `req_time, merchant_id, tran_id, amount, items, first_name, last_name, email, phone, purchase_type, payment_option, callback_url, return_deeplink, currency, custom_fields, return_params, payout, lifetime, qr_image_template` (19 fields). **MATCH** — the field sequence matches once the spec's `$last_name+ email` typo/newlines are cleaned. Live evidence: SF§5 (2026-07-16) verified the 9-field base order; the 19-field order is its superset (omitted fields hash as '', byte-identical for base-only callers, pinned by test); SF§10a/§13 paid QRs on this order.
**Validation**: min 3 minutes — hard at 180s (SF§13a pinned 179s→400 "04", 180s→00); max — advisory at 120 days (see §5.20 for the 30-vs-120-day spec inconsistency); amount floors — advisory (KHQR 100 / USD 0.01); wechat/alipay USD-only — advisory (spec-documented); first/last/email/phone caps 20/20/50/20 — advisory; items ≤10 — advisory. QR templates: 7 sandbox-verified names (`QR_TEMPLATES`, constants.ts:254-262); spec gives NO enum, just an apidog link — SDK is stricter with evidence.
**Response**: spec props qrString, qrImage, abapay_deeplink, app_store, play_store, amount, currency, status{code,message,trace_id} — all 8 modeled in `GenerateQrResponse` (types.ts:1075-1097), including the camelCase `qrString`/`qrImage` quirk. **MATCH**.

### 3.9 refund (merchant-portal)

**Request**: spec `request_time`, `merchant_id`, `merchant_auth{mc_id, tran_id, refund_amount}`, `hash` (4 required). SDK `refund(transactionId, amount, currency)` → requestWithMerchantAuth `{tran_id, refund_amount}` (+ auto `mc_id` inside the RSA plaintext, request_time, merchant_id, hash) (checkout.ts:652-664). **Full coverage**. The SDK's `currency` argument is used ONLY for local minimum validation — it is not sent (correct: currency is a response field, not request).
**Hash**: spec `$request_time . $merchant_id . $merchant_auth` = `MERCHANT_AUTH_DEFAULT_HASH_FIELDS` = code. **MATCH**.
**Validation**: SDK hard-throws USD < 0.01 (PTL04 sandbox-verified) and KHR non-integer/< 1. Note: the SDK's refund KHR floor is **1**, while every other endpoint's advisory floor is **100 KHR** — deliberate ("KHR 1 ≈ $0.0025", utils.ts:400-408) but inconsistent with the spec's global "100 KHR" floor language; refund's own spec floor is only implied via PTL187. Flagged in §6.2 as a possible validation inconsistency to confirm with ABA (can a 50 KHR refund succeed?).
**Response**: spec grand_total, total_refunded, currency, transaction_status, status{code,message} — all modeled in `RefundResponse` (types.ts:784-804). **MATCH**. SDK additionally maps the PTL code family (`REFUND_ERROR_CODES` constants.ts:104-123, live §18 partial-refund campaign).

### 3.10 aof/link-account (v3)

**Request**: spec 8 non-hash fields (request_id, request_time, merchant_id, ctid, return_deeplink, token_flag, currency, callback_url) — SDK sends all (credentials-on-file.ts:273-283) + auto hash. **Full coverage, no extensions**.
**Hash**: spec `$merchant_id . $request_time . $ctid . $return_deeplink . $callback_url . $request_id . $token_flag . $currency` = code (credentials-on-file.ts:285-294). **MATCH — SF§16 ACCEPTED** (business code 104 on a flag-disabled profile proves the hash layer passed).
**Validation**: request_id/ctid `[a-zA-Z0-9]{5,24}` hard (matches spec); currency REQUIRED hard (spec + live docs); token_flag validated against the linking enum `CITI_FLEX|CITO_FLEX|CITO_FIX|CITR_FLEX` — spec says only `CITI_FLEX|CITO_FLEX`; the wider set is sandbox-verified (SF§9a/§9b) and out-of-live-set values warn. Callback URL public-HTTPS guard (SDK-only, live best-practice).
**Response**: spec 200 `status{code,message,trace_id}` + `data{deeplink, qr_string, expire_in}` — all modeled (`LinkAccountResponse`, types.ts:856-872). The 400 `errors` map (spec) is not in the success type but surfaces at runtime through `PayWayBusinessError.fieldErrors` (client.ts classifyBusinessCode). **MATCH** (minor: `errors` not in the TS type — runtime-complete).

### 3.11 cof/link-card (v3)

**Request**: spec schema has 8 fields (request_id, request_time, merchant_id, ctid, token_flag, currency, callback_url, hash) — SDK sends all, PLUS two live-documented extensions the archived spec schema lacks: `frequency` (strictly enforced per live docs + SF§4/SF§9a — spec has it only inside the b4hash) and `continue_success_url` (the hosted form's Done target). `returnUrl`/`returnDeeplink` are deprecated-and-not-sent (SDK docs note live docs don't include them).
**Hash — DIFFERS (code follows newer live docs)**:
- Spec b4hash: `$merchant_id . $request_time . $ctid . $callback_url . $request_id . $token_flag . $frequency . $currency` — references `$frequency` which has NO schema entry (spec self-inconsistency), and omits `continue_success_url`.
- Code `LINK_CARD_HMAC_FIELDS` (credentials-on-file.ts:61-72): `merchant_id, request_time, ctid, callback_url, request_id, token_flag, frequency, amount, currency, continue_success_url` — adds an **`amount` hash position with NO body field** (hashes as ''; documented live-doc quirk, types.ts:891-892) and appends **`continue_success_url` after `currency`**.
- Evidence: SF§16 item 5 — realigned to the live-docs composition (`merchant_id.request_time.ctid.callback_url.request_id.token_flag.frequency.amount.currency.continue_success_url`); not directly probed (endpoint always answers HTML, so hash acceptance can't be business-code-classified), aligned on the live link-card page. Spec is missing the `amount` position and the trailing `continue_success_url`.
- **Verdict: DIFFERS — code matches the live docs; archived spec b4hash is stale/incomplete (and its schema omits the real `frequency` request field).**
**Validation**: request_id/ctid 5-24 hard; token_flag linking enum + warn outside `CITI_FLEX|CITO_FLEX`; `frequency` missing → advisory ("live-documented as required"); currency defaults USD (binding-layer required, SF§9a); callback public-HTTPS.
**Response**: spec 200 = `text/html` with no structured schema. SDK models the live surface: `LinkCardResponse{hosted_checkout: true, content_type, html, status?}` (domain-types) — the HTML page IS the success signal (SF§9a: HTTP 200 hosted page; link-card rejects JSON). SDK extension modeling live behavior the spec doesn't describe.

### 3.12 purchase/payment-credential (v3 CoF charge)

**Request**: spec 19 non-hash fields — request_time, merchant_id, tran_id, ctid, pwt, first_name, last_name, email, phone, amount, shipping_fee, currency, token_flag, purchase_type, callback_url, items, return_params, payout, custom_fields. SDK sends ALL 19 (credentials-on-file.ts:407-426); `requestId` deprecated, never sent (spec has no request_id ✓ — SF§16 item 4). **Full coverage, no extensions**.
**Hash**: spec `$request_time . $merchant_id . $tran_id . $amount . $currency . $items . $ctid . $pwt . $first_name . $last_name . $email . $phone . $purchase_type . $callback_url . $custom_fields . $return_params . $payout . $token_flag . $shipping_fee` (19 fields) = code (credentials-on-file.ts:428-448) EXACTLY. **MATCH — SF§16 ACCEPTED** (105 invalid token ⇒ hash passed).
**Validation**: token_flag charging enum `CITU_FLEX|MITU_FLEX|MITU_FIX|MITR_FLEX|MITR_FIX` (spec lists only CITU_FLEX|MITU_FLEX|MITR_FIX; the wider set is sandbox-verified §9a); amount floors advisory; `pwt` required. **Spec marks `ctid` REQUIRED** — SDK makes it optional ("optional on repeat charges", CLI help). Not sandbox-disproven either way; flagged in §6.3 as a low-confidence divergence (spec may be right; a ctid-less charge was not pinned in §16).
**Response**: spec 200 `status{code,message,trace_id}`. SDK `CofPaymentResponse` adds live-observed `tran_id` echo (types.ts:951). **MATCH+**.

### 3.13 renew-expired-account-token (v3)

**Request**: spec 5 non-hash fields (request_time, merchant_id, request_id, ctid, pwt) — SDK sends all (credentials-on-file.ts:457-472). **Full coverage**.
**Hash**: spec `$ctid . $request_time . $pwt . $merchant_id . $request_id` = code (credentials-on-file.ts:474). **MATCH — SF§16 ACCEPTED** (105). Note the spec's own oddity: this order differs from legacy `/api/aof/remove-account` and from v3 remove-token — each CoF op has its own order, and code tracks each per-endpoint.
**Response**: spec 200 `status{code,message,trace_id}`. SDK adds `new_token?: string` ("New payment token replacing the old one") — a live-docs extension NOT in the archived spec response. Flagged as SDK-EXTENSION (§6.5): keep, but confirm the key name against a live renewal before relying on it.

### 3.14 get-token-details (v3)

**Request**: spec 3 non-hash fields (request_time, request_id, merchant_id) — NO ctid/pwt. SDK sends exactly `request_id` + auto (credentials-on-file.ts:483-494). **MATCH (SF§16: no ctid/pwt — ACCEPTED, business code 09)**.
**Hash**: spec `$merchant_id . $request_time . $request_id` = code (credentials-on-file.ts:495). **MATCH**.
**Validation**: request_id 5-24 hard.
**Response**: spec `data` 11 props (ctid, pwt, source_of_fund, type, status, expired_at, token_flag, frequency, subscribed_amount, amount_limit_per_tran, currency) — SDK `GetTokenDetailsResponse.data` models ALL 11 (types.ts:985-1013). **MATCH**.

### 3.15 remove-token (v3)

**Request**: spec 4 non-hash fields (request_time, merchant_id, ctid, pwt) — NO request_id. SDK sends exactly that (credentials-on-file.ts:504-519). **MATCH (SF§16 ACCEPTED — code 00, idempotent on unknown token)**.
**Hash**: spec `$merchant_id . $ctid . $request_time . $pwt` = code (credentials-on-file.ts:520). **MATCH**. (Different order from renew — both verified separately.)
**Response**: spec `status{code,message,trace_id}` = SDK `RemoveTokenResponse`. **MATCH**.

### 3.16 payment-link/create

**Request**: spec = 4 required string fields + optional `image`, with `merchant_auth` plaintext `{mc_id, title, amount, currency, description, payment_limit, expired_date, return_url, merchant_ref_no, payout}`. SDK `create` sends ALL of those inside merchant_auth (+ auto mc_id) and the image as a top-level multipart part — never hashed (client.ts:1708-1718, SF§15a: hash = request_time+merchant_id+merchant_auth ONLY). **Full coverage**.
**Hash**: spec `$request_time . $merchant_id . $merchant_auth` = default = code (payment-link.ts:182-200 passes no override). **MATCH**.
**Validation**: title required + ≤250 advisory (spec mandatory max 250); **merchantRefNo REQUIRED by SDK — spec says OPTIONAL** (stricter-than-spec, deliberate: docs/17 "stricter than the official 'optional'"); description ≤250 HARD (sandbox-verified PTL04, SF§22 #6 — spec's own 250 cap confirmed); returnUrl required + public HTTPS (sandbox PTL04 when omitted); amount floors advisory; payout `{acc, amt}` shape hard + total-equals-amount advisory (spec-documented rule); image ≤3MB + JPG/JPEG/PNG advisory (spec); expired_date past/<300s advisory (live §22 #3 — spec has no rule).
**Response**: spec `data` (17 props) + `payout` array + `status` + `tran_id`. SDK `PaymentLink` models all 17 (id, title, image{image,filename,size}, amount, currency, status, description, payment_limit, total_amount_org, total_refund, total_amount, total_trxn, created_at, updated_at, expired_date, return_url, merchant_ref_no, outlet_id, outlet_name, payment_link) + shared `pushback_url` (detail-family) + `payout` (placement oneOf'd — V-2 open). `tran_id` typed `number|string` (spec says string; live returns NUMBER — SF§22 V-3). **MATCH+**.

### 3.17 payment-link/detail

**Request**: spec merchant_auth `{mc_id, id}` — SDK `getDetails(paymentLinkId)` → `{id}` + auto (payment-link.ts:203-213). **Full coverage**. (Live-verified: the `id` is create's opaque `data.id`, NOT merchant_ref_no/slug — bogus id answers 96, not documented PTL132; SF§22 #5.)
**Hash**: spec `$request_time . $merchant_id . $merchant_auth` = default = code. **MATCH**.
**Response**: spec `data` (17 props incl. `pushback_url`, string-typed total_amount_org/total_refund) + status + tran_id. SDK shares the `PaymentLink` type: `pushback_url` modeled (live-absent in sandbox detail — noted in types), total_amount_org/total_refund typed `number` with "official schema says string; observed numeric — do not rely on the type" (live §15/§22). **MATCH-to-live; spec typing stale** (§5.12-13).

### 3.18 pre-auth-completion

**Request**: spec merchant_auth `{mc_id, tran_id, complete_amount, payout[{acc,amt}]}` + request_time/merchant_id/hash. SDK `complete` sends `{tran_id, complete_amount}` (+ optional `idempotency_key`); `completeWithPayout` adds `payout: {acc, amt}[]` (pre-auth.ts:79-141). Spec fields fully covered; `idempotency_key` is an SDK EXTENSION with no spec entry and no live evidence (see §6.4). **Payout keys {acc, amt} CONFIRMED** (spec + code agree; AGENTS.md accurate).
**Hash**: spec `$merchant_auth . $request_time . $merchant_id` (merchant_auth FIRST — unique) = code `['merchant_auth','request_time','merchant_id']` (pre-auth.ts:95, :136). **MATCH — SF§6 live-verified** (valid signature → PTL62; invalid → PTL02).
**Validation**: amount positive; USD assumed; 110% over-capture guard (SDK-only, live-docs "documented ceiling"); sandbox beneficiary registry on payout.
**Response — GAP**: spec models `grand_total`, `currency`, `transaction_status`, `status{code,message}`. SDK `CompletePreAuthResponse` has `status`, `transaction_status`, **`total_amount`** (types.ts:1199-1207) — `total_amount` is NOT in the spec response (`grand_total` is), and `currency` is unmodeled. No sandbox success completion exists to arbitrate (all probes hit PTL59/PTL62 blockers, SF§9c) — but the spec's `grand_total` matches refund's verified live shape, making `grand_total` the more likely real key. **Flag: rename `total_amount` → `grand_total` (or model both) when a payout-enabled profile allows a live success.**

### 3.19 pre-auth-cancellation

**Request**: spec merchant_auth `{mc_id, tran_id}` + time/id/hash. SDK `cancel` sends `{tran_id}` + optional `idempotency_key` and `reason` (extensions, unverified). Spec fields covered.
**Hash**: spec `$merchant_id . $merchant_auth . $request_time` (merchant_id first — yet another order) = code (pre-auth.ts:152). **MATCH — SF§6 verified** (invalid → PTL02, valid dummy → PTL-family business codes).
**Response — GAP**: spec `grand_total`, `currency`, `transaction_status`, `status`. SDK models only `status` + `transaction_status` (types.ts:1217-1224) — `grand_total`/`currency` unmodeled. Same live-verification blocker as §3.18.

### 3.20 payout (v2 direct-payment)

**Request**: spec 6 fields (merchant_id, tran_id, beneficiaries RSA `[{account, amount}]`, amount, currency, custom_fields) + hash; NO time field. SDK sends all 6 (+ auto-injected `req_time` — not in spec, not hashed, live-accepted; see §2.1 caveat) (payout.ts:55-99).
**Hash**: spec `$merchant_id . $tran_id . $beneficiaries . $amount . $custom_fields . $currency` = code (payout.ts:93), **hex-encoded** (payout.ts:96) — the only hex hash in the SDK, matching SF§6 (hex signature reached code 24; base64 → code 1). **MATCH**.
**Validation**: beneficiaries non-empty, per-amount positive, sum == total (minor-unit compare); currency KHR/USD; sandbox beneficiary registry + currency-match warnings (live PTL147 family). **NOT enforced**: spec's max 10 beneficiaries (gateway code 25) — minor gap. Spec's merchant_id maxLength 255 — not locally checked (config-level).
**Response — GENUINE SDK GAP**: spec models `transaction_id, transaction_date, external_reference, apv, transaction_amount, transaction_currency, beneficiaries[{payout_id, name, mid_acccount, amount, currency}], status{code, message, tran_id, trace_id}`. SDK `PayoutResponse` (types.ts:1241-1249) models only `status{code,message,tran_id?}` + `bank_ref` (bank_ref is SDK-only, NOT in spec). 8 spec response fields are unmodeled. No live success payout exists on this profile (whitelist blockers, SF§9b/§22 #7), so the shape is unverified live — but the type should model the documented contract. **Flag: highest-value response-type fix in the SDK.**

### 3.21 add-whitelist-payout

**Request**: spec merchant_auth `{mc_id, payee}` + request_time/merchant_id/hash. SDK sends `{payee}` + auto (payout.ts:110-116). **Full coverage**.
**Hash**: spec `$request_time . $merchant_auth` (TWO values — merchant_id NOT hashed) = code `['request_time','merchant_auth']` (payout.ts:114). **MATCH — SF§6 verified** (valid dummy → 96; invalid → 1).
**Response — GAP**: spec `data{name, payee, currency, type, status, created_at}` + `status{code,message}` (no `00` in the documented code list — spec oddity §5.15). SDK `BeneficiaryResponse` models `status` only; the whole `data` object is unmodeled. Live probes never succeeded (PTL04 on dummy accounts, SF§9b; whitelist service disabled, SF§22 #7), so unverified — but the documented fields should be typed. **Flag.**

### 3.22 update-whitelist-status

**Request**: spec merchant_auth `{mc_id, payee, status(0|1)}` + time/id/hash. SDK sends `{payee, status}` + auto (payout.ts:102-108). **Full coverage**.
**Hash**: spec `$request_time . $merchant_auth` = code (payout.ts:106). **MATCH — SF§6 verified**.
**Response — GAP**: same `BeneficiaryResponse` shape as §3.21 — spec's `data` object (6 fields) unmodeled. **Flag** (live-verified to reach only PTL04/96 paths; success shape unobserved).

---

## 4. Hash-order verdict table (all 22)

| # | Endpoint | Spec b4hash (cleaned) | Code order | Verdict | Live evidence |
|---|---|---|---|---|---|
| 1 | purchase | req_time.merchant_id.tran_id.amount.items.shipping.firstname…frequency (25; +`additional_params`; no ctid) | 27-field `PURCHASE_HASH_FIELDS` — adds **ctid after items**, **google_pay_token after additional_params** | **DIFFERS** (code correct) | SF§17 (2026-09-05): documented order rejected w/ subscription trio; ctid-after-items accepted; gateway hint prints doc list but enforces ctid |
| 2 | check-transaction-2 | req_time.merchant_id.tran_id | same | MATCH | every campaign; SF§5/§7 |
| 3 | close-transaction | req_time.merchant_id.tran_id | same | MATCH | SF§6/§19 |
| 4 | transaction-detail | req_time.merchant_id.tran_id | same | MATCH | SF§11 |
| 5 | transaction-list-2 | req_time.merchant_id.from_date.to_date.from_amount.to_amount.status.page.pagination (spec has `+` typo) | same 9-field order | MATCH | SF§2: concat accepted (code 49), literal `+` rejected (code 1) |
| 6 | get-transactions-by-mc-ref | req_time.merchant_id.merchant_ref | same | MATCH | untested live (endpoint 404 in sandbox, SF§9e) |
| 7 | exchange-rate | req_time.merchant_id | same | MATCH | SF§8b |
| 8 | generate-qr | 19-field order (spec string has `$last_name+ email` typos/newlines) | `GENERATE_QR_HASH_FIELDS` — identical sequence | MATCH | SF§5 (9-field base live-verified; superset pinned by test), SF§10a/§13 |
| 9 | refund | request_time.merchant_id.merchant_auth | `MERCHANT_AUTH_DEFAULT_HASH_FIELDS` | MATCH | SF§6/§18 (full refund lifecycle) |
| 10 | aof/link-account (v3) | merchant_id.request_time.ctid.return_deeplink.callback_url.request_id.token_flag.currency | same | MATCH | SF§16 ACCEPTED (104 ⇒ hash passed) |
| 11 | cof/link-card (v3) | merchant_id.request_time.ctid.callback_url.request_id.token_flag.frequency.currency (references $frequency absent from schema; no amount/continue_success_url) | `LINK_CARD_HMAC_FIELDS` — adds **amount** (empty hash position) and appends **continue_success_url** | **DIFFERS** (code follows live docs) | SF§16 item 5 (realigned to live link-card page; HTML response prevents direct probe) |
| 12 | payment-credential (v3 charge) | 19-field: request_time.merchant_id.tran_id.amount.currency.items.ctid.pwt.first_name…shipping_fee | identical 19-field order | MATCH | SF§16 ACCEPTED (105 ⇒ hash passed) |
| 13 | renew-expired-account-token | ctid.request_time.pwt.merchant_id.request_id | same | MATCH | SF§16 ACCEPTED (105) |
| 14 | get-token-details | merchant_id.request_time.request_id | same | MATCH | SF§16 ACCEPTED (09) |
| 15 | remove-token | merchant_id.ctid.request_time.pwt | same | MATCH | SF§16 ACCEPTED (00) |
| 16 | payment-link/create | request_time.merchant_id.merchant_auth (image never hashed) | default trio | MATCH | SF§15a (image upload: same hash accepted verbatim) |
| 17 | payment-link/detail | request_time.merchant_id.merchant_auth | default trio | MATCH | SF§9d/§22 |
| 18 | pre-auth-completion | merchant_auth.request_time.merchant_id (auth FIRST) | same | MATCH | SF§6 (valid→PTL62, invalid→PTL02) |
| 19 | pre-auth-cancellation | merchant_id.merchant_auth.request_time | same | MATCH | SF§6 |
| 20 | payout | merchant_id.tran_id.beneficiaries.amount.custom_fields.currency — **hex** (unique) | same, hex encoding | MATCH | SF§6 (hex→24, base64→1) |
| 21 | add-whitelist-payout | request_time.merchant_auth (2 fields only) | same | MATCH | SF§6 (96 vs 1) |
| 22 | update-whitelist-status | request_time.merchant_auth | same | MATCH | SF§6 |

---

## 5. Spec errors — provably wrong or stale vs our live-verified implementation (report to ABA)

1. **purchase b4hash omits `ctid`.** The gateway SIGNS ctid (after `items`) on the subscription path; the documented 26/24-field order is rejected "Wrong Hash" when ctid is present (SF§17). Worse, the gateway's own wrong-hash hint prints the doc list — actively misleading.
2. **purchase b4hash references `$additional_params` but the schema defines no `additional_params` request field.** (It is a real field — the SDK sends it — but the spec must add it to the schema or drop it from the hash doc.)
3. **purchase marks `ctid` REQUIRED.** Plain purchases without ctid succeed universally in sandbox (every campaign since §8).
4. **exchange-rate response schema is structurally malformed**: only `aud`/`sgd` are inside `exchange_rates.properties`; `eur, gbp, myr, thb, hkd, cny, cad, krw, jpy, vnd` sit at the TOP LEVEL of the response object, with a `required` array mixing both levels. Live responses nest all currencies under `exchange_rates` (SF§8b).
5. **check-transaction-2 and transaction-detail nest `status` INSIDE `data`** in the spec; live responses carry `status` as a top-level sibling of `data` (SF§7c; SDK types + examples match live).
6. **check-transaction-2 hash prose contradicts its own PHP sample**: prose says concatenate "`merchant_id`, and `tran_id`" (no req_time); sample has `$req_time . $merchant_id . $tran_id`. Sample is correct.
7. **transaction-list-2 b4hash contains `+` instead of `.`** (`$to_date + $from_amount`). Live-proved: string concat accepted, arithmetic reading rejected (SF§2).
8. **generate-qr / request-qr b4hash strings are corrupted**: `$last_name+ email` with embedded newlines; request-qr's hash references ~10 fields that are not in its request schema ($items, $first_name, $last_name, $email, $phone, $return_deeplink, $custom_fields, $return_params, $payout, $qr_image_template — copy-paste from generate-qr).
9. **v3 cof/link-card b4hash includes `$frequency` but the schema has no `frequency` field** — frequency is a real, enforced request field (SF§4/§9a: link-card binding strictly requires it for recurring flags).
10. **v3 cof/link-card b4hash (archived spec) is missing the `amount` empty hash position and the trailing `continue_success_url` position** that the live docs include (SF§16 item 5).
11. **`payment_option` enums are inconsistent and incomplete**: purchase lists `cards|abapay|abapay_deeplink`; generate-qr lists `abapay_khqr|wechat|alipay` (no `abapay`); neither mentions `google_pay` or the QR-era `abapay_khqr_deeplink`, all live-supported (SDK `PAYMENT_OPTIONS`, constants.ts:274).
12. **payment-link `total_refund` typed number on create but string on detail/void**; live responses are numeric on both (SDK notes "do not rely on the type"). Similarly `total_amount_org` string vs live numeric.
13. **payment-link `tran_id` is documented string but arrives as a JSON number** on create/detail (SF§22 V-3; SDK coerces via `number|string`).
14. **purchase `firstname`/`lastname` maxLength 20** in the schema vs the live gateway's 100-char rule (SDK advisory says ≤100 per live docs; error 16/17 codes exist for malformed names).
15. **add-whitelist-payout `status.code` list has no `00` success entry** (update-whitelist-status does).
16. **`status.code` typed `anyOf [string, integer]` on transaction-list-2 / get-transactions-by-mc-ref** — live -2 endpoints always answer string (integers belong to the legacy non-suffixed paths, SF§1).
17. **purchase 200 response schema is junk**: empty properties with `required: ["01JME5PQCH7BA4JH9V9C51N1FV"]` (ULID artifact) and petstore leftovers (`Pet`, `Category`, `Tag`, `Woocommerce`) in `components.schemas` that no path references.
18. **PTL132 is documented as the invalid-link-id code, but a bogus id answers `96` "Invalid merchant data"** on this sandbox profile (SF§22 #5); PTL04 (not PTL99/PTL05) is the observed catch-all create rejection for bad currency/amount (SF§22 #6).
19. **No EXPIRED status exists anywhere** — expired payment links read OPEN with a 200 hosted page (SF§22 #2), expired purchase lifetimes read PENDING forever (W4-1). Spec semantics imply expiry is observable; it is not.
20. **generate-qr `lifetime` max is "30 days" in the archived spec descriptions, while other ABA materials (and our types) say 120 days** — one of the two is stale. (SDK treats >120 days as advisory only; sandbox accepted ~27h.)
21. **Legacy `/api/aof/*` sibling ops have contradictory hash orders** (remove-account `merchant_id.req_time.ctid.pwt` vs renew `merchant_id.ctid.pwt.req_time`) — at most one can be right; we implement the v3 forms instead, but the v1 docs should be corrected. Related: **`payment-link/void` is entirely missing from the spec** though live (SF§23) and signs exactly like create/detail.

---

## 6. Genuine SDK gaps & flagged items

### 6.1 Spec request fields we never send (no known reason): **NONE**
Every request field of all 22 implemented endpoints is either mapped to an SDK option or deliberately auto-computed (`req_time`/`request_time`, `merchant_id`, `hash`, RSA `merchant_auth`). Zero unmapped spec capabilities. (Two low-risk nuances: (a) `google_pay_token`'s exact hash position on purchase is aligned-by-family, not separately sandbox-pinned for a google-pay+subscription combined body; (b) transaction-list does not inject spec defaults page=1/pagination=40 — omitted keys rely on gateway defaults, matching live behavior.)

### 6.2 Validation inconsistencies (internal, worth a decision)
- **Refund KHR floor is 1** (hard) while every other endpoint's floor is **100 KHR** (advisory). Deliberate per utils.ts comments but diverges from the spec's global floor; confirm with ABA whether sub-100 KHR refunds succeed.
- **`ctid` optional on v3 CoF charge in the SDK, REQUIRED in the spec.** §16 verified bodies without `request_id` pass binding, but a ctid-less charge was not separately pinned. Either way it works today (pwt is the operative credential) — flag for a probe.

### 6.3 Response-type gaps (SDK models less than spec — all on endpoints with NO live success observation)
| Endpoint | Gap | Suggested fix |
|---|---|---|
| payout | 8 spec response fields unmodeled (`transaction_id, transaction_date, external_reference, apv, transaction_amount, transaction_currency, beneficiaries[], trace_id`); `bank_ref` modeled but not in spec | Model the documented contract now (harmless — extra optional props), verify live when a payout-enabled profile exists |
| add/update beneficiary | spec `data{name, payee, currency, type, status, created_at}` unmodeled (status-only type) | Same |
| pre-auth-complete | `total_amount` modeled where spec says `grand_total`; `currency` unmodeled | Prefer `grand_total` (matches refund's live-verified shape) or model both |
| pre-auth-cancel | `grand_total`, `currency` unmodeled | Same |
| get-transactions-by-mc-ref | array keyed `transactions` (spec: `data`); `status` typed `number` (spec + sibling endpoints: object) | Rename/type-fix (endpoint 404 in sandbox — untestable, low urgency) |
| v3 COF 400 `errors` map | not in the success TS types (runtime-complete via `PayWayBusinessError.fieldErrors`) | Optional type addition |

### 6.4 Unverified SDK extensions (sent on the wire, no spec entry, no live confirmation)
- **`idempotency_key`** (pre-auth complete + cancel) and **`reason`** (pre-auth cancel) — introduced in commit fc8b77a as "forwarded to PayWay (recommended for retries)"; the gateway has never confirmed it reads them (all sandbox pre-auth completions failed at business layer). Harmless (extra merchant_auth plaintext keys), but unproven — consider a probe or a docs note.
- All other extensions are evidenced: `google_pay_token` (live docs + google_pay option), `additional_params` (in the spec's own b4hash), `frequency`/`continue_success_url` on link-card (live docs, SF§4/§9a/§16), `req_time` on payout (live-accepted, §6).

### 6.5 Live-discovered response fields the SDK models beyond spec (keep — evidence in types.ts comments)
`lang`/`trace_id` on transaction-list status; `tran_id` echo in COF payment/renew status; `new_token` on renew (live-docs; exact key name unconfirmed by a live renewal — minor); numeric `tran_id` on payment-link; `hosted_checkout` HTML result on link-card; `bank_ref` on payout (SDK-only vs spec — verify against a real success body since spec omits it).

---

## 7. Method note

All code line references verified 2026-09-11 against: `src/domains/checkout.ts`, `qr.ts`, `credentials-on-file.ts`, `payment-link.ts`, `payout.ts`, `pre-auth.ts`, `khqr.ts`; `src/client.ts` (HASH_ORDER_HINTS :553-582, MERCHANT_AUTH_DEFAULT_HASH_FIELDS :514, request :1626-1661, requestWithMerchantAuth :1663-1735); `src/constants.ts` (ENDPOINTS :6-29, token-flag enums :221-222, QR templates :254-262, PAYMENT_OPTIONS :274); `src/types.ts` (response schemas :552-1328); `src/utils.ts` (validators); `src/auth.ts` (generateHmac/encryptMerchantAuth); `src/cli.ts` (generate-qr :2211-2245, cof charge :3772-3830, pre-auth :4205-4308). Raw spec re-checked directly from `docs/archive/Default module.openapi.json` for the response shapes and required arrays quoted above (exchange-rate nesting, check/detail status nesting, token-details data props, mc-ref data items, payout/refund/pre-auth response props, purchase/generate-qr required arrays, lifetime descriptions, status enum typo). SANDBOX-FINDINGS sections cited: §1-§6, §9, §10, §11, §13, §14, §15, §16, §17, §18, §19, §21, §22, §23.
