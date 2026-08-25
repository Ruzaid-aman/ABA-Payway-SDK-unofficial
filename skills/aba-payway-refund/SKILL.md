---
name: aba-payway-refund
description: Issue an ABA PayWay refund for a completed transaction.
version: 1.1.0
---

# ABA PayWay Refund

## Quick Start
```ts
const result = await payway.checkout.refund('order-123', 10);
```

Refund requests are capped at 500 requests per second. Persist refund intent and make your internal workflow idempotent.

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
check automatically; `--no-preflight` skips it, `-y/--force` skips prompts).

## Related Skills
- [Transaction Detail](../aba-payway-transaction-detail/SKILL.md)