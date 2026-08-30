# Code & Documentation Improvement Plan

**Date:** 2026-08-30
**Input:** `audit-results/edge-case-report.md` (23 findings EC-01…EC-23 + 5 live facts LS-1…LS-5), prior audits in this directory.
**Ground rule:** each item lists the exact seam, the suggested change, and the test update required. The
behavior-pinning suite `src/__tests__/edge-case-audit.test.ts` must be consciously updated with every
code change below — that is by design.

---

## P1 — wrong result / money-adjacent (fix first)

### 1. Beneficiary sum comparison in minor units (EC-16) — ✅ DONE 2026-08-30
- **Where:** `src/utils.ts` (`validateBeneficiaries`)
- **Problem:** `Math.abs(sum - totalAmount) > Number.EPSILON` false-rejects legitimate splits: `[1.1, 2.2]` vs `3.3` fails (4.4e-16 > 2.2e-16).
- **Change:** compare in integer minor units: `Math.round(sum * 100) !== Math.round(totalAmount * 100)` for USD; `Math.round` (sen-less) for KHR. Keep a `> 0.005`-style absolute tolerance as a belt-and-braces guard.
- **Tests:** flip audit suite E1 to expect **no throw** for `[1.1, 2.2]/3.3`; add a genuinely-unbalanced case (e.g. `[1.1, 2.2]` vs `3.31`) still throwing.

### 2. Enforce the QR lifetime minimum locally (EC-17, EC-18, LS-1) — ✅ DONE 2026-08-30
- **Where:** `src/utils.ts` (`validateQrLifetimeSeconds`, new), `src/domains/qr.ts`, `src/cli.ts`, `src/constants.ts` (`QR_LIFETIME_MIN_SECONDS = 180`, exported).
- **Problem:** gateway minimum is 3 minutes (sandbox-pinned: 179→400 `"04"`, 180→OK) and the API unit is *minutes*, but the SDK/CLI speak seconds and floor silently — `lifetime: 30` sends `0` and dies opaquely.
- **Change (as implemented):** the minimum lives in the QR domain, not the shared validator — `checkout.purchase` forwards its `lifetime` in MINUTES (spec min 3, below-min → error 69, now in `GATEWAY_CODE_HINTS` + docs/12), so a shared `>= 180` check would false-reject a valid checkout `lifetime: 3`. `validateQrLifetimeSeconds()` rejects 1–179s with a message naming the gateway minimum; the seconds→minutes conversion keeps its **floor** (deliberate deviation from the ceil suggestion: a QR must never outlive the merchant's displayed countdown, and with the min enforced, floor can never send 0). CLI `--lifetime` validates locally with a clear message (exit 1, no network call). Upper bound left unenforced (documented; EC-21).
- **Tests:** audit suite E5/E6 updated; add a pin that `lifetime: 30` now throws `PayWayConfigError` locally and `lifetime: 180` sends `3`.
- **Docs:** already updated (`docs/07`, `docs/12` `"04"` row) — no further work.

### 3. Retry non-JSON 5xx responses (EC-02) — ✅ DONE 2026-08-30
- **Where:** `src/client.ts` (`_executeFetch` — `!response.ok` check moved before the body-shape check).
- **Problem:** a CDN/LB HTML 503 page becomes a non-retryable "Invalid JSON response" with the HTTP status lost — exactly the failure mode the retry engine exists for.
- **Change (as implemented):** reordered — when `!response.ok`, the error is always built via `createHttpError` (which handles non-object bodies and keeps `statusCode`; 5xx stay retryable). The `createJsonParseError` path (with its HTML hint) now only applies to **2xx** non-JSON bodies. The `contentType` parameter remains unpassed (Batch 3 item 14).
- **Tests:** audit suite B5/B7 flipped to expect `statusCode` 500/503, `retryable: true`, and `maxRetries + 1` requests; the 200-HTML hint case unchanged.

### 4. Parse `Retry-After` as seconds (EC-03) — ✅ DONE 2026-08-30
- **Where:** `src/client.ts` (`parseRetryAfterMs`, new; used by `parseRateLimitInfo`).
- **Change (as implemented):** `retry-after`/`x-retry-after` moved to a dedicated `parseRetryAfterMs()` that multiplies numeric values by 1000 (clamped ≥ 0) and keeps HTTP-date parsing; `x-rate-limit-*` limit/remaining/reset continue through `parseHeaderNumber` unchanged. Remaining follow-up (Batch 4): document the epoch-seconds vs ms assumption for `*-reset` in `RateLimitInfo`.
- **Tests:** audit suite B5 flipped to `retryAfterMs === 1000` for `Retry-After: 1`; HTTP-date and raw-header-passthrough pins added.

---

## P2 — misleading failures / resilience gaps

### 5. Extract flat `code` on non-OK responses (EC-04) — ✅ DONE 2026-08-30
- **Where:** `src/client.ts` (`createHttpError`).
- **Change:** after the `status.code` attempt, fall back to a flat non-object `body.code` (string/number, non-zero) so the legacy list-2 403 shape `{"code":"49"}` populates `paywayCode`.
- **Tests:** audit suite B4 flips to `paywayCode === '49'`.

### 6. Handle legacy numeric `status` bodies explicitly (EC-01) — ✅ DONE 2026-08-30
- **Where:** `src/client.ts` (`checkResponseError`).
- **Change:** treat `typeof resp.status === 'number'` as a legacy status: non-zero → `PayWayBusinessError` carrying `paywayCode: String(resp.status)` and the `description` field as message; `0` → success. This only affects users calling legacy paths manually, so it is safe.
- **Tests:** audit suite A2 flips to expect a business error for `{"status": 1}`; add `{"status": 0}` success pin (exists).

### 7. Make `PAYWAY_ENV` URL form work or reject it (EC-12) — ✅ DONE 2026-08-30 (option a)
- **Where:** `src/client.ts` (`resolveConfig` via new `parseHttpBaseUrl()` helper).
- **Change (pick one, recommend a):**
  - a) In `resolveConfig`, when `PAYWAY_ENV` parses as an http(s) URL, use it as `baseUrl` (single source of truth, matches the validator's promise); or
  - b) Change the validator to error on URL-valued `PAYWAY_ENV` and point users to `PAYWAY_BASE_URL`.
