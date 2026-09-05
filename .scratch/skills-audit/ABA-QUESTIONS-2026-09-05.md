# Draft questions for ABA PayWay — 2026-09-05

> Drafted from the 2026-09-03 skills audit (T1/T4) and the 2026-09-05 session.
> Send to PayWay support / integration contact. Evidence paths included.

## Q-A (T1, BLOCKER for subscription go-live) — subscription enablement + hash order

Sandbox merchant profile `ec476910`:

1. **Subscription/token-registration enablement.** Purchase requests carrying
   the subscription trio (`ctid` + `token_flag=CITR_FIX` + `frequency`) now
   pass your hash layer but answer **`104` "Merchant not enabled token flag"**
   (HTTP 403). Please enable subscription / token registration for this
   sandbox profile (or tell us how to request it), so we can complete
   end-to-end recurring-payment testing.
2. **Authoritative hash order.** The live docs' subscription operation
   (`subscription-21402227e0`) lists a 26-field HMAC order WITHOUT `ctid`.
   That documented order is rejected with `Wrong Hash` (code 1). Our probing
   (evidence: `test-output/subscription-hash/`, SANDBOX-FINDINGS §17) shows
   the gateway actually signs **`ctid` between `items` and `shipping`**
   (27-field order). Can you confirm the composition, and update the
   subscription docs page? Also: your gateway's "Wrong Hash" error hint prints
   the documented (26-field) list, not the enforced list — please make the
   hint reflect the enforced order.

## Q-B (T4.2) — agent provider model

The agentic CLI preset used OpenCode Zen model `x-preview-f-free`, which now
answers HTTP 401 "Model x-preview-f-free is not supported"
(`PROVIDER_PROPOSAL_FAILED`). Which Zen models are supported for integration
use? (We currently point the docs at `deepseek-v4-flash-free` from the
public `/models` list.)

## Q-C (T4.1) — get-transactions-by-mc-ref 404

`/api/payment-gateway/v1/payments/get-transactions-by-mc-ref` answers **HTTP
404 with an empty body** in sandbox today (CLI + reconcile.cjs), while sibling
endpoints work. It was live-verified in earlier campaigns (SANDBOX-FINDINGS
§9-era). Regression or environment change?

## Q-D (T4.3–T4.5) — carried from NEXT-SESSION (unchanged)

- Subscription profile enablement — see Q-A.
- transaction-detail 403/429 cap — the skill's 10/min claim stands as a dated
  measurement; not reproducible with 6 rapid calls on 2026-09-03.
- Sandbox/production divergence: token-flag domain accepts 4 values in sandbox
  (`CITO_FIX`, `CITR_FLEX` pass with advisory); transaction-list status enum
  includes `PRE-AUTH` + gateway typo `DECLINDED`. Please confirm the
  production-only domains/enums so we can gate the sandbox-only ones.

## Q-E (2026-09-05 purchase campaign) — purchase-KHQR scan-time validity window

A Purchase-API KHQR whose transaction record was PENDING with a 1440-minute
lifetime was scan-refused "Transaction expired" at age 2h15m; a seconds-old
QR pays. The KHQR payload embeds no expiry (TLV-decoded), so validity is a
server-side lookup. **What governs the scan-time window on `purchase` — a
fixed window, or the lifetime (in which unit)?** Merchants requesting long
lifetimes need to know QRs must still be scanned promptly. Evidence:
`test-output/purchase-test-campaign/WAVE5-captures.md` (W5-1), SANDBOX-FINDINGS §21.

## Q-F (same campaign) — duplicate `tran_id` semantics

`purchase` silently accepts duplicate `tran_id`s (code 00 each), but the
resulting KHQRs scan as "Transaction not found" (unpayable), and a hosted-page
re-POST for a CLOSED duplicate first answers code 4 "Duplicated Transaction ID".
**Is duplicate-ID reuse supported at all, or should clients treat it as always
forbidden?** (Silent acceptance + dead QRs is a merchant trap.) Evidence: W5-7.

## Q-G (same campaign) — close-transaction on never-created tran_id

`close-transaction` for a tran_id that never existed answers **code 00
"Success!"** while close-after-payment correctly rejects with 403 code 2.
Is the never-created case intentional? (Idempotent-delete semantics would
argue for a not-found error instead.) Evidence: W2-3 + W5-2.
