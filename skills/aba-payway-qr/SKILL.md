---
name: aba-payway-qr
description: Generate an online ABA PayWay KHQR payment QR code.
version: 1.1.0
---

# ABA PayWay QR

## Quick Start
```ts
import { PayWay } from 'aba-payway-ts';
const payway = new PayWay();
const qr = await payway.qr.generateQr({ transactionId: 'order-123', amount: 10, paymentOption: 'abapay_khqr', callbackUrl: 'https://merchant.example/payway/callback' });
```

Use an HTTPS callback URL and save the transaction ID before displaying the returned QR data.

## Error Handling
```ts
import { PayWayAPIError } from 'aba-payway-ts';
try { await payway.qr.generateQr(params); }
catch (error) { if (error instanceof PayWayAPIError) console.error(error.statusCode); }
```

## Related Skills
- [Offline QR](../aba-payway-offline-qr/SKILL.md)
- [Check Transaction](../aba-payway-check-transaction/SKILL.md)