- **Tests:** audit suite D1 flips to assert the URL is (a) used as base URL or (b) rejected by `validatePayWayEnv`.

### 8. Validate `timeout` lower bound (EC-13) — ✅ DONE 2026-08-30
- **Where:** `src/client.ts` (`resolveConfig` validation block).
- **Change:** treat `timeout <= 0` (config or `PAYWAY_TIMEOUT`) as invalid: throw `PayWayConfigError` at construction ("timeout must be a positive number of milliseconds").
- **Tests:** audit suite C2/D3 flip to expect `PayWayConfigError` at construction for `timeout: 0` and `-1`.

### 9. Trim whitespace-only credentials (EC-15) — ✅ DONE 2026-08-30
- **Where:** `src/client.ts` (`resolveConfig`).
- **Change:** `merchantId: (config.merchantId ?? env ?? '').trim()` (same for `apiKey`) so the existing "required" check catches whitespace.
- **Tests:** audit suite D2 flips to expect `PayWayConfigError` for `'   '`.

### 10. Purchase-scoped retry safety (EC-10) — ✅ DONE 2026-08-30
- **Where:** `src/client.ts` (`request`/`_executeFetch` options param), `src/domains/checkout.ts` (`purchase`), `CreateTransactionParams.retryPolicy`.
- **Change (incremental):** add `retryPolicy?: 'transient' | 'none'` (or reuse `idempotencyKey` forwarding like pre-auth) to purchase-domain params; when `'none'`, network/5xx errors surface immediately. Default stays `'transient'` for backward compatibility; revisit once ABA answers open question #1/#11.
- **Tests:** add to audit suite C: purchase with `retryPolicy: 'none'` performs 1 attempt on connection reset.

### 11. Retry flat `429` business errors with the typed class (EC-05) — ✅ DONE 2026-08-30
- **Where:** `src/client.ts` (flat-code branch of `checkResponseError`).
- **Change:** when the flat code is `'429'`, throw `PayWayRateLimitError` instead of `PayWayBusinessError` (retry engine behavior already treats it as rate-limit).
- **Tests:** audit suite A6 flips `not.toBeInstanceOf` → `toBeInstanceOf(PayWayRateLimitError)` (call count stays 4).

---

## P3 — rough edges / observability

