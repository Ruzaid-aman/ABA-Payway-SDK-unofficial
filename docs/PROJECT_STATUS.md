# PayWay SDK — Project Status

> Last updated: 2026-08-24

> **Agentic CLI is functional** (built on commit `adede4a`). The agentic PayWay CLI — provider modes, 11 tools, risk gates, execution ledger, sessions, and secret redaction — plus this session's **guided `onboard` wizard** and **runtime/provider UX hardening** are present in the working tree. Verification gate is green: **670 Vitest tests pass (42 files)**, Biome lint clean (0 warnings), `tsc --noEmit` clean, build clean.

> **Milestone D committed** as `341923d` (guided `onboard` wizard, readiness matrix, runtime/provider UX). The working tree now holds the follow-up gap-hardening fixes (lint cleanups + deferred low-severity SDK issues), not yet committed.

---

## ✅ Completed Work

### Phase 1 — Spec & Foundation (DONE)

- **OpenAPI 3.1 spec** — 7 path files, shared + per-domain schemas, 3 auth mechanisms, webhooks
- **SDK source** — all 7 domains wired: `checkout`, `credentialsOnFile`, `qr`, `khqr`, `paymentLink`, `preAuth`, `payout`
- **Crypto layer** — `generateHmac` (base64/hex), `encryptMerchantAuth` (RSA PKCS1, 117-byte chunks), `verifyCallbackSignature` (timing-safe)
- **Build output** — ESM + CJS + `.d.ts` + sourcemaps via `tsup`
- **Toolchain** — `tsup`, `biome`, `vitest`, `@redocly/cli`, `openapi-typescript`

### Phase 2 — Sandbox Verification (DONE)

All 7 API domains probed against `checkout-sandbox.payway.com.kh`:

| Domain | Result |
|---|---|
| Ecommerce Checkout | ✅ HMAC string-concat confirmed. `-2` paths are distinct API versions. |
| Credentials-on-File | ✅ All 6 endpoints verified. `pwt` field, `ctid` mandatory, `link-card` requires urlencoded + `frequency`. |
| Payment Link | ✅ `create` and `detail` verified with urlencoded format. |
| QR API | ✅ JSON request, HMAC field order, live QR response format verified. |
| Pre-auth | ✅ JSON/RSA merchant_auth, endpoint-specific HMAC ordering verified. |
| Payout / Beneficiaries | ✅ RSA-encrypted beneficiaries, hex HMAC, beneficiary account ops verified. |
| KHQR | ⚠️ Sandbox returns 404 — unavailable in this sandbox profile. |

### Phase 2.5 — Test Suite (DONE)

- **129 tests passing** across 4 test files
- `auth.test.ts`, `utils.test.ts`, `client.test.ts`, `merchant-scenario-coverage.test.ts`

### QR Template Verification & Transaction Status Check (DONE)

- **All 10 sandbox QR templates** generate valid QR codes at $5.00 USD
- **All 10 paid transactions** verified APPROVED via `getTransactionList` + `getTransactionDetail`
- Discovered and documented: `tran_id` ≤ 20 chars (now enforced in SDK), list API uses `transaction_id` field, detail response wraps under `.data`, rate limit of 10 req/min on detail endpoint
- Scripts: `scripts/test-all-qr-templates.ts`, `scripts/check-qr-transactions.ts`
- Results saved to `test-logs/qr-images/` (10 PNGs, 10 QR strings, manifest.json, transaction-results.json)

### SDK Hardening: `validateTransactionId` (DONE)

- Enforces 20-character max and `[a-zA-Z0-9\-]` character set
- Catches invalid transaction IDs before API calls (rather than relying on HTTP 400 responses)- 4 new unit tests added covering: valid IDs, empty/missing, > 20 chars, invalid charset
### Documentation & Reference App (DONE)

- **15-chapter integration guide** in `docs/`, covering setup through deployment
- **Merchant scenario coverage docs** — 28 attested scenarios, coverage audit report, and `superpowers/` implementation plans
- **QR-POS reference app** at `payway-boilerplate/merchant-qr-pos/` — full Next.js consumer demo with Express backend, SQLite store, and Vitest tests
- **Cloudflare Workers webhook archiver guide** — `docs/cloudflare-free-webhook.md`

### Phase 2.5 — Code Review (DONE)

