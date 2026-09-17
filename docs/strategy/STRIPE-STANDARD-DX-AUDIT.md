# ABA PayWay TypeScript SDK — Stripe-Standard DX Audit & Roadmap

> **Prepared for:** SDK maintainers
> **Prepared by:** DX Engineering audit (AI agent)
> **Date:** 2026-07-17
> **SDK under review:** `aba-payway-ts` v1.0.0 (136 tests passing, 5 test files, ESM+CJS+d.ts build)
> **Benchmark:** [docs.stripe.com/development](https://docs.stripe.com/development), [docs.stripe.com/sdks](https://docs.stripe.com/sdks), [docs.stripe.com/error-handling](https://docs.stripe.com/error-handling), [docs.stripe.com/sdks/versioning](https://docs.stripe.com/sdks/versioning), [docs.stripe.com/api/idempotent_requests](https://docs.stripe.com/api/idempotent_requests)

---

## 0. What "Stripe standard" actually means (extracted principles)

Before auditing, here is what the benchmark documentation actually says Stripe does — the yardstick used throughout this report:

1. **One canonical entry point.** `docs.stripe.com/development` is a single hub linking to SDKs, API reference, testing, CLI, and versioning — a developer never has to guess where documentation lives.
2. **Semantic versioning with a public contract.** Stripe SDKs follow strict SemVer: **major** = breaking (renamed exception classes, changed types), **minor** = additive (new optional param/type), **patch** = behavior-preserving bug fix. The API itself versions separately by release date (`Stripe-Version` header), decoupled from SDK versions, with monthly non-breaking releases and twice-yearly breaking releases. Migration guides live in each SDK repo's wiki.
3. **Idempotency is a first-class, documented primitive.** Every `POST` accepts an `Idempotency-Key`. Stripe explains exactly how it works (24h TTL, parameter-mismatch errors, when NOT to send one) so retries never double-charge a customer.
4. **A typed, closed error taxonomy — not one generic exception.** Every SDK error has a `.type` (`StripeCardError`, `StripeInvalidRequestError`, `StripeAPIConnectionError`, `StripeAPIError`, `StripeAuthenticationError`, `StripeIdempotencyError`, `StripePermissionError`, `StripeRateLimitError`, `StripeSignatureVerificationError`), plus `.code`, `.param`, `.doc_url`, `.request_log_url`, `.requestId`. Docs give a **decision table**: which errors are the caller's fault (fix code/UI), which are transient (retry with idempotency key), which need a human (contact support).
5. **"You don't need to check HTTP status codes."** The library translates non-2xx into typed exceptions; callers never manually inspect `response.ok`.
6. **Automatic retries are opt-in and idempotency-aware.** When retries are enabled, the SDK **generates the idempotency key for you** so retried requests are provably safe.
7. **Webhook signature verification is a single documented helper**, and the docs are unambiguous about *where* the signature lives (a header) and what "unverified" looks like as a failure mode (400 response).
8. **Multi-runtime parity with an explicit support policy.** Every language SDK gets the same versioning rules and a public deprecation table (which Node/Python/Go/etc. versions are supported, deprecated, and dropped, with dates).
9. **Docs and code both describe the *same* mental model.** Nothing in the reference docs contradicts what the code does — the SDK is the docs' source of truth and vice versa.

These nine principles are the rubric applied below.

---

## 1. Executive Summary

The ABA PayWay TypeScript SDK is **already substantially more mature than a typical "vibecoded" SDK**. Prior work (documented in `docs/PROJECT_STATUS.md` and this session's direct verification) has already closed out most of the *critical* bugs a first audit would normally lead with: `cancel_url`/`continue_success_url`/`return_params` are now consistently base64-encoded ([src/domains/checkout.ts](../../src/domains/checkout.ts#L62-L75)), errors use `Object.setPrototypeOf` for reliable `instanceof`, retries with exponential backoff exist, rate-limit throttling exists, and 136 tests pass cleanly across 5 files.

What remains is not "make it work" — it's **"make it feel like Stripe."** Concretely, three things separate this SDK from Stripe-grade DX today:

1. **A live, security-relevant documentation bug**: the README and `docs/11-callbacks-and-webhooks.md` webhook example reads the signature from `req.body.hash`, but the OpenAPI spec (`payway-openapi/components/webhooks.yaml`, `PaymentCallbackBody` schema) says the signature arrives in the **`X-PAYWAY-HMAC-SHA512` header**, and the callback body has no `hash` field at all. Any merchant who copy-pastes the README's webhook handler gets a verification function that is silently fed `undefined` and will treat every webhook as invalid (or, worse, if someone "fixes" it by skipping verification, an unauthenticated webhook). This is exactly the kind of "first 15 minutes" failure Stripe's docs are obsessive about preventing.
2. **A single generic error class instead of a typed taxonomy.** Stripe's entire error-handling philosophy is "switch on `.type`, never guess." This SDK has one `PayWayAPIError` for every failure mode — network timeout, HTTP 5xx, PayWay business-logic failure, rate limit — with only string fields (`paywayCode`, `retryable`) to disambiguate. That forces every consuming app to write its own bespoke classification logic, which is precisely what Stripe's SDK exists to avoid.
3. **No idempotency story, undocumented.** This may be a correct reflection of the underlying PayWay API (it does not appear to document an idempotency-key mechanism), but the SDK doesn't say so anywhere. A developer coming from Stripe will look for this and, finding nothing, won't know if it's missing by design or by oversight — silence here is itself a DX defect.

Beyond these three, the codebase is inconsistent in smaller but compounding ways (input validation exists richly in `checkout` but is entirely absent in `paymentLink`; lint rules that should catch `any`/`!` abuse are set to `warn` instead of `error`; there's no `CONTRIBUTING.md`/`SECURITY.md`/`.github` scaffolding a serious open-source SDK needs). The documentation set, conversely, is a genuine **strength** — the 15-chapter guide with reader-specific learning paths, diagrams, and platform-specific examples arguably exceeds what most Stripe competitor SDKs ship, and should be preserved and cross-linked rather than rebuilt.

**Bottom line:** this is a "B+ SDK with an A+ documentation set and a same-day-fixable critical bug." The roadmap below is sequenced so Priority 1 is achievable as a focused single session; the SDK does not need a rewrite.

### Non-Negotiable Implementation Gates

Before any roadmap item is considered done, it must satisfy all three of these gates:

1. **Tests exist and pass.** Every behavior change needs a regression test in the relevant `src/__tests__/` file, and the full suite must stay green.
2. **Docs are updated.** Any user-facing API change, error-handling change, or workflow change must update the README and the relevant chapter under `docs/`.
3. **Sandbox verification uses API keys.** Anything that touches live PayWay behavior must be validated with sandbox credentials supplied through environment variables, not hardcoded values. For this SDK, that means `PAYWAY_MERCHANT_ID`, `PAYWAY_API_KEY`, and any required RSA/public-key material should be exercised in a sandbox test or probe before release.

These gates are intentionally stricter than a normal library project because payment SDKs fail by being almost-correct.

---

## 2. Detailed Analysis (by pillar)

### 2.1 Ease of Onboarding

| Signal | Stripe | PayWay SDK | Verdict |
|---|---|---|---|
| Single command install | `npm install stripe` | `npm install aba-payway-ts` | ✅ Parity |
| Time to first (real) call | Minutes — key + one call | Minutes — `new PayWay({...})` then `payway.checkout.createTransaction(...)` is a **local, synchronous, non-network HMAC-signing call** ([src/client.ts](../../src/client.ts)); the *first async network call* a merchant makes is typically `checkTransaction` after redirect | ✅ Actually easier to smoke-test than Stripe — no live network call required to validate wiring |
| One documented "canonical" starting doc | `docs.stripe.com/development` | `README.md` exists but **does not link to** `docs/README.md`'s 15-chapter guide, diagrams, or examples folder | ❌ Gap — a new developer reading only the npm README will never discover the deeper docs |
| Correct first webhook example | Verified against API reference | **Wrong** — reads `req.body.hash` (README.md:151, docs/11-callbacks-and-webhooks.md:64,150) vs. spec's `X-PAYWAY-HMAC-SHA512` header (payway-openapi/components/webhooks.yaml:8-26) | 🔴 Critical — breaks trust the moment a merchant implements webhooks, which is one of the first things any payment integration needs working |
| Table of contents / navigability | Yes | No TOC in README.md | ❌ Minor gap |

**Verdict:** Structurally on par with Stripe for the happy path (install → construct client → sign a transaction), but the webhook step — arguably the *second* thing every merchant does after checkout — is currently broken by documentation, not code.

### 2.2 Code Quality & Consistency

Verified directly against source:

- **Domain factory pattern is consistent** across all 7 domains (`checkout`, `credentialsOnFile`, `qr`, `paymentLink`, `preAuth`, `payout`, `khqr`) — each exports an interface + a `create<Domain>Domain(config, request, requestWithMerchantAuth)` factory. This is a genuinely good, Stripe-like "resource namespace" architecture (`payway.checkout.x`, `payway.payout.y` mirrors `stripe.customers.x`, `stripe.charges.y`).
- **Input validation is inconsistent across domains.** `checkout.createTransaction` calls `validateTransactionId`, `validatePositiveAmount`, `validateCurrency`, `validateLifetime` ([src/domains/checkout.ts](../../src/domains/checkout.ts#L56-L60)). `paymentLink.create` accepts an `amount` field but calls **none** of these validators ([src/domains/payment-link.ts](../../src/domains/payment-link.ts#L20-L33)). A merchant who passes a negative amount or a 3-decimal USD value gets caught in `checkout` but not in `paymentLink` — same bug class, different domain, different outcome.
- **Lint configuration under-enforces.** `biome.json` sets `noExplicitAny` and `noNonNullAssertion` to `"warn"` ([biome.json](../../biome.json#L5-L11)), which does not fail CI or `npm run lint` (Biome warnings are non-blocking by default). For a payment SDK, both rules should be `"error"`.
- **Error hierarchy is shallow.** `src/errors.ts` has exactly 3 classes: `PayWayError` → `PayWayConfigError` / `PayWayAPIError`. `PayWayAPIError` carries good *data* (`statusCode`, `paywayCode`, `endpoint`, `retryable`, `rateLimitInfo`, `toJSON()`), but no *type discrimination* — callers must inspect string fields rather than `catch`-and-`instanceof`/`switch` on distinct classes.
- **Naming has no single verb convention** across domains: `checkout.checkTransaction`, `credentialsOnFile.payment`, `payout.payout`, `qr.generateQr`, `khqr.getTransactionsByMerchantRef`. Functionally fine, but a new contributor writing an 8th domain has no style guide to follow.
- **Strengths worth preserving:** timing-safe webhook comparison (`crypto.timingSafeEqual` in `src/auth.ts`), correct RSA PKCS1 117-byte chunking with round-trip tests, token-bucket rate-limit throttling, and generic `_executeFetch` de-duplicating retry/timeout/parsing logic across `request()` and `requestWithMerchantAuth()`.

### 2.3 Documentation & DX

This is the SDK's strongest pillar and should be treated as a competitive asset, not a liability:

- 15 numbered chapters in `docs/` with **persona-specific reading paths** (first-time integrator, mobile dev, backend dev, debugging) documented in `docs/README.md` — this is more structured than most payment SDKs' docs sites.
- 4 Mermaid/diagram files (`payment-lifecycle`, `link-unlink-state-machine`, `callback-flow`, `platform-decision-tree`).
- Runnable examples across web (redirect + popup + QR display), backend (Node + PHP webhook receivers), iOS, Android, and Telegram.
- **Gaps:** (a) the webhook signature bug above lives in *two* of these docs, so the strength is currently undermined by one repeated inaccuracy; (b) no generated API reference (no `typedoc` script in `package.json`) — JSDoc exists in source (confirmed on all public `client.ts` methods) but isn't published anywhere a consumer can browse without reading `.d.ts` files; (c) README.md doesn't cross-link to any of this, so its value is invisible to anyone who only reads the npm package page.

### 2.4 API Design & Idiomatic Usage

- Fully leverages TypeScript: OpenAPI-generated `components['schemas'][...]` types are used as actual method **return types** (not just imports) — e.g., `checkTransaction` returns `Promise<components['schemas']['CheckTransactionResponse']>`. No `any`/`unknown` leak into the public surface. This is genuinely idiomatic and on par with Stripe's own typed-response approach.
- Config object constructor (`new PayWay({ merchantId, apiKey, ... })`) matches the idiomatic single-object-config pattern most Node SDKs (including Stripe) use.
- `onRequest`/`onResponse` observability hooks are a nice touch **beyond** what Stripe's Node SDK exposes out of the box (Stripe relies on its own Dashboard + `stripe.on('request')` events in some SDKs, so this isn't unique, but it's a good idiom either way).
- **Gap:** no fluent/chained request options (Stripe supports a second `options` argument to every method for things like `idempotencyKey`, custom headers, `stripeAccount`). This SDK has no equivalent "escape hatch" argument on domain methods, which limits advanced use (custom per-call timeout, per-call header injection) without touching global config.

### 2.5 Developer-Facing Testing & Reliability

- **136 tests, 5 files, all passing** (verified by running `vitest run` directly this session). Coverage spans HMAC generation/verification, RSA round-trips (including exact byte-boundary tests at 117/118/234/235 bytes), retry/backoff behavior, and rate-limit token-bucket math using fake timers.
- The next implementation pass should preserve or improve this baseline: any new feature should arrive with a regression test, an updated doc example, and a sandbox/API-key verification note.
- Retry logic is real and tested: exponential backoff (`retryDelayMs * 2 ** attempt`), retries only on 5xx/429/network errors, never on 4xx or business-logic failures.
- **Gap:** no test asserts the *documented* webhook example actually works end-to-end (i.e., no regression test would have caught the `req.body.hash` vs. header bug, because the bug lives in prose, not code — this argues for a "doc example as executable test" pattern, discussed below).
- **Gap:** idempotency — not applicable if PayWay's API genuinely has no such mechanism, but this should be an explicit, tested, documented statement rather than silence.

---

## 3. Prioritized Roadmap

Each item includes a success metric, per the request. Effort is relative (S = hours, M = 1 session, L = multi-session).

### Priority 1 — Core DX & Readability ("first 15 minutes")

| # | Task | Why it's P1 | Success metric | Effort |
|---|---|---|---|---|
| 1.1 | **Fix webhook signature docs**: update `README.md` and `docs/11-callbacks-and-webhooks.md` to read the signature from the `X-PAYWAY-HMAC-SHA512` request header (per `payway-openapi/components/webhooks.yaml`), not `req.body.hash`. Add a one-line code comment citing the OpenAPI source of truth. | This is the single bug most likely to make a real integration silently fail or ship insecure. | 0 webhook-related support questions about "verifyCallback always returns false"; both docs match the OpenAPI spec 1:1 (verifiable by a grep for `req.body.hash` returning zero results) | S |
| 1.2 | **Add a README table of contents + explicit link to `docs/README.md`** ("For a full 15-chapter integration guide covering iOS/Android/Telegram/webviews, see docs/"). | Currently the deeper docs are functionally invisible to an npm-only reader. | New developer can navigate from npm README to any of the 15 chapters in ≤ 2 clicks; README contains a direct pointer to the docs learning path | S |
| 1.3 | **Add a "Design decisions" / FAQ note on idempotency and test strategy**: one paragraph stating whether PayWay's API supports idempotency keys, what merchants should do instead if it does not, and how to validate integrations safely with sandbox API keys. | Removes ambiguity that a Stripe-experienced developer will otherwise stumble on, and makes the testing posture explicit. | The word "idempotency" appears in README/docs with an explicit answer, and the docs explain how to run sandbox verification using env-based API keys | S |
| 1.4 | **Executable doc examples**: extract the webhook handler and checkout snippets from README/docs into a small `docs/examples/backend/` script covered by a Vitest test that imports it and asserts behavior, so documentation bugs like 1.1 fail CI in the future. | Prevents regressions of exactly the bug found in 1.1. | At least the webhook-verification example has a passing test that would fail if the doc code were wrong, and the example is verified against sandbox credentials in a gated test | M |

### Priority 2 — Codebase Health & Consistency

| # | Task | Why it matters | Success metric | Effort |
|---|---|---|---|---|
| 2.1 | **Introduce a typed error taxonomy** on top of `PayWayAPIError`: add narrow subclasses (or a discriminated `type` field with values like `'business_error' \| 'network_error' \| 'rate_limit_error' \| 'config_error'`) so callers can `switch` instead of parsing strings, mirroring Stripe's `.type` pattern. | Directly closes the biggest architectural gap vs. Stripe's error-handling philosophy. | A documented `switch (e.type)` example in README works exactly as Stripe's own error-handling doc snippet does, with ≥ 4 distinguishable types and a unit test per type | M |
| 2.2 | **Backfill validation parity across domains**: apply `validatePositiveAmount`/`validateCurrency` (and any other applicable validators) to `paymentLink.create`, and audit `preAuth`/`payout`/`khqr` for the same gap. | Same bug class currently caught in one domain and not others. | Every domain method accepting `amount`/`currency` calls the same validator; add regression tests per domain (target: +1 test per domain minimum) | S–M |
| 2.3 | **Tighten `biome.json`**: set `noExplicitAny` and `noNonNullAssertion` to `"error"`, run `npm run lint`, and fix resulting violations (or add narrowly-scoped inline suppressions with justification comments where `any`/`!` is genuinely required, e.g. JSON parsing boundaries). | Currently these rules are cosmetic warnings only. | `npm run lint` exits non-zero on any new `any`/`!` usage; existing violations reduced to a documented, justified allowlist | M |
| 2.4 | **Establish a naming convention doc** (e.g. `docs/CONTRIBUTING.md` § "Adding a new domain") specifying verb patterns for new domain methods (`create*`, `get*`, `list*`, `verify*`) so future domains don't repeat today's inconsistency (`payment()`, `payout()`, `generateQr()`). | Prevents the inconsistency from compounding as the SDK grows. | New domains added after this doc exists follow the documented verb convention (spot-checkable in code review) | S |
| 2.5 | **Add `CONTRIBUTING.md`, `SECURITY.md`, and minimal `.github/` templates** (issue template, PR template). None currently exist. | Table stakes for any SDK accepting external contributions or security reports, which Stripe (and any serious OSS SDK) has. | Files exist and are linked from README; a security researcher has an unambiguous disclosure path | S |
| 2.6 | **Add a release-gate checklist for API-key-backed testing**: every user-facing change must cite the sandbox credentials used, the command run, and the observed result. | Ensures implementation is not only unit-tested but also validated against the real PayWay sandbox behavior. | Pull requests or release notes include a reproducible sandbox verification note, with secrets sourced from env vars and never committed | S |

### Priority 3 — Advanced Features & Documentation

| # | Task | Why it matters | Success metric | Effort |
|---|---|---|---|---|
| 3.1 | **Per-call request options escape hatch**: add an optional final `options?: { timeoutMs?: number; signal?: AbortSignal }` argument to domain methods (or a fluent `.withOptions()`), matching Stripe's per-call options pattern. | Currently only global config controls timeout/retries; power users can't override per call. | At least `checkTransaction` and `createTransaction`-adjacent calls accept a per-call timeout override, covered by a test | M |
| 3.2 | **Generate a browsable API reference** via `typedoc` (script already trivial to add: `"docs:api": "typedoc --out dist/docs src/index.ts"`), and publish/link it from `docs/README.md`. | JSDoc already exists in source; it's currently invisible outside IDE tooltips. | A generated HTML/markdown API reference exists, is linked from both README.md and docs/README.md, and has at least one smoke test or build verification step | S–M |
| 3.3 | **Formalize a versioning/support policy doc** (`docs/VERSIONING.md`): state the SemVer contract explicitly for this SDK (what counts as breaking for THIS project — e.g., renaming exported types, changing a domain method signature), and the supported Node.js version range (`engines.node` already says `>=18.0.0` — confirm this is intentional and documented, mirroring Stripe's public Node-version deprecation table). | Removes ambiguity for consumers deciding whether to pin or float the dependency version. | `docs/VERSIONING.md` exists, is linked from README, and CHANGELOG.md entries include dates and adhere to Keep a Changelog format (current `CHANGELOG.md` has no dates) | S |
| 3.4 | **Error taxonomy documentation table** (Stripe-style): for each error scenario (network failure, 5xx, PayWay business error, rate limit, signature verification failure), document the recommended handling response, similar to Stripe's error-handling guide's table. | Turns 2.1's code change into a documented decision table developers can act on without reading source. | `docs/12-error-handling-and-debugging.md` contains a table mapping error type → recommended action, cross-referenced from README, and at least one row explicitly says whether the path is covered by unit tests or sandbox API-key validation | S |
| 3.5 | **Consider (research spike, not a commitment) whether a client-side idempotency safety net makes sense**: e.g., an optional in-memory/duration-bounded de-dupe keyed on `tran_id` for `createTransaction`-style calls, purely as a client-side guard against accidental double-submits, clearly documented as *not* equivalent to server-enforced idempotency. | Since the underlying PayWay API doesn't appear to support idempotency keys, the SDK can't replicate Stripe's guarantee — but a documented, honest partial mitigation is more Stripe-like than silence. | A design doc exists; only implement if it doesn't create false confidence — success metric is a clear "what this does and doesn't protect against" doc section, reviewed before any code ships | L (spike first) |

### 3.6 Priority 1 Execution Plan

This is the exact order I would use to execute Priority 1.

#### Step 1: Fix the webhook docs first

Purpose: eliminate the security-relevant doc mismatch before adding any new examples.

Files:
- [README.md](../../README.md)
- [docs/11-callbacks-and-webhooks.md](../guides/11-callbacks-and-webhooks.md)
- [docs/README.md](../README.md)

Changes:
- Replace every `req.body.hash` example with header-based extraction from `X-PAYWAY-HMAC-SHA512`.
- Add a short note that the callback body is signed using the header, not a body field.
- Add an explicit pointer from the top-level README to the long-form docs index in `docs/README.md`.

Validation:
- `npx vitest run src/__tests__/client.test.ts`
- `npx vitest run src/__tests__/auth.test.ts`
- `npm run lint`

Sandbox/API-key command:
- `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> PAYWAY_PUBLIC_KEY_PEM=<sandbox_public_key_path_or_value> npm run probe`

Done when:
- The docs no longer mention `req.body.hash`.
- The README links directly to the full docs entry point.
- A sandbox callback example has been verified with real sandbox credentials.

#### Step 2: Add the idempotency and testing note

Purpose: remove ambiguity for Stripe-experienced developers and make the test posture explicit.

Files:
- [README.md](../../README.md)
- [docs/12-error-handling-and-debugging.md](../guides/12-error-handling-and-debugging.md)

Changes:
- Add one short FAQ section explaining that PayWay does not currently expose Stripe-style idempotency keys (if that remains true after verification).
- State the recommended merchant-side duplicate-protection strategy using `tran_id` uniqueness and post-submit verification.
- Document that sandbox validation must use environment-provided API keys.

Validation:
- `npx vitest run src/__tests__/client.test.ts`
- `npx vitest run src/__tests__/merchant-scenario-coverage.test.ts`

Sandbox/API-key command:
- `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> npm run probe`

Done when:
- The README and the error-handling chapter both answer the idempotency question explicitly.
- The docs tell a developer how to validate the integration without hardcoding secrets.

#### Step 3: Make the doc examples executable

Purpose: ensure the prose examples are backed by runnable code so docs regressions fail CI.

Files:
- [docs/examples/backend/](../examples/backend)
- [src/__tests__/docs-examples.test.ts](../../src/__tests__/docs-examples.test.ts)

Changes:
- Extract the webhook verification example into a small reusable example module.
- Extract the checkout signing example into a second reusable example module.
- Add tests that import the example module(s) and assert the expected behavior.

Validation:
- `npx vitest run src/__tests__/docs-examples.test.ts`
- `npm test`
- `npm run build`

Sandbox/API-key command:
- `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> PAYWAY_PUBLIC_KEY_PEM=<sandbox_public_key_path_or_value> npm run probe`

Done when:
- The example code and the docs are the same source of truth.
- A change to the documented webhook flow would fail a test before it reaches release.

#### Step 4: Close the README navigation gap

Purpose: make the deep docs discoverable from the npm landing page.

Files:
- [README.md](../../README.md)
- [docs/README.md](../README.md)

Changes:
- Add a short table of contents or quick-links block near the top of the README.
- Link the deep documentation guide, diagrams, and examples in one place.

Validation:
- `npm run lint`
- `npx vitest run src/__tests__/client.test.ts`

Sandbox/API-key command:
- `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> npm run probe`

Done when:
- A new user can go from the npm README to the docs learning path without guessing where the long-form guide lives.

### 3.7 Priority 2 Execution Plan

This is the exact order I would use to execute Priority 2.

#### Step 1: Introduce the typed error taxonomy

Purpose: make PayWay errors classifiable without string parsing.

Files:
- [src/errors.ts](../../src/errors.ts)
- [src/client.ts](../../src/client.ts)
- [src/__tests__/client.test.ts](../../src/__tests__/client.test.ts)
- [README.md](../../README.md)
- [docs/12-error-handling-and-debugging.md](../guides/12-error-handling-and-debugging.md)

Changes:
- Add narrow subclasses or a discriminated `type` field for business, network, rate-limit, and config failures.
- Ensure `PayWayAPIError.toJSON()` includes the new classification field.
- Update the README error-handling example so it shows the new classification pattern.
- Add a documentation table in the debugging guide that maps each error class/type to the recommended response.

Validation:
- `npx vitest run src/__tests__/client.test.ts`
- `npx vitest run src/__tests__/auth.test.ts`
- `npm run lint`
- `npm run typecheck`

Sandbox/API-key command:
- `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> npm run probe`

Done when:
- Callers can distinguish at least four error categories without inspecting arbitrary strings.
- The README and error guide show the same taxonomy that the code exposes.

#### Step 2: Backfill validation parity across domains

Purpose: make input validation consistent wherever the SDK accepts money, currency, or identifiers.

Files:
- [src/domains/payment-link.ts](../../src/domains/payment-link.ts)
- [src/domains/pre-auth.ts](../../src/domains/pre-auth.ts)
- [src/domains/payout.ts](../../src/domains/payout.ts)
- [src/domains/khqr.ts](../../src/domains/khqr.ts)
- [src/utils.ts](../../src/utils.ts)
- [src/__tests__/client.test.ts](../../src/__tests__/client.test.ts)
- [src/__tests__/utils.test.ts](../../src/__tests__/utils.test.ts)
- [src/__tests__/merchant-scenario-coverage.test.ts](../../src/__tests__/merchant-scenario-coverage.test.ts)

Changes:
- Apply the same `validatePositiveAmount` and `validateCurrency` checks used in checkout to the other money-moving domains.
- Add or reuse helper validation for any domain-specific required identifiers.
- Ensure any new validation failures return `PayWayConfigError` with a clear message.

Validation:
- `npx vitest run src/__tests__/utils.test.ts`
- `npx vitest run src/__tests__/client.test.ts`
- `npx vitest run src/__tests__/merchant-scenario-coverage.test.ts`
- `npm run typecheck`

Sandbox/API-key command:
- `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> npm run probe`

Done when:
- Every domain that takes an amount or currency applies the same validation rules.
- The regression tests prove invalid input is rejected before any network request is attempted.

#### Step 3: Tighten Biome enforcement

Purpose: make the linter actually block unsafe patterns instead of just warning about them.

Files:
- [biome.json](../../biome.json)
- [src/client.ts](../../src/client.ts)
- [src/errors.ts](../../src/errors.ts)
- [src/utils.ts](../../src/utils.ts)
- [src/__tests__/*.ts](../../src/__tests__)

Changes:
- Change `noExplicitAny` and `noNonNullAssertion` to `error`.
- Fix or narrowly suppress the violations that surface, with justification comments where needed.
- Keep the public API surface free of avoidable unsound casts.

Validation:
- `npm run lint`
- `npm run typecheck`
- `npx vitest run`

Sandbox/API-key command:
- `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> npm run probe`

Done when:
- The lint command fails on newly introduced `any` or non-null assertions.
- Existing violations are either removed or clearly justified.

#### Step 4: Add contribution and security entry points

Purpose: make the project ready for outside contributors and security reporters.

Files:
- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [SECURITY.md](../../SECURITY.md)
- [README.md](../../README.md)
- [.github/](../../.github)

Changes:
- Add a short contribution guide that explains how to run tests, lint, typecheck, and sandbox verification.
- Add a security policy that tells researchers where and how to report issues.
- Add minimal GitHub issue and pull request templates if the repository uses them.

Validation:
- `npx vitest run`
- `npm run lint`
- `npm run build`

Sandbox/API-key command:
- `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> npm run probe`

Done when:
- External contributors have a clear path to local validation.
- Security researchers have a documented disclosure route.

#### Step 5: Add a release-gate checklist for API-key-backed testing

Purpose: make sandbox verification a repeatable release requirement instead of an ad hoc habit.

Files:
- [docs/STRIPE-STANDARD-DX-AUDIT.md](STRIPE-STANDARD-DX-AUDIT.md)
- [README.md](../../README.md)
- [docs/README.md](../README.md)

Changes:
- Add a short checklist telling maintainers to record the sandbox command, credentials source, and observed result for every user-facing change.
- Link that checklist from the README and the long-form docs index.

Validation:
- `npm run lint`
- `npx vitest run src/__tests__/client.test.ts`

Sandbox/API-key command:
- `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> PAYWAY_PUBLIC_KEY_PEM=<sandbox_public_key_path_or_value> npm run probe`

Done when:
- Release notes or PR notes can point to a reproducible sandbox command and result.
- No user-facing change is considered complete without an API-key-backed verification note.

### 3.8 Priority 3 Execution Plan

This is the exact order I would use to execute Priority 3.

#### Step 1: Add per-call request options

Purpose: give advanced users a narrow escape hatch without forcing global config changes.

Files:
- [src/client.ts](../../src/client.ts)
- [src/domains/checkout.ts](../../src/domains/checkout.ts)
- [src/domains/payment-link.ts](../../src/domains/payment-link.ts)
- [src/domains/qr.ts](../../src/domains/qr.ts)
- [src/domains/pre-auth.ts](../../src/domains/pre-auth.ts)
- [src/domains/payout.ts](../../src/domains/payout.ts)
- [src/domains/credentials-on-file.ts](../../src/domains/credentials-on-file.ts)
- [src/domains/khqr.ts](../../src/domains/khqr.ts)
- [src/__tests__/client.test.ts](../../src/__tests__/client.test.ts)

Changes:
- Add a small per-call options shape for timeout and abort signal handling.
- Thread the options through the request helpers without changing the default behavior.
- Keep the API additive so existing consumers do not break.

Validation:
- `npx vitest run src/__tests__/client.test.ts`
- `npm run typecheck`
- `npm run lint`

Sandbox/API-key command:
- `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> npm run probe`

Done when:
- A single call can override timeout behavior without mutating global config.
- Existing domain methods still behave exactly as before when no options are passed.

#### Step 2: Generate a browsable API reference

Purpose: turn existing JSDoc into a published reference that developers can browse outside the editor.

Files:
- [package.json](../../package.json)
- [tsup.config.ts](../../tsup.config.ts)
- [docs/README.md](../README.md)
- [README.md](../../README.md)
- [src/index.ts](../../src/index.ts)

Changes:
- Add a docs generation script such as `typedoc`.
- Link the generated API reference from the README and the docs entry point.
- Keep the output versioned or reproducible in CI if the repo publishes generated docs.

Validation:
- `npm run build`
- `npm run typecheck`
- `npm run lint`

Sandbox/API-key command:
- `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> npm run probe`

Done when:
- A developer can browse the public API without opening source files.
- The generated reference matches the exported API surface.

#### Step 3: Formalize versioning and support policy

Purpose: make compatibility promises explicit for maintainers and consumers.

Files:
- [docs/VERSIONING.md](../project/VERSIONING.md)
- [CHANGELOG.md](../../CHANGELOG.md)
- [README.md](../../README.md)
- [package.json](../../package.json)

Changes:
- Document the SemVer rules this SDK actually follows.
- Explain what constitutes a breaking change for the PayWay SDK.
- Add the supported Node.js runtime range and how it is enforced.
- Make the changelog date-driven and easy to scan.

Validation:
- `npm run lint`
- `npm run typecheck`
- `npx vitest run`

Sandbox/API-key command:
- `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> npm run probe`

Done when:
- Consumers can tell when a version bump is safe to adopt.
- The changelog and docs describe the same support policy.

#### Step 4: Add the error taxonomy documentation table

Purpose: translate the new error taxonomy into a user-facing decision guide.

Files:
- [docs/12-error-handling-and-debugging.md](../guides/12-error-handling-and-debugging.md)
- [README.md](../../README.md)
- [src/errors.ts](../../src/errors.ts)

Changes:
- Add a table that maps each error category to the recommended response.
- Include guidance for retryable vs non-retryable failures.
- Make the table match the runtime taxonomy exactly.

Validation:
- `npx vitest run src/__tests__/client.test.ts`
- `npm run lint`
- `npm run typecheck`

Sandbox/API-key command:
- `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> npm run probe`

Done when:
- The docs tell a developer what to do next for each failure mode.
- The guidance is consistent with the code and the README example.

#### Step 5: Decide whether to pursue client-side idempotency mitigation

Purpose: keep Stripe-style safety expectations honest without pretending PayWay has a server-side idempotency contract.

Files:
- [docs/STRIPE-STANDARD-DX-AUDIT.md](STRIPE-STANDARD-DX-AUDIT.md)
- [README.md](../../README.md)
- [docs/12-error-handling-and-debugging.md](../guides/12-error-handling-and-debugging.md)
- [src/client.ts](../../src/client.ts)

Changes:
- Document the decision clearly, even if the answer is to do nothing.
- If a guard is implemented, keep it explicitly advisory and bounded.
- Avoid making the SDK appear safer than the upstream API actually is.

Validation:
- `npx vitest run src/__tests__/client.test.ts`
- `npx vitest run src/__tests__/merchant-scenario-coverage.test.ts`
- `npm run lint`

Sandbox/API-key command:
- `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> npm run probe`

Done when:
- The docs explicitly say whether any mitigation exists and what it does not guarantee.
- No caller could reasonably mistake the mitigation for server-enforced idempotency.

### 3.9 Consolidated Implementation Checklist

Use this as the single run list for implementation. The detailed priority sections above remain the reference, but this is the checklist to execute and tick off.

- [ ] **P1.1 Fix webhook docs** - Files: [README.md](../../README.md), [docs/11-callbacks-and-webhooks.md](../guides/11-callbacks-and-webhooks.md), [docs/README.md](../README.md). Tests: `npx vitest run src/__tests__/client.test.ts`, `npx vitest run src/__tests__/auth.test.ts`, `npm run lint`. Sandbox: `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> PAYWAY_PUBLIC_KEY_PEM=<sandbox_public_key_path_or_value> npm run probe`.
- [ ] **P1.2 Add README navigation** - Files: [README.md](../../README.md), [docs/README.md](../README.md). Tests: `npm run lint`, `npx vitest run src/__tests__/client.test.ts`. Sandbox: `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> npm run probe`.
- [ ] **P1.3 Add idempotency and test-strategy note** - Files: [README.md](../../README.md), [docs/12-error-handling-and-debugging.md](../guides/12-error-handling-and-debugging.md). Tests: `npx vitest run src/__tests__/client.test.ts`, `npx vitest run src/__tests__/merchant-scenario-coverage.test.ts`. Sandbox: `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> npm run probe`.
- [ ] **P1.4 Make doc examples executable** - Files: [docs/examples/backend/](../examples/backend), [src/__tests__/docs-examples.test.ts](../../src/__tests__/docs-examples.test.ts). Tests: `npx vitest run src/__tests__/docs-examples.test.ts`, `npm test`, `npm run build`. Sandbox: `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> PAYWAY_PUBLIC_KEY_PEM=<sandbox_public_key_path_or_value> npm run probe`.
- [ ] **P2.1 Add typed error taxonomy** - Files: [src/errors.ts](../../src/errors.ts), [src/client.ts](../../src/client.ts), [src/__tests__/client.test.ts](../../src/__tests__/client.test.ts), [README.md](../../README.md), [docs/12-error-handling-and-debugging.md](../guides/12-error-handling-and-debugging.md). Tests: `npx vitest run src/__tests__/client.test.ts`, `npx vitest run src/__tests__/auth.test.ts`, `npm run lint`, `npm run typecheck`. Sandbox: `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> npm run probe`.
- [ ] **P2.2 Backfill validation parity** - Files: [src/domains/payment-link.ts](../../src/domains/payment-link.ts), [src/domains/pre-auth.ts](../../src/domains/pre-auth.ts), [src/domains/payout.ts](../../src/domains/payout.ts), [src/domains/khqr.ts](../../src/domains/khqr.ts), [src/utils.ts](../../src/utils.ts), [src/__tests__/client.test.ts](../../src/__tests__/client.test.ts), [src/__tests__/utils.test.ts](../../src/__tests__/utils.test.ts), [src/__tests__/merchant-scenario-coverage.test.ts](../../src/__tests__/merchant-scenario-coverage.test.ts). Tests: `npx vitest run src/__tests__/utils.test.ts`, `npx vitest run src/__tests__/client.test.ts`, `npx vitest run src/__tests__/merchant-scenario-coverage.test.ts`, `npm run typecheck`. Sandbox: `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> npm run probe`.
- [ ] **P2.3 Tighten Biome enforcement** - Files: [biome.json](../../biome.json), [src/client.ts](../../src/client.ts), [src/errors.ts](../../src/errors.ts), [src/utils.ts](../../src/utils.ts), [src/__tests__/*.ts](../../src/__tests__). Tests: `npm run lint`, `npm run typecheck`, `npx vitest run`. Sandbox: `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> npm run probe`.
- [ ] **P2.4 Add contribution and security entry points** - Files: [CONTRIBUTING.md](../../CONTRIBUTING.md), [SECURITY.md](../../SECURITY.md), [README.md](../../README.md), [.github/](../../.github). Tests: `npx vitest run`, `npm run lint`, `npm run build`. Sandbox: `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> npm run probe`.
- [ ] **P2.5 Add release-gate checklist** - Files: [docs/STRIPE-STANDARD-DX-AUDIT.md](STRIPE-STANDARD-DX-AUDIT.md), [README.md](../../README.md), [docs/README.md](../README.md). Tests: `npm run lint`, `npx vitest run src/__tests__/client.test.ts`. Sandbox: `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> PAYWAY_PUBLIC_KEY_PEM=<sandbox_public_key_path_or_value> npm run probe`.
- [ ] **P3.1 Add per-call request options** - Files: [src/client.ts](../../src/client.ts), [src/domains/checkout.ts](../../src/domains/checkout.ts), [src/domains/payment-link.ts](../../src/domains/payment-link.ts), [src/domains/qr.ts](../../src/domains/qr.ts), [src/domains/pre-auth.ts](../../src/domains/pre-auth.ts), [src/domains/payout.ts](../../src/domains/payout.ts), [src/domains/credentials-on-file.ts](../../src/domains/credentials-on-file.ts), [src/domains/khqr.ts](../../src/domains/khqr.ts), [src/__tests__/client.test.ts](../../src/__tests__/client.test.ts). Tests: `npx vitest run src/__tests__/client.test.ts`, `npm run typecheck`, `npm run lint`. Sandbox: `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> npm run probe`.
- [ ] **P3.2 Generate a browsable API reference** - Files: [package.json](../../package.json), [tsup.config.ts](../../tsup.config.ts), [docs/README.md](../README.md), [README.md](../../README.md), [src/index.ts](../../src/index.ts). Tests: `npm run build`, `npm run typecheck`, `npm run lint`. Sandbox: `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> npm run probe`.
- [ ] **P3.3 Formalize versioning and support policy** - Files: [docs/VERSIONING.md](../project/VERSIONING.md), [CHANGELOG.md](../../CHANGELOG.md), [README.md](../../README.md), [package.json](../../package.json). Tests: `npm run lint`, `npm run typecheck`, `npx vitest run`. Sandbox: `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> npm run probe`.
- [ ] **P3.4 Add error taxonomy documentation table** - Files: [docs/12-error-handling-and-debugging.md](../guides/12-error-handling-and-debugging.md), [README.md](../../README.md), [src/errors.ts](../../src/errors.ts). Tests: `npx vitest run src/__tests__/client.test.ts`, `npm run lint`, `npm run typecheck`. Sandbox: `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> npm run probe`.
- [ ] **P3.5 Decide on client-side idempotency mitigation** - Files: [docs/STRIPE-STANDARD-DX-AUDIT.md](STRIPE-STANDARD-DX-AUDIT.md), [README.md](../../README.md), [docs/12-error-handling-and-debugging.md](../guides/12-error-handling-and-debugging.md), [src/client.ts](../../src/client.ts). Tests: `npx vitest run src/__tests__/client.test.ts`, `npx vitest run src/__tests__/merchant-scenario-coverage.test.ts`, `npm run lint`. Sandbox: `PAYWAY_MERCHANT_ID=<sandbox_merchant_id> PAYWAY_API_KEY=<sandbox_api_key> npm run probe`.

---

## 4. Potential Challenges & Trade-offs

1. **The webhook doc fix (1.1) requires re-verifying against a live PayWay sandbox callback**, not just the OpenAPI spec, since `SANDBOX-FINDINGS.md` notes some behavioral surprises elsewhere (e.g., HTTP 200-wrapped business errors). The risk is not only a wrong field name: if the sandbox callback shape differs from the schema, a copy-pasted example can still break even after the docs are technically aligned with the spec. Before shipping the corrected docs, capture one real webhook payload/header pair from the sandbox and confirm the header name, callback body keys, signature canonicalization, and failure response all match the documented flow.
2. **Introducing a typed error taxonomy (2.1) is a public API change.** Any consumer currently doing `catch (e) { if (e instanceof PayWayAPIError) ... }` continues to work if the taxonomy is additive (new optional `type` discriminant field or new subclasses that still extend `PayWayAPIError`), but this must be done additively to avoid a major version bump this early in adoption. The design trade-off is between Stripe-like ergonomics and long-term stability: a richer taxonomy helps callers, but every new class or discriminant becomes part of the compatibility contract and must be documented, tested, and preserved.
3. **Tightening lint rules (2.3) may surface a non-trivial number of existing `any`/`!` usages** (the OpenAPI-generated `types.ts` and raw `fetch`/`Response` parsing boundaries are the likely hotspots). Budget time to triage: some usages are legitimate (parsing truly-untyped JSON) and should get scoped `// biome-ignore` comments with justification rather than being contorted into unsound casts just to satisfy the linter. The trade-off is velocity versus safety: if the team adds too many suppressions, the rule becomes ceremonial; if the team over-corrects, it may introduce noisy wrapper code around natural TypeScript boundaries.
4. **Validation parity (2.2) can expose domain-specific exceptions that are not actually bugs.** Some endpoints may intentionally allow broader input shapes or endpoint-specific edge cases, so the challenge is to normalize only the common invariants (amount, currency, required identifiers) without flattening legitimate domain differences. The mitigation is to codify the shared rules in tests first, then isolate true exceptions with a short comment in code or docs so future contributors know the asymmetry is intentional.
5. **Idempotency (3.5) is the highest-risk item.** Faking idempotency client-side (e.g., de-duping by `tran_id` in memory) can create a false sense of safety across multiple server instances/restarts — worse than no idempotency at all if merchants assume it behaves like Stripe's server-enforced guarantee. This should remain a documented research spike, not a committed roadmap item, until there's confirmation of what PayWay's backend actually guarantees on retried `tran_id`s. The most likely outcome is that the SDK should document a merchant-side duplicate-prevention strategy rather than implement a misleading approximation.
6. **Documentation is already large (15 chapters + diagrams + examples).** Adding a generated API reference (3.2) and versioning doc (3.3) risks documentation sprawl without a single navigable index. The README TOC fix (1.2) should land *before* 3.2/3.3 so new docs have an obvious home instead of becoming orphaned files. There is also a discoverability trade-off: the more docs the project adds, the more important it becomes to keep one obvious "start here" page that routes different user personas to the right depth.
7. **Sandbox testing must remain a release gate, not an afterthought.** If a change touches request construction, response parsing, error handling, or webhook verification, require a sandbox/API-key-backed verification step before calling it done. The trade-off is operational cost: sandbox probes take longer than unit tests and may be blocked by credential availability, but skipping them is how payment integrations ship hidden incompatibilities.
8. **Per-call request options (3.1) can complicate the request surface area.** Adding per-call overrides improves ergonomics for advanced users, but it also creates precedence rules between global config and method-level options. Those rules need to be explicit and tested so users know what wins when both timeout and abort signal are present.
9. **Generated API docs (3.2) can drift from source if they are not wired into CI.** If the typedoc output is only generated manually, it will slowly become stale and undermine trust. The mitigation is to make docs generation reproducible and add at least one build verification step so the published reference stays aligned with exported types.
10. **Resourcing:** Priority 1 is realistically a single focused session. Priority 2 is where most of the actual engineering time will go (validation parity audit across 7 domains, lint cleanup). Priority 3 items are individually small but collectively open-ended (typedoc styling, versioning policy bikeshedding) — timebox them. The practical trade-off is depth versus breadth: each added safeguard improves the SDK, but every safeguard also adds maintenance cost that should be justified by user-facing risk.

---

## 5. Quick-Reference: Verified Current State (for future audits)

- Version: `1.0.0` · Tests: **136 passing / 5 files** (verified via `npx vitest run` this session)
- `.npmignore` **exists** and already excludes `docs/`, `scripts/`, `payway-boilerplate/`, `*.yaml`, test files — publish hygiene is already handled, contrary to what a naive `grep` for the file might suggest if run against a stale cache.
- `cancel_url`, `continue_success_url`, `return_params` **are already** consistently `encodeBase64IfNeeded()`-wrapped in [src/domains/checkout.ts](../../src/domains/checkout.ts#L62-L75) — the "critical encoding bug" recorded in earlier session memory (`docs/PROJECT_STATUS.md` Task 1) is resolved and should not be re-flagged in future passes.
- Real, currently-open gaps confirmed by direct file inspection this session: webhook signature doc/spec mismatch (README.md:151, docs/11:64,150 vs payway-openapi/components/webhooks.yaml:8-26), `biome.json` permissive lint rules, missing `CONTRIBUTING.md`/`SECURITY.md`/`.github/`, validation gap in `src/domains/payment-link.ts`, shallow error taxonomy in `src/errors.ts`.
