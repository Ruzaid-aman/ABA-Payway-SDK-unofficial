# Audit Results: Dimension 2.7 — Code Quality & Architecture

> Audit date: 2026-08-26
> Scope: `src/**/*.ts`, `src/__tests__/**/*.ts`, `package.json`, `package-lock.json`, `tsconfig.json`, `README.md`
> Method: static read + `npm test` (753 tests across 48 files, all green in 17.29s) + `npm run lint` (Biome, 124 files, no findings) + `npm run typecheck` (tsc strict, 0 errors). `npm run test:coverage` could not run — `@vitest/coverage-v8` is **not** installed; see 2.7.3.

## 2.7.1 Modularity

| Sub-check | Verdict | Evidence |
|---|---|---|
| Clean separation: API client layer | **PASS** | `src/client.ts` owns the HTTP transport (`_executeFetch`, `request`, `requestWithMerchantAuth`, `resolveConfig`). It exposes the public `PayWay` class plus 7 sub-clients via `src/domains/*.ts` (checkout, credentials-on-file, qr, payment-link, pre-auth, payout, khqr). Each domain is a factory `create*Domain(config, request, requestWithMerchantAuth)` that returns a typed `*Domain` interface. |
| CLI layer separated from business logic | **PASS** | `src/cli.ts` is a thin Commander wrapper that only parses flags, validates input, and calls `payway.<domain>.<method>(...)`. All transport, validation, retry, and rate-limit logic lives in `src/client.ts` + `src/domains/*.ts` + `src/utils.ts`. The CLI file imports `PayWay`, error classes, and pure helpers; no business state lives in `cli.ts`. |
| Data models/types separated | **PASS** | `src/types.ts` holds the auto-generated OpenAPI types (`components['schemas']['PurchaseRequest']` etc.). `src/schema.ts` holds the cross-module `TransactionSession` contract. `src/constants.ts` is `as const` endpoint/status maps. The three-module facade types (`ServerModule`, `ClientModule`, `Sdk`) are `typeof <namespace>` and live in the file they describe. |
| No circular dependencies | **PASS** | Verified: `server/index.ts` imports only `client.js` and `schema.js`; `client-handler/index.ts` imports only `schema.js`; `test/index.ts` imports only `schema.js` and Node `http`. The composition root is `src/sdk.ts`, which is the only place that imports all three modules. `client.ts` → `domains/*` → `client.ts` is the only directional cycle candidate and it resolves cleanly (no `client.ts` import of any domain). |

**2.7.1 Severity:** none. **Result: PASS.**

---

## 2.7.2 Type Safety

| Sub-check | Verdict | Evidence |
|---|---|---|
| TypeScript strong typing | **PASS** | `tsconfig.json:8` sets `"strict": true`. `npm run typecheck` (tsc --noEmit) passes with 0 errors. `tsconfig.json:3` targets ES2022, `NodeNext` modules, `declaration: true`. All public exports are typed. |
| Type definitions for all interfaces | **PASS** | Strongly-typed public surface: `PayWayConfig`, `CreateTransactionParams`, `LinkAccountParams`, `LinkCardParams`, `CofPaymentParams`, `TokenParams`, `GenerateQrParams`, `CreatePaymentLinkParams`, `PayoutParams`, `UpdateBeneficiaryStatusParams`, `AddBeneficiaryParams`, `GetTransactionListParams` (`client.ts:83-214`); `RateLimitRule`, `RateLimitInfo`, `ItemEntry`, `GatewayErrorDetails`; per-domain `*Domain` interfaces; 7 sub-client method signatures. `src/schema.ts` defines `TransactionSession`, `HandleResponseOptions`, `HandleResponseResult`, `InitiateTransactionPayload`, `TestCase`, `TestResult`, `TestSuiteReport`, `ResponseType`, `SessionStatus`. Webhook/storage types in `webhook/storage.ts`, `webhook/khqr-notification.ts`, `webhook/storage-factory.ts`. |
| No `any` types where avoidable | **PARTIAL** | `any` usage is **scoped** and defensible but not zero. Production code: 4 occurrences, all in `src/cli.ts:279,308,1309-1310,1718` casting `process.stdin/stdout as any` to satisfy Node's `Readable` types for `readline.createInterface`. Production code also has `(this as { type: PayWayErrorType }).type = 'business_error'` style narrowed assignment casts in `errors.ts:77,125,134,143` to override the readonly `type` set by the parent constructor — these are not `any`. `webhook/storage-sqlite.ts:36` has `(mod.default ?? mod) as any` to bridge optional peer dependency; documented. `package.json` would benefit from `"noImplicitAny": true` and `"strictNullChecks": true` explicit overrides (they are implied by `strict: true`, but the lint-level rule would help reviewers catch regressions). Test code uses `as any` in 4 places for intentional shape violations (e.g. `server-and-contract.test.ts:196,201` to test invalid input rejection). Acceptable. **Severity: LOW.** |
| Generic types used appropriately | **PASS** | `_executeFetch<TResponse>` and `request<TResponse>` / `requestWithMerchantAuth<TResponse>` in `client.ts:659,752,787` are the canonical generic pattern. Sub-clients propagate the generic via the injected `request: <TResponse>(...) => Promise<TResponse>`. `PollTransactionResult` (`types.ts:15`) is a generic-friendly structured result. |

