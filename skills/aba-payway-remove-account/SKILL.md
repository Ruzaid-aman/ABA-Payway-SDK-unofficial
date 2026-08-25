---
name: aba-payway-remove-account
description: Remove a stored ABA PayWay account token.
version: 1.1.0
---

# Remove Account

## Quick Start
```ts
const result = await payway.credentialsOnFile.removeToken({ requestId: 'remove-123', ctid: 'credential-id', paymentToken: 'stored-token' });
```

PayWay uses the unified `removeToken` endpoint for account and card credentials.

## Error Handling
```ts
import { PayWayAPIError } from 'aba-payway-ts';
try { await payway.credentialsOnFile.removeToken(params); }
catch (error) { if (error instanceof PayWayAPIError) console.error(error.statusCode); }
```

## Related Skills
- [Link Account](../aba-payway-link-account/SKILL.md)