- Full code review completed 2026-07-16
- **1 critical bug found** (see Task 1 below)
- 3 high, 8 medium, 12 low severity items catalogued

### Popup Modal Example (DONE)

- Created [`docs/examples/web/checkout-popup.html`](./docs/examples/web/checkout-popup.html) — complete runnable implementation of the PayWay popup checkout flow
- Updated [`docs/03-web-implementation.md`](./docs/03-web-implementation.md) — added "Option B: Popup Modal" section with code example and architecture notes
- Updated [`docs/README.md`](./docs/README.md) — added popup example to the "Runnable Examples" table
- **Three critical requirements verified in the example:**
  1. `viewType: 'popup'` is passed to the backend for checkout initiation
  2. Form `target="aba_webservice"` is set on the hidden form
  3. `checkout2-0.js` and `AbaPayway.checkout()` are used to open the popup
- Architecture clearly documented: **Backend** handles all hash calculations and crypto; **Frontend** only handles payment initiation and HTML response rendering

---

## 🚧 Remaining Work — Sequenced Task Breakdown

### Milestone A: MVP Release `v0.1.0` (Target: ~1 day)

> Goal: A working, publishable SDK that merchants can `npm install` and start collecting payments via checkout.

Tasks must be completed **in this order**:

#### Task 1 — Fix Critical Bug: `cancel_url` Encoding ⬅️ START HERE

- **What**: `checkout.createTransaction` base64-encoded `return_url` but sent `cancel_url` raw, producing inconsistent HMAC signatures.
- **Files**: `src/client.ts`, `src/utils.ts`, `src/__tests__/client.test.ts`, `src/__tests__/utils.test.ts`
- **Actions**:
  - [x] Apply `encodeBase64IfNeeded` to `cancel_url`, `continue_success_url`, and `return_params`
  - [x] Add runtime validation helpers (`validateCurrency`, `validatePositiveAmount`, `validateTransactionId`, `validateBeneficiaries`)
  - [x] Wire validation into `createTransaction` and `payout`
  - [x] Add unit tests for encoding and validation
  - [x] Run tests — confirm all pass
- **Status**: 🟢 Completed

#### Task 2 — Fix Error Class `instanceof` Safety

- **What**: Add `Object.setPrototypeOf` to all 3 error classes so `instanceof` works reliably across compilation targets.
- **Files**: `src/errors.ts`
- **Actions**:
  - [x] Add `Object.setPrototypeOf(this, ClassName.prototype)` to each constructor
  - [x] Run tests — confirm all pass
- **Status**: 🟢 Completed

#### Task 3 — Fix `package.json` Metadata

- **What**: Set correct version, add required npm fields.
- **Files**: `package.json`
- **Actions**:
  - [x] Change `version` from `"1.0.0"` to `"0.1.0"`
  - [x] Add `"engines": { "node": ">=18.0.0" }`
  - [x] Add `"license": "MIT"` (or appropriate license)
  - [x] Add `"repository"` field (placeholder — replace with real org before publish)
  - [x] Add `"keywords": ["payway", "aba", "payment", "cambodia", "khqr"]`
- **Status**: 🟢 Completed

#### Task 4 — Verify Publish Safety

- **What**: Ensure no credentials, internal docs, or source leak into the npm package.
- **Files**: `.npmignore`, `package.json`
- **Actions**:
  - [x] Add `*.md` exclusion to `.npmignore` (except README.md which npm always includes)
  - [x] Add `PaywAySandboxkey.txt` exclusion
  - [x] Add `New folder/` exclusion
  - [x] Run `npm pack --dry-run` and verify only `dist/`, `README.md`, `package.json` are included
- **Status**: 🟢 Completed

#### Task 5 — Add JSDoc to Public API

- **What**: Add JSDoc comments to every public method in `client.ts` so merchants get IDE tooltips.
- **Files**: `src/client.ts`
- **Actions**:
  - [x] Add JSDoc to `PayWay` constructor
  - [x] Add JSDoc to `verifyCallback`
  - [x] Add JSDoc to all `checkout.*` methods (6 methods)
  - [x] Add JSDoc to all `credentialsOnFile.*` methods (6 methods)
  - [x] Add JSDoc to `qr.generateQr`
  - [x] Add JSDoc to `paymentLink.*` methods (2 methods)
  - [x] Add JSDoc to `preAuth.*` methods (3 methods)
  - [x] Add JSDoc to `payout.*` methods (3 methods)
  - [x] Add JSDoc to `khqr.getTransactionsByMerchantRef`
  - [x] Rebuild (`npm run build`) to verify JSDoc appears in `.d.ts` output
