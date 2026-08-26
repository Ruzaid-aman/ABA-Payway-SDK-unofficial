---
name: aba-payway-remove-card
description: Remove a stored ABA PayWay card token.
version: 1.1.0
---

# Remove Card

## Quick Start
```ts
// ⚠️ BLOCKED by default until ABA publishes the token-management HMAC spec (TD-03).
// Opt in explicitly: new PayWay({ ..., allowUnverifiedTokenOperations: true })
// requestId/ctid must match the gateway rule [a-zA-Z0-9]{5,24} — no hyphens.
const result = await payway.credentialsOnFile.removeToken({ requestId: 'remove123', ctid: 'credential01', paymentToken: 'stored-token' });
```

PayWay uses the same `removeToken` API for linked account and card credentials.

## Error Handling
```ts
import { PayWayAPIError } from 'aba-payway-ts';
try { await payway.credentialsOnFile.removeToken(params); }
catch (error) { if (error instanceof PayWayAPIError) console.error(error.statusCode); }
```

## Related Skills
- [Link Card](../aba-payway-link-card/SKILL.md)
