# Production Verification Plan

> Created 2026-08-31 from the Technical Production Review (P3).
> **Status: planned — gated on production credentials.** The production base
> URL (`https://checkout.payway.com.kh`) is configured but has never been
> verified live (SANDBOX-FINDINGS §1, "Still open"). Nothing in this document
> should be executed until a merchant account with production credentials is
> provisioned and the maintainer explicitly approves the run.

## Why this plan exists

Every sandbox-verified fact in `SANDBOX-FINDINGS.md` is *sandbox* evidence.
Production may differ in exactly the seams that matter most to merchants:
error envelope shapes, rate-limit responses, close/enforcement semantics, and
QR lifetime boundaries. The opt-in sandbox contract suite
(`src/__tests__/sandbox-contract.test.ts`) pins the sandbox behavior; this
plan defines the production equivalent, executed manually and read-mostly.

## Preconditions (all required before the first probe)

- [ ] Production credentials provisioned by ABA and stored in env vars
      (`PAYWAY_MERCHANT_ID`, `PAYWAY_API_KEY`, RSA key) — never committed,
      never shared via chat or tickets (SECURITY.md rules apply).
- [ ] Explicit maintainer approval recorded for each run (who, when, scope).
- [ ] `PAYWAY_ENV=production` resolves to `https://checkout.payway.com.kh`
      and the resolved URL is recorded in the run notes.
- [ ] Run budget agreed: this plan makes **at most 12 API calls**, of which
      2 create real transactions (the minimum needed to observe status
      shapes on a live object).

## Stage 1 — Read-only shape probes (6 calls, no transactions created)

1. `exchange-rate` → confirm 200 envelope `{ status: { code: '00' } }` and
   that `exchange_rates` still nests `usd/eur/...`.
2. `check-transaction` on a syntactically valid, never-used tran_id →
   record the not-found shape (sandbox: 200-wrapped `status.code 6`,
   message "tran_id not found"). Confirm the code and transport status.
3. `transaction-detail` on the same never-used tran_id → record the shape
   and the effective rate limit observed (sandbox: 10/min, HTTP 403 with
   numeric body `status.code` 429 and no headers).
4. `transaction-list` over a 2-day window → confirm the 3-day max-window
   rule (sandbox: HTTP 403 "Maximum date rang is allowed only 3 days") and
   the `{ data, page, pagination, status }` envelope.
5. If ABA has answered the v3 token-trial HMAC questions (ABA-OPEN-QUESTIONS
   Q6) run the token get-details probe per their spec — otherwise skip.
6. Record every response header set (rate-limit headers, Retry-After) for
   comparison against `parseRateLimitInfo` and `parseRetryAfterMs`.

## Stage 2 — Minimal transaction probes (2 real transactions)

1. Create one `generate-qr` transaction (small amount, 180 s lifetime).
   Confirm: 2xx shape (`qrString`/`qrImage`), lifetime boundary behavior
   (sandbox minimum 180 s → confirm production matches), and that
   `check-transaction` observes the transaction in the same <1 s window.
2. Create one `purchase` (hosted checkout) transaction. Confirm the deeplink
   / QR URL shape and that `transaction-list` visibility for unpaid
   purchases matches the sandbox asymmetry finding (SANDBOX-FINDINGS §14b)
   or corrects it.
3. Do **not** probe refund/close against real money without a second,
   explicit approval — note the desired refund/close checks as follow-ups
   once ABA confirms production enforcement semantics (Q4).

## Stage 3 — Reconciliation and sign-off

- Diff every observed shape against `SANDBOX-FINDINGS.md` §1–§14 and the
  pins in `src/__tests__/sandbox-contract.test.ts`.
- Record deltas as new dated sections in `SANDBOX-FINDINGS.md` (append —
  never rewrite history) and open/remediate behavior pins as needed.
- Update `HANDOFF.md` §7 with the confirmed (or corrected) production facts.
- If any production behavior differs from a locally-enforced SDK guard
  (e.g. QR lifetime minimum, private-callback-host guard), file it against
  the next release milestone before shipping.

## Constraints honored by this plan

- Read-mostly: no money movement beyond two bounded, small QR lifetimes.
- Rate-limit aware: far below every documented cap (detail 10/min is the
  binding constraint — the plan makes 1–2 detail calls per stage).
- Secrets handled per `SECURITY.md`; run evidence goes to `test-output/`
  with no credentials, and findings to `SANDBOX-FINDINGS.md` (dated).