- **Status**: 🟢 Completed

#### Task 6 — Update README for All 7 Domains

- **What**: Current README only shows checkout + webhook. Add usage examples for CoF, QR, Payment Link, Pre-auth, Payout.
- **Files**: `README.md`
- **Actions**:
  - [x] Add "Available APIs" section listing all 7 domains
  - [x] Add QR API usage example
  - [x] Add Credentials-on-File usage example
  - [x] Add Payment Link usage example
  - [x] Add Pre-auth usage example
  - [x] Add Payout usage example
  - [x] Add "Error Handling" section showing `PayWayAPIError` usage
  - [x] Add `npm test` to Development section
  - [x] Verify all code examples compile
- **Status**: 🟢 Completed

#### Task 7 — Final Build & Smoke Test

- **What**: Clean build, full test run, manual smoke test of the npm package.
- **Actions**:
  - [x] Run `npm run lint`
  - [x] Run `npm run typecheck`
  - [x] Run `npm test` — all pass
  - [x] Run `npm run build` — clean output
  - [x] Run `npm pack` — inspect tarball contents
  - [x] Create a scratch consumer project, `npm install ./aba-payway-ts-0.1.0.tgz`, verify imports work
- **Status**: 🟢 Completed

**🎯 After Task 7: Tag `v0.1.0` and publish / deliver to pilot merchants.** (Milestone A Completed)

---

### Milestone B: Production-Hardened Release `v1.0.0` (Target: ~3-5 days after Milestone A)

> Goal: A battle-tested SDK with retry logic, typed responses, and KHQR offline QR. Ready for production traffic at scale.

#### Task 8 — DRY Refactor: Extract Shared Fetch Logic

- **What**: `request()` and `requestWithMerchantAuth()` duplicate timeout setup, fetch, response parsing, and error handling. Extract into a private `_executeFetch()`.
- **Files**: `src/client.ts`
- **Actions**:
  - [x] Create `_executeFetch(url, headers, body, timeoutMs)` private method
  - [x] Refactor `request()` to use `_executeFetch()`
  - [x] Refactor `requestWithMerchantAuth()` to use `_executeFetch()`
  - [x] Run tests — all must still pass
- **Status**: 🟢 Completed

#### Task 9 — Add Retry Logic for Transient Failures

- **What**: Add configurable exponential backoff retry for 5xx and network errors. Never retry 4xx.
- **Files**: `src/client.ts`, `src/__tests__/client.test.ts`
- **Actions**:
  - [x] Add `maxRetries` (default: 0) and `retryDelayMs` (default: 1000) to `PayWayConfig`
  - [x] Implement retry loop in `_executeFetch()` with exponential backoff
  - [x] Only retry on: HTTP 5xx, network errors (ECONNRESET, ETIMEDOUT), AbortError
  - [x] Never retry on: HTTP 4xx, `PayWayAPIError` from 200-wrapped responses
  - [x] Add tests for retry behavior (mock 503 then 200, verify retry count)
  - [x] Add test that 4xx errors are NOT retried
- **Status**: 🟢 Completed

#### Task 10 — Enrich Error Context

- **What**: `PayWayAPIError` should always carry `statusCode`, and add `endpoint` field. Add `toJSON()`.
- **Files**: `src/errors.ts`, `src/client.ts`, `src/__tests__/client.test.ts`
- **Actions**:
  - [x] Add `endpoint` field to `PayWayAPIError`
  - [x] Pass endpoint path to error constructors in `request()` and `requestWithMerchantAuth()`
  - [x] For 200-wrapped errors, set `statusCode: 200` explicitly
  - [x] Add `toJSON()` method to `PayWayAPIError` for structured logging
  - [x] Fix `paywayCode` type: change from `string | number` to `string` (runtime is always string)
  - [x] Add tests for enriched error fields
- **Status**: 🟢 Completed

#### Task 11 — Add Optional Logging Hooks

