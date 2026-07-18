---
name: aba-payway-link-card
description: Link a payment card for ABA PayWay credential-on-file payments.
version: 1.1.0
---

# Link Card

## Quick Start
```ts
const result = await payway.credentialsOnFile.linkCard({ requestId: 'link-123', frequency: '1M', returnUrl: 'https://merchant.example/return' });
```

Use a public HTTPS return URL and retain the returned token only on the server.

## Error Handling
```ts
import { PayWayConfigError } from 'aba-payway-ts';
try { await payway.credentialsOnFile.linkCard(params); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); }
```

## Related Skills
- [Token Purchase](../aba-payway-token-purchase/SKILL.md)