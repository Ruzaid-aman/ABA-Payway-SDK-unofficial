---
name: aba-payway-transaction-detail
description: Retrieve detailed ABA PayWay transaction information safely.
version: 1.1.0
---

# Transaction Detail

## Quick Start
```ts
const detail = await payway.checkout.getTransactionDetail('order-123');
```

PayWay limits this endpoint to 10 requests per minute. Do not poll it for every page refresh.

## Error Handling
```ts
import { PayWayRateLimitError } from 'aba-payway-ts';
try { await payway.checkout.getTransactionDetail('order-123'); }
catch (error) { if (error instanceof PayWayRateLimitError) console.error('Retry later'); }
```

## Related Skills
- [Check Transaction](../aba-payway-check-transaction/SKILL.md)