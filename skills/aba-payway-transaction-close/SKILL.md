---
name: aba-payway-transaction-close
description: Close an ABA PayWay transaction after processing it.
version: 1.1.0
---

# Close Transaction

## Quick Start
```ts
const result = await payway.checkout.closeTransaction('order-123');
```

Only close a transaction after your order system has reconciled its PayWay status.

## Error Handling
```ts
import { PayWayBusinessError } from 'aba-payway-ts';
try { await payway.checkout.closeTransaction('order-123'); }
catch (error) { if (error instanceof PayWayBusinessError) console.error(error.message); }
```

## Related Skills
- [Check Transaction](../aba-payway-check-transaction/SKILL.md)