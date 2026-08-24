---
name: aba-payway-payment-link
description: Create and inspect hosted ABA PayWay payment links.
version: 1.1.0
---

# ABA PayWay Payment Link

## Quick Start
```ts
const link = await payway.paymentLink.create({ title: 'Invoice 123', amount: 10, merchantRefNo: 'invoice-123', returnUrl: 'https://merchant.example/paid', currency: 'USD' });
```

Payment Link APIs require `publicKeyPem` for RSA-encrypted merchant authorization. The SDK validates the PEM structure before any call — a malformed key throws a clear `PayWayConfigError` (use the exported `isValidPublicKeyPem()` to pre-flight).

## Error Handling
```ts
import { PayWayConfigError } from 'aba-payway-ts';
try { await payway.paymentLink.getDetails('link-id'); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); }
```

## Related Skills
- [Configuration](../aba-payway-sdk-configuration/SKILL.md)