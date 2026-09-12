# Sandbox probe findings — 2026-07-16

> **2026-08-25 full-cycle campaign appended at the bottom of this file.**
> New CLI commands (`check-transaction`, `close-transaction`, `transaction-detail`,
> `transaction-list`, `refund`, `exchange-rate`), standardized exit codes, and a
> multi-line `.env` loader fix landed from that campaign.

Ran `scripts/sandbox-probe.ts` against `https://checkout-sandbox.payway.com.kh`
with real sandbox credentials (merchant `ec476910`). Results below are now
reflected in `payway-openapi/openapi.yaml` (info.description items 6 & 10)
and `payway-openapi/components/schemas/shared.yaml` (StatusBlock).

## 1. `-2` suffix paths are real, and NOT aliases of the legacy paths

`check-transaction-2` / `transaction-list-2` and their non-suffixed
counterparts are both live endpoints, but they are different API versions
with different response contracts:

| | `-2` (what this spec targets) | legacy (no suffix) |
|---|---|---|
| check-transaction shape | `{"status":{"code":6,"message":"...","tran_id":"..."}}` | `{"status":6,"description":"..."}` |
| transaction-list shape | `code` is a **string** (`"49"`), plus `lang`/`trace_id`/`tran_id` | `code` is an **integer** (`49`), plus `pw_tran_id` |
| transaction-list HTTP status (same logical error) | 403 | 400 |

**Action taken:** kept `-2` throughout the spec/client (already correct).
**Do not** switch to the legacy paths — their response shape won't match
these schemas at all.

## 2. Hash concatenation: string-concat confirmed correct

Probed `transaction-list-2` with an intentionally invalid `from_date`,
comparing two HMAC variants:

- **String concat** (current `src/auth.ts` behavior): server returned
  `code: "49"` "Invalid Start Date" — i.e. the hash was **accepted**,
  request proceeded to business validation.
- **PHP arithmetic `+`** (literal reading of PayWay's own PHP sample):
  server returned `code: "1"` **"Wrong Hash."**

**Action taken:** none needed — `generateHmac()` was already correct.
PayWay's own reference PHP sample has a typo (`$to_date + $from_amount`
should be `.` concatenation like every other field).

## 3. New fact: PayWay does NOT uniformly wrap errors in HTTP 200

`transaction-list-2` returns real HTTP 400/403 for validation errors, not
a 200 with an internal error code. This contradicts the assumption (made
before this probe) that all business errors come back as 200 OK. It means:

- The `operation-4xx-response` Redocly lint warning should **not** be
  blindly suppressed for every operation — some genuinely have 4xx
  responses and should document them.
- The `client.ts` bug where `!response.ok` is the only failure check is
  still real for endpoints that DO wrap errors in 200 (confirmed
  separately in PayWay's own docs example for `close-transaction`'s
  "Wrong hash" case) — but this now needs per-endpoint verification
  rather than a blanket assumption in either direction.

## Still open

- Production base URL is still unconfirmed (sandbox only, per earlier note).

## 7. QR Template Generation & Transaction Status Verification (2026-07-18)

End-to-end test of QR generation across all 10 sandbox templates, followed
by payment and transaction status verification via the SDK.

### 7a. QR Generation — all 10 templates pass

Generated QR codes at $5.00 USD for every sandbox template using
`scripts/test-all-qr-templates.ts`:

| Template | `qrString` | `qrImage` (PNG) | Duration |
|---|---|---|---|
| `template1` | ✅ | ✅ | ~400ms |
| `template1_color` | ✅ | ✅ | ~180ms |
| `template2` | ✅ | ✅ | ~170ms |
| `template2_color` | ✅ | ✅ | ~170ms |
| `template3_color` | ✅ | ✅ | ~170ms |
| `template4` | ✅ | ✅ | ~170ms |
| `template4_color` | ✅ | ✅ | ~170ms |
| `template5` | ✅ | ✅ | ~170ms |
| `template5_color` | ✅ | ✅ | ~170ms |
| `template6_color` | ✅ | ✅ | ~170ms |

**Key findings:**
- `qr_image_template` must be one of the 10 sandbox templates; any other
  value returns HTTP 400.
- `payment_option: 'abapay_khqr'` is required — omitting it produces a
  400 "Parameter validation required" error.
- `tran_id` (the `transactionId` param) must be ≤ 20 characters and may
  only contain `[a-zA-Z0-9\-]`. The PayWay API rejects longer IDs with
  HTTP 400. This constraint is now enforced by `validateTransactionId()`
  in the SDK.
- All templates return both `qrString` (MHR TLV payload) and `qrImage`
  (Base64-encoded PNG).

### 7b. Transaction Status Verification — all 10 APPROVED

After paying each generated QR, used `scripts/check-qr-transactions.ts`
to verify via `getTransactionList` + `getTransactionDetail`:

| Template | Transaction ID | Status | Amount | APV |
|---|---|---|---|---|
| `template1` | `QR-template1-mrpukd3` | ✅ APPROVED | $5 USD | 876776 |
| `template1_color` | `QR-template1color-mr` | ✅ APPROVED | $5 USD | 942818 |
| `template2` | `QR-template2-mrpukdj` | ✅ APPROVED | $5 USD | 773857 |
| `template2_color` | `QR-template2color-mr` | ✅ APPROVED | $5 USD | 401511 |
| `template3_color` | `QR-template3color-mr` | ✅ APPROVED | $5 USD | 650677 |
| `template4` | `QR-template4-mrpuke0` | ✅ APPROVED | $5 USD | 723978 |
| `template4_color` | `QR-template4color-mr` | ✅ APPROVED | $5 USD | 801747 |
| `template5` | `QR-template5-mrpukea` | ✅ APPROVED | $5 USD | 317286 |
| `template5_color` | `QR-template5color-mr` | ✅ APPROVED | $5 USD | 711692 |
| `template6_color` | `QR-template6color-mr` | ✅ APPROVED | $5 USD | 863477 |

### 7c. API Response Structure Findings

**`getTransactionList` response shape:**
- Transaction array is the **direct top-level value** (not nested under
  `.data` or `.transactions`).
- Each entry uses `transaction_id` (not `tran_id`) as the ID field.
- Amount field is `payment_amount` (not `amount` or `tran_amount`).
- Other fields: `transaction_date`, `apv`, `payment_status`,
  `payment_status_code`, `payment_type`, `original_amount`,
  `total_amount`, `payment_currency`.

**`getTransactionDetail` response shape:**
- Response wraps actual data under `.data` key: `{ status: {…}, data: {…} }`.
- `data.payment_status` is a string (`"APPROVED"`, `"PENDING"`, etc.).
- `data.payment_status_code` is a number (0=APPROVED, 2=PENDING, etc.).
- `status.code` is `"00"` for success (NOT `"0"` as in other endpoints).

**Rate limits confirmed:**
- `getTransactionDetail`: hard limit of **10 requests/minute** (per
  endpoint docs). Returns HTTP 403 when exceeded.
- `getTransactionList`: 50 requests/minute.
- Recommendation: add 7-second delay between detail calls when querying
  multiple transactions sequentially.

### 7d. `status` filter parameter

The `status` filter on `getTransactionList` expects a **string enum value**
(`"APPROVED"`, `"PENDING"`, etc.), not the numeric code. Using `"0"`
returns zero results.

## 5. QR API (`generate-qr`) probe findings

The QR API was verified against the sandbox on 2026-07-16 using
`scratch/sandbox-probe-qr-api.ts`.

- `POST /api/payment-gateway/v1/payments/generate-qr` accepts JSON.
- The accepted HMAC-SHA512/Base64 plaintext order is
  `req_time + merchant_id + tran_id + amount + purchase_type + payment_option + callback_url + currency + qr_image_template`.
- A valid request with `purchase_type: "purchase"`,
  `payment_option: "abapay_khqr"`, a Base64-encoded `callback_url`, and
  `qr_image_template: "template2"` returned HTTP 200 with camelCase
  `qrString` and `qrImage` fields.
- A deliberately invalid hash returned HTTP 403 with nested
  `status.code: "1"` and message `"Wrong Hash."`.

**Action taken:** updated the SDK and OpenAPI QR request/response contract to
match this verified payload. The previous `items`/customer-details/`return_url`
model does not apply to this endpoint.

## 6. Pre-auth, payout, KHQR, and checkout error probes

Probed on 2026-07-16 using `scratch/sandbox-probe-pre-auth.ts`,
`scratch/sandbox-probe-payout.ts`, `scratch/sandbox-probe-khqr.ts`, and
`scratch/sandbox-probe-checkout-errors.ts`.

