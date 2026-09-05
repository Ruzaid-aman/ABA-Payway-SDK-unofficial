---
name: aba-payway-offline-qr
description: Generate an offline EMVCo KHQR payload without calling ABA PayWay APIs.
version: 1.2.0
---

# Offline KHQR

## Quick Start
```ts
const payload = payway.khqr.generateOfflineQR({ amount: 10, currency: 'USD', merchantRef: 'invoice-123' });
```

Offline QR uses EMVCo TLV plus CRC-16 CCITT. It does not use online HMAC signing, never reaches PayWay, and has no webhook or automatic reconciliation.

## Configuration (required)

Offline KHQR needs the merchant identity from env or config — **all 7 `PAYWAY_KHQR_*` vars** (a bare `generate-qr --offline` without them fails locally with 7 `KHQR_*_REQUIRED` codes, exit 1; the repo `.env` does NOT ship them):

```sh
PAYWAY_KHQR_BAKONG_ID             # Bakong-registered account id (e.g. user@ababank)
PAYWAY_KHQR_ABA_MERCHANT_ID       # ABA merchant id
PAYWAY_KHQR_ACQUIRER_NAME         # Acquirer name
PAYWAY_KHQR_MERCHANT_CATEGORY_CODE
PAYWAY_KHQR_MERCHANT_NAME
PAYWAY_KHQR_MERCHANT_CITY
PAYWAY_KHQR_PAYWAY_DATA           # PayWay routing data (62·68/99 tags)
```

Note: unlike a locally built offline QR, the Merchant Portal's Customer Module QR is also static but carries PayWay routing tags (62·68, 99), so its payments DO trigger callbacks and are reconcilable — see [Customer Module QR](../aba-payway-customer-qr/SKILL.md).

## Error Handling
```ts
import { PayWayConfigError } from 'aba-payway-ts';
try { payway.khqr.generateOfflineQR(params); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); }
```

## Related Skills
- [Online QR](../aba-payway-qr/SKILL.md)
