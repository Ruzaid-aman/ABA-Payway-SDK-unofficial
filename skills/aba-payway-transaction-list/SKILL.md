---
name: aba-payway-transaction-list
description: List ABA PayWay transactions with date, amount, and status filters.
version: 1.1.0
---

# Transaction List

## Quick Start
```ts
const transactions = await payway.checkout.getTransactionList({ fromDate: '2026-07-01', toDate: '2026-07-03', status: 'APPROVED' });
```

This endpoint is capped at 50 requests per minute; cache dashboard results instead of live polling.

## Error Handling
```ts
import { PayWayAPIError } from 'aba-payway-ts';
try { await payway.checkout.getTransactionList({}); }
catch (error) { if (error instanceof PayWayAPIError) console.error(error.endpoint); }
```

## Related Skills
- [Transaction Detail](../aba-payway-transaction-detail/SKILL.md)