# ABA PayWay OpenAPI Spec vs SDK/CLI — Final Coverage Report

**Date:** 2026-09-11 · **Method:** Double-pass multi-agent review
**Spec under review:** `docs/archive/Default module.openapi.json` (shared by the ABA PayWay team) — OpenAPI 3.1.0, **33 POST endpoints**
**Subject:** `aba-payway-ts` v1.5.0 SDK + agentic CLI (68 leaf commands)

**Pass 1** (3 parallel extraction agents): spec-inventory.md (33 endpoints, full request/response fields), sdk-inventory.md (22 gateway endpoints called, 65 value exports), cli-inventory.md (command tree, local/remote split).
**Pass 2** (2 parallel cross-check agents): coverage-matrix.md (per-endpoint verdicts + gap cards), fidelity-audit.md (field/hash/validation/response comparison, 22 endpoints). All Pass-1 claims re-verified in code; disagreements resolved (2 Pass-1 errors corrected).

---

## VERDICT

**We do NOT implement the full suite — and we shouldn't.** Of 33 spec endpoints:

| Verdict | Count | What it means |
|---|---|---|
| **COVERED** | 20 | Full SDK method + CLI command, contract live-verified in sandbox |
| **PARTIAL** | 2 | Implemented with a small, fixable limitation |
| **SUPERSEDED-LEGACY** | 6 | v1 predecessors — functionally covered by our v3 implementations |
| **MISSING** | 5 | No SDK/CLI surface at all |
| **Total** | **33** | 22 SDK-called + 11 not called = 33; zero orphans either direction |

Effective business coverage: **28 of 33 (85%)** do what the spec describes (20 full + 2 partial + 6 superseded). Of the 5 missing, only **2 are practical gaps** for merchants (`payment-link/void`, `payments/request-qr`); the self-activation trio is partner-only.

## The 5 MISSING endpoints

1. **`payment-link/void` — P1, highest-priority gap.** The missing half of the link lifecycle. We already live-verified its full contract (SANDBOX-FINDINGS §23, 2026-09-11, probe script `scripts/sandbox-probe-payment-link-void.ts`): same hash trio + RSA `merchant_auth` as detail, `VOIDED` status, PTL188 on double-void, code 96 on bogus id. VOID actually kills the customer page (unlike expiry, which leaves a live form). Implementation cost is LOW — clone `getDetails`, change path. Closes the documented §22 pain "expired links read OPEN, enforce expiry merchant-side."
2. **`/api/payment-gateway/v1/payments/request-qr` (QR for Soundbox) — P2.** No v3 successor. Distinct from generate-qr: nullable amount (customer keypad entry), required `callback_url`, no template requirement, `abapay` option. Real retail-counter value.
3-5. **`online-self-activation` trio (`new-merchant`, `get-mc-credential-info`, `get-mc-info`) — P3, deliberately skip.** Partner-credential class (`partner_id`, RSA-encrypted blobs, merchant auth model incompatible with ours). The spec itself is internally inconsistent for these (HMAC-SHA256 vs SHA512 conflict between the three).

## The 6 SUPERSEDED-LEGACY endpoints (v1 → our v3)

All functionally covered. Two minor v1-only deltas, both with workarounds:
- v1 `aof/renew-expired-account` response carried `expired_in` (new expiry); v3 renew returns only status+trace_id → use `get-token-details.expired_at` or the SDK's 90-day local helpers.
- v1 `aof/pushback-status` keyed lookups by arbitrary `return_param`; v3 `get-token-details` requires `request_id` (moot — the SDK journals request_ids). v3 returns a superset otherwise.

## The 2 PARTIAL endpoints (small fixes)

1. **generate-qr pre-auth — SDK-only.** `GenerateQrParams.purchaseType?: 'purchase'|'pre-auth'` exists (client.ts:414, signed at qr.ts:46, wired at qr.ts:119) but `generate-qr` has no `--purchase-type` flag. Fix = ~4 lines in cli.ts; domain plumbing complete.
2. **purchase `payment_option` validation.** `PAYMENT_OPTIONS` (constants.ts:274) contains none of the purchase spec's documented values (`abapay`, `abapay_deeplink`), so the SDK advisory fires spuriously on valid spec-documented values; the correct purchase enum exists in the codebase but is only applied on the subscription branch (checkout.ts:358-362). Fix = use the purchase-specific enum list.

