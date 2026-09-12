# PayWay SDK — Project Status

**DX integration update — 2026-09-06:** `codex/dx-p0` (`6331e48`), `codex/dx-p1` (`601dcb6`), and `codex/dx-p2` (`c20c616`) were combined as `codex/dx-overhaul` and fast-forwarded into local `main` at `46c895b`. Merge repairs preserve structured payment output, hosted-form controls, P1 onboarding, the P2 reference app, and the journal/payment-link additions. Nothing was pushed. Source P0/P1/P2 branches/worktrees and two named integration-backup stashes are retained. See [merge readiness](../.superpowers/sdd/ABA-PayWay-DX-overhaul/merge-readiness.md) for verification and remaining roadmap scope.


> Last updated: 2026-09-05

> **Skills-audit execution + user-driven simulator campaigns (2026-09-05, commits `3f54398`→`c1875fc`).** Executed the 2026-09-03 skills-audit work list end-to-end: **T1 subscription blocker ROOT-CAUSED and fixed** — the gateway signs `ctid` after `items` on the purchase path (live 27-field order; the docs' 26-field list omits ctid and is rejected with Wrong Hash; the gateway's wrong-hash hint prints the DOC list, not the enforced one). With the fix the trio passes the hash layer and answers `104` "Merchant not enabled token flag" — the sandbox profile is not subscription-enabled (external blocker; ABA questions drafted in `.scratch/skills-audit/ABA-QUESTIONS-2026-09-05.md`). **T2** 9 skill doc-truth fixes + seeded payout accounts; **T3.1–T3.5** script exit-code contract (0/1/2, documented in skills/README.md), `.env` auto-load in bundled scripts, and `--json` error envelopes for check-transaction/transaction-detail (`printApiErrorJson`). Then two user-driven ABA-Simulator campaigns produced SANDBOX-FINDINGS **§18–§20**: the first full paid lifecycle (QR → APPROVED → list-visible → partial refund → REFUNDED), the UTC+7 gateway-clock trap (UTC-derived list windows silently return 0 rows), unpaid-QR-only list invisibility demonstrated within one response, and **QR-channel close enforcement repeatable** (closed-unpaid QRs scan-refused "transaction expired" ×2 — channel-dependent per CLOSE-TRANSACTION-FINDINGS §2b/§9). Learnings synced into `.agents/AGENTS.md` (new Sandbox Channel & Status Facts section), docs/07, README, root AGENTS.md, CLI description strings, SDK JSDoc, and 12 skills. Gate: **1283 tests / 83 files green, tsc clean, biome clean**; skills audit greps clean; `.zcode/skills` byte-identical. **Follow-up:** scope-level **Purchase API test plan** prepared and committed (`2a20c63`, `.scratch/purchase-api-test-plan/TEST-PLAN.md`) — KHQR + card payments across 4 creation routes (SDK-JSON / SDK-webpage gate-0 / CLI command / CLI webpage form), 8 divergence hypotheses, 33 scenarios in 4 waves, 12 user-manual steps; execution deferred to a fresh session (deeplinks explicitly excluded until a later phase). The ABA Mobile Simulator reference (test-account limits, PIN, secret word) is committed at `docs/archive/ABA Mobile Simulator App.md`.

> **Link-card hosted-page session (2026-09-01, committed `e8bcaf6` on `main`).** Learned from the checkout-with-card flow (`checkout-form` / `getCheckoutFormHtml()`) and applied the same local-signing pattern to link-card — the one PayWay endpoint that requires `application/x-www-form-urlencoded` (JSON rejected unread) and always answers with the gateway's hosted card-entry page. Shipped: (1) SDK `credentialsOnFile.getLinkCardFormHtml()` — local-only signed HTML form, hidden fields + §16 HMAC byte-identical to `linkCard()`'s wire body (pinned by a wire-vs-form test); (2) CLI `cof link-card-form` (local signing, no API call, stdout/`--out` split, TTY auto-open, callback-missing warning); (3) `cof link-card` now captures the guaranteed HTML answer as the success artifact it is — saves to `payway-output/link-card-<request-id>.html`, exit 0, `--json` hostedHtmlPath envelope; (4) shared `escapeHtmlAttribute()` in `utils.ts` (checkout output byte-identical). **Live-verified**: the local form's fields POST as a browser → HTTP 200 + the real 42 KB hosted "PayWay - Checkout" page (evidence `test-output/link-card-form-live-probe-2026-09-01.json`); `cof link-card` live-captured the same page. Gate: **1236 tests / 80 files green (+18 new), tsc clean, biome clean, coverage 78.5/74.2 above floors**. Docs/skills synced: docs/09 (form-method section), docs/12 (exception note), README (CLI table + COF snippet), AGENTS.md, CHANGELOG Unreleased, and five COF skills → v1.2.0 (link-card, link-account, token-purchase, remove-card, remove-account — all were stale v1.3.5-era: wrong flags, TD-03 gate, pre-§16 param shapes).

