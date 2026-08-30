# Edge-Case Audit Report — SDK + CLI

**Date:** 2026-08-30
**Scope:** `aba-payway-ts` v1.1.1 (src/, CLI), sandbox `checkout-sandbox.payway.com.kh`
**Method:**
1. Static review of the highest-risk seams (error parsing `client.ts:244-404`, retry engine `client.ts:727-857`, config resolution `client.ts:575-639`, validation `utils.ts`, auth `auth.ts`, env validation `src/config/envValidator.ts`).
2. Adversarial behavior-pinning suite `src/__tests__/edge-case-audit.test.ts` — **43 probes, all passing** (real local HTTP server + real fetch, not mocked Response objects).
3. CLI battery: malformed amounts/IDs, missing flags, unknown commands, credential-less runs.
4. Live sandbox probes (12 calls, `test-output/edge-case-probe/live-probe.log`).

> **Remediation status (2026-08-30):** ALL findings EC-01–EC-23 are fixed (Batch 4 landed via
> `fix/batch-4-p3-polish`) — see `code-improvement-plan.md` and CHANGELOG (Unreleased).
> Behavior-pinning tests for fixed findings have been flipped to regression tests.

Prior campaigns (§1-§12 of `docs/SANDBOX-FINDINGS.md`, `audit-results/four-pillars/`) already
pinned the PTL-code surface, the 403+429 rate-limit shape, and close-transaction semantics.
This campaign targets the **untested seams**: malformed response shapes, retry/throttle
interplay, config edge values, and QR lifecycle bounds. Codes **reconfirmed** here are not
re-listed.

Severity: **P1** = wrong result/money-adjacent, **P2** = misleading failure or resilience gap,
**P3** = rough edge/observability, **P4** = cosmetic.

---

## A. Error & response-shape parsing

| # | Sev | Finding | Location | Pinned by |
|---|-----|---------|----------|-----------|
| EC-01 | P2 | **Legacy numeric `status` bodies pass as success.** `{"status": 6, "description": …}` (the legacy non-`-2` shape, see SANDBOX-FINDINGS §1) resolves without any error — `checkResponseError` only inspects object/string `status`. | `client.ts:244-294` | audit suite A2 |
| EC-02 | P2 | **Non-JSON 4xx/5xx bodies are misreported and never retried.** The string-body check (`createJsonParseError`) runs *before* the `!response.ok` check, so a CDN/LB HTML 503 page surfaces as "Invalid JSON response…" with `statusCode: undefined` and `retryable: false` — a transport outage that the retry engine is designed to absorb is reported as a client-side parse problem. | `client.ts:776-782` + `client.ts:368-384` | audit suite B6/B7 |
| EC-03 | P2 | **`Retry-After` seconds are read as milliseconds.** `parseHeaderNumber` returns the numeric value unchanged; RFC 7231 defines seconds. A proxy sending `Retry-After: 60` produces `retryAfterMs: 60` — the retry hammers the gateway instead of waiting. (Sandbox sends no such header; risk is via proxies/CDNs.) | `client.ts:406-422`, retry path `client.ts:830-833` | audit suite B5 |
| EC-04 | P2 | **Flat top-level `code` is lost on non-OK responses.** `createHttpError` extracts only `status.code`; the legacy list-2 403 shape `{"code": "49"}` yields `paywayCode: undefined` — code-based matching, `explain`, and `PollingAbortedError` NOT_FOUND detection miss it (`getGatewayErrorDetails` still finds it via `rawBody`). | `client.ts:331-346` | audit suite B4 |
| EC-05 | P3 | **Flat `{"code": "429"}` on HTTP 200 is retried but typed as business error.** The retry engine keys off `paywayCode === '429'` (4 attempts with backoff) while the thrown type is `PayWayBusinessError` — callers matching on `instanceof PayWayRateLimitError` won't catch it. | `client.ts:821` + `client.ts:281-293` | audit suite A6 |
| EC-06 | P3 | **`onResponse` hook is not invoked on business errors.** `checkResponseError` throws before the hook; merchants relying on `onResponse` for observability never see 200-wrapped failures. | `client.ts:784-799` | audit suite G1 |
| EC-07 | P3 | **Empty/204 bodies resolve as silent `null` success.** `parseResponseBody` returns `null`; no shape validation follows. A truncated gateway answer is indistinguishable from a real empty success. | `client.ts:302-313` | audit suite A9/A10 |
| EC-08 | P3 | **`contentType` never passed to `createJsonParseError`** — the function advertises "(content-type: …)" context but the only call site omits it, so the hint is dead code. | `client.ts:777` vs `368-384` | audit suite A11 |
| EC-09 | P4 | **Success codes are not trimmed** — `{"status": {"code": "0 "}}` throws `PayWayBusinessError` with `paywayCode: '0 '`. | `client.ts:253-255` | audit suite A3 |

