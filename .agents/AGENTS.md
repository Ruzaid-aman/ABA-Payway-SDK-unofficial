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
- **Callback signing & verification are ONE canonicalization (2026-09-10, webhook workbench)**:
  - `verifyCallbackDetailed` (verify) and `signCallbackBody` (sign) live together in `src/auth.ts` and share the exact sorted-key-concat → HMAC-SHA512 → Base64 canonicalization (`hash` field stripped when `stripHash: true`).
  - Anything that must produce or check a callback signature — webhook fixtures (`buildWebhookFixture`), tests, future tooling — goes through those two functions. Never re-implement the canonicalization elsewhere (D1/D3 anti-checklist; the drift-guard suite pattern exists for a reason).
  - Callback-signing scope: online checkout callbacks ONLY. Payment-link pushbacks (`{tran_id, status: 0, merchant_ref_no}`, no hash) and offline KHQR notifications have no signature contract — verify via check-transaction / reconciliation.
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

## Payment Link pushback & lifecycle (sandbox-verified 2026-09-06, live payment; VOID live-verified 2026-09-11 §23)
- **The pushback to `return_url` carries NO `hash` field** (live-captured through a real simulator payment): body is exactly `{tran_id (string), status (numeric 0 = APPROVED), merchant_ref_no}`; `User-Agent: PayWayApp/3.0`, `Content-Type: application/json; charset=utf-8`. `verifyCallback()` does NOT apply — verification is `check-transaction(tran_id)`. `status` is numeric `0`, NOT the `"00"` string the official overview sample shows — accept both. `tran_id` is a string in the pushback but numeric-typed in create/detail responses — coerce everywhere.
- **No EXPIRED status exists for payment links**: after `expired_date` passes, detail still reports `OPEN` and the hosted page still answers 200 (mirrors W4-1 purchase lifetimes) — enforce expiry merchant-side. Create rejects past/under-~5-min `expired_date` with PTL04 (boundary in (150s, 300s]); unset expiry echoes `"0"` (string) in detail.
- **VOIDED is a real, distinct status (§23, 2026-09-11 — undocumented endpoint `payment-link/void`)**: the void endpoint signs exactly like detail (`merchant_auth {mc_id, id}`, default-trio HMAC; Content-Type lenient). A voided link reads `status:"VOIDED"` in detail with `total_trxn` 0; the hosted page answers 200 but its SSR state carries `page:"invalid-data"` code `07` — the customer form is DEAD, unlike expiry which leaves it up. NOT idempotent: double-void → HTTP 403 PTL188 "The payment link is already voided" (treat as terminal, not error); bogus id → 403 96 (same as detail). Implemented as `paymentLink.void(id)` + CLI `payment-link void -i` (TTy confirm, `-y`/`--json` skip; PTL188 → standard exit-2 envelope); in MUTATION_ENDPOINTS (single-attempt transport). Open: void-on-paid/partially-paid, in-flight pushbacks after void — don't void paid links (refund instead).
- **PTL04 is the catch-all payment-link create rejection**: unsupported currency (EUR), omitted currency, non-numeric amount ALL answer PTL04 (HTTP 400). PTL99/PTL05 are documented but NOT reproducible on this sandbox profile. A bogus detail id answers **HTTP 403 code 96** "Invalid merchant data" — the officially documented PTL132 was NOT reproduced.
- **Response datatype reality**: `tran_id` is a NUMBER on create/detail (official docs say string); response `amount` arrives as a string ("0.03"); official schemas are internally inconsistent (amount string-vs-number, payout top-level-vs-in-data) — the repo OpenAPI pins the observed reality with do-not-rely notes.
- **Payout on payment links is blocked on this sandbox profile**: `beneficiary add` → 403 code 32 "Service is not enable"; payout-bearing create → 403 "Payout accounts are not in whitelist". Same blocker class as the subscription `104` (§17). Filed as ABA question Q19.

## Workflow & State Tracking
- **Always check status first**: Before beginning new work or deciding what to do next, ALWAYS read `HANDOFF.md` in the root of the workspace. This is the source of truth for what has been done and what the current priorities are.
- **Understand the API quirks**: Read `docs/SANDBOX-FINDINGS.md` to understand API behaviors we have verified during our sandbox probes.
- **Close Transaction channel dependence (open escalation)**: `docs/CLOSE-TRANSACTION-FINDINGS.md` documents that closure enforcement is CHANNEL-dependent in sandbox — the KHQR/QR channel refuses closed transactions at scan time (3 observations: 2026-08-25 + 2026-09-05 ×2, "transaction expired"), while two hosted-card sessions accepted payment AFTER a code-00 close (APPROVED). Closure is unqueryable: no CLOSED status in check/detail ever — keep a local `closed` flag. Read the dossier before ANY work involving `closeTransaction`, and re-run its §7 validation checklist when ABA ships a fix.
- **When probing endpoints**: When tasked to probe a sandbox endpoint, write a script in the `scripts/` folder to execute and verify the endpoint exists and validates formatting correctly, similar to prior probes.
- **Update status continuously**: Keep the current-state section of `HANDOFF.md` updated as tasks are completed.
- **Never embed backticks in `git commit -m` under Git Bash**: command substitution eats the enclosed text (a 2026-09-06 commit lost a word). Use `git commit -F <file>` or backtick-free messages.
- **Sub-agent line numbers drift (~40-60 lines observed in cli.ts)**: explorer reports are orientation only — re-derive every file:line from the working tree (grep the symbol) before it lands in a durable doc. Policy: audit-results/transaction-data-audit/REPORT.md §19.
- **commander option collision**: an option defined on ANY ancestor command (e.g. `agent --session`) silently swallows the same flag on descendants — never reuse an ancestor's option name (why `agent ledger recover` uses `--session-id`).
- **Design against instrumentation only after reading its contract**: the journal originally targeted the SDK hooks; code validation showed hooks carry no cid/duration/attempt and onResponse never fires on error paths — hence the first-party emitter inside `_executeFetch` (docs/18).

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
- **Hosted-page continuation needs `continue_success_url` (W5-10)**: plain `return_url` does not move the browser. `generate-checkout` poll timeout was machine-invisible in `--json` (W5-11) — **FIXED 2026-09-06 (improvement I-1)**: generate-qr/generate-checkout now map poll outcomes to exit codes (timeout 3, consecutive errors 2).

