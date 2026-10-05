---
name: aba-payway-refund
description: Issue an ABA PayWay refund for a completed transaction.
metadata:
  version: 1.4.2
---

# ABA PayWay Refund

## Quick Start
```ts
const result = await payway.checkout.refund('order-123', 10);
```

Refund requests are capped at 500 requests per second. Persist refund intent and make your internal workflow idempotent.

## Fast CLI Path
Use this when you already know the PayWay `tran_id` and refund amount:
```bash
payway-sdk refund -t <tran_id> -a <amount> -c USD
payway-sdk transaction-detail -t <tran_id>
```

After the follow-up `transaction-detail`, read:
- `refund_amount` for the total refunded so far
- `transaction_operations` for the refund event history
- `payment_status` as a coarse lifecycle flag only; PayWay shows `REFUNDED` even after a partial refund (sandbox-verified 2026-09-05: $0.50 paid → $0.10 refund → status REFUNDED, `refund_amount 0.1`), so do not use that field alone to infer a full refund

## Error Handling
```ts
import { PayWayAPIError } from 'aba-payway-ts';
try { await payway.checkout.refund('order-123', 10); }
catch (error) { if (error instanceof PayWayAPIError) console.error(error.retryable); }
```

Known sandbox-verified codes: `PTL04` (amount < 0.01 USD / < 1 KHR), `PTL36`
(target transaction not found or invalid), `PTL37` (refund exceeds original),
`PTL58` (refund failed), `PTL181` (insufficient balance).

## Pre-flight Balance Check (currency-aware)
Refunds are requested against the ORIGINAL (merchant) money of the order.
`payment_amount` describes the PAYER's actual debit and can be in a DIFFERENT
currency (sandbox W5-6: 4000 KHR ordered → paid 1 USD; 1.20 USD ordered → paid
4800 KHR) — never mix the two. Use the exported helper:

```ts
import { computeRefundableBalance } from 'aba-payway-ts';

const detail = await payway.checkout.getTransactionDetail('order-123');
const d = (detail as any).data;
const balance = computeRefundableBalance(d, 'USD');   // the refund request currency
if (balance.status !== 'ok' || balance.remaining === undefined) {
  // 'ambiguous' + currencyMismatch → the order currency differs from (or is
  // missing for) your request currency; re-issue with the order currency —
  // never convert manually (no authoritative conversion contract exists).
  // 'unavailable' + reason → fields missing or status not refundable.
  throw new Error(balance.reason ?? 'refund balance unavailable');
}
if (refundAmount > balance.remaining) throw new Error('Refund exceeds remaining balance');
```

The helper reconciles `original_amount − refund_amount` in ONE currency — the
ORDER currency. It returns `ambiguous` (with `currencyMismatch`) when the refund
request currency differs from the order's `original_currency`, or that field is
missing (the units of the number are then unconfirmed); `unavailable` with a
reason when fields are missing or the status is not refundable
(APPROVED/REFUNDED/PRE-AUTH). A payer debit in another currency stays
informational and does not change the balance.

The CLI equivalent is `payway-sdk refund -t <id> -a <amount> -c <currency>` — it
runs this check automatically and HARD-STOPS on a currency mismatch (hint:
re-run with `-c <order currency>`). `-y/--force` skips ONLY the confirmation
prompt (balance validation still runs); `--no-preflight` skips the balance
validation explicitly (the detail lookup is rate-limited to 10/min). Under
`--json`, preflight diagnostics go to stderr and local rejections emit the
`{ error: { kind: 'validation', … } }` envelope on stdout.

## Uncertain refund outcome

The SDK submits refunds once by default. After a timeout, preserve the refund
intent and serialize further refund work for that transaction. Compare
`transaction-detail` refund amounts and operations with the pre-submit totals;
`REFUNDED` can describe an earlier partial refund, and an unchanged immediate
read does not prove failure. A repeated partial refund can execute again.
Keep ambiguous attempts unresolved and ask PayWay support to trace them before
resubmission. Do not use `--no-preflight` as timeout recovery or share secrets in
support logs. Full runbook: `payway-sdk docs errors-and-debugging`.

## No refund after payout/split
Once a transaction has been processed via payout/split, the **standard refund API is not available** (ABA-confirmed 2026-09-12) — refunds are manual, or a pre-auth refund before the split. Design split flows to make refund decisions before completing the payout. See `payway-sdk docs settlement-disputes` (served offline: settlement, payouts, FX, and disputes).

## Related Skills
- [Transaction Detail](../aba-payway-transaction-detail/SKILL.md)
