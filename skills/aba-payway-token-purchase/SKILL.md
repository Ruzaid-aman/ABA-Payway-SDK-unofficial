---
name: aba-payway-token-purchase
description: Charge a stored ABA PayWay credential token.
version: 1.1.0
---

# Token Purchase

## Quick Start
```ts
const result = await payway.credentialsOnFile.payment({ requestId: 'request-123', transactionId: 'order-123', amount: 10, paymentToken: 'stored-token' });
```

Never log or expose the payment token to browsers.

## Error Handling
```ts
import { PayWayBusinessError } from 'aba-payway-ts';
try { await payway.credentialsOnFile.payment(params); }
catch (error) { if (error instanceof PayWayBusinessError) console.error(error.message); }
```

## Related Skills
- [Link Account](../aba-payway-link-account/SKILL.md)
- [Link Card](../aba-payway-link-card/SKILL.md)
