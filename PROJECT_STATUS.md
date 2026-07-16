# PayWay SDK — Project Status

> Last updated: 2026-07-16

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

- **90 tests passing** across 3 test files
- `auth.test.ts` (19 tests), `utils.test.ts` (25 tests), `client.test.ts` (46 tests)

### Phase 2.5 — Code Review (DONE)

- Full code review completed 2026-07-16
- **1 critical bug found** (see Task 1 below)
- 3 high, 8 medium, 12 low severity items catalogued

---

## 🚧 Remaining Work — Sequenced Task Breakdown

### Milestone A: MVP Release `v0.1.0` (Target: ~1 day)

> Goal: A working, publishable SDK that merchants can `npm install` and start collecting payments via checkout.

Tasks must be completed **in this order**:

#### Task 1 — Fix Critical Bug: `getTransactionList` Arithmetic HMAC ⬅️ START HERE
- **What**: `client.ts:491` passes arithmetic pairs `[['to_date', 'from_amount']]` to `generateHmacArithmetic`, but sandbox probes proved this produces "Wrong Hash" errors. Plain string-concat is correct.
- **Files**: `src/client.ts`, `src/auth.ts`, `src/__tests__/auth.test.ts`, `src/__tests__/client.test.ts`
- **Actions**:
  - [ ] Remove arithmetic pairs argument from `getTransactionList` call (use `undefined`)
  - [ ] Remove `generateHmacArithmetic` function from `auth.ts` (dead code after fix)
  - [ ] Remove `generateHmacArithmetic` import from `client.ts`
  - [ ] Remove arithmetic HMAC tests from `auth.test.ts`
  - [ ] Update `getTransactionList` test to verify plain HMAC is used
  - [ ] Run tests — confirm all pass
- **Status**: 🔴 Not started

#### Task 2 — Fix Error Class `instanceof` Safety
- **What**: Add `Object.setPrototypeOf` to all 3 error classes so `instanceof` works reliably across compilation targets.
- **Files**: `src/errors.ts`
- **Actions**:
  - [ ] Add `Object.setPrototypeOf(this, ClassName.prototype)` to each constructor
  - [ ] Run tests — confirm all pass
- **Status**: 🔴 Not started

#### Task 3 — Fix `package.json` Metadata
- **What**: Set correct version, add required npm fields.
- **Files**: `package.json`
- **Actions**:
  - [ ] Change `version` from `"1.0.0"` to `"0.1.0"`
  - [ ] Add `"engines": { "node": ">=18.0.0" }`
  - [ ] Add `"license": "MIT"` (or appropriate license)
  - [ ] Add `"repository"` field
  - [ ] Add `"keywords": ["payway", "aba", "payment", "cambodia", "khqr"]`
- **Status**: 🔴 Not started

#### Task 4 — Verify Publish Safety
- **What**: Ensure no credentials, internal docs, or source leak into the npm package.
- **Files**: `.npmignore`, `package.json`
- **Actions**:
  - [ ] Add `*.md` exclusion to `.npmignore` (except README.md which npm always includes)
  - [ ] Add `PaywAySandboxkey.txt` exclusion
  - [ ] Add `New folder/` exclusion
  - [ ] Run `npm pack --dry-run` and verify only `dist/`, `README.md`, `package.json` are included
- **Status**: 🔴 Not started

#### Task 5 — Add JSDoc to Public API
- **What**: Add JSDoc comments to every public method in `client.ts` so merchants get IDE tooltips.
- **Files**: `src/client.ts`
- **Actions**:
  - [ ] Add JSDoc to `PayWay` constructor
  - [ ] Add JSDoc to `verifyCallback`
  - [ ] Add JSDoc to all `checkout.*` methods (6 methods)
  - [ ] Add JSDoc to all `credentialsOnFile.*` methods (6 methods)
  - [ ] Add JSDoc to `qr.generateQr`
  - [ ] Add JSDoc to `paymentLink.*` methods (2 methods)
  - [ ] Add JSDoc to `preAuth.*` methods (3 methods)
  - [ ] Add JSDoc to `payout.*` methods (3 methods)
  - [ ] Add JSDoc to `khqr.getTransactionsByMerchantRef`
  - [ ] Rebuild (`npm run build`) to verify JSDoc appears in `.d.ts` output
