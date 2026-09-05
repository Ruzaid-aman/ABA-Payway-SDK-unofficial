# Project Rules & Learned Knowledge: PayWay SDK

## Domain Separation
- **Offline/Onsite KHQR Generation**:
  - Uses EMVCo Tag-Length-Value (TLV) encoding.
  - Checksum calculation uses **CRC-16 CCITT** (polynomial `0x1021`, initial `0xFFFF`).
  - Does NOT make any network/API requests to PayWay.
- **Online/API Calls**:
  - Uses standard REST APIs (e.g. `/api/payment-gateway/v1/payments/generate-qr` or `/payment-link/create`).
  - Signatures are generated using **HMAC-SHA512** (raw digest base64-encoded) on concatenated strings of parameters.
  - DO NOT mix up or merge the encryption/checksum logic of offline QR (CRC-16) with online API calls (HMAC-SHA512).

## Cryptographic Standards
- **HMAC-SHA512**:
  - Key: API Key.
  - Format: Raw binary digest, then base64 encoded.
- **RSA Public Key Encryption**:
  - Key: 1024-bit PEM public key.
  - Padding: `RSA_PKCS1_PADDING`.
  - Block size: 117 bytes.
  - Formatting: Plaintext is JSON-stringified, encrypted in chunks, and then concatenated as raw buffers before base64-encoding the entire concatenated buffer.
  - *Warning*: Do not base64-encode individual chunks inside the loop (as done in some boilerplate JS files); this is a known boilerplate quirk. The PayWay production system expects standard PHP-equivalent chunk concatenation before base64 encoding.

## Request Formatting
- **Form Content-Types**:
  - Some APIs (such as Payment Link Create/Detail, Refund, Pre-auth) expect forms (`multipart/form-data` or `application/x-www-form-urlencoded`) rather than JSON.
  - The SDK must support encoding payloads into forms when making requests to these specific endpoints.
- **`link-card` is form-urlencoded ONLY and ALWAYS answers HTML (2026-09-01, live-verified)**:
  - Sending JSON to `/api/payment-credential/v3/cof/link-card` is rejected without being read; the response is the gateway's hosted card-entry page on BOTH success and error.
  - Because a plain browser `<form method="POST">` submission IS `application/x-www-form-urlencoded`, the natural integration is a locally-signed HTML form (the `checkout-form` pattern): `credentialsOnFile.getLinkCardFormHtml()` / `payway-sdk cof link-card-form` build hidden fields + the §16 HMAC locally — byte-identical to `linkCard()`'s wire body — no server roundtrip needed. Live probe: the form's fields POST as a browser → HTTP 200 + the real hosted "PayWay - Checkout" page (`test-output/link-card-form-live-probe-2026-09-01.json`).
  - On the API path, the hosted page surfaces as `PayWayBusinessError` with the page preserved in `rawBody` (string) — that page IS the success artifact, not a failure. The CLI `cof link-card` saves it to `payway-output/link-card-<request-id>.html` and exits 0.
  - The resulting `pwt` token NEVER appears in the response — it arrives only via the `callback_url` sent with the request.
  - HTML-attribute escaping for all form builders goes through the shared `escapeHtmlAttribute()` in `src/utils.ts` — never re-implement it locally.

## Workflow & State Tracking
- **Always check status first**: Before beginning new work or deciding what to do next, ALWAYS read `PROJECT_STATUS.md` in the root of the workspace. This is the source of truth for what has been done and what the current priorities are.
- **Understand the API quirks**: Read `SANDBOX-FINDINGS.md` to understand API behaviors we have verified during our sandbox probes.
- **Close Transaction channel dependence (open escalation)**: `docs/CLOSE-TRANSACTION-FINDINGS.md` documents that closure enforcement is CHANNEL-dependent in sandbox — the KHQR/QR channel refuses closed transactions at scan time (3 observations: 2026-08-25 + 2026-09-05 ×2, "transaction expired"), while two hosted-card sessions accepted payment AFTER a code-00 close (APPROVED). Closure is unqueryable: no CLOSED status in check/detail ever — keep a local `closed` flag. Read the dossier before ANY work involving `closeTransaction`, and re-run its §7 validation checklist when ABA ships a fix.
- **When probing endpoints**: When tasked to probe a sandbox endpoint, write a script in the `scripts/` folder to execute and verify the endpoint exists and validates formatting correctly, similar to prior probes.
- **Update status continuously**: Keep `PROJECT_STATUS.md` updated as tasks are completed.

## Sandbox Channel & Status Facts (2026-09-05, user-driven simulator campaigns — SANDBOX-FINDINGS §17–§20)
- **Purchase hash signs `ctid` after `items` (live 27-field order, §17)**: the live docs' subscription operation omits ctid and is gateway-rejected with Wrong Hash; `PURCHASE_HASH_FIELDS` carries the verified order. The gateway's wrong-hash hint prints the DOC list, not the enforced one — never treat the hint as authoritative.
- **Subscription registrations need a subscription-enabled profile**: with the correct hash the trio passes the hash layer and answers `104` "Merchant not enabled token flag"; the sandbox profile is NOT enabled (external blocker — see `.scratch/skills-audit/ABA-QUESTIONS-2026-09-05.md`).
- **Transaction-list/detail timestamps are UTC+7 (gateway clock)**: a UTC- or local-derived `--from/--to` window silently returns 0 rows (no error). Omit the dates for the full gateway day, or convert.
- **List visibility is unpaid-QR-only asymmetric (§14/§20)**: paid transactions ARE list-visible; unpaid QR-only ones never appear (check-transaction/detail see them); unpaid checkout-path transactions DO appear.
- **`payment_status` is a coarse flag after refunds**: a PARTIAL refund flips status to REFUNDED while `refund_amount` stays the authoritative returned-total. Parse `original_currency` only on PAID transactions — unpaid detail reports the merchant credential currency (KHR) regardless of transaction currency.
- **Simulator latency**: scan→approve ≈60–90 s from QR creation; check-transaction sees APPROVED <1 s after approval; detail lags creation ~5 s.

