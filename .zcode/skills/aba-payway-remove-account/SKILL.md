---
name: aba-payway-remove-account
description: Remove a stored ABA PayWay account token.
metadata:
  version: 1.2.1
---

# Remove Account

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

PayWay uses the unified `removeToken` endpoint for account and card credentials.
CLI: `payway-sdk cof token remove --ctid credential01 --token <pwt>`

## Error Handling
```ts
import { PayWayAPIError } from 'aba-payway-ts';
try { await payway.credentialsOnFile.removeToken(params); }
catch (error) { if (error instanceof PayWayAPIError) console.error(error.statusCode); }
```
Codes 104/105/09 carry token-state hints (invalid/expired — re-link or renew).

> 📋 **§24 live fact (2026-09-12):** remove answers `00 Success` even for a
> NON-EXISTENT token — it cannot probe existence or confirm anything was
> deleted. Use `getTokenDetails()` (09 = not found) to check presence first.