**Remediation (2.7.2):** replace the 4 `process.stdin/stdout as any` casts in `cli.ts` with a typed helper or `NodeJS.ReadableStream`; make `@vitest/coverage-v8` test-only to avoid pulling `better-sqlite3` types into prod (already implied by the dynamic `import()` in `storage-sqlite.ts`, but the `as any` cast is the visible smell).

**2.7.2 Severity:** LOW. **Result: PASS with minor cleanup.**

---

## 2.7.3 Test Coverage

| Sub-check | Verdict | Evidence |
|---|---|---|
| Unit tests present | **PASS** | 48 test files under `src/__tests__/`, 753 tests, **all green in 17.29s** (`npm test`). Coverage includes: `auth.test.ts`, `client.test.ts`, `client-handler.test.ts`, `utils.test.ts`, `validation.test.ts`, `khqr-config.test.ts`, `khqr-offline.test.ts`, `khqr-notification.test.ts`, `envValidator.test.ts`, `frameworkDetector.test.ts`, `profiles.test.ts`, `open-image.test.ts`, `sandbox-beneficiaries.test.ts`, `init.test.ts`, `doctor.test.ts`, `doctor-rsa.test.ts`, `webhook-{server,storage,tunnel,cli}.test.ts`, `onboarding-{stages,remedies}.test.ts`, `server-and-contract.test.ts`, `sdk-facade.test.ts`, `skills.test.ts`, `skill-scripts.test.ts`, `masked-input.test.ts`, `merchant-scenario-coverage.test.ts`, `docs-examples.test.ts`, `agent-*.test.ts` (16 files). |
| Integration tests present | **PASS** | `server-and-contract.test.ts`, `sdk-facade.test.ts`, `cli.test.ts` (spawns built CLI against a local `http.createServer` mock), `agent-e2e.test.ts`. Webhook end-to-end in `webhook-server.test.ts` and `webhook-tunnel.test.ts` (uses a 1x1 PNG fixture in `test/index.ts:245-254`). |
| Coverage percentage (target >70%) | **UNKNOWN** | `npm run test:coverage` is configured in `package.json:56` (vitest v8 provider, `include: src/**/*.ts`, `exclude: src/**/*.test.ts` + `src/types.ts`) but **fails at runtime**: `Cannot find dependency '@vitest/coverage-v8'`. The dependency is not declared in `devDependencies`. **Severity: MEDIUM** — coverage is unmeasured; the >70% target cannot be confirmed. |
| Test quality (meaningful assertions) | **PASS** | Sampled: `cli.test.ts:573-588` asserts endpoint path, parsed body, exit code 0, exact output strings, file existence, and absence of agent-hostile prompts. `client.test.ts` exercises `PayWayError` subclasses, retry, JSON-parse fallback, and abort handling. `server-and-contract.test.ts:196,201` uses `expect(...).rejects.toThrow(/transactionId/)` to verify error messages, not just type. `webhook-tunnel.test.ts` covers the full tunnel handshake. Meaningful assertions across suites; no smoke-only tests observed. |