- Pre-auth completion and completion-with-payout share
  `/pre-auth-completion`; both use JSON with RSA-encrypted `merchant_auth`.
  Their HMAC order is `merchant_auth + request_time + merchant_id`.
  The encrypted JSON uses `complete_amount` and an optional raw `payout`
  array. Cancellation uses `merchant_id + merchant_auth + request_time`.
  Validly signed dummy requests reached `PTL62` while invalid hashes reached
  `PTL02`; both were HTTP 403.
- Payout uses RSA-encrypted `beneficiaries` and requires `currency`. Its HMAC
  is hexadecimal, not Base64: `merchant_id + tran_id + beneficiaries + amount
  + custom_fields + currency`. The valid hexadecimal signature reached code
  `24` (invalid encrypted beneficiary data), while Base64 and intentionally
  invalid signatures returned code `1` "Wrong Hash." over HTTP 403.
- Add/update beneficiary use JSON RSA `merchant_auth` containing `payee`
  (and numeric `status` for update), signed as Base64 HMAC of
  `request_time + merchant_auth`. Valid dummy requests reached code `96`;
  invalid signatures returned code `1`, all as HTTP 403.
- KHQR's published lookup path returned HTTP 404 for both correctly signed and
  deliberately invalid requests. It is unavailable under this sandbox profile.
- `check-transaction-2` and `close-transaction` both return HTTP 403 for a
  deliberately invalid hash, not a 200-wrapped error.

## 4. Credentials-on-File (CoF) probe findings

Probed the 6 CoF endpoints (`link-account`, `link-card`, `payment-credential`, `renew-expired-account-token`, `get-token-details`, `remove-token`).

**Key Discoveries:**
1. **`pwt` over `payment_token`**: All token-based endpoints (`payment-credential`, `renew-expired-account-token`, `get-token-details`, `remove-token`) strictly require the field to be named `pwt` in the payload and HMAC calculation, not `payment_token` as earlier specs suggested.
2. **`ctid` is mandatory for token management**: The 3 token management endpoints (`renew-expired-account-token`, `get-token-details`, `remove-token`) require the `ctid` field to be present and hashed.
3. **`link-card` requires `application/x-www-form-urlencoded`**: Unlike `link-account` and others which accept JSON, `link-card` rejects all JSON payloads without reading them. It must be sent as form data.
4. **`link-card` requires `frequency`**: A new required field `frequency` (allowing values like `1W|1M|2M`) is strictly enforced when `token_flag` implies recurring billing (like `CITR_FLEX`).

**Action taken:**
- Updated `client.ts` to rename `paymentToken` to `pwt` in payload mapping, and added `ctid` to token operations.
- Added `contentType` support to `client.ts`'s `request()` to support URL-encoded forms, and applied it to `linkCard`.
- Added `frequency` to `LinkCardParams`.
- Updated `credentials-on-file.yaml` OpenAPI paths and schemas to reflect `pwt`, `ctid`, and `application/x-www-form-urlencoded` for `linkCard`.

---

## 8. Full-cycle validation campaign — 2026-08-25

Evidence: `test-output/campaign-evidence.json` (raw), harness:
`scripts/sandbox-campaign-full-cycle.ts` (re-runnable).

### 8a. Defects found & fixed in this repo

| # | Defect | Evidence | Fix |
|---|---|---|---|
| 1 | `loadDotEnv()` was line-based; multi-line quoted PEMs in `.env` were truncated to `"-----BEGIN PUBLIC KEY-----`. Every RSA endpoint (refund, payment-link, pre-auth, payout) failed with a misleading "does not look like a public key PEM". | `.env` stores the PEM across 6 lines; refund probe failed at config stage before reaching PayWay. | `src/cli.ts loadDotEnv()` now folds quoted values across lines and strips quotes/`\n` escapes. Verified: refund now reaches PayWay. |
| 2 | `payway-sdk generate-checkout` hardcoded `payment_gate: 0`; sandbox now responds to that param with **HTTP 200 + HTML page**, surfacing as "Invalid JSON response" with zero diagnostics. | Reproduced twice via SDK path (`REPRO*` transactions). Without the param → clean JSON `qrString`/`qrImage`. | Removed hardcoded gate from CLI; `createJsonParseError()` now reports content-type, an HTML-detection hint ("parameter value rejected server-side"), and a body snippet. |
| 3 | No standalone CLI commands for check/close/detail/list/refund/exchange-rate even though agent skills documented those flows. | `src/cli.ts` command audit vs `skills/*`. | Added 6 commands, all with `--json` for agents. |
| 4 | Any API failure exited with code 1 — indistinguishable from validation errors for agent frameworks. | CLI audit. | Standardized exit codes: `0` success / `1` validation-input / `2` PayWay API failure / `3` network-timeout-rate-limit (`classifyError`). |

### 8b. New sandbox facts

- **Duplicate `tran_id` is silently accepted** on purchase (HTTP 200, code=00) —
  sandbox overwrites/reuses. Production semantics unknown.
- **`payment_status_code` 2 = PENDING confirmed** via list + check after close;
  a closed-but-unpaid transaction still reports PENDING (not CANCELLED).
- **Refund target missing → HTTP 403 `PTL36`** "Transaction not found or is
  invalid" (new code added to `REFUND_ERROR_CODES`). Refund of a *known but
  unpaid* tran returned the same shape.
- **`transaction-list-2` date format is strictly `YYYY-MM-DD HH:mmss`.**
  Compact `YYYYMMDD`, ISO `YYYY-MM-DD`, epoch seconds, and
  `YYYYMMDDHHmmss` all return code 49 "Invalid Start Date." (HTTP 403).
- **Close on nonexistent tran → HTTP 403 code 5** "Transaction not found";
  check on nonexistent tran → HTTP 200 code 6 "tran_id not found".
- Exchange rate returns `status.code: "00"` with `exchange_rates` object.

### 8c. Clarifying questions for ABA / future probes

1. Does production reject duplicate `tran_id`, or does it also silently overwrite?
   (Sandbox accepts — dangerous idempotency semantics.)
2. Why do closed/unpaid transactions keep reporting `PENDING` instead of a
   CANCELLED status? Is close only effective before payment authorization?
3. What are the official retry/backoff semantics for webhook delivery failures?
4. Do partial refunds round to the original currency's scale (0.01 USD / 1 KHR)
   or to KHR integers regardless of original currency?
5. Is `payment_gate` still supported on `/v1/payments/purchase`? (HTML response
   suggests it now routes to a web flow rather than an API error.)

---

## 9. Scope-coverage campaign: CoF / Payout / Pre-auth / Payment Link / KHQR — 2026-08-25

Evidence: `test-output/campaign-scopes-evidence.json`; harness:
`scripts/sandbox-campaign-scopes.ts`. Deep-probe trail (kept for reference in
git history): `scripts/probe-cof-deep{,2,3,5,6}.ts`, `probe-cof-hunt.ts`.
Portal scope map: https://developer.payway.com.kh/ (Accept payments /
Auto-payments / Hold payments / Multi-party payouts).

### 9a. Credentials-on-File (all 6 endpoints live)

Binding layer leaks per-field validation errors — `HTTP 400 code "04"` with an
`errors{}` map (Laravel/.NET style). This shape is NOT in our OpenAPI spec.

| Endpoint | Content-type | Server-required fields | Verified outcome |
|---|---|---|---|
| `link-account` | JSON | `request_id`, `ctid`, `token_flag` (enum **CITI_FLEX\|CITO_FLEX\|CITO_FIX\|CITR_FLEX**), `currency`; optional `callback_url` | Binding passes w/ valid flag → hash layer |
| `link-card` | form-urlencoded | `request_id`, **`ctid`**, **`currency`**, `token_flag` (same enum), `frequency` (`1W\|1M\|2M`) | Full payload → **HTTP 200 hosted HTML checkout page** (= success; redirect customer) |
| `payment-credential` | JSON only (form → 415) | flat fields incl. `pwt`; `token_flag` uses a DIFFERENT enum: **CITU_FLEX\|MITU_FLEX\|MITU_FIX\|MITR_FLEX\|MITR_FIX** | Binding passes → hash layer |
| token trio (`renew/get-details/remove`) | JSON | model `CheckPushbackStatusRequest` requires flat `request_time`, `request_id`, **`request`** (string; we default it to request_id), `ctid`, `pwt`, `hash` | Binding passes → hash layer |