- **What**: Allow merchants to hook into request/response lifecycle for debugging and monitoring.
- **Files**: `src/client.ts`, `src/index.ts`
- **Actions**:
  - [x] Add `onRequest?: (endpoint, body) => void` to `PayWayConfig`
  - [x] Add `onResponse?: (endpoint, status, body) => void` to `PayWayConfig`
  - [x] Call hooks in `_executeFetch()` (non-throwing, wrapped in try-catch)
  - [x] Export config types from `index.ts`
  - [x] Add tests verifying hooks are called
- **Status**: 🟢 Completed

#### Task 12 — Wire Generated Types to API Responses

- **What**: Replace `Promise<any>` return types with actual response types from `types.ts`.
- **Files**: `src/client.ts`, `src/types.ts`
- **Actions**:
  - [x] Map each domain method's `TResponse` generic to the corresponding OpenAPI type
  - [x] Verify IntelliSense works for response properties
  - [x] Run `npm run typecheck` — must pass
- **Status**: 🟢 Completed

#### Task 13 — Strengthen Test Suite

- **What**: Add tests for gaps found in code review.
- **Files**: `src/__tests__/auth.test.ts`, `src/__tests__/client.test.ts`
- **Actions**:
  - [x] Add RSA round-trip test (encrypt then decrypt with private key, verify plaintext matches)
  - [x] Add RSA boundary tests (exactly 117 bytes, 118 bytes, 234 bytes)
  - [x] Add RSA boundary at **235 bytes** (currently only 117/118/234 covered)
  - [x] Add test computing expected HMAC value for `createTransaction` and comparing
  - [x] Add test for `getTransactionDetail` (currently zero coverage)
  - [x] Add test for `payout.payout` with `custom_fields` object
  - [x] Add explicit test for empty/null response body (mocks exist but assertion coverage unconfirmed)
  - [x] Run tests — all must pass
- **Status**: 🟢 Completed

#### Task 14 — KHQR Offline QR Generation

- **What**: Implement on-premises offline QR code generation using a custom TLV encoding + CRC-16 CCITT. This is a self-contained module with NO API calls. **Note:** This is *not* an official Bakong KHQR code; it is provided as a merchant-scannable offline fallback.
- **Files**: `src/khqr-offline.ts` (NEW), `src/__tests__/khqr-offline.test.ts` (NEW), `src/client.ts`, `src/index.ts`
- **Actions**:
  - [x] Implement TLV encoder (Tag-Length-Value format)
  - [x] Implement CRC-16 CCITT checksum (polynomial `0x1021`, initial `0xFFFF`)
  - [x] Expose `khqr.generateOfflineQR(params)` method on the PayWay class
  - [x] Add unit tests with known test vectors
  - [x] Export types from `index.ts`
- **Status**: 🟢 Completed

#### Task 15 — CHANGELOG & Final Polish

- **What**: Create CHANGELOG, final README review, version bump to `1.0.0`.
- **Files**: `CHANGELOG.md`, `docs/README.md`, `package.json`
- **Actions**:
  - [x] Create `CHANGELOG.md` with v1.0.0 entry
  - [x] Add KHQR offline usage example to docs/README.md
  - [x] Add retry configuration example to docs/README.md
  - [x] Bump version to `1.0.0`
  - [x] Final `npm pack` and consumer smoke test
  - [x] Tag `v1.0.0`
- **Status**: 🟢 Completed

**🎯 After Task 15: Tag `v1.0.0` — production-ready release.**

---

### Milestone C: CLI Modularization & Live-Sandbox Hardening `v1.2.0` (IN PROGRESS, uncommitted)

> Goal: Migrate the CLI to Commander with modular subcommands, and validate the full transaction lifecycle (QR → poll → refund) against the live sandbox with real captured evidence. Started after `v1.1.1` (commit `ca96005`); **not yet committed**.

#### Task 16 — Fix Regression: `checkout` `responseType` Routing ⬅️ START HERE