## Fidelity of the 22 implemented endpoints (the good news)

- **Request fields: zero genuine misses.** Every spec request field is either sent or auto-computed (`req_time`/`request_time`, `merchant_id`, `hash`, RSA `merchant_auth`). v1/v3 naming quirk (`req_time`/`firstname` vs `request_time`/`first_name`) is handled correctly everywhere.
- **Hash orders: 20 MATCH / 2 DIFFERS — both DIFFERS are code-correct.** The spec's b4hash for purchase omits `ctid` (live-verified: the gateway enforces ctid-after-items, SF§17) and link-card's lacks `amount`/`continue_success_url` positions (SF§16). Our implementation is right; the spec is stale.
- **SDK extensions beyond spec (7 fields, live-parity):** purchase `google_pay_token`+`additional_params`, link-card `frequency`+`continue_success_url`, pre-auth `idempotency_key`/`reason` (last two unverified live), payout auto-`req_time`.
- **Validation: 10 hard / 15 advisory / 4 spec-constraints-not-enforced / 7 beyond-spec.**
- **Response modeling gaps (5 endpoints, all never-live-observed success responses):** payout (8 documented response fields unmodeled — highest-value fix), add/update beneficiary (`data` object), pre-auth complete/cancel (`grand_total`/`currency`; SDK models `total_amount` where spec says `grand_total`), get-transactions-by-mc-ref (array keyed `transactions` vs spec `data`; endpoint 404s in sandbox so never corrected).

## Spec errors to report back to the ABA PayWay team (21 found; top 8)

1. **purchase b4hash omits `ctid`** — the gateway enforces it (its own error hint prints the doc list while enforcing ctid-after-items); b4hash also references `$additional_params` which the schema never defines; `ctid` marked REQUIRED though ctid-less purchases succeed.
2. **exchange-rate response schema is malformed** — 10 of 12 currencies sit at top level instead of inside `exchange_rates` (live nests all).
3. **check-transaction-2 / transaction-detail nest `status` inside `data`** — live responses carry it as a top-level sibling.
4. **transaction-list-2 b4hash has a literal `+` where `.` belongs** (live-proved); check-transaction-2 prose omits `req_time` that its own sample includes.
5. **generate-qr/request-qr b4hash strings are corrupted** (`$last_name+ email` with embedded newlines; request-qr's hash lists ~10 fields not in its schema).
6. **link-card b4hash includes `$frequency`** but the request schema omits the real, enforced frequency field.
7. **payment-link:** `tran_id` documented string but arrives numeric; `total_refund`/`total_amount_org` typing inconsistent; PTL132 documented but bogus ids answer 96; no EXPIRED status exists anywhere.
8. **No enum keywords anywhere** (value lists live in prose only); `payment_option` enums incomplete/inconsistent (no `google_pay`, no `abapay_khqr_deeplink`); petstore boilerplate (`Pet`, `Category`, `Tag`) left in components; self-activation HMAC algorithm conflicts (SHA256 vs SHA512).

Full details: [spec-inventory.md](spec-inventory.md) · [sdk-inventory.md](sdk-inventory.md) · [cli-inventory.md](cli-inventory.md) · [coverage-matrix.md](coverage-matrix.md) · [fidelity-audit.md](fidelity-audit.md)

---

## Recommended work items (priority order)

| # | Item | Size | Priority |
|---|---|---|---|
| 1 | SDK method + CLI `payment-link void` (contract already live-verified §23) | Small | **P1** |
| 2 | `generate-qr --purchase-type` CLI flag (domain plumbing done) | ~4 lines | P1 |
| 3 | Purchase-path `payment_option` enum: use the purchase enum, not `PAYMENT_OPTIONS` | Small | P1 |
| 4 | Payout response type: model the 8 documented fields | Small | P2 |
| 5 | `request-qr` (Soundbox) — SDK domain + CLI command | Medium | P2 |
| 6 | Pre-auth complete/cancel + beneficiary + get-transactions-by-mc-ref response types | Small each | P2 |
| 7 | Send spec-error list to ABA team (hash orders, exchange-rate schema, status nesting) | n/a | P2 (goodwill/parity) |
| 8 | online-self-activation trio | Skip unless partner use case | P3 |