**OPEN — token-trio HMAC composition is black-box.** ~60 compositions tried
(field orders × base64/hex × separators × JSON-subset × decoded-values ×
merchant_auth wrapper). All → 403 "Wrong Hash". The v3 CoF HMAC plaintext is
undocumented and not derivable without ABA's official sample. SDK now sends
the correct binding shape but these three calls will fail at the hash layer
until ABA publishes the composition.

**SECURITY observation:** `link-card` returned its hosted checkout page even
with a deliberately corrupted hash (sandbox). Hash appears unenforced there —
clarifying question for ABA; do not rely on client-side hash as a control.

### 9b. Payout & beneficiaries

| Probe | Result |
|---|---|
| payout to non-whitelisted account (valid RSA beneficiaries, hex HMAC) | HTTP 403, numeric code **37** "Payout accounts are not in whitelist" |
| add-beneficiary dummy account `0077777777` | HTTP 400 **PTL04** Parameter validation required |
| update-whitelist-status nonexistent payee | HTTP 400 **PTL04** |

### 9c. Pre-auth (hold payments) — real lifecycle

Created a REAL pre-auth hold via `purchase {type:'pre-auth', paymentOption:'cards'}`
(code 00). Then:

| Operation | Result |
|---|---|
| check-transaction on unpaid pre-auth | Success (status visible) |
| complete (never cardholder-authorized) | HTTP 403 **PTL59** "Unable to complete pre-authorization: transaction status is invalid..." |
| complete-with-payout | HTTP 403 **PTL62** "Merchant information is invalid" (sandbox profile lacks payout permission) |
| cancel unauthorized | HTTP 403 **PTL170** "Unable to cancel pre-authorization: transaction status is invalid" |
| cancel nonexistent tran | HTTP 403 **PTL36** (same code as refund target-missing) |

### 9d. Payment Link — fully working end-to-end

- `create` → real link: id `q1qXwF59VQGUPqbMBpqSsw==`,
  url `https://link-sandbox.payway.com.kh/ABAPAY…`; `detail` on it → Success.
- detail of nonexistent id → HTTP 403 code **96** "Invalid merchant data".
- `expired_date` in the past → rejected PTL04.
- **Duplicate `merchant_ref_no` accepted** (two links created with same ref) —
  mirrors the duplicate-`tran_id` finding; PayWay does not enforce uniqueness
  on merchant references in sandbox.

### 9e. KHQR get-transactions-by-mc-ref

Still **404** for validly signed requests — endpoint unavailable under this
sandbox profile (consistent with 2026-07-16 probe).

### 9f. New clarifying questions for ABA (adds to §8c)

6. Publish the v3 token-management / CoF HMAC composition (or official samples).
7. Why does `link-card` skip hash verification in sandbox? Is it enforced in production?
8. Is duplicate `merchant_ref_no` on payment links intentional?
9. What payee format does `add-whitelist-payout` expect (PTL04 vs code 96)?
10. Which sandbox profiles are provisioned for `complete-with-payout` (PTL62)?

## 10. Online QR + hosted checkout-link flows, poller hardening (2026-08-25)

Two end-to-end live runs with real sandbox payments; captured as reusable
scripts `scripts/online-qr-poll.ts` and `scripts/checkout-link-poll.ts`.

### 10a. Online QR (`qr.generateQr`) — paid in ~37s

$31.11 USD, `paymentOption: 'abapay_khqr'`, template `template2_color`,
`lifetime: 600` (seconds; SDK converts to whole minutes). Poll #1-7 PENDING,
#8 APPROVED (~37s). PNG + KHQR payload + deeplink saved per transaction.

### 10b. Hosted checkout link (`checkout.purchase`) — gate contract pinned

| Request shape | Response |
|---|---|
| `paymentOption: 'abapay_khqr_deeplink'`, no gate | JSON: `qrString` + `qrImage` + `abapay_deeplink`; **no `checkout_qr_url`** |
| same + `viewType: 'hosted_view'` + `paymentGate: 0` | JSON **includes `checkout_qr_url`** (hosted page at `checkout-sandbox.payway.com.kh/eyJ…`) |

So on the JSON API path, gate 0 is what produces the hosted URL. This refines
the earlier "Changed" note about `generate-checkout`: when POSTing the payload
as a browser form, gate 0 answers with an HTML page instead of JSON — both
behaviors are the same routing decision (gate 0 = Checkout service renders it).

Run 2: $12.12 USD, lifetime 600s. Poll timeline: NOT_FOUND ×1 → PENDING ×4 →
APPROVED (~32s).

### 10c. First check after creation returns code 6 (grace period)

The first `check-transaction` immediately after creation returned HTTP 200 /
`status.code 6` "tran_id not found"; ~5s later the same ID reported PENDING.
Propagation delay, not a wrong-ID error.

**Action taken:** `pollTransactionStatus()` now detects `paywayCode === '6'`
and yields `paymentStatus: 'NOT_FOUND'` without incrementing
`maxConsecutiveErrors` (previously one such poll burned a third of the error
budget and could abort legitimate purchase flows). Covered by two new tests in
`src/__tests__/client.test.ts`.

### 10d. Open questions (adds to §8c/§9f)

11. Does production enforce unique `tran_id`? Sandbox silently accepts duplicates (reconfirmed during these runs).
12. What is the authoritative visibility delay for check/list after create in production?

## 11. get-transaction-detail deep probe — rate-limit contract pinned, SDK hardened (2026-08-25)

Instrumented live probe (`scripts/sandbox-probe-txn-detail.ts`) across four phases.
Evidence: `test-output/txn-detail-probe.json`.

### 11a. Latency & richness

| Endpoint | n | min | p50 | max |
|---|---|---|---|---|
| check-transaction | 4 | 130ms | 467ms | 624ms |
| transaction-detail | 5 | 174ms | 225ms | 749ms |

Detail returns the richest body (`apv`, `bank_ref`, `payer_account`,
`payment_type`, full `transaction_operations` history) — right for
reconciliation/refund decisions, not for real-time status.

### 11b. Fresh-creation visibility is ASYMMETRIC

After creating a QR: **check-transaction sees the new ID in <1s; transaction-
detail took ~5s** to return it (HTTP 200 code 6 "tran_id not found" before).
Status polling must use check-transaction; detail is for after-the-fact reads.

### 11c. Rate-limit contract (the big one)

The documented 10/min cap on detail is enforced as:

```
HTTP 403 Forbidden          ← NOT 429
{"status":{"code":429,"message":"Rate limit exceeded for this request.
Please try again later","tran_id":"…"}}   ← code is a JSON NUMBER
```

- No rate-limit headers at all (no X-RateLimit-*, no Retry-After).
- Exactly 10 OK calls per rolling minute, then 403s.
- The numeric `status.code 429` slipped past the SDK's string-only body-code
  extraction, so this was surfacing as an opaque non-retryable `api_error`.

**Action taken:** extraction now accepts numeric codes; the response maps to
typed `PayWayRateLimitError` (retryable). Retry pacing derives from the SDK's
own observed request window (capped 1-10s) instead of blind backoff when no
Retry-After exists. Verified live: burst → paced retries → typed error →
success once the window rolled.

### 11d. CLI hardening

`payway-sdk transaction-detail` gained `--wait <seconds>` (retries every 2s
while the gateway reports code 6) and prints a lag hint with the
check-transaction escape hatch when it gives up. `printApiError` now explains
the 403+429 cap shape and points to the fast alternative endpoint.

## 12. Card-payment checkout matrix + create→close lifecycle (2026-08-25)

Probed `checkout.purchase()` with `paymentOption: 'cards'` across payment_gate
values (JSON content-type throughout):

| Request | Response | Transaction created? |
|---|---|---|
| `cards`, no gate | JSON PurchaseQrResponse (`qrString`/`qrImage`/`abapay_deeplink`) — **KHQR data regardless of the cards option** | yes |
| `cards` + `paymentGate: 1` | same JSON | yes |
| `cards` + `paymentGate: 0` (+`hosted_view`) | **the hosted card-checkout page itself as HTML** (~47 KB, test-card fields included); surfaces through the SDK as an "Invalid JSON" PayWayAPIError whose `rawBody` holds the full page | yes |