- **What**: In-flight edits to `src/domains/checkout.ts` / `src/client.ts` broke response-type routing. Tests expect `deeplink` and `qr_image` response types but the SDK is currently returning `qr_string` for both.
- **Files**: `src/domains/checkout.ts`, `src/client.ts`, `src/__tests__/server-and-contract.test.ts`, `src/__tests__/sdk-facade.test.ts`
- **Evidence**: `npx vitest run` → **246 passed / 3 failed**:
  - `sdk-facade.test.ts`: `sdk.runTestSuite()` expects `report.success === true`, gets `false`
  - `server-and-contract.test.ts`: `tran_id` prefixed `e2e-deeplink-*` expected `responseType: 'deeplink'`, got `'qr_string'`
  - `server-and-contract.test.ts`: `tran_id` prefixed `e2e-qr_image-*` expected `responseType: 'qr_image'`, got `'qr_string'`
- **Actions**:
  - [x] Diff current `checkout.ts` against last-known-good (`HEAD`) to isolate the routing change
  - [x] Fix response-type detection logic so `deeplink`/`qr_image`/`qr_string` route correctly
  - [x] Re-run `npx vitest run` — confirm 249/249 passing
  - [x] Re-run `npx tsc --noEmit` and `npm run typecheck` — confirm both agree (see Known Issues)
- **Status**: 🟢 Completed (commit `df04deb`)

#### Task 17 — CLI Migration to Commander

- **What**: `src/cli.ts` grew by ~250 lines migrating from a hand-rolled arg parser to `commander`, alongside already-modular `src/cli/commands/{doctor,init,skills}.ts`.
- **Files**: `src/cli.ts`, `src/cli/commands/*`
- **Actions**:
  - [x] Confirm all existing CLI commands (`init`, `doctor`, `test`, `demo`, `status`, `validate`, `generate-qr`, `skills`) work identically under Commander
  - [x] Decide whether remaining command logic in `cli.ts` should be extracted into `src/cli/commands/` for consistency with `doctor.ts` / `init.ts` / `skills.ts`
  - [x] Add/update CLI tests to cover the Commander entry point
- **Status**: 🟢 Completed (commit `df04deb`)

#### Task 18 — Live-Sandbox Integration Scripts

- **What**: Four new scripts (`scripts/sandbox-integration-test.ts`, `scripts/post-payment-test.ts`, `scripts/qr-payment-test.ts`, `scripts/check-qr-transactions.ts` update) exercise the full lifecycle — QR generation, transaction polling, refunds, exchange rate, HMAC, transaction list — against the live sandbox and write timestamped reports to `test-logs/`.
- **Files**: `scripts/sandbox-integration-test.ts`, `scripts/post-payment-test.ts`, `scripts/qr-payment-test.ts`, `test-logs/`
- **Latest result** (`test-logs/integration-report-2026-07-18T03-40-15-579Z.md`): **8/8 categories passed** — SDK instantiation, 10/10 QR templates, transaction polling, refunds (expected `PTL36` rejection on unpaid tx), QR lifetime, exchange rate, HMAC verification, transaction list.
- **Actions**:
  - [x] Document these scripts in `README.md`'s "Sandbox test scripts" table (currently only lists 4 of the now 6+ scripts)
  - [x] Decide whether `test-logs/` output (PNGs, JSONL, transaction JSON) should be `.gitignore`d instead of staged — currently ~50 generated artifact files are staged for commit
  - [ ] Fold durable assertions from these scripts into the permanent Vitest suite where appropriate, keep the rest as manual sandbox-verification tooling
- **Status**: 🟡 Completed (documentation + gitignore done; Vitest fold deferred to future release)

**🎯 After Task 16–18: commit as a clean changeset, re-verify the full validation gate, then tag `v1.2.0`.**

---

### Milestone D: Agentic CLI — Guided Onboarding & Runtime/Provider UX (DONE — commit `341923d`)

> Goal: Make the agentic PayWay CLI self-configuring and observable. Adds `payway-sdk onboard` (TUI wizard), a unified readiness matrix that powers both `doctor` fix-hints and `onboard` routing, and runtime UX so the user can see what the agent is doing and get actionable errors instead of opaque failures.

#### Task D1 — Guided `onboard` TUI wizard