> **v1.3.0 released + testability campaign (2026-08-30, committed through `d486738`).** The v1.3.0 release remediated **all 23 edge-case audit findings (EC-01–EC-23)** (lifetime minimums, empty-body guard, private-callback-host guard, `runCli` export, retry policy, … — see `CHANGELOG.md` and `audit-results/edge-case-report.md`). Since then: statement coverage raised **55% → 70% → 75.8%**, and the agent CLI/REPL testability refactor extracted the pure logic of `agent.ts`/`repl.ts` into `agent-helpers.ts`, `repl-helpers.ts`, `progress.ts`, and `ansi.ts` (REPL loop in-process testable via `runRepl(io)`). Gate: **988 tests / 63 files green, tsc clean, biome clean**; coverage 75.79% stmts / 71.08% branch / 83.68% funcs. Working tree clean. Agent-facing handoff: [HANDOFF.md](../HANDOFF.md).

> The previously *uncommitted* sessions below (QR image auto-open 2026-08-26; payout hardening 2026-08-26) were subsequently committed and shipped in the v1.3.0 lineage.

> **QR image auto-open session (2026-08-26, uncommitted).** `generate-qr` now opens the saved QR PNG with the OS default image viewer so it is immediately scannable: default behavior is TTY-aware (interactive terminals only; scripts/CI/agents unaffected), `--open-image` forces it, `--no-open-image` suppresses it. New SDK export `openImageInDefaultViewer()` + `defaultViewerCommandForPlatform()` in `src/open-image.ts` (allowlisted per-platform command — Windows `rundll32 url.dll,FileProtocolHandler` / macOS `open` / Linux `xdg-open` — spawned shell-less and detached, never throws, degrades to an "Open it manually" hint). Live-verified on Windows (rundll32 opened the PNG from transaction `qrmt9v6kaa288eb2`). Docs synced across README, CHANGELOG, Chapter 7, QUICK-START-1-PAGER, VISUAL-GUIDE, and `skills/aba-payway-qr` v1.3.0. Gate: **738 tests / 47 files / lint clean / typecheck clean / build clean**.

> **Close-Transaction escalation open (2026-08-25, uncommitted).** Live sandbox evidence that `closeTransaction` is advisory only: two card payments completed AFTER a code-00 close (`PAY8skk3vbbi` MC \*6777, `PAY8t4x1ozl9` VISA \*0206 → both APPROVED), closure is unqueryable (no CLOSED status in check/detail, no operation marker), and re-close returns 00 idempotently. Full dossier with reproduction + ABA questions + post-fix checklist: [CLOSE-TRANSACTION-FINDINGS.md](./CLOSE-TRANSACTION-FINDINGS.md). Same session also shipped: typed rate-limit errors for the undocumented HTTP 403 + numeric-code-429 shape with window-aware retry pacing and `onThrottle` hook; poller `NOT_FOUND` grace period; end-to-end tools (`online-qr-poll.ts`, `checkout-link-poll.ts`, `checkout-cards-close.ts`, `close-transaction-verify.ts`); skills/docs sync (qr/purchase/check-transaction/transaction-detail/transaction-close v1.2.0). Gate: **727 tests / lint clean / typecheck clean**, all flows paid & verified live.

