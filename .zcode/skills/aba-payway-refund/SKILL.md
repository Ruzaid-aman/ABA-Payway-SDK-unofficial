---
name: aba-payway-refund
description: Issue an ABA PayWay refund for a completed transaction.
version: 1.3.0
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
- `payment_status` as a coarse lifecycle flag only; PayWay shows `REFUNDED` even after a partial refund (live-confirmed 2026-09-05, SANDBOX-FINDINGS §18: $0.50 paid → $0.10 refund → status REFUNDED, `refund_amount 0.1`), so do not use that field alone to infer a full refund

## Error Handling
```ts
import { PayWayAPIError } from 'aba-payway-ts';
try { await payway.checkout.refund('order-123', 10); }
catch (error) { if (error instanceof PayWayAPIError) console.error(error.retryable); }
```

Known sandbox-verified codes: `PTL04` (amount < 0.01 USD / < 1 KHR), `PTL36`
(target transaction not found or invalid), `PTL37` (refund exceeds original),
`PTL58` (refund failed), `PTL181` (insufficient balance).

## Pre-flight Balance Check
Fetch the original transaction first (rate-limited to 10/min) and compare:
```ts
const detail = await payway.checkout.getTransactionDetail('order-123');
const d = (detail as any).data;
const remaining = Number(d.payment_amount) - Number(d.refund_amount ?? 0);
if (remaining <= 0) throw new Error('Nothing left to refund');
```
The CLI equivalent is `payway-sdk refund -t <id> -a <amount>` (runs this
check automatically; `--no-preflight` skips only the detail lookup, while
`-y/--force` skips both the pre-flight lookup and the confirmation prompt).

## Related Skills
- [Transaction Detail](../aba-payway-transaction-detail/SKILL.md)