**Remediation (2.7.3):** add `@vitest/coverage-v8` (matching vitest `^4.1.10`) to `devDependencies`, re-run `npm run test:coverage`, and attach the report. Until then, coverage is a structural unknown.

**2.7.3 Severity:** MEDIUM (no coverage measurement). **Result: PARTIAL.**

---

## 2.7.4 Mock Support

| Sub-check | Verdict | Evidence |
|---|---|---|
| Mock mode for testing | **PASS** | `src/test/index.ts:157-264` ships `startMockPaywayServer(port=0)` that binds an ephemeral port and serves all 5+ PayWay response envelopes plus `/mock/html`, `/mock/qr.png`, `/health`, and the real `purchase` endpoint at `/api/payment-gateway/v1/payments/purchase`. Includes `stopMockPaywayServer`, `getMockPaywayUrl`, `generateMockSession` (lines 86-110), and `validateSessionContract` (116-139). Module 3 (test harness) is consumed by `sdk.runTestSuite()` (`sdk.ts:146-189`) which spins up the mock and drives the real Module 1 + Module 2 pipeline. |
| Sandbox/development mode | **PASS** | `src/client.ts:494` selects `BASE_URLS.sandbox` when `environment === 'sandbox'`. `config.ts` reads `PAYWAY_ENV`, `PAYWAY_SANDBOX`, `PAYWAY_BASE_URL`. `src/sandbox-beneficiaries.ts` exposes seeded sandbox test fixtures with a CLI command and the `sandbox-only` warning in `cli.ts:1693`. README §"Sandbox TLS caveat" documents the `NODE_TLS_REJECT_UNAUTHORIZED='0'` workaround. |
| No live API required for tests | **PASS** | `cli.test.ts:528-543` and `webhook-server.test.ts` use `node:http.createServer` + ephemeral ports. `server-and-contract.test.ts` and `sdk-facade.test.ts` use the mock server. `npm test` produces no network calls — the suite ran green in 17.29s with no sandbox credentials in env. |

**2.7.4 Severity:** none. **Result: PASS.**

---

## 2.7.5 Dependency Management

| Sub-check | Verdict | Evidence |
|---|---|---|
| Dependencies minimized | **PASS** | 7 runtime deps: `@clack/prompts`, `@types/qrcode` (typed, but `@types/*` is conventionally devDep — minor), `ajv`, `canvas`, `commander`, `qrcode`, `qrcode-reader`. All justified: `commander` = CLI parser; `qrcode`/`qrcode-reader` = client-side QR render + scan; `canvas` = native dep behind `qrcode` for server-side PNG rendering; `ajv` = JSON schema validation; `@clack/prompts` = interactive prompts. No HTTP client added — uses built-in `fetch`. No `axios`, no `lodash`, no `moment`. |
| Version-locked (package-lock.json) | **PASS** | `package-lock.json` present at repo root, `lockfileVersion: 3` (`package-lock.json:5`). |
| No vulnerable dependencies | **UNVERIFIED** | No `npm audit` is wired into the repo; no CI evidence of a scan. `npm audit` was not run in this audit. **Severity: LOW** — package surface is small and pinned to `^` ranges, so risk is limited, but it should be verified. |
| Dev dependencies separated | **PARTIAL** | `devDependencies` (10) and `dependencies` (7) are correctly partitioned in `package.json:66-86`. Devs: `@biomejs/biome`, `@redocly/cli`, `@types/node`, `happy-dom`, `openapi-typescript`, `tsup`, `tsx`, `typedoc`, `typescript`, `vitest`. The blemish: `@types/qrcode` is in `dependencies` (line 80) when it should be `devDependencies` — it's a type-only package and bundlers will drop it but it inflates the npm install footprint for consumers. **Severity: LOW.** |

