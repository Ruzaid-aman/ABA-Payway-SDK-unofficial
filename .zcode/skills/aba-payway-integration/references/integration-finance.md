# Payment receipts and settlement evidence

## Record the correct financial basis

Keep order, immutable attempt, unique gateway receipt, verified payment posting, fulfillment job, refund/hold/payout operation, token/consent and settlement batch/match records separate. Uniqueness includes environment, MID/tenant and operation/receipt identity. Invoice references can be one-to-many.

Recipe units are USD cents and whole KHR. Reject invalid/nonfinite/negative/unsafe/over-precision money before submission; never round an obligation silently. Preserve original, discounted payable, payer and settled amounts/currencies, FX source/time and approved rounding independently. The current recipes support exact-price core flows, not arbitrary discounts/partial payments/FX accounting.

A verified approval authorizes a payment posting under the business policy. It does not prove external shipping succeeded or that money settled. Keep a durable outbox and retry downstream work with its own idempotency key. Additional genuine receipts require overpayment review; missing callbacks are recovered by inquiry.

## Establish sources before production acceptance

Obtain actual portal/gateway transaction records, settlement report names/schema/grain/download route/permissions/cutoff and the agreed bank booking evidence. Do not invent a report API. Record agreement/version, accounts/currencies, fee/refund/FX treatment, approved tolerance, observation window and finance owner.

Preserve original protected exports with checksums. Import by source/checksum and stable operation/row identity; validate schema/currency/totals/pagination/completeness. A repeated import cannot repost revenue/refunds. The installed settlement helper operates on a merchant-normalized synthetic schema; it does not implement ABA export retrieval or authorize a finance signoff.

## Join and compare

Prefer exact environment/MID/gateway receipt or operation ID, validated bank reference and batch membership. For aggregate credits bridge receipt → official report batch → bank booking. Amount/time/APV/masked-card similarity is an investigation lead, never an automatic match or signoff.

Compare each amount on the same financial basis and currency. Use the actual agreement's signed component model; do not assume fees are always netted or always separate. A sale of USD 100, same-batch refund 20 and netted fee 1 yields 79 only in that illustrative agreement. A later refund debit must be verified separately; do not subtract it twice.

The synthetic helper requires explicit batch/scope/currency/operation identity, bank reference and an approved integer tolerance; it rejects conflicting duplicates and uses integer totals. Currency conversion, report checksum ingestion, access, completeness and the approved report-to-bank bridge remain the merchant's responsibility.

## Exceptions and G6 evidence

Classify missing order/receipt/report/booking, duplicate or excess receipt, identity/outlet/account mismatch, amount/currency difference, unexpected fee/FX/cutoff, overdue settlement, missing refund and beneficiary discrepancy. Record owner, due time, protected evidence reference, reason and authorized resolution. Normal cycle delay is pending, not automatically failed.

Match capture (not an uncaptured hold), completed refund and all payout source/beneficiary legs to actual financial evidence. Observe later batches where required. No approved status, diagnostic journal entry or manually typed total establishes settlement.

G6 requires every transaction/operation prescribed by ABA's existing rule to be accounted for, correct accounts/currencies and approved fees/FX/tolerance, no material unexplained discrepancy, and authorized finance/ABA review. Keep it pending/blocked while reports or policy are unavailable.

## Evidence template

Record policy/source version, acceptance transaction list, MID/outlet/profile references, order/attempt/gateway/operation/bank IDs, timezone-aware times, component amounts/currencies, export checksums, report/batch membership, bank booking/value date, match calculation, discrepancy disposition and reviewer/time. Store restricted originals internally and use synthetic fixtures publicly.