## B. Retry engine & idempotency

| # | Sev | Finding | Location | Pinned by |
|---|-----|---------|----------|-----------|
| EC-10 | P2 | **Non-idempotent purchase calls are silently re-sent** after network errors/5xx/429 (all `retryable`). Sandbox overwrites duplicate `tran_id`, so this recovers transparently there, but production duplicate semantics are an open ABA question (§8c #1/#11). `idempotency_key` exists only on pre-auth. Documented in README now; consider purchase-scoped retry opt-in. | `client.ts:822-826`, `errors.ts:120-127` | audit suite C3 |
| EC-11 | P3 | Confirmed behavior: connection resets consume all attempts (1+maxRetries) before surfacing `PayWayNetworkError`; last-error is the one thrown (no aggregate). | `client.ts:748-856` | audit suite C1 |

## C. Configuration & environment

| # | Sev | Finding | Location | Pinned by |
|---|-----|---------|----------|-----------|
| EC-12 | P2 | **`PAYWAY_ENV=<URL>` is accepted by the validator but silently ignored by the client.** `envValidator` treats a URL-valued `PAYWAY_ENV` as valid; `resolveConfig` only maps `sandbox`/`production`, so without `PAYWAY_BASE_URL` the client quietly uses the sandbox host. | `envValidator.ts:83-95` vs `client.ts:580-588,543-548` | audit suite D1 |
| EC-13 | P2 | **`PAYWAY_TIMEOUT=0`/negative poisons every request.** `?? 30_000` doesn't guard `0`; the AbortController fires instantly, each call times out and burns retries ("Request timed out after 0ms"). No lower-bound validation anywhere. | `client.ts:589,732,749-750` | audit suite C2, D3 |
| EC-14 | P3 | **CLI credential precedence is undocumented and surprising.** With no `.env` in cwd and env cleared, an API command still succeeded using the persisted global profile store ("Using profile: sandbox (sandbox)"). Precedence profile store > `.env` > ambient env should be documented in README/docs/07-… setup and surfaced by `doctor`. | `src/cli.ts` (profile load), `src/config/profiles.ts` | live probe §13e |
| EC-15 | P3 | **Whitespace-only `merchantId`/`apiKey` pass construction** (`'   '` is truthy); the garbage is hashed and sent, producing an opaque gateway code (1/8/26) instead of a local config error. | `client.ts:603-608` | audit suite D2 |

## D. Input validation

| # | Sev | Finding | Location | Pinned by |
|---|-----|---------|----------|-----------|
| EC-16 | **P1** | **`validateBeneficiaries` false-rejects legitimate float sums.** `[1.1, 2.2]` vs total `3.3` accumulates 4.4e-16 error > `Number.EPSILON` (2.2e-16) → `PayWayConfigError "must sum to total amount"`. Real split-payout rejections for valid input. Fix: compare in minor units (cents/sen) or allow a small absolute tolerance. | `utils.ts:172` | audit suite E1 |
| EC-17 | **P1** | **QR `lifetime` below the gateway minimum reaches the wire.** Sandbox-pinned boundary: 179s → HTTP 400 code `"04"`; 180s → success (spec: min 3 mins, max 120 days). `validateLifetime()` accepts any positive integer; CLI advertises seconds with no minimum. Users get an opaque 400. Fix: local `>= 180` check + warn, and surface the seconds→minutes floor. | `utils.ts:61-65`, `domains/qr.ts:57`, `cli.ts` generate-qr | live probes §13a; audit suite E5/E6 |
| EC-18 | P2 | **`generateQr` silently floors seconds to minutes** — `lifetime: 30` sends `lifetime: 0`. Combined with EC-17 this is the direct cause of the opaque `"04"`. | `domains/qr.ts:57` | audit suite E5 |
| EC-19 | P2 | **`validatePublicHttpsUrl` only blocks `localhost`** — `https://127.0.0.1`, `https://192.168.x.x`, `https://10.x.x.x` all pass for `callbackUrl`/`returnUrl`, guaranteeing a gateway call to an unreachable host and silent callback loss. | `utils.ts:67-80` | audit suite E3 |
| EC-20 | P3 | **`validateTransactionId` has no minimum length** — 1-char IDs pass locally (gateway rule for `request_id`/`ctid` is `[a-zA-Z0-9]{5,24}`; tran_id's own min is unverified). | `utils.ts:45-59` vs `constants.ts:170` | audit suite E2 |
| EC-21 | P4 | **`validateLifetime` unbounded above** — 100000s accepted live (~27h); spec max 120 days not enforced locally (low risk, document). | `utils.ts:61-65` | live probe §13a |

## E. Auth & sanitization

| # | Sev | Finding | Location | Pinned by |
|---|-----|---------|----------|-----------|
| EC-22 | P3 | **`verifyCallback()` does not strip `hash` itself** — a payload passed through as received never validates (documented only in JSDoc). The webhook server strips it, but direct `payway.verifyCallback(body, sig)` users must know to destructure first. Add an option to auto-strip. | `auth.ts:56-88`, `client.ts:946-955` | audit suite F2 |
| EC-23 | P4 | **Benign 32+ hex strings are masked in logs** (order refs, content hashes) by the defensive entropy heuristic in `sanitizeForLog`. | `utils.ts:312-323` | audit suite H1 |

## F. CLI probes (all behaved correctly)

- `validate` rejects `abc`, `0`, `-5`, `1.999`, `0.001`, KHR `4000.5`, currency `EUR`, `bad id!` with precise messages, exit **1**. ✅
- Missing required option (`check-transaction` without `-t`) → commander error, exit **1**. ✅
- Unknown command → exit **1**. `explain 999` → friendly unknown-code message, exit **0**. `explain 04` normalizes to `4` "Invalid Data". ✅
- Live: `check-transaction` nonexistent ID → HTTP 200 code 6, printed as "tran_id not found / PayWay code: 6", exit **2**. ✅
- Live: `generate-qr --lifetime 179` → exit **2** with "HTTP Error: 400 … PayWay code: 04". ⚠️ (correct exit code, opaque root cause — see EC-17)

## G. Live sandbox facts (new, 2026-08-30)

| # | Fact | Evidence |
|---|------|----------|
| LS-1 | QR `lifetime` minimum is exactly 180s; 179→400 `"04"`, 180→200; 100000s (~27.8h) accepted | `test-output/edge-case-probe/live-probe.log` |
| LS-2 | Duplicate `tran_id` on generate-qr silently accepted: $5.00 then $7.77 under `ec-probe-dup` → two live QR payloads, both code 00 | same |
| LS-3 | Amount bounds: $0.01 and $100000 USD accepted; KHR 4000 accepted (EMVCo "4000.00") | same |
| LS-4 | `check-transaction` nonexistent → HTTP 200 nested `status.code 6` (reconfirm of §8b); CLI exit 2 | same |
| LS-5 | Gateway code `"04"` (string) is the binding-validation shape on generate-qr; `explain` normalizes it | same |

### Suggested additions to the ABA open-questions list

14. Is the 3-minute QR lifetime minimum (and 120-day max) identical in production?
15. Is duplicate `tran_id` on `generate-qr` (two live QRs, different amounts, one ID) intentional? What does production do?

---

## Verification state

- `src/__tests__/edge-case-audit.test.ts`: **43/43 passing** (pins all in-repo behaviors above).
- Full suite after additions: 49 + 1 files, 796 + 43 tests, all green; `tsc --noEmit` clean; `biome lint` clean on new file.
- Live probes: 12 sandbox calls, no payments initiated, no state mutated beyond throwaway QR creations (`ec-probe-*`).
