---
name: aba-payway-check-transaction
description: Check the current status of an ABA PayWay transaction.
version: 1.1.0
---

# Check Transaction

## Quick Start
```ts
const result = await payway.checkout.checkTransaction('order-123');
```

This endpoint is capped at 600 requests per second. Prefer verified webhooks for fulfillment decisions.

## Error Handling
```ts
import { PayWayBusinessError } from 'aba-payway-ts';
try { await payway.checkout.checkTransaction('order-123'); }
catch (error) { if (error instanceof PayWayBusinessError) console.error(error.paywayCode); }
```

## Related Skills
- [Hash and Webhooks](../aba-payway-hash/SKILL.md)