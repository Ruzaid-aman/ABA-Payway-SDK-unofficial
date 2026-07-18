---
name: aba-payway-purchase
description: Create a signed ABA PayWay checkout purchase with aba-payway-ts.
version: 1.1.0
---

# ABA PayWay Purchase

## Quick Start
```ts
import { PayWay } from 'aba-payway-ts';
const payway = new PayWay();
const payload = payway.checkout.createTransaction({ transactionId: 'order-123', amount: 10, currency: 'USD' });
```

Post the returned signed payload from your server-rendered checkout form. Keep API credentials server-side.

## Error Handling
```ts
import { PayWayConfigError } from 'aba-payway-ts';
try { payway.checkout.createTransaction({ transactionId: 'order-123', amount: 10 }); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); }
```

## Related Skills
- [Configuration](../aba-payway-sdk-configuration/SKILL.md)
- [Check Transaction](../aba-payway-check-transaction/SKILL.md)