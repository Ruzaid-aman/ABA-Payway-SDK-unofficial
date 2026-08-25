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