So gate 0's meaning is consistent with §10b — "Checkout service renders it" —
but for `cards` there is no JSON+URL shape: the page IS the response body, and
it cannot be rendered from a static file (its relative `/_nuxt/*` assets break
under file:// with CORS/file-origin errors).

**Correct integration (official docs,
developer.payway.com.kh/ecommerce-checkout-3158159f0):** build the signed
payload locally (`checkout.createTransaction()`), embed it as hidden inputs in
`<form method="POST" target="aba_webservice" action="…/v1/payments/purchase">`,
load `https://checkout.payway.com.kh/plugins/checkout2-0.js` deferred, and call
`AbaPayway.checkout()` — the HTML renders in a modal via iframe form POST
(no CORS). Implemented in `scripts/checkout-cards-close.ts`; creation verified
by check-transaction within ~3s of page open.

Live end-to-end run ($7.77 USD): created → PENDING → `closeTransaction`
code 00 → post-close still PENDING. Extra observations:

- **Closing is advisory, not a hard void — sandbox violates the documented
  contract.** Docs (close-transaction): "Once a transaction is closed, it will
  no longer accept payment: any incoming payment will be rejected or reversed…"
  Live card payments disproved this TWICE: `PAY8skk3vbbi` (MC \*6777) and
  `PAY8t4x1ozl9` (VISA \*0206) were both closed with code 00 while PENDING,
  then paid on still-open checkout pages → **APPROVED**.
- **Closure is not queryable:** check-transaction keeps reporting PENDING for
  closed-unpaid txns, and transaction-detail shows no cancellation marker —
  operation history reads `Create Order → Completed` even when a close was
  accepted in between. There is NO CLOSED status anywhere.
- Closing an **already-closed** transaction is idempotent in sandbox
  (code 00 again) — reusable tool: `scripts/close-transaction-verify.ts`.
- Modal vs hosted: the generated page must WAIT for the deferred
  `checkout2-0.js` before calling `AbaPayway.checkout()`; racing window.load
  falls back to full-page hosted navigation. The page now offers both modes
  explicitly (modal enabled once the plugin attaches, hosted always available;
  hosted drops the `target="aba_webservice"` iframe attribute so navigation is
  top-level).
- **Open question for ABA (#13):** is post-close rejection/reversal enforced in
  PRODUCTION? Until answered, merchants must treat close as advisory, keep a
  local closed flag, watch webhooks for late APPROVED events, and refund.

> 📁 **Full close-API dossier (evidence, reproduction, questions for ABA,
> post-fix validation checklist): [CLOSE-TRANSACTION-FINDINGS.md](./CLOSE-TRANSACTION-FINDINGS.md)**

## 13. Edge-case campaign: QR lifecycle bounds, duplicates, response shapes (2026-08-30)

Evidence: `test-output/edge-case-probe/live-probe.log`; harness:
`src/__tests__/edge-case-audit.test.ts` (43 behavior-pinning probes); full
findings matrix in `audit-results/edge-case-report.md`.

### 13a. QR lifetime — minimum is exactly 180s (pinned)

| `lifetime` (seconds) | Sent to API (minutes) | Result |
|---|---|---|
| 30 | 0 | HTTP 400, code `"04"` |
| 59 / 60 / 90 / 120 / 150 / 179 | 0/1/1/2/2/2 | HTTP 400, code `"04"` |
| **180** | **3** | **HTTP 200, code 00** |
| 100000 (~27.8h) | 1666 | HTTP 200, code 00 |

Matches the OpenAPI spec note ("Minimum: 3 mins. Maximum: 120 days") — but
neither `validateLifetime()` nor the CLI enforces or hints it, so sub-180s
requests die at the gateway with the opaque string code `"04"`
("The given data was invalid"). `payway-sdk explain 04` already normalizes
`"04"` → `4` "Invalid Data" (verified). ~27h values are accepted, consistent
with the 120-day max not being approached.

### 13b. Duplicate `tran_id` on generate-qr silently accepted

Same `-t ec-probe-dup` at $5.00 and then $7.77: both returned HTTP 200 /
code 00 with **two different live QR payloads** (amounts embedded: "5.00"
and "7.77"). Mirrors the §8b duplicate-purchase finding — whichever QR is
scanned first wins; the other amount goes stale. Extends open question #1/#11
to the QR endpoint.

### 13c. Amount bounds on generate-qr

- $0.01 USD → accepted (EMVCo amount "0.01").
- $100000 USD → accepted (no observed cap at this scale).
- KHR 4000 → accepted (EMVCo amount "4000.00", gateway adds decimals for KHR).

### 13d. Reconfirmed live

- check-transaction on nonexistent ID → HTTP 200, nested `status.code 6`
  "tran_id not found"; CLI prints friendly message + `PayWay code: 6`, exit 2.
- CLI exit codes behave as documented (validate errors → 1, API failure → 2).
- `validate` command rejects every malformed amount/ID thrown at it with a
  precise message and exit 1.

### 13e. CLI credential precedence surprise

Running any API command from a directory **without** `.env` (and with the env
cleared) still reached the sandbox: the persisted global profile store
(`profiles`) supplied credentials ("Using profile: sandbox (sandbox)") with no
opt-in. Precedence (profile store > `.env` > ambient env) is undocumented —
see finding EC-14 and the improvement plan.


## 14. Sandbox contract suite — transaction-list visibility gap + shape (2026-08-31)

New opt-in suite: `src/__tests__/sandbox-contract.test.ts` (`npm run test:sandbox`,
gate `SANDBOX_CONTRACT_TESTS=1`). First run evidence in the suite file and
`test-output/` shell history. Facts pinned live:

### 14a. transaction-list response shape + date-range cap

`getTransactionList` success body is a JSON object `{ data: [...], page,
pagination, status: { code: "00", message: "Success!", tran_id } }` — rows carry
`transaction_id`, `payment_status`, `payment_status_code`, `original_amount`,
`original_currency`, `transaction_date`. (The local mock in
`cli-mock-commands.test.ts` sends a bare array — that mock shape deviates from
the live sandbox and is kept for CLI-renderer coverage only.)

A date range wider than **3 days** is rejected with **HTTP 403** and the message
"Maximum date rang is allowed only 3 days" (sic — gateway typo) — sandbox-verified
2026-08-31 with a 4-year window. The SDK surfaces it as `PayWayAPIError`
(statusCode 403, message preserved).

### 14b. Unpaid QR-only transactions are invisible to transaction-list (NEW)

Across a wide window (`2026-01-01` → `2030-01-01`), transaction-list was rejected
out of hand (see 14a); within a valid ≤3-day window spanning both days,
transaction-list returned only the two checkout-created (`purchase`) transactions
— **none** of the 16+ unpaid `generate-qr` transactions created 2026-08-30/31 by
the suite appeared, although `check-transaction` sees them in <1 s and
`getTransactionDetail` in ~5 s (both returned PENDING / original_amount as expected).

Implication for merchants: reconciliation built on transaction-list alone will
miss unpaid-but-open QR transactions; poll with check-transaction (per-tran)
instead, and expect list visibility only for checkout-created or paid items.
The contract suite pins this asymmetry as a regression test; revisit if ABA
confirms different production semantics (ABA-OPEN-QUESTIONS Q9/Q10 territory).

### 14c. Suite infrastructure notes

- Gate `SANDBOX_CONTRACT_TESTS=1` (deliberately not `PAYWAY_*`-prefixed — the
  hermetic-env setup file scrubs `PAYWAY_*` before test-file modules evaluate).
- `.env` is parsed directly by the suite (credentials never depend on
  `process.env`, which is scrubbed).
- `NODE_TLS_REJECT_UNAUTHORIZED='0'` is set/restored inside the suite's
  `beforeAll`/`afterAll` (undici reads it lazily at connect time — verified);
  no shell prefix needed for `npm run test:sandbox`.
- Rate budget per run: ~6 generate-qr, ~5 check-transaction, 1 detail, 1 list
  call — inside the §4 caps (detail 10/min, list 50/min).

---

## 15. Payment-link multipart image upload — accepted, renamed, hosted (2026-08-31)

Evidence: `test-output/payment-link-image-probe/probe-*.json` (full probe matrix per run;
`scripts/sandbox-probe-payment-link.ts` case 3c), plus a chained `payment-link/detail`
call on the image link (`HTTP 200 code=00`).

### 15a. Multipart contract

- `payment-link/create` accepts **`multipart/form-data`** with exactly the four string
  fields (`request_time`, `merchant_id`, `merchant_auth`, `hash`) plus an optional
  top-level **`image`** binary part. HTTP 200 `code=00` "Success." on the first attempt.
- The HMAC composition is **unchanged** when an image is attached:
  `hash = base64(HMAC-SHA512(request_time + merchant_id + merchant_auth, api_key))` —
  image bytes are never hashed. Sending the same hash as the urlencoded requests is
  accepted verbatim.
- No `Content-Type` header must be set by the caller (the runtime generates the
  boundary); sending urlencoded `Content-Type` with a multipart body would fail, but
  the SDK's multipart path omits the header entirely.

### 15b. What the gateway does with the image

`payment-link/detail` on the image link returned:

```json
"image": {
  "image": "https://pw-admin-sandbox.ababank.com/merchants/transaction-photo/payment_link_image_178811415013201.png",
  "filename": "payment_link_image_178811415013201.png",
  "size": 0
}
```

- The upload is **stored and hosted** — `image.image` becomes an ABA CDN URL.
- The original filename is **not preserved**: the gateway renames to
  `payment_link_image_<epoch-ms>.<ext>`. Do not rely on `filename` for anything
  merchant-facing.
- `size` is reported as `0` even after a successful upload (sandbox quirk; treat as
  unreliable).
- A link created **without** an image returns the empty shape
  `{"image":"","filename":"","size":0}` — check `image.image` truthiness, not presence.

### 15c. Tooling notes from this campaign

- `scripts/sandbox-probe-payment-link.ts` previously parsed `.env` with a line-by-line
  minimal parser; the repo `.env` now stores `PAYWAY_RSA_PUBLIC_KEY` as a multi-line
  quoted PEM, which that parser truncates to the header line (`local RSA error:
  DECODER routines::unsupported` on every case). The probe now uses the CLI's shared
  `loadDotEnvIntoProcess` (`src/cli/dotenv.ts`) — the same fix belongs in any other
  script that still hand-rolls dotenv parsing.
- `npm run bundle` (Redocly) has been broken since the spec split in `017cc4d`
  (duplicate `$ref` keys under `components.schemas`, plus duplicated schema names
  across the split files). `payway-openapi/bundled.yaml` is maintained by hand in the
  meantime; the `image` part is documented in both `components/schemas/payment-link.yaml`
  and `bundled.yaml`.

---

## 16. Token-trio HMAC compositions VERIFIED from live docs; CoF family realigned (2026-08-31)

**Context.** TD-03 / RTM R-04/05/06 / ABA-OPEN-QUESTIONS Q6 blocked the v3 token-management trio because
~60 derivable HMAC compositions were rejected during the §9a campaign (2026-08-2x). The live docs at
developer.payway.com.kh now publish **explicit per-endpoint hash orders** (each spec page embeds the Apidog
OpenAPI definition). `scripts/sandbox-probe-token-trio.ts` (new, re-runnable) probed the documented orders plus
the SDK baselines; evidence: `test-output/token-trio/probe-2026-08-31T00-28-10-661Z.log`.

**Classification rule.** The gateway checks the HMAC before the business layer: a wrong-hash code
(`1`/`01`/PTL02) proves rejection; ANY other business code (105 invalid token, 09 data not found, 04 invalid
data, 104 flag not enabled, 00 success) proves the hash layer ACCEPTED the composition — synthetic
request_id/ctid/pwt values are sufficient.

### 16a. Verdicts (merchant `ec476910`, sandbox)

| Endpoint | Live-documented composition | Verdict | Business code observed |
|---|---|---|---|
| renew-expired-account-token | `ctid.request_time.pwt.merchant_id.request_id` | **ACCEPTED** | `105` Invalid payment credential token (403) |
| get-token-details | `merchant_id.request_time.request_id` — **no ctid/pwt anywhere** | **ACCEPTED** | `09` Data not found (403) |
| remove-token | `merchant_id.ctid.request_time.pwt` — **no request_id** | **ACCEPTED** | `200` code `00` Success (idempotent removal of unknown token) |
| link-account | `merchant_id.request_time.ctid.return_deeplink.callback_url.request_id.token_flag.currency` | **ACCEPTED** | `104` Merchant not enabled token flag (403) |
| purchase/payment-credential | `request_time.merchant_id.tran_id.amount.currency.items.ctid.pwt.first_name.last_name.email.phone.purchase_type.callback_url.custom_fields.return_params.payout.token_flag.shipping_fee` — **no request_id** | **ACCEPTED** | `105` Invalid payment credential token (403) |
| every corresponding SDK legacy order (5 baselines) | `request_time.merchant_id.request_id.…` | **REJECTED** | `01` Wrong Hash on all five |

### 16b. Consequences (behavior contract change — flip the pins consciously)

1. **The gateway tightened CoF hash validation since §9a.** The §9a-era "sandbox-verified" SDK orders now
   return `01 Wrong Hash` on the same sandbox. The live-documented compositions are the current contract;
   the SDK is realigned to them (link-account, link-card, CoF payment, renew, details, remove).
2. **The token trio is UN-GATED**: `allowUnverifiedTokenOperations` now defaults to allowed; setting it
   explicitly to `false` re-blocks (escape hatch). TD-03/Q6 are resolved-by-evidence, not by ABA prose.
3. **Per-endpoint token params replace the shared `TokenParams`**: renew needs `requestId+ctid+pwt`,
   get-token-details needs ONLY `requestId`, remove-token needs `ctid+pwt` (no `request_id`).
4. **`request`/`request_id` binding quirks from §9a are gone**: the binding layer accepted bodies without
   `request` and without `request_id` (token-details, remove-token, CoF payment live-doc probes passed
   binding and reached the business layer). The SDK no longer sends `request`; CoF payment no longer sends
   `request_id` (param kept, deprecated, not sent).
5. **link-card** is realigned to its live-documented composition
   (`merchant_id.request_time.ctid.callback_url.request_id.token_flag.frequency.amount.currency.continue_success_url`,
   with `amount`/`frequency` as empty hash positions) — `return_url`/`return_deeplink` are NOT part of the
   live-documented link-card request and are no longer sent (params deprecated). Not directly probed (the
   endpoint answers in HTML); aligned on family consistency + documented order.
6. `npm run bundle` is FIXED as of 13f817e (duplicate `$ref` under `components.schemas` removed); §15c's
   hand-maintained `payway-openapi/bundled.yaml` can now be regenerated (`dist/openapi.bundled.yaml`).

## 17. Subscription trio "Wrong Hash" root-caused: gateway signs `ctid`; docs omit it; profile not subscription-enabled (2026-09-05)

**Context.** The 2026-09-03 skills audit (T1 blocker) live-reproduced `Wrong Hash`
(code 1, HTTP 403) for `purchase` with the subscription trio
(`ctid` + `token_flag=CITR_FIX` + `frequency`) on every documented
`payment_option`, while the SAME body without the trio succeeds. The gateway's
wrong-hash hint prints the documented 26-field order — which matches
`PURCHASE_HASH_FIELDS` byte-for-byte — yet the hash is rejected. Re-probed and
confirmed live 2026-09-05.

**Method.** `scripts/sandbox-probe-subscription.ts` (new, re-runnable, per-case
filter args) builds the exact SDK body via `checkout.createTransaction()`, then
re-signs it with candidate hash orders and POSTs to `/payments/purchase`.
Classification per §16: wrong-hash codes prove rejection; ANY other business
code proves the hash layer ACCEPTED. Evidence:
`test-output/subscription-hash/probe-2026-09-05T10-35-35-445Z.log` (A–B6) and
`probe-2026-09-05T10-37-53-177Z.log` (C1/C2 disambiguation).

**Findings.**

1. **The live docs' subscription hash order is WRONG: it omits `ctid`.** With
   `ctid` inserted after `items`, the hash layer ACCEPTS (business code
   observed); the documented 26-field order (and 4 other ctid placements:
   before token_flag, after frequency, after merchant_id, body-only) are all
   rejected with code 1. Probe C1/C2 (items present, non-empty) disambiguated
   the position: ctid AFTER items accepted (104), ctid BEFORE items (right
   after amount) rejected. The live composition is the **27-field order**
   `req_time.merchant_id.tran_id.amount.items.ctid.shipping.…
   .skip_success_page.token_flag.frequency` — the same `ctid`-after-`items`
   motif as the §16 payment-credential composition.
2. **The gateway's wrong-hash hint prints the DOC list, not the enforcement
   list** — it shows 26 fields (no ctid) while enforcement includes ctid. Do
   not treat the hint as authoritative; it is a static template.
3. **Merchant profile `ec476910` is NOT subscription-enabled.** With the
   correct (ctid-signed) composition the gateway answers **`104` "Merchant not
   enabled token flag"** (HTTP 403) — the §16 rule in action: past the hash
   layer, business layer refuses. A green end-to-end subscription checkout is
   impossible on this profile until ABA enables subscription/token
   registration. The CODE_HINTS entry for `104` now says so.
4. **Fix shipped:** `ctid` added to `PURCHASE_HASH_FIELDS` after `items` (one
   shared order — for plain purchases `ctid` is absent from the body, hashes as
   `''`, and the HMAC is byte-identical to the 26-field order, so plain
   purchases are unaffected; pinned by tests). The OpenAPI subscription
   operation documents the gateway divergence. Bundled skill scripts
   (`sign-request.cjs`, `checkout-payload.cjs`) realigned to the 27-field
   order in the same change.
5. Probe note: the probe script initially classified numeric codes against a
   string set (`WRONG_HASH_CODES.has(1)` vs `'1'`) and mislabeled verdicts in
   the first run's SUMMARY — the raw codes in the log are authoritative; the
   script now String()s the code before classification.

## 18. First full paid lifecycle end-to-end: QR → ABA simulator → APPROVED → list-visible → partial refund → REFUNDED (2026-09-05)

**Context.** The 2026-09-03 skills audit executed zero money movement; every
prior transaction stayed PENDING. With the user running the ABA Simulator app,
a complete paid lifecycle was executed on merchant `ec476910`.

**Flow.** `generate-qr -a 0.50 -c USD --lifetime 900 -y` → tran
`qrmtoab02ufd0f32` → user scanned + approved in the simulator (~18:13:54
gateway time) → `check-transaction` APPROVED (code 0) within seconds →
partial refund `-a 0.10 -y` accepted (`code 00`) → detail shows
`refund_amount 0.1`, `payment_status REFUNDED` (code 4).

**Confirmations (nothing contradicts existing pins).**

1. **Paid transactions ARE visible in transaction-list** (§14's invisibility
   gap applies to UNPAID QR-only transactions only) — the paid txn appears
   with its APPROVED status. Watch the timezone: gateway `transaction_date`
   is UTC+7; a UTC-derived window misses it.
2. **Partial refund flips the WHOLE payment_status to REFUNDED** in sandbox
   while `refund_amount` (0.10) stays the source of truth for how much was
   returned — confirms the refund skill's "payment_status is a coarse flag"
   guidance.
3. Simulator scan→approve latency ≈ 60–90 s from QR creation; check-transaction
   saw the APPROVED status immediately after approval (<1 s, §7 holds).

## 19. Close-transaction IS enforced customer-side on the QR path — nuancing §7/§12 (2026-09-05)

**Context.** §7/§12 (2026-08-25) pinned: "Close-transaction is advisory in
sandbox — closed-unpaid transactions still pay and stay PENDING; no CLOSED
status exists anywhere." That evidence came from the checkout/card path
(hosted page payments). Today's user-driven simulator test adds the QR path.

**Test.** `generate-qr -a 33.12 USD --lifetime 900` → tran `qrmtoaywyqb13a72`
(created 18:31:49 gateway, expires 18:46:49). `check-transaction` PENDING,
detail PENDING/unpaid. One minute later: `close-transaction -y` → code 00
Success. Detail after close: still PENDING, no CLOSED status,
`transaction_operations` empty — API-side unchanged from §7.

**New fact.** The user then scanned the closed QR in the ABA Simulator
(~18:38, ~8 minutes BEFORE natural lifetime expiry) — the app refused with
**"transaction expired"** and payment could not be completed. Customer-side,
the close IS effective on the QR/KHQR path.

**Consequences.**

1. §7's "closed-unpaid txns still pay" must be scoped to the checkout/card
   path (2026-08-25 evidence). Whether the gateway changed since August or the
   behavior is path-specific is OPEN — re-verify with a checkout-path
   close→pay before relying on either direction.
2. The customer-facing close signal on the QR path is the generic
   "transaction expired" message — indistinguishable from natural lifetime
   expiry at scan time.
3. API-side guidance is unchanged: no CLOSED status exists remotely, so keep
   a local `closed` flag; a PENDING status after close cannot distinguish
   closed-unpaid from still-open.

**Also noted.** `transaction-detail --json` on this unpaid txn shows
`original_currency: "KHR"` (the merchant credential currency) while
`payment_currency: ""` and `payment_amount: 0` — for USD-created QRs the
unpaid detail carries the credential currency in `original_currency`, not the
transaction currency. Cosmetic, but agents parsing `original_currency` on
unpaid transactions should not treat it as the payment currency.

## 20. QR lifecycle retest — §18/§19 confirmed with a second controlled pass (2026-09-05, user-driven)

Two back-to-back QRs (QR-1 `qrmretest01usd` $2.50, QR-2 `qrmretest02usd`
$0.75; both 900 s, created 18:42 gateway): full matrix of 10 expectations met
— evidence: `test-output/qr-lifecycle-retest-2026-09-05.md`. Highlights:

1. **§14 demonstrated within ONE list response:** after payment, QR-1 appears
   (APPROVED) while the closed-unpaid QR-2 — same day, same merchant — stays
   absent. The visibility gap is unpaid-only, not merchant/day-related.
2. **§19 repeatable:** the closed-unpaid QR was scan-refused by the simulator
   with "transaction expired" for the SECOND time (~1 min after close, ~13
   min before natural expiry). QR-path close enforcement is a stable
   behavior, not a one-off.
3. **§18 repeatable:** partial refund ($1.00 of $2.50) → whole status flips
   REFUNDED, `refund_amount 1` authoritative.
4. **Currency quirk resolved (§19 addendum):** unpaid detail's
   `original_currency` carries the merchant CREDENTIAL currency (KHR);
   after payment it reflects the REAL transaction currency (USD). Parse
   `original_currency` only on paid transactions.
5. Simulator scan→approve latency this pass: ~60 s from creation.

## 21. Purchase API campaign — routes × methods × gate negotiation (2026-09-05, evening; agent + user simulator/card session)

Full evidence: `test-output/purchase-test-campaign/` (WAVE5-captures.md, REPORT.md, raw JSON/HTML/PNG). Plan: `.scratch/purchase-api-test-plan/TEST-PLAN.md`. Facts W5-1…W5-12 (report §5). Highlights for the knowledge base:

1. **(W5-1) Purchase KHQRs have a scan-time validity window INDEPENDENT of the record lifetime.** A QR with 1440-min record lifetime was scan-refused "Transaction expired" at age 2h15m while check-transaction read PENDING seconds before; a seconds-old lifetime-10 QR pays. The KHQR payload embeds NO expiry (TLV decode: tags 00/01/30/52/53/54/58/59/60/62/99/63 only) — validity is a server-side lookup. Bounds: pays <2 min, refused at 2h15m; root cause (fixed window vs lifetime-unit mismatch) unresolved — Q-E. A refused scan does NOT mutate gateway state.
2. **(W5-2) Close-endpoint validation is three-way on the purchase channel:** never-created tran_id → code 00 (§W2-3); PENDING unpaid → code 00, no state change; PAID (APPROVED/REFUNDED) → HTTP 403 code 2 "This transaction has already been approved and cannot be cancelled."
3. **(W5-3) The gate-0 response HTML is a Nuxt SSR app** with relative `/_nuxt/*` assets (SRI-hashed) and client-side QR hydration — the QR is NOT in the HTML. Saved standalone (file:// or foreign origin) it renders BLANK; it renders only as the browser's form-POST response. Matches the official docs ("responds with a HTML response that contains the checkout interface, which you must render").
4. **(W5-4) Success payloads differ by media/gate negotiation (H4, stronger than expected):** JSON POST without gate → JSON; browser form POST without gate (KHQR **or cards**) → the same JSON rendered raw in the browser; form POST with `payment_gate: 0` → the hosted interface. The hosted card page is therefore reachable ONLY via gate 0 (H2) — CLI/plain-form "cards" flows are mislabeled bank QRs (H3).
5. **(W5-5) `payment_type` is method-dependent:** KHQR → `"ABA Pay"`; card → scheme name (`"MC"`, `"VISA"`) with `card_source: "ONUS"`. Paid ops differ too: card = [Create Order, Completed]; KHQR = [Completed] only.
6. **(W5-6) `payment_amount`/`payment_currency` report the PAYER's actual debit**, which can differ in currency from the request: 4000 KHR request paid as 1 USD; 1.20 USD request paid as 4800 KHR (`payer_account "*001"`). `original_amount`/`original_currency`/`total_amount` and transaction-list keep the merchant's request. Reconcile on `original_*`, never `payment_amount` alone.
7. **(W5-7) Duplicate `tran_id` on purchase:** JSON path silently accepts N creations (code 00 each) but the resulting KHQRs are UNPAYABLE — scan refuses "Transaction not found" (fresh or expired). A gate-0 form re-POST of a PENDING duplicate renders the hosted page and the payment LANDS with the form's amount ($1.71). Re-POST of a CLOSED id answered code 4 "Duplicated Transaction ID." once, then rendered the page on retry. Never reuse tran_ids.
8. **(W5-8/H7) A CLOSED gate-0 card session still pays:** created → close code 00 at 22:17:26 → paid $1.50 VISA ONUS at 22:22:42. Third lifetime observation (2026-08-25 ×2, purchase channel ×1); close stays scan-enforced ONLY on the KHQR channel (§19/§20).
9. **(W5-9) Simulator scan-refusal messages are generic:** "Transaction expired" covers record-expired, scan-window-exceeded, AND already-paid re-scans; "Transaction not found" is duplicate-ID-only. Apps cannot branch on the message.
10. **(W5-10) Hosted-page post-payment continuation requires `skip_success_page: 0 + continue_success_url`** (redirect observed); a plain `return_url` does NOT move the browser. `return_params` echo: unresolved (no listener).
11. **(W5-11) `generate-checkout` poll timeout exits 0** (human warning only; `--json` prints just the create response) — machine-invisible, contrast generate-qr's exit-3 `{event: aborted}` envelope. DX follow-up. **RESOLVED 2026-09-06 (journal improvement I-1, branch audit/transaction-data-ai-readiness)**: both create commands now map poll outcomes to exit codes and emit the `aborted` NDJSON event under `--json`.
12. **(W5-12) The AbaPayway popup plugin (`checkout2-0.js`) modal renders blank** from a locally-opened (file://) form page — popup flows need an http(s) origin; mechanism live-verified 2026-08-25.
13. CLI poll semantics (H1): `generate-checkout` blocks + polls by default (5 s), exits 0 on APPROVED with a final block; first poll often NOT_FOUND (indexing lag); check latency ~282 ms.

**§21 addenda (same session, post-report sweep):**

14. **(W5-13) `transaction-detail.transaction_date` and the `transaction-list` date column are DIFFERENT events** (both UTC+7): detail carries the **creation** timestamp — it stays fixed even when approval lands much later (w2u12001: transaction_date 22:17:24, approval ~22:40 via the dupprobe form) — while the list column carries the **payment completion** time (matches the `Completed` op timestamp on 4/4 paid samples). Reconciliation windows keyed on the list date window the payment time, not creation. Gateway clock can also precede the client wall clock by 2–28 s.
15. **Scan→approve latency varies** (22 s this pass vs §18's 60–90 s) — poll for ≥2 min, never hard-code.
16. **`generate-checkout` saves NO QR PNG in non-TTY mode**; the human-mode `abapay_deeplink` embeds the URL-encoded qrString (`&qrcode=<payload>`) — extractable and renderable with the `qrcode` package when a scannable PNG is needed. JSON mode carries `qrString` directly.

## 22. Payment-link gateway facts — docs-review probes (2026-09-06, agent session; scripts `scripts/sandbox-probe-payment-link-verify.ts` + `-expired-sweep.ts` + `-after-expiry.ts`)

Evidence: `test-output/payment-link-docs-review/` (verify-probes + expired-sweep + after-expiry JSON, gitignored — lives on disk).

1. **(V-3) `tran_id` is a NUMBER on both payment-link endpoints** (create + detail), contradicting the official docs' `string` declaration — e.g. `178865342966685`. The SDK's `number | string` typing stands; do not rely on the type.
2. **(V-4) No EXPIRED status exists — expiry is advisory**: a link created with `expired_date = now+300s` reads `status: "OPEN"` in detail AFTER expiry, and the hosted `payment_link` page still answers **HTTP 200** (payment acceptance untested — needs an interactive payer; assume refusal and enforce expiry merchant-side, mirroring W4-1 purchase lifetimes).
3. **(V-4) `expired_date` acceptance window**: past values (−3600s) and short-future offsets (+150s) are **rejected at create with PTL04**; **+300s and beyond accepted** (number or string both fine; echo is number at create, **string** in detail). Boundary is somewhere in (150s, 300s].
4. **(V-4) Unset expiry echoes `"0"` (string)** in the detail response — same shape the OpenAPI spec models; `pushback_url` was **absent** from sandbox detail responses despite the official detail schema.
5. **(V-5a) A bogus link id on detail answers HTTP 403 + code `96` "Invalid merchant data"** — the officially documented `PTL132` was NOT reproduced on this profile. Both stay in the docs/12 table with their status noted.
6. **(V-5b/c/d) PTL04 is the catch-all create rejection**: unsupported currency (EUR), omitted currency, and a non-numeric amount ALL answered HTTP 400 `PTL04`. Neither PTL99 (merchant invalid currency) nor PTL05 (parameter invalid format) was reproducible — they may be production-only or superseded shapes.
7. **(V-2, externally blocked) Payout placement remains unverified**: the payout-bearing create is rejected 403 "Payout accounts are not in whitelist", and `beneficiary add 500000001` fails 403 code **32 "Service is not enable"** — this sandbox merchant profile has no payout-whitelist service at all (mirrors the subscription `104` blocker, §17). Response `payout` placement (apidog top-level vs ABA sample inside `data`) needs a payout-enabled profile; the OpenAPI keeps the UNVERIFIED note + oneOf until then.
8. **(V-1, still open) Pushback body**: the documented sample carries no `hash`; verifying a real pushback's field set needs an interactive payment session on a live `return_url` receiver.

**§22 addendum (2026-09-06, later same session — V-1 closed with a real payment):**

9. **(V-1) The payment-link pushback contract is LIVE-CAPTURED** — user paid a $1.50 link through the ABA Mobile Simulator against a trycloudflare receiver (`scripts/sandbox-probe-payment-link-pushback.ts`, evidence `test-output/payment-link-docs-review/pushback-captures.jsonl` + `v1-rig-console.txt`):
   - **NO `hash` field — confirmed live.** Body is exactly `{"tran_id":"178865526240157","status":0,"merchant_ref_no":"plvr-v1-mtp34wx4"}` — `verifyCallback()` does NOT apply; the pushback is a notification, verification is `check-transaction(tran_id)` (which returned APPROVED / amount 1.5 within ~1s of the pushback).
   - `status` is the **numeric `0`** (APPROVED), NOT the `"00"` string the official overview sample shows — receivers must accept both.
   - `tran_id` arrives as a **string** here while create/detail responses carry it numeric-typed — coerce everywhere.
   - Headers: `User-Agent: PayWayApp/3.0`, `Content-Type: application/json; charset=utf-8`, W3C `traceparent`/`elastic-apm-traceparent` tracing headers, source IP `103.108.218.2` (KH).
   - Pushback latency: approval → pushback ≈ instant (captured seconds after the simulator approval); the pushback fired once, no retries observed on a 200 ACK.

10. **(2026-09-13, $89.56 one-payment link, trycloudflare rig re-run — evidence `.scratch/late-night-payment-link/pushbacks.jsonl`)** Two V-1 follow-ups confirmed on a second live payment (same contract byte-for-byte):
   - **The pushback carries NO hash anywhere — body AND headers.** Captured headers are only `User-Agent: PayWayApp/3.0`, `Content-Type: application/json; charset=utf-8`, W3C `traceparent`/`elastic-apm-traceparent`, and CDN hops — no signature header of any kind. If a spec/sample implies "the hash is in the header" for payment-link pushback, it doesn't match live behavior; trust = `check-transaction(tran_id)` only.
   - **Refreshing a FULLY-PAID link's hosted page shows "Payment link is no longer valid — Contact to seller for support."** (customer-facing, after `total_trxn == payment_limit`). This is distinct from the other two dead-page behaviors: expiry keeps the form up (still OPEN/200), and void renders the code-07 invalid-data shell. Detail right after payment still reported `status: "OPEN"` with `total_trxn: 1` / `total_amount: 89.56` — another sighting of the OPEN-vs-paid quirk; branch on totals, not `status`.
   - **The gateway NEVER redirects the customer to `return_url` — it is pushback-only (server-to-server POST).** Live-confirmed on the second $89.56 payment: zero browser requests hit the return URL after approval (the lone GET in the first capture was the user opening the tunnel URL manually). There is also **no `continue_success_url` parameter** on payment-link create (unlike purchase) and no other redirect hook — the full field set is `title, amount, currency, description, payment_limit, return_url (base64), merchant_ref_no, expired_date, payout` (+ optional `image` part). A "thank you / next step" page after paying is impossible via the link API; the customer stays on the hosted page's own completion state. Merchant-side flow must live entirely in the pushback handler.

## 23. Payment-link VOID — undocumented endpoint, live-verified (2026-09-11, agent session; script `scripts/sandbox-probe-payment-link-void.ts`)

User surfaced an **unpublished ABA endpoint**: `POST /api/merchant-portal/merchant-access/payment-link/void` (no official docs page). Probed live against the sandbox; the FULL contract is now mapped. Evidence: `test-output/payment-link-void-probe/` (JSON + pre/post-void hosted-page HTML, gitignored — lives on disk).

1. **(W-V1/W-V2) The endpoint is LIVE and signs exactly like create/detail**: body `{request_time, merchant_id, merchant_auth, hash}`; `merchant_auth` is the RSA-encrypted `{mc_id, id}` (the **same `id` key detail uses** — the create-response `data.id`, NOT the hosted slug and NOT `tran_id`); hash is the default trio HMAC `request_time + merchant_id + merchant_auth` (base64). Success answers HTTP 200 `{status:{code:"00",message:"Success.",…}, tran_id:<log id>}` — `tran_id` arrives **numeric** (number in JSON), plus `lang`/`trace_id` inside `status`.
2. **(W-V3) VOID IS A REAL, DISTINCT STATE — the "no status beyond OPEN/PAID" picture was incomplete**: post-void, `payment-link/detail` reports `status:"VOIDED"` (a NEW status value never before observed on this sandbox) and `updated_at` advances; `total_trxn`/`total_amount` stay 0. The hosted `payment_link` page still answers **HTTP 200** but its SSR `window.__NUXT__` state carries `checkout.page:"invalid-data"` with `status.code "07" "Invalid Data"` (`DPL-` prefixed log id) — i.e. **the customer-facing payment form is dead**; only a boilerplate error shell renders. Unlike expiry (§22 #2, page stays a live form), void **does** kill the customer side.
3. **(W-V4) Double-void answers HTTP 403 code `PTL188` "The payment link is already voided."** — NOT idempotent; treat a PTL188 response as "already in the desired terminal state" rather than an error. New code for the docs/12 table.
4. **(W-V5) A bogus link id answers HTTP 403 code `96` "Invalid merchant data"** — the same shape as detail's bogus id (§22 #5), keeping code 96 the "unknown link id" signal across the family.
5. **(W-V6) Content-Type lenient — both `application/json` and `application/x-www-form-urlencoded` are accepted** (create requires form-urlencoded; void takes either — JSON verified working).
6. **(W-V3 side observation) Pre-void hosted page title carries `"<outlet_name> | $<amount>"`** (`ehanson259 | $1.50`) — the outlet-facing brand on the link form.

**Open items from this probe (deferred, need an interactive payer):**

- Whether a **partially-paid** multi-payment link (`payment_limit > 1`, `total_trxn > 0`) can be voided, or PTL188-like codes guard it (the probe link was unpaid).
- Whether voiding a **PAID** link answers PTL188/another code — likely terminal-state rejection, untested.
- Whether a voided link still fires pushbacks for in-flight payments, and what `payment-link/create` echo of a `void` link id looks like (not applicable — void takes detail `id`, not `tran_id`).

**§23 addendum (2026-09-12, branch `feat/payment-link-void` — contract IMPLEMENTED and re-verified through the shipped surfaces):**

17. **(E1–E6) The implemented SDK + CLI reproduce the full §23 contract live** — `scripts/e2e-payment-link-void.ts` runs `payway.paymentLink.void()` and `payment-link void --json` against the sandbox; all six legs green (success 00 + numeric `tran_id`; detail `VOIDED` + advanced `updated_at`; double-void 403 PTL188 through `PayWayAPIError.paywayCode`; bogus 403 96; CLI `--json` one-doc success exit 0; CLI PTL188 `{error:{kind:'api',exitCode:2,hint}}` envelope exit 2). Evidence: `test-output/payment-link-void-e2e/` (gitignored). Durable facts pinned as a gated test in `src/__tests__/sandbox-contract.test.ts` (§23 describe block; needs `SANDBOX_CONTRACT_TESTS=1` + RSA key). Implementation note: the SDK ships void in `MUTATION_ENDPOINTS` (single-attempt transport) and the CLI prompt is skipped under `--json`/`-y` (agents/CI unaffected).

## 24. Link-card full-cycle review — hosted error contract, hash enforcement refutes §9a, profile token-flag blocker (2026-09-12, agent review session; rig `scripts/sandbox-probe-link-card-cycle.ts`, evidence `test-output/link-card-review/`, review card `.scratch/link-card-review/REVIEW-CARD.md`)

A superpowers-style review + automated full-cycle test of the link-card integration (offline suites 188/188 green + live sandbox e2e: webhook receiver + trycloudflare tunnel + in-app browser card-entry attempt). **The paid cycle is externally blocked**: merchant `ec476910` is NOT enabled for card tokenization. Findings:

1. **(LC-1) Profile blocker — hosted card linking answers code 104.** A properly-signed link-card request (form POST **and** API path, `CITI_FLEX` and `CITO_FLEX`, frequency 1M) reaches the business layer and the gateway redirects the customer to `https://checkout-sandbox.payway.com.kh/add-card/<base64>` where the base64 payload is `{"message":"Merchant not enabled token flag.","status":{"code":"104",…,"pw_tran_id":"<request_id>","trace_id":"…","version":"v3"}}` — the hosted page renders "Unable to process — Merchant not enabled token flag. [Error Code: 104] [Order ID: <request_id>]". Same 104 family as the §17 subscription blocker: ABA must enable the token-flag service on the sandbox profile before pwt capture (and therefore COF charge/renew/callback-contract testing) is possible. Q18 evidence capture is blocked on this.
2. **(LC-2) Hosted error contract: the result travels in the 302 redirect target.** The link-card POST answers **HTTP 302 → `Location: …/add-card/<base64 JSON>`** (success AND error). Node fetch follows the redirect silently, so the SDK's `linkCard()` sees only the final 42 KB static Nuxt shell — the rawBody carries NO error marker (verified: no `pw_tran_id`, no message text). Server-side detection of hosted-page outcomes requires the redirect URL (`fetch redirect:'manual'` or `response.url` after follow) — the probe does exactly this. The 2026-09-01 "real hosted card-entry page" reading (§9a item 5's 42 KB probe) was the shell only; the rendered result was never verified until now.
3. **(LC-3) §9a CORRECTION — the sandbox DOES verify the link-card hash.** Controlled replay of the same signed request: intact urlencoded base64 → 302 → 104 (hash layer passed, business layer reached); the same replay with base64 `+` corrupted into spaces → 302 → `{"code":"01","message":"Wrong Hash."}`; hash field removed → **HTTP 400 JSON** `{"status":{"code":"04","message":"The given data was invalid.","errors":{"hash":["The hash field is required."]}}}`. The 2026-08-27 "sandbox skips hash verification on link-card" observation is refuted as of today; open question 7 ("why does link-card skip hash verification?") is answered by evidence — it doesn't. (Skill note "Sandbox does not verify the hash on this endpoint" and the §9a/Q7 entries are stale — correct them in the next docs/skills wave.)
4. **(LC-4) No callback fires for a failed link attempt.** Two 104 attempts with a live tunneled `callback_url` produced zero deliveries (`webhook list` unchanged) — the COF callback only fires on a completed card link, so a missing callback after an error page is expected, not a lost delivery.
5. **(LC-5) Hosted error page is a dead end for the customer**: the rendered error page's OK button performs no navigation (URL unchanged) and `continue_success_url` is NOT honored on the error path.
6. **(LC-6) Token-lifecycle negative paths, live**: `cof charge` with an unknown pwt → code **105** "Invalid payment credential token" (105-family hint fires); `cof token details` for a request that never linked → code **09** "Data not found"; **`cof token remove` with a NON-EXISTENT token answers `00 Success`** — remove does not verify token existence (idempotent-shaped; use get-token-details/09 to probe existence, never remove).
7. **(LC-7) CLI contract gap hit live**: `cof charge --json` / `cof token details --json` on these gateway failures printed the HUMAN error block to stdout (exit 2), not the `{error:{kind,exitCode,…}}` envelope — the whole `cof` command group's catches call `printApiError` and never `printApiErrorJson` (src/cli.ts:3924, 4015, 4165, 4197, 4224, 4252). Machine-mode consumers must not parse cof `--json` stdout on failure until this is fixed.
