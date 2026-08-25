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

## Sandbox Facts (2026-08-25)
- Payout to a non-whitelisted account → HTTP 403, numeric code **37** ("Payout accounts are not in whitelist"). Whitelist the payee first via `addBeneficiary`.
- Beneficiaries are RSA-encrypted and the HMAC is **hex**-encoded for this endpoint (SDK handles both).

## Error Handling
```ts
import { PayWayConfigError } from 'aba-payway-ts';
try { await payway.payout.payout(params); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); }
```

## Related Skills
- [Configuration](../aba-payway-sdk-configuration/SKILL.md)