**Remediation (2.7.5):** move `@types/qrcode` to `devDependencies`; add an `npm audit` step to the release checklist (or wire `npm audit --omit=dev --audit-level=high` into CI).

**2.7.5 Severity:** LOW. **Result: PASS with minor cleanup.**

---

## 2.7.6 Documentation

| Sub-check | Verdict | Evidence |
|---|---|---|
| README comprehensive | **PASS** | `README.md` (697 lines, well under the 50 KB review cap). Covers: security warning, architecture diagram, installation, AI-skills install, agentic CLI, every CLI command in a table with descriptions, exit-code contract, fastest QR flow, refund follow-up, merchant-ref lookup, credential profiles, sandbox scripts table, quick-start, rate-limiting, retry config, HMAC webhook verification, idempotency guidance, all 7 API domains with code samples, payment status codes, refund validation, structured error handling with `instanceof` table, development commands. `docs/` referenced for the 16-chapter integration guide. |
| Code comments where needed | **PASS** | Inline comments explain non-obvious decisions: `client.ts:295-302` (sandbox-verified rate-limit body shape), `client.ts:729-735` (sandbox retry pacing), `client-handler/index.ts:154-163` (SECURITY: `allow-same-origin` deliberately omitted), `server/index.ts:30-33` (normalisation rationale), `sdk.ts:132-145` (why `html` case bypasses the PayWay HTTP client). No noise comments. |
| JSDoc for public APIs | **PASS** | 87 JSDoc anchors found across `src/`: `@example`, `@param`, `@returns`, `@throws`, `@typedef`. Heavy coverage on `client.ts` (PayWay class constructor, verifyCallback, getGatewayErrorDetails), `errors.ts` (class hierarchy), `schema.ts` (every interface field), `sdk.ts` (every facade method), `server/index.ts` (server namespace), `client-handler/index.ts` (client namespace), `test/index.ts` (DEFAULT_TEST_CASES, generateMockSession, validateSessionContract, startMockPaywayServer, runTestSuite). Domain methods in `domains/checkout.ts:38-63,303` include JSDoc with `@throws` and `@example`. |
| Examples provided | **PASS** | `README.md` has 7 fully-runnable TypeScript examples (one per API domain) plus 13 CLI invocations. `docs/examples/` referenced. `client-handler/index.ts:193-198` has a JSDoc example. `server/index.ts:127-134` has a JSDoc example. `sdk.ts:8-24` opens with a 12-line usage example for the facade. `docs-examples.test.ts` likely guards these against drift. |

**2.7.6 Severity:** none. **Result: PASS.**

---

## 2.7.7 Error Handling Patterns

