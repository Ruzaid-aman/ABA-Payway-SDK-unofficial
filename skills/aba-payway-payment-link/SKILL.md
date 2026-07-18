---
name: aba-payway-payment-link
description: Create and inspect hosted ABA PayWay payment links.
version: 1.1.0
---

# ABA PayWay Payment Link

## Quick Start
```ts
const link = await payway.paymentLink.create({ title: 'Invoice 123', amount: 10, merchantRefNo: 'invoice-123', returnUrl: 'https://merchant.example/paid' });
```

Payment Link APIs require `publicKeyPem` for RSA-encrypted merchant authorization.

## Error Handling
```ts
import { PayWayConfigError } from 'aba-payway-ts';
try { await payway.paymentLink.getDetails('link-id'); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); }
```

## Related Skills
- [Configuration](../aba-payway-sdk-configuration/SKILL.md)