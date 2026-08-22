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

> **Local vs. network:** `createTransaction()` (and `createCheckoutPayload()`) only **builds a LOCAL signed payload** — it performs no network request. By contrast, `purchase()` (and the agentic `create_checkout_purchase` tool) performs the actual **NETWORK request** to PayWay. Use the local builder when you want to render your own checkout form; use `purchase()` when you want the SDK to submit the payment.

## Error Handling
```ts
import { PayWayConfigError } from 'aba-payway-ts';
try { payway.checkout.createTransaction({ transactionId: 'order-123', amount: 10 }); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); }
```

## Related Skills
- [Configuration](../aba-payway-sdk-configuration/SKILL.md)
- [Check Transaction](../aba-payway-check-transaction/SKILL.md)