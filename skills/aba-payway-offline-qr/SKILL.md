---
name: aba-payway-offline-qr
description: Generate an offline EMVCo KHQR payload without calling ABA PayWay APIs.
version: 1.1.0
---

# Offline KHQR

## Quick Start
```ts
const payload = payway.khqr.generateOfflineQR({ amount: 10, currency: 'USD', merchantRef: 'invoice-123' });
```

Offline QR uses EMVCo TLV plus CRC-16 CCITT. It does not use online HMAC signing, never reaches PayWay, and has no webhook or automatic reconciliation.

## Error Handling
```ts
import { PayWayConfigError } from 'aba-payway-ts';
try { payway.khqr.generateOfflineQR(params); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); }
```

## Related Skills
- [Online QR](../aba-payway-qr/SKILL.md)
