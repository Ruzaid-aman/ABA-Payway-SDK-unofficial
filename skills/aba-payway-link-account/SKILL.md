---
name: aba-payway-link-account
description: Link an ABA PayWay account for future credential-on-file payments.
version: 1.1.0
---

# Link Account

## Quick Start
```ts
const result = await payway.credentialsOnFile.linkAccount({ requestId: 'link-123', callbackUrl: 'https://merchant.example/payway/callback' });
```

The callback URL must be public HTTPS. Store returned credential identifiers securely.

## Error Handling
```ts
import { PayWayConfigError } from 'aba-payway-ts';
try { await payway.credentialsOnFile.linkAccount(params); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); }
```

## Related Skills
- [Token Purchase](../aba-payway-token-purchase/SKILL.md)