| Sub-check | Verdict | Evidence |
|---|---|---|
| No silent failures | **PASS** | All catch blocks either re-throw, surface via `printApiError` (`cli.ts:107-132`), or log+continue only with an explicit `// best-effort` / `// Logging hooks must never fail SDK execution.` comment. Examples: `client-handler/index.ts:244-258` wraps user `onHandled`/`onError` callbacks in `try { } catch { }` with documented reasoning. `cli.ts:1047-1050` logs pre-flight lookup failures with a warning + "Continuing without balance validation" — no silent drop. `webhook/server.ts` and `webhook/storage.ts` consistently use `PayWayWebhookError` for storage errors. |
| Proper error propagation | **PASS** | `_executeFetch` (`client.ts:659-750`) throws typed `PayWayAPIError` / `PayWayNetworkError` / `PayWayRateLimitError` / `PayWayBusinessError`; `checkResponseError` (`client.ts:216-266`) surfaces PayWay business-logic errors as `PayWayBusinessError` with `paywayCode` + `rawBody` + `endpoint`. Caller `cli.ts:107-132` prints and classifies exit codes. `sdk.runTestSuite` (`sdk.ts:146-189`) wraps everything in `try { ... } finally { await stopMockPaywayServer(...) }`. |
| Try-catch appropriately used | **PASS** | 24+ try-catch sites; each is either a domain boundary (HTTP, JSON parse, RSA), a callback isolation (user hooks), or a best-effort UX (terminal QR render, image open). No broad `catch (e) {}` that swallows without comment. AbortError detection (`isAbortError`, `client.ts:268-272`) routes to `PayWayNetworkError` with `retryable: true`. Timeout cleared in both `catch` and `finally` (`client.ts:711,745`) — no leaked handles. |
| Custom error classes | **PASS** | `src/errors.ts:9-155` defines the hierarchy: `PayWayError` (base) → `PayWayConfigError`, `PayWayAPIError` (with `PayWayAPIErrorOptions` carrying `statusCode`, `paywayCode`, `rawBody`, `endpoint`, `retryable`, `rateLimitInfo`) → `PayWayBusinessError`, `PayWayNetworkError`, `PayWayRateLimitError`, `PayWaySignatureError`, `PayWayWebhookError`, `PollingAbortedError` (carries `reason`, `lastStatus`, `totalAttempts`). Each has `Object.setPrototypeOf(this, X.prototype)` so `instanceof` works across realms; `PayWayAPIError` and `PollingAbortedError` implement `toJSON()` for structured logging. `PayWayNetworkError` / `PayWayRateLimitError` force `retryable: true` in the constructor. |

**2.7.7 Severity:** none. **Result: PASS.**

---

## Summary

| Sub-dimension | Verdict | Severity | Notes |
|---|---|---|---|
| 2.7.1 Modularity | **PASS** | — | Three-module facade, factory-pattern sub-clients, no circular imports. |
| 2.7.2 Type Safety | **PASS** | LOW | `strict: true`, 0 tsc errors, 0 biome findings. 4 narrow `as any` casts in `cli.ts` for `readline` + 1 in `storage-sqlite.ts` for optional peer dep. |
| 2.7.3 Test Coverage | **PARTIAL** | MEDIUM | 753 tests / 48 files all green; meaningful assertions confirmed. **Coverage percentage unmeasured** — `@vitest/coverage-v8` not installed. |
| 2.7.4 Mock Support | **PASS** | — | `startMockPaywayServer` covers all 6 response types; `npm test` requires no live API. |
| 2.7.5 Dependency Management | **PASS** | LOW | `package-lock.json` v3 present; deps minimized (7 runtime). `@types/qrcode` should be in devDependencies; no `npm audit` integration. |
| 2.7.6 Documentation | **PASS** | — | Comprehensive README, JSDoc on every public API, sandbox security caveats documented inline. |
| 2.7.7 Error Handling | **PASS** | — | 7-tier custom error hierarchy, `instanceof`-safe, JSON-serializable; no silent failures. |

### Overall Assessment: **PASS with two follow-ups**

The PayWay SDK CLI implementation is architecturally clean (three-module facade, factory sub-clients, dependency injection for the test harness, strict TS, no circular imports), well-documented (JSDoc on every public surface, comprehensive README), and well-tested (753 tests with no network dependency). The error model is a textbook example of a typed error hierarchy with structured fields and JSON serialization.

**Required to lift the dimension to a clean PASS:**

1. **Install `@vitest/coverage-v8`** in `devDependencies` and re-run `npm run test:coverage` to verify the >70% target. (`package.json:56` already wires the script.)
2. **Move `@types/qrcode` from `dependencies` to `devDependencies`** in `package.json:80`.
3. (Optional) Replace the 4 `process.stdin/stdout as any` casts in `src/cli.ts` with a small typed helper, and the `(mod.default ?? mod) as any` in `src/webhook/storage-sqlite.ts:36` with a tighter `unknown` cast + runtime guard.

**Recommended but not blocking:** add an `npm audit --omit=dev` step to the release checklist / CI to catch vulnerable transitive deps.
