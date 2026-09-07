---
name: aba-payway-pre-auth
description: Complete, complete with payout, or cancel an ABA PayWay pre-authorization.
metadata:
  version: 1.2.0
---

# ABA PayWay Pre-Authorization

## Quick Start
```ts
const result = await payway.preAuth.complete('order-123', 10);
```

Pre-authorization endpoints require `publicKeyPem` because requests use RSA-encrypted merchant authorization. The SDK validates the PEM structure before any call — a malformed key throws a clear `PayWayConfigError` (use the exported `isValidPublicKeyPem()` to pre-flight).

## Complete with payout
```ts
const result = await payway.preAuth.completeWithPayout('order-123', 200.0, [
  { acc: '500000001', amt: 200.0 },
]);
```

`completeWithPayout` captures the pre-auth **and** pushes funds to beneficiary
accounts in one call. Each payout entry is validated the same way as a standalone
payout:

- **Both environments:** `acc` must be digits only, length 9/11/15, and `amt` a positive USD amount.
- **Sandbox only:** `acc` must be one of the seeded sandbox beneficiaries and the payout is always **USD** — a non-whitelisted or currency-mismatched account throws `PayWayConfigError` before the request (see `aba-payway-sandbox-beneficiaries`).

```ts
// Sandbox payout rules (applies to the entry { acc: '500000001', amt: 200.0 }):
// 500000001 IS a seeded USD account, so this entry passes sandbox validation.
// A KHR beneficiary/MID or an unknown account throws PayWayConfigError locally
// BEFORE any request (see aba-payway-sandbox-beneficiaries).
```

## Error Handling
```ts
import { PayWayConfigError, PayWayAPIError } from 'aba-payway-ts';
import { PRE_AUTH_ERROR_CODES } from 'aba-payway-ts';
try {
  await payway.preAuth.completeWithPayout('order-123', 200.0, [{ acc: '500000001', amt: 200.0 }]);
} catch (error) {
  if (error instanceof PayWayConfigError) {
    console.error(error.message); // client-side: bad account/amount, sandbox whitelist/currency
  } else if (error instanceof PayWayAPIError) {
    switch (error.paywayCode) {
      case PRE_AUTH_ERROR_CODES.UNABLE_TO_COMPLETE: // PTL59
        console.error('Capture not allowed — transaction status invalid (never authorized / already done).');
        break;
      case PRE_AUTH_ERROR_CODES.MERCHANT_INVALID: // PTL62
        console.error('Profile lacks permission for this operation (e.g. complete-with-payout).');
        break;
      case PRE_AUTH_ERROR_CODES.UNABLE_TO_CANCEL: // PTL170
        console.error('Only OPEN/PENDING pre-auths can be cancelled.');
        break;
      default:
        console.error(`${error.paywayCode}: ${error.message}`);
    }
  }
}
```

## Related Skills
- [Payout](../aba-payway-payout/SKILL.md)
- [Sandbox Beneficiaries](../aba-payway-sandbox-beneficiaries/SKILL.md)
- [Configuration](../aba-payway-sdk-configuration/SKILL.md)