- **What**: A single `payway-sdk onboard` command that scans current state, then walks provider → profile → callback → privacy → verify with live connectivity checks, skip-if-already-done, non-TTY JSON output, and `PAYWAY_ONBOARD_AUTO=1` opt-in for first-run.
- **Files**: `src/cli/commands/onboard.ts` (NEW), `src/agent/onboarding/{scan,stages,remedies}.ts` (NEW), `src/cli.ts`, `src/cli/commands/agent.ts`, `src/agent/repl.ts`, `package.json` (`@clack/prompts ^1.7.0`)
- **Actions**:
  - [x] Scan state via `scanOnboardingState()` (provider / profile / webhook / privacy / verify)
  - [x] `runOnboard()` drives `set-provider` → `add-or-verify-profile` → `set-callback` → `ack-privacy` → `verify` stages with `@clack/prompts` (spinner, confirm, password, multiselect)
  - [x] Live connectivity checks via the same path `doctor` uses; verify stage reads `history.json` for the latest callback delivery
  - [x] TTY shows the wizard; non-TTY returns `{status:'blocked'|'ready'}` JSON and exit code 1 when blocked (never prompts)
  - [x] First-run detection (`maybeAutoOnboard`) + `onboardingHintText` surfaced from `ask` and REPL when not configured
  - [x] `evaluateReadinessDetailed` (`src/agent/readiness.ts`) is the single canonical matrix carrying `remedyId`, consumed by both `doctor` hints and `onboard` routing
- **Status**: 🟢 Completed (`341923d`)

#### Task D2 — `doctor` fix-hints

- **What**: `agent doctor` now prints a `→ <fix>` hint per non-ready row, derived from `evaluateReadinessDetailed`, so the user knows exactly what command to run.
- **Files**: `src/cli/commands/agent.ts`
- **Actions**:
  - [x] Map each non-ready `CapabilityState` to a remedy hint (e.g. `agent setup --provider nvidia`, `agent profiles add`, `agent config --set callbackUrl=…`, `agent doctor --ack-privacy`)
  - [x] `CapabilityState` gained `'blocked'` to represent hard stops
- **Status**: 🟢 Completed (`341923d`)

#### Task D3 — Runtime & provider UX hardening

- **What**: Make `ask`/`agent` observable and fail loudly with actionable messages instead of opaque errors.
- **Files**: `src/agent/orchestrator.ts`, `src/agent/provider.ts`, `src/cli/commands/agent.ts`, `src/agent/repl.ts`
- **Actions**:
  - [x] `OrchestratorOptions.onProgress` hook emits `propose → validate → authorize → execute → finalize`; CLI prints `· Validating plan…`, `· Executing <tool>…`, etc. in TTY
  - [x] `provider.ts` distinguishes a fetch `AbortError` → "provider request timed out after <ms> (check PAYWAY_AGENT_API_KEY, network egress, and baseUrl)" instead of "This operation was aborted"
  - [x] `ask` gains `--provider-timeout <ms>` to override the inference request timeout so a hung provider surfaces in seconds
  - [x] TTY prints a remediation hint on `PROVIDER_PROPOSAL_FAILED` (verify `PAYWAY_AGENT_API_KEY`, run `agent doctor`)
  - [x] `checkConnectivity` reports `blocked` when `PAYWAY_AGENT_API_KEY` is unset (previously `/models` returned 200 without auth and falsely reported `ok`)
- **Status**: 🟢 Completed (`341923d`)

#### Task D4 — Tests & docs

- **What**: Cover the new onboarding logic and update all agent-facing docs.
- **Files**: `src/__tests__/onboarding-remedies.test.ts` (NEW), `src/__tests__/onboarding-stages.test.ts` (NEW), `docs/AGENT-SETUP-PLAYBOOK.md` (NEW), `docs/AGENTIC-PAYWAY-CLI-USER-GUIDE.md`, `docs/QUICK-START-1-PAGER.md`, `README.md`, `skills/aba-payway-agent/SKILL.md`
- **Actions**:
  - [x] Tests for `remedies.ts` (provider/profile/webhook/privacy/verify → fix commands) and `stages.ts` (stage sequencing, skip logic, non-TTY JSON)
  - [x] New `docs/AGENT-SETUP-PLAYBOOK.md` capturing manual path + implementation/architecture + 12 maintainer gotchas
  - [x] User guide, quick-start, README, and the `aba-payway-agent` skill all describe `onboard` as the recommended setup path
- **Status**: 🟢 Completed (`341923d`)

**🎯 Milestone D committed as `341923d` with the full gate green (typecheck + lint + 662 tests + build). Follow-up gap-hardening (lint warnings + deferred low-severity SDK issues) landed after; see Known Issues.**

---

