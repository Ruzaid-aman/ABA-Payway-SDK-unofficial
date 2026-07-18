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

## Related Skills
- [Transaction Detail](../aba-payway-transaction-detail/SKILL.md)