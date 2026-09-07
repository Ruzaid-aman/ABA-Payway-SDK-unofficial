---
name: aba-payway-remove-card
description: Remove a stored ABA PayWay card token.
metadata:
  version: 1.2.0
---

# Remove Card

IRREVERSIBLE — after removal, charges decline with purchase error 87 and the
ABA Mobile user is notified. Users can also remove tokens themselves in ABA
Mobile (the merchant then receives a CoF callback with status 0).

## Quick Start
```ts
// v1.3.6 (§16-verified param shape): removeToken takes ctid + pwt ONLY — NO requestId.
// The token trio is un-gated by default (allowUnverifiedTokenOperations is a
// deprecated opt-out; TD-03 resolved 2026-08-31).
await payway.credentialsOnFile.removeToken({
  ctid: 'credential01',       // [a-zA-Z0-9]{5,24}
  paymentToken: 'stored-token', // the pwt
});
// Hash order: merchant_id.ctid.request_time.pwt
```

PayWay uses the same `removeToken` API for linked account and card credentials.
CLI: `payway-sdk cof token remove --ctid credential01 --token <pwt>`

## Error Handling
```ts
import { PayWayAPIError } from 'aba-payway-ts';
try { await payway.credentialsOnFile.removeToken(params); }
catch (error) { if (error instanceof PayWayAPIError) console.error(error.statusCode); }
```
Codes 104/105/09 carry token-state hints (invalid/expired — re-link or renew).

## Related Skills
- [Link Card](../aba-payway-link-card/SKILL.md)