- **Status**: 🔴 Not started

#### Task 6 — Update README for All 7 Domains
- **What**: Current README only shows checkout + webhook. Add usage examples for CoF, QR, Payment Link, Pre-auth, Payout.
- **Files**: `README.md`
- **Actions**:
  - [ ] Add "Available APIs" section listing all 7 domains
  - [ ] Add QR API usage example
  - [ ] Add Credentials-on-File usage example
  - [ ] Add Payment Link usage example
  - [ ] Add Pre-auth usage example
  - [ ] Add Payout usage example
  - [ ] Add "Error Handling" section showing `PayWayAPIError` usage
  - [ ] Add `npm test` to Development section
  - [ ] Verify all code examples compile
- **Status**: 🔴 Not started

#### Task 7 — Final Build & Smoke Test
- **What**: Clean build, full test run, manual smoke test of the npm package.
- **Actions**:
  - [ ] Run `npm run lint`
  - [ ] Run `npm run typecheck`
  - [ ] Run `npm test` — all pass
  - [ ] Run `npm run build` — clean output
  - [ ] Run `npm pack` — inspect tarball contents
  - [ ] Create a scratch consumer project, `npm install ./aba-payway-ts-0.1.0.tgz`, verify imports work
- **Status**: 🔴 Not started

**🎯 After Task 7: Tag `v0.1.0` and publish / deliver to pilot merchants.**

---

### Milestone B: Production-Hardened Release `v1.0.0` (Target: ~3-5 days after Milestone A)

> Goal: A battle-tested SDK with retry logic, typed responses, and KHQR offline QR. Ready for production traffic at scale.

#### Task 8 — DRY Refactor: Extract Shared Fetch Logic
- **What**: `request()` and `requestWithMerchantAuth()` duplicate timeout setup, fetch, response parsing, and error handling. Extract into a private `_executeFetch()`.
- **Files**: `src/client.ts`
- **Actions**:
  - [ ] Create `_executeFetch(url, headers, body, timeoutMs)` private method
  - [ ] Refactor `request()` to use `_executeFetch()`
  - [ ] Refactor `requestWithMerchantAuth()` to use `_executeFetch()`
  - [ ] Run tests — all must still pass
- **Status**: 🔴 Not started

#### Task 9 — Add Retry Logic for Transient Failures
- **What**: Add configurable exponential backoff retry for 5xx and network errors. Never retry 4xx.
- **Files**: `src/client.ts`, `src/__tests__/client.test.ts`
- **Actions**:
  - [ ] Add `maxRetries` (default: 0) and `retryDelayMs` (default: 1000) to `PayWayConfig`
  - [ ] Implement retry loop in `_executeFetch()` with exponential backoff
  - [ ] Only retry on: HTTP 5xx, network errors (ECONNRESET, ETIMEDOUT), AbortError
  - [ ] Never retry on: HTTP 4xx, `PayWayAPIError` from 200-wrapped responses
  - [ ] Add tests for retry behavior (mock 503 then 200, verify retry count)
  - [ ] Add test that 4xx errors are NOT retried
- **Status**: 🔴 Not started

#### Task 10 — Enrich Error Context
- **What**: `PayWayAPIError` should always carry `statusCode`, and add `endpoint` field. Add `toJSON()`.
- **Files**: `src/errors.ts`, `src/client.ts`, `src/__tests__/client.test.ts`
- **Actions**:
  - [ ] Add `endpoint` field to `PayWayAPIError`
  - [ ] Pass endpoint path to error constructors in `request()` and `requestWithMerchantAuth()`
  - [ ] For 200-wrapped errors, set `statusCode: 200` explicitly
  - [ ] Add `toJSON()` method to `PayWayAPIError` for structured logging
  - [ ] Fix `paywayCode` type: change from `string | number` to `string` (runtime is always string)
  - [ ] Add tests for enriched error fields
- **Status**: 🔴 Not started

#### Task 11 — Add Optional Logging Hooks
- **What**: Allow merchants to hook into request/response lifecycle for debugging and monitoring.
- **Files**: `src/client.ts`, `src/index.ts`
- **Actions**:
  - [ ] Add `onRequest?: (endpoint, body) => void` to `PayWayConfig`
  - [ ] Add `onResponse?: (endpoint, status, body) => void` to `PayWayConfig`
  - [ ] Call hooks in `_executeFetch()` (non-throwing, wrapped in try-catch)
  - [ ] Export config types from `index.ts`
  - [ ] Add tests verifying hooks are called
