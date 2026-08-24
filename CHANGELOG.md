# Changelog

## Unreleased

### Added

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

### Changed

- **Deterministic callback override** - `normalizePlan` replaces model-supplied `generate_online_qr` callback URLs with the merchant profile's configured URL; models can no longer inject placeholder webhooks into executed plans.
- **`payment_option` defaults to `abapay_khqr`** in `qr.generateQr` - PayWay's QR API now rejects requests without it (`400 The given data was invalid`).
- **PEM validation on RSA endpoints** - Refund, Pre-Auth, Payout, and Payment Link now throw a descriptive `PayWayConfigError` ("does not look like a public key PEM") before any encryption/network call when `publicKeyPem` is malformed.
- **URL auto-encoding** - `encodeBase64IfNeeded` now also base64-encodes protocol-relative (`//host/path`) and `www.`-prefixed URLs alongside `http(s)://`.
- **Provider error clarity** - inference timeouts now report "provider request timed out after <ms>" instead of the opaque "This operation was aborted"; TTY runs print a remediation hint on `PROVIDER_PROPOSAL_FAILED`.
- **`agent doctor` accuracy** - provider row reports `blocked` when `PAYWAY_AGENT_API_KEY` is unset instead of a false-positive `ok` from the unauthenticated `/models` ping.

### Fixed

- Explicit buffer encoding in `verifyCallbackSignature` timing-safe comparison.
- Removed four stale Biome lint warnings (unused suppressions + unused variable).

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
