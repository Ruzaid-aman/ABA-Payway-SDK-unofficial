# Changelog

## Unreleased

### Added

- **End-to-end live-flow scripts** — `scripts/online-qr-poll.ts` (one online KHQR → save/open PNG → poll 10 min) and `scripts/checkout-link-poll.ts` (Create Transaction API with `paymentGate: 0` → open hosted `checkout_qr_url` → poll 10 min). Registered as tools in the QR, purchase, and check-transaction skills; sandbox-paid and verified 2026-08-25 ($31.11 APPROVED ~37s, $12.12 APPROVED ~32s).
- **Transaction-lifecycle CLI commands** — `check-transaction`, `poll-transaction` (NDJSON event stream; exit 0 terminal / 2 API error / 3 timeout), `transaction-detail`, `transaction-list` (defaults to today, aligned table), `close-transaction -y/--force`, `refund` with pre-flight refundable-balance check via transaction-detail, and `exchange-rate`. All accept `--json`.
- **Standardized CLI exit codes** — `0` success · `1` validation/input · `2` PayWay API failure · `3` network/timeout/rate-limit (`classifyError()`), applied across every command.
- **Terminal QR rendering** — `generate-qr`, `generate-checkout`, and `payment-link create` render scannable half-block QRs in interactive terminals (`--no-show-qr` to opt out).
- **`payway-sdk explain [code]`** — offline decoder for gateway/refund/pre-auth codes with fix hints; backed by new exports `PRE_AUTH_ERROR_CODES` (`PTL59/62/170`) and `GATEWAY_CODE_HINTS`, plus programmatic `explainPayWayCode()` / `explainAll()`.
- **`doctor --live`** — real sandbox round-trip (exchange-rate) after static checks; verdict gates on credential rows only so advisory failures (e.g. framework detection in non-framework repos) never block it.
- **Doctor RSA PEM shape check** — flags truncated multi-line `.env` keys with a targeted fix hint.
- **Shared multi-line `.env` parser** (`src/cli/dotenv.ts`) — quoted values spanning lines fold correctly; used by the CLI entrypoint and doctor.
- **Visual guide** (`docs/VISUAL-GUIDE.md`) — one-page ASCII tour: architecture, setup paths, onboarding journey, payment lifecycle, cheat sheet.
- **Guided onboarding** (`payway-sdk onboard`) - interactive TUI wizard (@clack/prompts) that scans the current setup and walks provider → profile → callback → privacy → verify with live connectivity checks, skip-if-already-done stages, non-TTY JSON output, and opt-in first-run automation (`PAYWAY_ONBOARD_AUTO=1`).
- **OpenCode Zen provider preset** (`opencode`, `https://opencode.ai/zen/v1`) - first-class preset with `x-preview-f-free` as the onboarding default model.
- **Sampling passthrough** on `agent setup`: `--max-tokens`, `--temperature`, `--top-p`, and `--extra-body <json>` (e.g. NVIDIA `chat_template_kwargs`) merged into every chat-completions request.
- **Strict-JSON plan repair round** - when a model's plan fails AgentPlanV1 validation, the provider re-asks once with the exact AJV errors and valid tool names before failing.
- **Transient retry in the provider adapter** - 429/5xx chat-completion responses are retried up to 3 times with backoff; auth errors fail immediately.
- **Tool catalog in the strict-JSON system prompt** - the prompt now enumerates every tool's exact name, parameters, and required fields, derived from the same definitions as native-tools mode.
- **Unified readiness matrix** (`evaluateReadinessDetailed`) - single source powering both `agent doctor` fix-hints (`→` remedy per row) and `onboard` stage routing.
- **Runtime progress visibility** - `ask`/`agent` print per-stage progress (`propose → validate → authorize → execute`) via a new orchestrator `onProgress` hook.
- **`ask --provider-timeout <ms>`** - override the inference provider request timeout so hung providers surface fast.
- **`isValidPublicKeyPem()` export** - structural PEM public-key check for pre-flight validation.
- **`aba-payway-customer-qr` skill (24th skill)** — Merchant Portal Customer Module static QRs ("Printed QR channel"): decoded payload anatomy (PayWay routing tags `62·68`, `99`), callback handling via `merchant_ref`, reconciliation guidance, plus bundled tools `decode-khqr.cjs` (TLV decode + CRC-16 validation) and `qr-manifest.cjs` (batch QR-folder audit to CSV).
- **Skill helper scripts** — six dependency-free `.cjs` tools shipped inside their skills and covered by `src/__tests__/skill-scripts.test.ts`: `verify-callback.cjs`, `sign-request.cjs`, `mock-callback.cjs` (hash/webhooks), `checkout-payload.cjs` (first payment), `decode-status.cjs` (check-transaction), and `reconcile.cjs` (transaction-by-merchant-ref watermark/dedupe fallback job).

### Changed