## Key Learnings (this session)

- **Readiness is one matrix.** `evaluateReadinessDetailed` (with `remedyId`) is the single source for both `doctor` fix-hints and `onboard` routing — do not re-derive capability checks elsewhere.
- **Provider errors must be specific.** Distinguish *missing key* vs *timeout (AbortError)* vs *HTTP auth error*; the user's earlier "failed silently" was a 30s `AbortError` wrapped as "This operation was aborted" with no progress output.
- **Non-TTY `ask` redacts provider messages** as `[REDACTED]` (privacy). Diagnose interactively or via `agent doctor`; the TTY path shows the real text.
- **`agent doctor` connectivity is not a substitute for a live call.** NVIDIA's `/models` returns 200 without auth, so the provider row must check key presence before the ping. A set-but-invalid key still pings "ok" — runtime `PROVIDER_PROPOSAL_FAILED` is the real signal.
- **`payway-sdk` is only on PATH after `npm link`/global install.** From a checkout use `node dist/cli.js <cmd>` (or `npx payway-sdk`).
- **`agent profiles add` takes flags, not stdin JSON.** Use `jq -n '{...}' | agent profiles add -` (reads stdin), or pass `--merchant-id`/`--api-key`/`--public-key-pem` and `--name`.
- **Biome lint forbids non-null assertions (`!`).** Use `as` casts / optional chaining.
- **Skill version is pinned by test.** `skills.test.ts` asserts `version: 1.1.0` in every `SKILL.md` frontmatter — bumping it (e.g. to 1.3.0) breaks the suite; keep at 1.1.0 or update the test.
- **First-run hint + auto-onboard** should be opt-in (`PAYWAY_ONBOARD_AUTO=1`) to avoid surprising non-interactive/CI invocations.

---

## Known Issues (For Reference)

| Severity | Issue | Status |
|---|---|---|
| 🟡 Medium | `npm run typecheck` exits 1 with no output while `npx tsc --noEmit` exits 0 clean — npm script wrapper disagrees with the underlying compiler, cause not yet diagnosed | ✅ Resolved (now both clean) |
| 🟡 Medium | `test-logs/` generated artifacts were staged for commit | ✅ Resolved (added to `.gitignore`) |
| 🔴 Critical | `checkout` `responseType` routing regression — `deeplink`/`qr_image` return `qr_string` | ✅ Resolved |
| 🟡 Medium | Missing runtime input validation (amounts, currency, transaction ids) | ✅ Resolved |
| 🟡 Medium | `checkResponseError` false-positive on empty string `body.code` | ✅ Resolved |
| 🟡 Medium | `requestWithMerchantAuth` form encoding silently mangles objects | ✅ Resolved |
| 🟡 Medium | `encryptMerchantAuth` type signature accepts `Record` but payout passes array | ✅ Resolved |
| 🟡 Medium | No test verifies actual HMAC hash values | ✅ Resolved |
| 🟡 Medium | No test for `getTransactionDetail` | ✅ Resolved |
| 🔵 Low | `verifyCallbackSignature` should use explicit base64 encoding for Buffer comparison | ✅ Resolved (explicit `utf8` buffers) |
| 🔵 Low | No input validation on `publicKeyPem` format | ✅ Resolved (`isValidPublicKeyPem` gate on RSA endpoints) |
| 🔵 Low | `encodeBase64IfNeeded` doesn't handle URLs without scheme | ✅ Resolved (`//` and `www.` prefixes encoded; bare single-label hosts intentionally pass through) |
| 🟡 Medium | Four biome lint warnings (unused suppressions + unused variable) flagged in r3-report residual concerns | ✅ Resolved (0 warnings) |

---

## Quick Reference

```
Package version (package.json):  1.1.1
Last agentic commit:             adede4a (agentic payway CLI implementation review artifacts)
Working tree state:              Gap-hardening fixes (lint cleanups, PEM validation, encodeBase64IfNeeded URL handling) — uncommitted; Milestone D committed as 341923d
Vitest:                          670 passing / 0 failing (42 files)
Typecheck:                       npx tsc --noEmit -> clean; npm run typecheck -> clean
Lint:                            biome -> 0 errors, 0 warnings
Build:                           clean (dist/ rebuilt)
Next task:                       Commit gap-hardening fixeset, then tag next release
```
