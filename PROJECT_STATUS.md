# PayWay SDK — Project Status

> Last updated: 2026-07-17

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

### Documentation & Reference App (DONE)

- **15-chapter integration guide** in `docs/`, covering setup through deployment
- **Merchant scenario coverage docs** — 28 attested scenarios, coverage audit report, and `superpowers/` implementation plans
- **QR-POS reference app** at `payway-boilerplate/merchant-qr-pos/` — full Next.js consumer demo with Express backend, SQLite store, and Vitest tests
- **Cloudflare Workers webhook archiver guide** — `docs/cloudflare-free-webhook.md`

### Phase 2.5 — Code Review (DONE)

- Full code review completed 2026-07-16
- **1 critical bug found** (see Task 1 below)
- 3 high, 8 medium, 12 low severity items catalogued

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

## Known Issues (For Reference)

| Severity | Issue | Task |
|---|---|---|
| 🔴 Critical | `cancel_url` not base64-encoded like `return_url` | Resolved |
| 🟡 Medium | Missing runtime input validation (amounts, currency, transaction ids) | Resolved |
| 🟡 Medium | `checkResponseError` false-positive on empty string `body.code` | Task 10 |
| 🟡 Medium | `requestWithMerchantAuth` form encoding silently mangles objects | Task 8 |
| 🟡 Medium | `encryptMerchantAuth` type signature accepts `Record` but payout passes array | Task 12 |
| 🟡 Medium | No test verifies actual HMAC hash values | Task 13 |
| 🟡 Medium | No test for `getTransactionDetail` | Task 13 |
| 🔵 Low | `verifyCallbackSignature` should use explicit base64 encoding for Buffer comparison | Task 8 |
| 🔵 Low | No input validation on `publicKeyPem` format | Deferred |
| 🔵 Low | `encodeBase64IfNeeded` doesn't handle URLs without scheme | Deferred |

---

## Quick Reference

```
Current version:  1.0.0
Tests:            136 passing
Build:            Clean (ESM + CJS + .d.ts)
Next task:        Tag v1.0.0 — production-ready release
```