## Purchase API Campaign Facts (2026-09-05 evening — SANDBOX-FINDINGS §21, W5-1…W5-13)
- **Scan-validity ≠ record lifetime (W5-1)**: purchase KHQRs have a server-side scan-time window (payload embeds no expiry); a record-PENDING QR with hours of lifetime left was scan-refused at 2h15m. Scan promptly; create scan targets immediately before user steps. Check-transaction PENDING does NOT prove scannability.
- **The hosted checkout page renders ONLY as a browser form-POST response (W5-3/W5-4)**: the gate-0 HTML is a Nuxt app with relative `/_nuxt/*` assets and client-side QR hydration — saved standalone it is blank. Use `getCheckoutFormHtml()` (add `paymentGate: 0` for the hosted view); gate-less form POSTs answer raw JSON in the browser. Popup plugin (`checkout2-0.js`) needs an http(s) origin — blank modal from file:// (W5-12).
- **`payment_type` and ops differ by method (W5-5)**: KHQR → `"ABA Pay"` + ops `[Completed]`; card → scheme (`MC`/`VISA`) + `card_source ONUS` + ops `[Create Order, Completed]`.
- **`payment_amount`/`payment_currency` = the PAYER's actual debit (W5-6)**: may differ in currency from the request (4000 KHR → 1 USD; 1.20 USD → 4800 KHR). Reconcile on `original_*`/`total_amount`; list shows the request.
- **Duplicate `tran_id` (W5-7)**: silently accepted on the JSON path but resulting QRs scan-refuse "Transaction not found"; hosted-page re-POST of a PENDING dup renders and pays the FORM's amount; CLOSED-id re-POST → code 4 once, then page. Never reuse tran_ids.
- **Close validation is three-way (W5-2/W5-8)**: never-created → code 00; PENDING → code 00 no-op; paid → 403 code 2. Closed gate-0 CARD sessions still pay (H7 ×3); close is scan-enforced only on the KHQR channel.
- **Scan-refusal messages are generic (W5-9)**: "Transaction expired" covers expired, window-exceeded, and already-paid; "Transaction not found" = duplicate IDs only.
- **Dates are different events (W5-13)**: detail `transaction_date` = creation (fixed); list date = payment completion. Both UTC+7; gateway clock can trail the client wall clock by seconds.
- **Hosted-page continuation needs `continue_success_url` (W5-10)**: plain `return_url` does not move the browser. `generate-checkout` poll timeout exits 0 and is machine-invisible in `--json` (W5-11 — follow-up).

## SDK Usage Examples
- Prefer the facade for a complete merchant flow: `const session = await sdk.initiate(payload, config);` followed by `await sdk.handle(session, { target: '#payway-container' });`.
- Use `new PayWay()` for domain APIs when `PAYWAY_MERCHANT_ID` and `PAYWAY_API_KEY` are configured in the environment.
- Keep all SDK calls and credentials on the server. Browser code must receive only the data required to render or redirect payment experiences.

## Error Handling Matrix
| Error | Meaning | Retry guidance |
|---|---|---|
| `PayWayConfigError` | Missing or invalid local configuration/input | Correct configuration; do not retry unchanged. |
| `PayWayBusinessError` | PayWay rejected a valid transport request | Resolve the business condition; do not retry blindly. |
| `PayWayNetworkError` | Network failure or request timeout | Retry is supported by configured retry policy. |
| `PayWayRateLimitError` | PayWay returned HTTP 429 | Honor retry delay and reduce request rate. |
| `PayWayAPIError` | Other HTTP/API failure | Retry only when `retryable` is true. |
| `PayWaySignatureError` | Signature-related verification failure | Reject the untrusted callback. |

## Environment Variables
| Variable | Purpose |
|---|---|
| `PAYWAY_MERCHANT_ID` | Required merchant identifier when not passed to `PayWay`. |
| `PAYWAY_API_KEY` | Required signing key when not passed to `PayWay`. |
| `PAYWAY_RSA_PUBLIC_KEY` | RSA public key for encrypted endpoints. |
| `PAYWAY_BASE_URL` | Optional API base URL override. |
| `PAYWAY_ENV` | Named environment override (`sandbox` or `production`). Takes precedence over `PAYWAY_SANDBOX`. |
| `PAYWAY_SANDBOX` | `true` selects sandbox; `false` selects production. |
| `PAYWAY_TIMEOUT` | Optional request timeout in milliseconds. |
| `DEBUG_PAYWAY` | `true` or `1` enables sanitized diagnostic logging. |

## Skills Directory
- The packaged `skills/` directory contains 29 focused `aba-payway-*` guides.
- Several guides bundle dependency-free `.cjs` tools under their `scripts/` folder (KHQR decode/CRC validation, request signing, callback verification, mock callbacks, reconciliation cron, checkout payload builder, status decoder) — each SKILL.md documents its own tools.
- Install all of them (including bundled scripts) with `npx payway-sdk skills add <agent>`, where agent is `claude`, `codex`, `opencode`, `cursor`, or `copilot`.