| # | Item | Where | Change | Test flip |
|---|------|-------|--------|-----------|
| 12 | Emit `onResponse` on business errors (EC-06) — ✅ DONE 2026-08-30 (hooks moved before `checkResponseError`) | `client.ts` | audit G1: `toHaveBeenCalled` |
| 13 | Guard empty/204 bodies (EC-07) — ✅ DONE 2026-08-30 (empty 2xx → `PayWayAPIError`; 204 and JSON `null` → `null`) | `client.ts` | audit A9/A10 |
| 14 | Pass `contentType` to `createJsonParseError` (EC-08) — ✅ DONE 2026-08-30 | `client.ts` | audit A11 |
| 15 | Trim success/error codes before comparing (EC-09) — ✅ DONE 2026-08-30 | `client.ts` | audit A3 |
| 16 | Private-IP guard for callback/return URLs (EC-19) — ✅ DONE 2026-08-30 (opt-out: `allowPrivateCallbackHosts` config) | `utils.ts` + qr/payment-link/credentials-on-file domains | audit E3 |
| 17 | `tran_id` minimum length (EC-20) — ✅ DONE 2026-08-30 (one-time `console.warn` below 5 chars) | `utils.ts` | audit E2 |
| 18 | `verifyCallback` hash-strip option (EC-22) — ✅ DONE 2026-08-30 (`{ stripHash: true }`, default false) | `auth.ts`, `client.ts` | audit F2 |
| 19 | Document CLI credential precedence (EC-14) — ✅ DONE 2026-08-30 (README profiles section + docs/02) | README, docs/02 | — (doc-only) |
| 20 | Log-masking false positives (EC-23) — ✅ DONE 2026-08-30 (hex threshold 32 → 40) | `utils.ts` | audit H1 |

---

## Documentation status (done in this campaign)

| File | Change |
|------|--------|
| `README.md` | Fixed `maxRetries`/`retryDelayMs` default drift (was "default: 0 = no retry"/1000; actual 3/3000); added non-idempotent-retry warning box |
| `docs/07-qr-code-handling.md` | Lifetime minimum 180s (sandbox-pinned), seconds→minutes floor, duplicate-QR-tran_id fact |
| `docs/12-error-handling-and-debugging.md` | Added `"04"` gateway-code row; new "Response-shape & configuration caveats (2026-08-30 audit)" subsection |
| `docs/SANDBOX-FINDINGS.md` | New §13: lifetime boundary table, duplicate-QR-tran_id, amount bounds, credential-precedence surprise, open questions #14/#15 |
| `audit-results/edge-case-report.md` | Full findings matrix (this campaign) |

## Suggested execution order

1. **Batch 1 (P1, ~1 session):** items 1, 2, 4 + test flips — small, isolated, high user impact. ✅ DONE 2026-08-30
2. **Batch 2 (P2 resilience):** items 3, 5, 6, 11 (all in `client.ts` error paths; one review). ✅ DONE 2026-08-30
3. **Batch 3 (P2 config):** items 7, 8, 9, 10. ✅ DONE 2026-08-30 (item 7 implemented as option (a): URL-valued `PAYWAY_ENV` is now used as the base URL; item 10 shipped as `CreateTransactionParams.retryPolicy: 'transient' | 'none'`)
4. **Batch 4 (P3):** table items 12–20, any order; item 19 is doc-only and can land with batch 1. ✅ DONE 2026-08-30 (landed on `fix/batch-4-p3-polish`, merged to main)

## Batch 5 — post-audit follow-ups — ✅ DONE 2026-08-30

| # | Item | Where | Status |
|---|------|-------|--------|
| 5.1 | `checkout.purchase` lifetime minimum (3 minutes) enforced locally, error-69 parity | `utils.ts validatePurchaseLifetimeMinutes`, `constants.ts PURCHASE_LIFETIME_MIN_MINUTES`, `domains/checkout.ts` | ✅ |
| 5.2 | QR lifetime above the 120-day spec maximum warns once (deliberately not hard-enforced pending ABA production parity) | `utils.ts validateQrLifetimeSeconds`, `constants.ts QR_LIFETIME_MAX_SECONDS` | ✅ |
| 5.3 | `RateLimitInfo.reset` unit ambiguity documented (epoch-seconds vs ms unconfirmed; prefer `retryAfterMs`) | `client.ts RateLimitInfo` JSDoc | ✅ |

Every batch ends with: `npx vitest run` (839+ tests), `npx tsc --noEmit`, `npx biome lint src`, and a
CHANGELOG entry under a new `### Fixed`/`### Changed` heading (minor version bump — several items are
behavior changes to error surfaces).