- **Status**: 🔴 Not started

#### Task 12 — Wire Generated Types to API Responses
- **What**: Replace `Promise<any>` return types with actual response types from `types.ts`.
- **Files**: `src/client.ts`, `src/types.ts`
- **Actions**:
  - [ ] Map each domain method's `TResponse` generic to the corresponding OpenAPI type
  - [ ] Verify IntelliSense works for response properties
  - [ ] Run `npm run typecheck` — must pass
- **Status**: 🔴 Not started

#### Task 13 — Strengthen Test Suite
- **What**: Add tests for gaps found in code review.
- **Files**: `src/__tests__/auth.test.ts`, `src/__tests__/client.test.ts`
- **Actions**:
  - [ ] Add RSA round-trip test (encrypt then decrypt with private key, verify plaintext matches)
  - [ ] Add RSA boundary tests (exactly 117 bytes, 118 bytes, 234 bytes, 235 bytes)
  - [ ] Add test computing expected HMAC value for `createTransaction` and comparing
  - [ ] Add test for `getTransactionDetail` (currently zero coverage)
  - [ ] Add test for `payout.payout` with `custom_fields` object
  - [ ] Add test for empty/null response body
  - [ ] Run tests — all must pass
- **Status**: 🔴 Not started

#### Task 14 — KHQR Offline QR Generation
- **What**: Implement on-premises KHQR QR code generation using EMVCo TLV encoding + CRC-16 CCITT. This is a self-contained module with NO API calls.
- **Files**: `src/khqr-offline.ts` (NEW), `src/__tests__/khqr-offline.test.ts` (NEW), `src/client.ts`, `src/index.ts`
- **Actions**:
  - [ ] Implement EMVCo TLV encoder (Tag-Length-Value format)
  - [ ] Implement CRC-16 CCITT checksum (polynomial `0x1021`, initial `0xFFFF`)
  - [ ] Expose `khqr.generateOfflineQR(params)` method on the PayWay class
  - [ ] Add unit tests with known test vectors
  - [ ] Export types from `index.ts`
- **Status**: 🔴 Not started

#### Task 15 — CHANGELOG & Final Polish
- **What**: Create CHANGELOG, final README review, version bump to `1.0.0`.
- **Files**: `CHANGELOG.md` (NEW), `README.md`, `package.json`
- **Actions**:
  - [ ] Create `CHANGELOG.md` with v0.1.0 and v1.0.0 entries
  - [ ] Add KHQR offline usage example to README
  - [ ] Add retry configuration example to README
  - [ ] Bump version to `1.0.0`
  - [ ] Final `npm pack` and consumer smoke test
- **Status**: 🔴 Not started

**🎯 After Task 15: Tag `v1.0.0` — production-ready release.**

---

## Known Issues (For Reference)

| Severity | Issue | Task |
|---|---|---|
| 🔴 Critical | `getTransactionList` uses arithmetic HMAC proven wrong by sandbox | Task 1 |
| 🟡 Medium | `checkResponseError` false-positive on empty string `body.code` | Task 10 |
| 🟡 Medium | `requestWithMerchantAuth` form encoding silently mangles objects | Task 8 |
| 🟡 Medium | `encryptMerchantAuth` type signature accepts `Record` but payout passes array | Task 12 |
| 🟡 Medium | No test verifies actual HMAC hash values | Task 13 |
| 🟡 Medium | No test for `getTransactionDetail` | Task 13 |
| 🔵 Low | `verifyCallbackSignature` should use explicit base64 encoding for Buffer comparison | Task 8 |
| 🔵 Low | No input validation on `publicKeyPem` format | Deferred |
| 🔵 Low | `formatAmount` accepts negative values silently | Deferred |
| 🔵 Low | `encodeBase64IfNeeded` doesn't handle URLs without scheme | Deferred |

---

## Quick Reference

```
Current version:  1.0.0 (needs change to 0.1.0)
Tests:            90 passing
Build:            Clean (ESM + CJS + .d.ts)
Next task:        Task 1 — Fix arithmetic HMAC bug
```
