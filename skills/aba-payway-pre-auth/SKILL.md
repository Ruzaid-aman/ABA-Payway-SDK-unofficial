---
name: aba-payway-pre-auth
description: Complete, complete with payout, or cancel an ABA PayWay pre-authorization.
version: 1.1.0
---

# ABA PayWay Pre-Authorization

## Quick Start
```ts
const result = await payway.preAuth.complete('order-123', 10);
```

Pre-authorization endpoints require `publicKeyPem` because requests use RSA-encrypted merchant authorization.

## Error Handling
```ts
import { PayWayConfigError } from 'aba-payway-ts';
try { await payway.preAuth.cancel('order-123'); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); }
```

## Related Skills
- [Configuration](../aba-payway-sdk-configuration/SKILL.md)