- **Rate-limit responses are typed and retryable** - the strict caps (e.g. transaction-detail 10/min) are enforced by the sandbox as HTTP 403 with a NUMERIC body `status.code` 429 ("Rate limit exceeded...") and no rate-limit headers; numeric codes now pass error extraction so this maps to `PayWayRateLimitError` instead of an opaque non-retryable `api_error`. Rate-limited retries pace from the SDK's own observed request window (1-10s) rather than blind exponential backoff; verified live end-to-end (SANDBOX-FINDINGS §11).
- **Local throttle transparency** - new optional `onThrottle({ endpoint, waitMs })` hook (plus debug logging) fires when a request is queued by a documented-limit token bucket.
- **`transaction-detail --wait <seconds>`** - retries every 2s while the gateway reports code 6; sandbox-measured detail lag after creation is ~5s vs <1s for check-transaction. The command (and `printApiError`) now print targeted hints for both the lag and the 403+429 cap shape, pointing to check-transaction (600 req/s) as the fast status read.
- **`pollTransactionStatus` tolerates the creation grace period** — a check right after creation can answer HTTP 200 / `status.code 6` ("tran_id not found") for a few seconds; the poller now yields `paymentStatus: 'NOT_FOUND'` without counting it toward `maxConsecutiveErrors`, so legitimate purchase flows are never aborted by propagation delay (sandbox-verified 2026-08-25, see SANDBOX-FINDINGS §10).
- **`payment_gate=0` contract documented** — on the JSON Create Transaction path, gate 0 (+ `hosted_view`) is what makes the response include the hosted `checkout_qr_url`; JSDoc on `CreateTransactionParams.paymentGate`, `GenerateQrParams.lifetime` (seconds, min 3 min), and the OpenAPI types now state this.
- **`generate-checkout` no longer sends `payment_gate: 0`** — sandbox answers that value with an HTTP 200 HTML page instead of JSON.
- **Non-JSON responses are diagnosable** — "Invalid JSON response" errors now include content-type, an HTML-detection hint ("parameter rejected server-side"), and a body snippet.
- **`LinkCardParams.currency`** added (sandbox binding layer requires it; defaults `USD`) and included in the HMAC field list.
- **v3 token-management trio sends the required `request` field** (defaults to `requestId`), satisfying the server binding model.
- **Refund skill/docs** document the pre-flight balance pattern and PTL36.
- **Deterministic callback override** - `normalizePlan` replaces model-supplied `generate_online_qr` callback URLs with the merchant profile's configured URL; models can no longer inject placeholder webhooks into executed plans.
- **`payment_option` defaults to `abapay_khqr`** in `qr.generateQr` - PayWay's QR API now rejects requests without it (`400 The given data was invalid`).
- **PEM validation on RSA endpoints** - Refund, Pre-Auth, Payout, and Payment Link now throw a descriptive `PayWayConfigError` ("does not look like a public key PEM") before any encryption/network call when `publicKeyPem` is malformed.
- **URL auto-encoding** - `encodeBase64IfNeeded` now also base64-encodes protocol-relative (`//host/path`) and `www.`-prefixed URLs alongside `http(s)://`.
- **Provider error clarity** - inference timeouts now report "provider request timed out after <ms>" instead of the opaque "This operation was aborted"; TTY runs print a remediation hint on `PROVIDER_PROPOSAL_FAILED`.
- **`agent doctor` accuracy** - provider row reports `blocked` when `PAYWAY_AGENT_API_KEY` is unset instead of a false-positive `ok` from the unauthenticated `/models` ping.

### Fixed

- Multi-line quoted RSA PEMs in `.env` were truncated to their first line by the CLI's loader, silently breaking every RSA-encrypted endpoint (refund, payment links, pre-auth, payout).
- Explicit buffer encoding in `verifyCallbackSignature` timing-safe comparison.
- Removed four stale Biome lint warnings (unused suppressions + unused variable).

### Documentation

