---
name: aba-payway-exchange-rate
description: Retrieve the current ABA PayWay exchange rate.
version: 1.1.0
---

# Exchange Rate

## Quick Start
```ts
const rate = await payway.checkout.getExchangeRate();
```

Cache rates according to your pricing policy; do not make the checkout page depend on a fresh request.

## Error Handling
```ts
import { PayWayNetworkError } from 'aba-payway-ts';
try { await payway.checkout.getExchangeRate(); }
catch (error) { if (error instanceof PayWayNetworkError) console.error('Temporary network failure'); }
```

## Related Skills
- [Purchase](../aba-payway-purchase/SKILL.md)