> **Full-cycle sandbox validation campaign complete (2026-08-25).** Ran a 15-scenario lifecycle probe (`scripts/sandbox-campaign-full-cycle.ts`, evidence in `test-output/campaign-evidence.json`): purchase → check → close → re-check → detail → list → refund paths plus edge cases. Fixed two P1 CLI/SDK defects found live: (1) the `.env` loader truncated multi-line quoted PEMs, silently breaking every RSA endpoint (refund/payment-link/pre-auth/payout); (2) `generate-checkout` hardcoded `payment_gate: 0`, which the sandbox now answers with an HTML page → "Invalid JSON response". Added six missing transaction-lifecycle CLI commands with `--json`, standardized exit codes `0/1/2/3`, refund pre-flight balance check, and new sandbox facts (duplicate `tran_id` accepted; closed txns stay `PENDING`; strict `"YYYY-MM-DD HH:mm:ss"` list-date format; refund code `PTL36`). Gate: **676 tests / lint clean / typecheck clean**, all fixes verified against live sandbox. Details: [SANDBOX-FINDINGS §8](./SANDBOX-FINDINGS.md).

> **Agentic CLI is live end-to-end.** The agentic PayWay CLI originally shipped with provider modes, 11 tools, risk gates, execution ledger, sessions, and secret redaction; later payment-link and journal work expanded the catalog to 13 tools. It runs against **OpenCode Zen (`x-preview-f-free`, free)** with a verified live sandbox QR creation (`ask` → plan → authorize → PayWay `code 0 Success`). Key reliability work this session: tool-catalog planning prompt, one-round plan repair, transient-error retries, deterministic callback override, sampling passthrough flags, and a real SDK fix (`payment_option` is required by the PayWay QR API). Verification gate is green: **676 Vitest tests pass (42 files)**, Biome lint clean (0 warnings), `tsc --noEmit` clean, build clean.

> Session work committed through: `341923d` (onboarding wizard + runtime/provider UX), `65046c8` (gap hardening: PEM validation, URL encoding, lint cleanups), `9f47648`/`e6c872c` (opencode preset, prompt/retry/override fixes), `b8ff4b6` (artifact ignore), `e135c19` (agent docs sync), `bc4efb7` (sandbox-campaign SDK/CLI fixes + lifecycle commands), `922cf67`/`88459f0` (docs & learnings sync), `808dc80` (journey UX pass: poll-transaction, doctor --live, terminal QR, explain).

> **Documentation-audit session (2026-08-25, uncommitted):** added the 24th packaged skill `aba-payway-customer-qr` with bundled offline tools (`decode-khqr.cjs`, `qr-manifest.cjs`) covered by `src/__tests__/skill-scripts.test.ts`, and documented the six skill helper scripts in their SKILL.md guides. Aligned all user-facing docs to the code-read environment variables (`PAYWAY_RSA_PUBLIC_KEY`, `PAYWAY_ENV` per `src/client.ts`) across `README.md`, `CONTRIBUTING.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `docs/RELEASE_CHECKLIST.md`, and Chapters 02/12/14; completed the README CLI command table (`generate-checkout`, `payment-link create/detail`, `setup-webhook`, `config`); fixed chapter-count references (15 → 16) and broken table cells; updated the `.agents/AGENTS.md` knowledge base (skill count 20 → 24, scripts tooling, `PAYWAY_ENV` row).

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

- **16-chapter integration guide** in `docs/`, covering setup through deployment
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

### Milestone C: CLI Modularization & Live-Sandbox Hardening `v1.2.0` (DONE)

> Goal: Migrate the CLI to Commander with modular subcommands, and validate the full transaction lifecycle (QR → poll → refund) against the live sandbox with real captured evidence. Started after `v1.1.1` (commit `ca96005`).

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

### Milestone E: Full-Cycle Sandbox Validation Campaign (DONE — 2026-08-25, committed `bc4efb7`)

> Goal: Audit the entire transaction lifecycle against the live sandbox, convert findings into SDK/CLI/agent-framework improvements, and document evidence. Reusable harness: `scripts/sandbox-campaign-full-cycle.ts` → `test-output/campaign-evidence.json`.

#### Task E1 — P1: Multi-line `.env` PEM loader fix

- **What**: `loadDotEnv()` was line-based; a quoted multi-line RSA PEM in `.env` was truncated to `"-----BEGIN PUBLIC KEY-----`, so **every** RSA-encrypted endpoint (refund, payment-link, pre-auth, payout) failed with "publicKeyPem does not look like a public key PEM" even with correct config.
- **Evidence**: Live refund probe failed at config stage; `.env` stores the PEM across 6 lines.
- [x] Fold quoted values across lines, strip quotes and `\n` escapes (`src/cli.ts`)
- [x] Verified: `payway-sdk refund` now reaches PayWay (server responds PTL36 for unknown tran)
- **Status**: 🟢 Completed