- Corrected the packaged-skill count in `.agents/AGENTS.md` (20 → 24) and documented the bundled `scripts/` tooling there; added the missing `PAYWAY_ENV` row to its environment-variable table.
- Replaced a dangling "Customer Module guide §10" reference in the transaction-by-merchant-ref skill with a direct link to the [aba-payway-customer-qr](skills/aba-payway-customer-qr/SKILL.md) skill.
- Added discovery pointers for the new skill and its offline helper scripts to `docs/README.md` Quick Links and the `docs/VISUAL-GUIDE.md` cheat sheet.
- Cross-linked online / offline / customer-module QR skills so the static-but-routable distinction is discoverable from each.
- **Environment-variable alignment (code is source of truth — the SDK reads `PAYWAY_RSA_PUBLIC_KEY` and `PAYWAY_ENV`, per `src/client.ts`)**: replaced incorrect `PAYWAY_PUBLIC_KEY_PEM` / `PAYWAY_PUBLIC_KEY` / `PAYWAY_ENVIRONMENT` references across `README.md`, `CONTRIBUTING.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `docs/RELEASE_CHECKLIST.md`, and Chapters 02, 12, and 14; corrected a false claim that both public-key variable names are accepted.
- Added missing CLI commands to the README command table (`generate-checkout`, `payment-link create/detail`, `setup-webhook`, `config`) and fixed table cells that contained double-backslash pipe escapes.
- Updated "15-chapter guide" references to **16 chapters** (`README.md`, `docs/PROJECT_STATUS.md`).
- Synced `docs/PROJECT_STATUS.md` with repository reality: milestone C/E/F "uncommitted" markers corrected to their landing commits (`df04deb`, `bc4efb7`), commit history extended through `808dc80`, and a documentation-audit session entry added.
- Added `PAYWAY_ENV` to the configuration skill's environment-variable list (`skills/aba-payway-sdk-configuration/SKILL.md`).

### Known open item

- v3 token-management endpoints (`renew-expired-account-token`, `get-token-details`, `remove-token`) reject all derivable HMAC compositions (~60 tried; SANDBOX-FINDINGS §9a) — awaiting ABA's official signature spec. Requests now pass the binding layer but fail at the hash layer.

## 1.3.0

### Added

- **Webhook CLI command** (`payway-sdk setup-webhook`) — starts a local HTTP server that receives, logs, and persists ABA PayWay payment callbacks. Supports JSONL file storage (zero deps), optional SQLite storage (via `better-sqlite3`), and optional Cloudflare Tunnel integration for public URL exposure.
- **Webhook HTTP server** (`src/webhook/server.ts`) — `POST /aba-payway-webhook` endpoint that acknowledges callbacks with `200 {"acknowledged": true}` and logs HMAC-SHA512 signature verification without rejecting.
- **Cloudflare Tunnel manager** (`src/webhook/tunnel.ts`) — spawns `cloudflared tunnel --url` as a subprocess, parses the generated `trycloudflare.com` URL, and manages the tunnel lifecycle.
- **Storage adapters** — `WebhookStorage` interface with JSONL (`src/webhook/storage-json.ts`) and SQLite (`src/webhook/storage-sqlite.ts`) implementations, plus auto-detection factory.
- **`PayWayWebhookError`** error class for webhook-specific failures.
- **24 new Vitest tests** across 4 test files covering storage, server, tunnel, and CLI integration.
- **Webhook Setup Guide** (`docs/16-webhook-setup-guide.md`) — comprehensive guide covering command options, storage backends, Cloudflare Tunnel setup, programmatic usage, and security checklist.

## 1.1.1

### Added

- QR template generation test script (`scripts/test-all-qr-templates.ts`) — generates QR codes for all 10 PayWay sandbox templates at a configurable amount and saves PNG images + QR strings to disk.
- Transaction status check script (`scripts/check-qr-transactions.ts`) — fetches recent transactions via `getTransactionList`, queries detail for each via `getTransactionDetail`, and saves structured JSON results.
- End-to-end QR template verification: all 10 templates generate valid QR codes, all 10 paid transactions verified as APPROVED.
- Sandbox findings documented: QR API template constraints, transaction list/detail response shapes, rate limits, and status filter parameter format.

### Fixed

- `validateTransactionId()` now enforces PayWay's 20-character limit and `[a-zA-Z0-9\-]` character set, matching the actual API constraint discovered during sandbox testing.
- `status` filter in `getTransactionList` — documented that it requires string enum values (e.g. `"APPROVED"`), not numeric codes.
- Rebuilt the packaged CLI with `generate-checkout`; it now invokes the Checkout API through a static `PayWay` import instead of shipping an outdated command list.

### Documentation

- Added `generate-checkout` CLI setup and usage guidance, including its `payment_gate: 0` response fields and the distinction between Checkout return URLs and configured callbacks.

### Changed

- Updated `docs/SANDBOX-FINDINGS.md` with QR template generation and transaction status verification findings.
- Updated `docs/PROJECT_STATUS.md` with QR template verification milestone.

## 1.0.0

### Added

- Added SDK retry support with `maxRetries`, `retryDelayMs`, `onRequest`, and `onResponse` hooks.
- Added centralized request execution with `_executeFetch()` and exponential backoff.
- Added offline KHQR generation via `payway.khqr.generateOfflineQR()`.
- Added full OpenAPI response typing for checkout, credential-on-file, QR, refund, payout, payment link, and pre-auth methods.
- Added RSA roundtrip validation and exact HMAC hashing tests.

### Fixed

- Hardened `PayWayAPIError` with safe `toJSON()` serialization, endpoint context, and retryability metadata.
- Improved retry handling for transient HTTP 5xx responses while preserving 4xx/200-business errors.

### Changed

- Bumped package version to `1.0.0`.