## Transaction Journal Facts (2026-09-06 — deep audit + 6-phase implementation, branch audit/transaction-data-ai-readiness)
- **The local journal is the only complete transaction record** (audit verdict: gateway history is incomplete BY DESIGN — no CLOSED/EXPIRED status, unpaid QR-only invisible to lists, callbacks never retried). Recording is OPT-IN: `--journal` (single invocation) or `PAYWAY_JOURNAL=1` + `PAYWAY_JOURNAL_DIR` + `PAYWAY_JOURNAL_MODE=digest|full`, or SDK config `journal: true | {dir, mode}`. Default OFF — the library never writes files silently. File: `<cwd>/payway-data/journal.jsonl`.
- **One join key everywhere**: SDK cid (`payway.lastCorrelationId`) = journal `correlationId` = ledger `correlation` (attachCorrelation, first-write-wins) = artifact sidecar `correlationId`. Webhook records join via record id (callback.received correlationId) + matchedTransactionId. Reuse these keys; never invent new ones.
- **Redaction at write is mandatory**: digest mode allow-lists non-secret transactional fields (no hash/merchant_auth/pwt/QR base64/PII); full mode runs sanitizeForLog with caps. Hook payloads and `--json` output are NOT sanitized — the journal must not repeat that.
- **Query surface**: `journal show|timeline|stats|reconcile|explain|anomalies|prune`; agent tool `query_journal` (read-only, no approval gate, 13-tool catalog); skill `aba-payway-journal`. `agent ledger recover --session-id` lists unfinished creates (lookup only, NEVER replays). Webhook sink persists signatureVerdict/verificationReason/matchedTransactionId/matchedStatus/replay.
- **Honesty rules baked into outputs**: a missing callback is NOT proof of non-payment (PayWay never retries deliveries); PENDING does not mean alive (expired/closed read PENDING forever); the funnel reports the local record only. Keep those caveats in any new journal-derived output.
- **Anomaly heuristics use leave-one-out baselines** (a day vs the mean of the OTHER active days) — never include the spike in its own baseline.
- **Improvement batch shipped 2026-09-06 (I-1..I-8/I-12/I-13)**: poll outcomes to exit codes (I-1); `--json` envelopes carry `correlationId`/`traceId` + `PayWay.lastTraceId` (I-2); duplicate-tran_id advisory, `--allow-duplicate-id` (I-3); `doctor` journal row + 50 MB warning (I-4); `maxAgeDays`/`PAYWAY_JOURNAL_MAX_AGE_DAYS` prune-on-write (I-5); `journal timeline --with-webhooks` (I-6); `setup-webhook --journal` .env upsert (I-7); docs/12 Pattern 3b (I-8); REPL unfinished-creates banner, `PAYWAY_AGENT_NO_RECOVER_HINT` (I-12); `agent ledger prune --before` (I-13). Deferred: profiles encryption, `--json-safe`, SQLite backend (I-9/I-10/I-11). Backlog: `.scratch/transaction-data-journal/IMPROVEMENTS.md`. Learnings: `audit-results/transaction-data-audit/LEARNINGS.md`.

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
| `PAYWAY_JOURNAL` | `1` enables the transaction journal (`<cwd>/payway-data/journal.jsonl`). |
| `PAYWAY_JOURNAL_DIR` | Journal directory override. |
| `PAYWAY_JOURNAL_MODE` | `digest` (default, allow-listed fields) or `full` (sanitizeForLog bodies, capped). |
| `PAYWAY_WEBHOOK_DIR` | Webhook capture store directory for `journal reconcile` (default `<cwd>/webhook_data`). |
| `PAYWAY_JOURNAL_MAX_AGE_DAYS` | Journal retention — prune events older than N days on write (best-effort, fail-open). |
| `PAYWAY_AGENT_NO_RECOVER_HINT` | `1` suppresses the agent REPL banner about unfinished creates in the prior session. |

## Skills Directory
- The packaged `skills/` directory contains 32 focused `aba-payway-*` guides (including journal queries and production webhook fulfillment).
- Several guides bundle dependency-free `.cjs` tools under their `scripts/` folder (KHQR decode/CRC validation, request signing, callback verification, mock callbacks, reconciliation cron, checkout payload builder, status decoder) — each SKILL.md documents its own tools.
- From the repo root, install all of them (including bundled scripts and references) with `npx tsx src/cli.ts skills add <agent>`, where agent is `claude`, `codex`, `opencode`, `cursor`, or `copilot`.
- **Webhook workbench (2026-09-10)**: the first-class `payway-sdk webhook trigger|verify-callback|resend|list` group and `setup-webhook --forward-to <url>` cover the hash skill's `.cjs` verify/mock tools natively (`--json` envelopes, record-store integration). The scripts remain only for checkout installs without the CLI; the skills point to the CLI first. Local loop: `setup-webhook --forward-to <app-url>` + `webhook trigger --event payment.approved` exercises a receiver's full verify/handle path without the ABA Simulator — fixtures are synthetic (the gateway never saw the tran_id; never fulfill on them).
