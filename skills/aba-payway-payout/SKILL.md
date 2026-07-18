---
name: aba-payway-payout
description: Make an ABA PayWay payout and manage payout beneficiaries.
version: 1.1.0
---

# ABA PayWay Payout

## Quick Start
```ts
const result = await payway.payout.payout({ transactionId: 'payout-123', amount: 10, currency: 'USD', beneficiaries: [{ account: 'recipient-account', amount: 10 }] });
```

`beneficiaries` must be non-empty and their amounts must exactly equal the payout total. A public key is required.

## Error Handling
```ts
import { PayWayConfigError } from 'aba-payway-ts';
try { await payway.payout.payout(params); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); }
```

## Related Skills
- [Configuration](../aba-payway-sdk-configuration/SKILL.md)