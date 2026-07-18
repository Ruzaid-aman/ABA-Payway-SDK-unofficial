# Sandbox probe findings — 2026-07-16

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