#### Task E2 — P1: `generate-checkout` broken by `payment_gate: 0`

- **What**: CLI hardcoded `paymentGate: 0`; sandbox now answers that parameter with **HTTP 200 + HTML page**, surfacing as opaque "Invalid JSON response from PayWay API".
- **Evidence**: Reproduced twice via the SDK path; identical payload without `payment_gate` returns clean JSON (`qrString`/`qrImage`).
- [x] Removed hardcoded gate from CLI
- [x] `createJsonParseError()` now reports content-type, HTML-detection hint ("parameter value rejected server-side"), and body snippet (`src/client.ts`)
- **Status**: 🟢 Completed

#### Task E3 — Transaction-lifecycle CLI commands

- **What**: Skills documented check/close/detail/list/refund flows but the CLI had no commands for them.
- [x] Added `check-transaction`, `close-transaction -y/--force`, `transaction-detail`, `transaction-list --from/--to/--status`, `refund` (pre-flight balance check via detail API), `exchange-rate` — all with `--json`
- [x] Enforce sandbox-verified `"YYYY-MM-DD HH:mm:ss"` date format locally with an actionable error (code 49 trap)
- **Status**: 🟢 Completed

#### Task E4 — Standardized exit codes for agents

- **What**: All failures exited 1 — indistinguishable to agent frameworks.
- [x] `classifyError()`: `0` success / `1` validation-input / `2` PayWay API failure / `3` network-timeout-ratelimit; wired through `printApiError()` and all command catch blocks
- [x] Live-verified: bad amount → 1, PTL36 → 2
- **Status**: 🟢 Completed

#### Task E5 — Knowledge base update

- [x] `docs/SANDBOX-FINDINGS.md` §8: campaign evidence, new sandbox facts, 5 clarifying questions for ABA
- [x] Chapter 2 (`.env` multi-line PEM support), Chapter 7 (lifecycle facts + CLI commands), Chapter 12 (PTL36, HTML-response debugging, exit-code table), refund skill (pre-flight pattern)
- **Status**: 🟢 Completed

**🎯 Gate green after Milestone E: 676/676 tests, biome 0 warnings, tsc clean. New sandbox facts & open questions: [SANDBOX-FINDINGS §8b–8c](./SANDBOX-FINDINGS.md).**

---

### Milestone F: Scope-Coverage Campaign — CoF / Payout / Pre-auth / Payment Link / KHQR (DONE — 2026-08-25, committed `bc4efb7`, docs synced `922cf67`)

> Goal: extend the validation campaign to every API scope not covered by Milestone E. Harness: `scripts/sandbox-campaign-scopes.ts` → `test-output/campaign-scopes-evidence.json` (27 scenarios). Deep-probe trail documented in [SANDBOX-FINDINGS §9](./SANDBOX-FINDINGS.md).

#### Task F1 — Credentials-on-File contract decode

- **What**: Server binding layer leaks per-field errors (HTTP 400 code `"04"` + `errors{}` map) — used them to decode exact contracts.
- [x] Decoded required fields per endpoint; token_flag enums (`CITI/CITO/CITR_FLEX…` for linking vs `CITU/MITU/MITR_FLEX/FIX` for charging)
- [x] Confirmed `payment-credential` is JSON-only (form → 415); `link-card` form-only
- [x] **Fixed SDK gap:** `LinkCardParams.currency` added (server-required, defaults USD) — payload + HMAC wired (`src/client.ts`, `src/domains/credentials-on-file.ts`)
- [x] **Fixed SDK gap:** v3 token-trio now sends the binding-required `request` field (defaults to requestId)
- [x] **OPEN (documented):** v3 token-management HMAC composition not derivable black-box (~60 combos tried; all 403 Wrong Hash) — needs ABA sample/spec
- [x] **Security observation:** `link-card` returns hosted page even with corrupted hash in sandbox
- **Status**: 🟢 Completed

#### Task F2 — Payout / pre-auth / payment-link / KHQR live evidence

- [x] payout non-whitelisted → code **37** "Payout accounts are not in whitelist"
- [x] Real pre-auth lifecycle: purchase(type=pre-auth) OK → complete unauthorized **PTL59**, complete-with-payout **PTL62** (profile lacks permission), cancel **PTL170**, cancel-missing **PTL36**
- [x] Payment link created end-to-end (live `link-sandbox.payway.com.kh/ABAPAY…` URL), detail verified; nonexistent detail → code **96**; past expiry → PTL04; **duplicate merchant_ref_no accepted**
- [x] KHQR by-ref still 404 in this sandbox profile
- **Status**: 🟢 Completed

#### Task F3 — Knowledge base sync

- [x] SANDBOX-FINDINGS §9 (per-scope tables + questions 6–10 for ABA)
- [x] Chapter 9 sandbox-verified facts block; refund skill already current
- **Status**: 🟢 Completed

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

### Sandbox-campaign learnings (2026-08-25, Milestones E–F)

- **Tag which layer a probe reached.** PayWay processes requests as *binding → hash → business*. Earlier CoF "verified" notes had only ever reached the binding layer; always record the layer in evidence (binding errors = HTTP 400 code `"04"` with an `errors{}` map; hash failure = 403 code `01`).
- **Binding errors are free spec discovery.** The server names its exact model and missing properties ("missing required properties including 'request_time'") — satisfy binding first, then hunt HMAC compositions. This decoded every CoF contract in one session.
- **One loader, one place.** The multi-line `.env` PEM bug existed because three copies of a naive line-based loader drifted (cli.ts fixed last, doctor.ts silently broken until extracted into `src/cli/dotenv.ts`). Any env parsing belongs in one shared module.
- **Sandbox acceptance ≠ security proof.** `link-card` returns its hosted page even with a corrupted hash — never present sandbox success as evidence that server-side verification exists.
- **Exit codes are an API.** Agents branch on `$?`; collapsing validation vs API vs network failures into a single nonzero code destroys automation. Keep the 0/1/2/3 contract in every new command.
- **Advisory checks must not gate critical ones.** `doctor --live` originally refused to probe because "framework detected: unknown" failed in the SDK's own repo — separate credential health from cosmetic detection before composing verdicts.

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
Package version (package.json):  1.3.0 (tag v1.3.0; next release v1.4.0 — do not move tags)
Recent commits:                  d486738 (agent testability refactor) / 47145e1 (handoff) / 6bf3afc (changelog) / 9661b16 (coverage 55→70%) / b6d15e1 (v1.3.0)
Working tree state:              CLEAN — nothing uncommitted (QR auto-open & payout-hardening sessions shipped in v1.3.0)
Active agent provider:           opencode (https://opencode.ai/zen/v1), model x-preview-f-free, key via PAYWAY_AGENT_API_KEY in .env
Vitest:                          988 passing / 0 failing (63 files)
Typecheck:                       npx tsc --noEmit -> clean; npm run typecheck -> clean
Lint:                            biome -> 0 errors, 0 warnings
Build:                           clean (dist/ rebuilt + agent subprocess suite re-verified 2026-08-30)
Coverage:                        75.79% stmts / 71.08% branch / 83.68% funcs / 76.59% lines
Live E2E:                        doctor --live round-trip ✓; poll-transaction/list verified against sandbox (2026-08-25); openImageInDefaultViewer live-opened a real sandbox QR PNG on Windows (2026-08-26)
Sandbox campaigns:               Milestones E+F committed; evidence in test-output/campaign-*.json + SANDBOX-FINDINGS §8–9
Next task:                       SQLite webhook-storage coverage (HANDOFF §5.1); ask ABA: v3 token-trio HMAC composition (§9a), close-transaction enforcement (CLOSE-TRANSACTION-FINDINGS §5); npm publish is a user decision
```

## Recent Session — Payout hardening (2026-08-26, committed in v1.3.0 lineage)

- Enforced **payout currency must match beneficiary account currency** client-side in
  sandbox: `payout.ts` and `pre-auth.ts` (`completeWithPayout`) now call
  `validateSandboxBeneficiary(acc, currency, { sandbox })` → throws `currency mismatch`
  for e.g. a KHR payout to a seeded USD account. Production still validates format only.
- Added payout error codes to `constants.ts` (`PAYOUT_ERROR_CODES`) and
  `cli/explain-code.ts`; `payway-sdk explain PTL147|12|PTL146|PTL-PAYOUT-37|PTL46|PTL-PAYOUT-36`
  now resolve with actionable hints. `printApiError` gained payout-specific branches + 415.
- Added a **`payout` CLI command** (`-t/-a/-c/-b "acc:amt,..."`) — the SDK had no CLI path.
- Docs: `docs/12-error-handling-and-debugging.md` gained a Payout-Specific error table + `12/PTL147` row.
- Skills: `aba-payway-payout` v1.2.0 (currency rule + error matrix + CLI), synced to all 3 skill paths.
- Tests: payout/pre-auth fixtures moved to seeded `500000001`; new test asserts KHR→USD rejection.
- Status: `npx tsc --noEmit` clean, `vitest` 754 passing / 0 failing, `biome lint` clean.

## Recent Session — Payment-link void (2026-09-11/12, branch `feat/payment-link-void`, merged into `feat/customer-module-qr` 2026-09-12)

- Surfaced + live-verified ABA's **undocumented** `payment-link/void` endpoint (SANDBOX-FINDINGS §23): signs like detail, `VOIDED` is a real status, double-void → 403 PTL188, bogus id → 403 96.
- **SDK**: `payway.paymentLink.void(id)` — merchant-auth family, `MUTATION_ENDPOINTS` single-attempt member, `VoidPaymentLink*` OpenAPI schemas + regenerated types, `HASH_ORDER_HINTS` entry.
- **CLI**: `payment-link void -i <id> [-y] [--json]` — TTY confirmation, PTL188 exit-2 envelope with terminal-state hint, `explain PTL188`.
- Tests: hash-order/mutation-retry/client/domain pins + mock-harness void route + gated §23 sandbox-contract pin; live e2e 6/6 legs (`scripts/e2e-payment-link-void.ts`).
- Docs/skills: docs/17 §17.4 (+renumber, cross-refs swept), docs/12 rows, skill v1.5.0 + mirror, AGENTS/.agents/HANDOFF/CHANGELOG, typedoc regen.
- Gates: build/tsc/lint clean; suite 1673 passed (+1 pre-existing npm-12 pack-format failure, fix in flight on main checkout); sandbox 14/14; check:repository passed.

## Recent Session — CLI competitive audit + P0 webhook workbench (2026-09-10, commits `cc6c635`→`86b1604`)

- Audited Stripe CLI, Razorpay CLI, and the live npm ecosystem (competitors
  `aba-payway` v0.2.2 — verified gateway-contract bugs: QR lifetime in minutes
  vs the seconds contract, close→CANCELLED claim, no 200-wrapped error
  handling; `aba-payway-sdk` v0.2.35 — false "Official" claim, wrong host in
  quick-start). Findings + roadmap + re-audit live in
  `docs/competitive-analysis-cli-stripe-razorpay.md`.
- **Shipped P0 Wave 1** (`9435301`+`f7b9b5d`, ff-merged to main): new
  `payway-sdk webhook trigger|verify-callback|resend|list` command group +
  `setup-webhook --forward-to/--forward-headers`. New library surface:
  `src/webhook/forwarder.ts` (capture-survives-forward-failure contract),
  `src/webhook/fixtures.ts` (7 fixture events across the three callback
  contracts), `signCallbackBody` in `src/auth.ts` (the shared signing inverse
  of `verifyCallbackDetailed` — one canonicalization, D1/D3).
- Contracts: signed online fixtures round-trip through the SDK verifier;
  pushback/KHQR fixtures carry NO hash by design (§22 V-1); exit 0 valid /
  1 invalid+reason / 3 network; forward failures never reject the original
  callback.
- Live e2e verification with the built dist CLI (not just suite): trigger →
  receiver → wire-byte verify; capture → forward with signature preserved;
  SQLite store read by `webhook list`; resend; invalid-sig exit 1; no-hash
  pushback leg. Evidence: `.scratch/audit-webhook-e2e/`.
- Docs/skills propagated: docs/16 "Local Webhook Workbench" section, README,
  SDK-AND-CLI-REFERENCE, AGENTS.md canonical list + contract bullet,
  CHANGELOG Unreleased, `aba-payway-hash` v1.4.0 + `aba-payway-webhook-production`
  v1.1.0 (canonical + `.zcode` mirrors), COMMAND_EXAMPLES.
- Open follow-ups: P3-A pushback captures don't populate
  `matchedTransactionId/matchedStatus`; P3-B `webhook list` doesn't report the
  active storage backend; Wave 2 = `docs/llms.txt`+`docs` command, then an MCP
  server; bin-name decision (`aba-payway-cli` free) before first publish.
- Status on merged main: build/tsc/biome clean, **vitest 1,662 passed / 13
  skipped** (38 new tests).

## Recent Session — Link-card full-cycle review + fix wave (2026-09-12, commits `034af4f` + `5cf62af`+)

Superpowers-style review of the card-on-file (link-card) integration, then all
fixes shipped. Review card: `.scratch/link-card-review/REVIEW-CARD.md` (with a
§8 resolution record). Live facts: SANDBOX-FINDINGS **§24** (LC-1..LC-7).

- **Review verdict**: no critical code defects; the two-path (form vs API)
  design with the shared hash builder is sound. External blocker found: the
  sandbox profile is NOT enabled for token flags — link-card's hosted page
  answers code 104 "Merchant not enabled token flag", so no pwt can be
  captured and the paid cycle + Q18 callback capture stay blocked on ABA.
- **New live facts (§24)**: the hosted result travels as
  `302 → /add-card/<base64 JSON>` (the 42 KB POST body is a static shell);
  the sandbox hash IS enforced (controlled replays refute the old "skips
  hash" note); no callback fires for a failed link; `removeToken` answers
  `00 Success` even for a non-existent token; charge-105 / details-09 live
  shapes captured.
- **Fixes shipped**: SDK `linkCard()` error now carries `responseUrl` +
  `hostedPage` (new exported `HostedPageOutcome` type); whole `cof` CLI group
  emits the uniform `--json` error envelope; `cof link-card` reports the
  hosted error code (human) and `hostedPage` + journal join keys (`--json`);
  validation symmetry in `buildLinkCardPayload` (currency, frequency enum,
  missing-callbackUrl advisory, '' guard); `getLinkCardFormHtml` no-store
  meta; hardened page save; docs/09 flagship example rewritten (it taught
  `result.pwt`, which never exists — link-account's example had the same bug)
  plus the wrong "success signal" sentence; docs/11 gained a CoF callbacks
  section; docs/12 COF rows updated with live messages; aba-payway-link-card
  v1.3.0 / cof v1.1.0 / token-lifecycle v1.1.0 / remove-card+account v1.2.1
  (`.zcode` mirrors synced); knowledge corpus re-synced; INTEGRATION-GAPS Q12
  "hash skipping" half resolved-by-evidence.
- **Tests**: +10 (link-card-hosted-outcome suite + mock-harness cof envelope
  cases + form-test entity decoding). Gates: build/tsc/biome src+skills clean;
  suite 1,856 passed / 14 skipped.
- **Open**: ABA must enable the token-flag service on sandbox merchant
  `ec476910`; re-run `scripts/sandbox-probe-link-card-cycle.ts` to capture the
  pwt callback (answers Q18) and complete the paid legs.
