---
name: aba-payway-payout
description: Make an ABA PayWay payout / split-payout and manage payout beneficiaries (whitelist, currency matching, error codes).
metadata:
  version: 1.2.0
---

# ABA PayWay Payout

## Quick Start
```ts
const result = await payway.payout.payout({
  transactionId: 'payout-123',
  amount: 10,
  currency: 'USD',
  beneficiaries: [{ account: '500000001', amount: 10 }],
});
```

`beneficiaries` must be non-empty and their amounts must **exactly equal** the payout total. A public key (`publicKeyPem`) is required — the beneficiary blob is RSA-encrypted and the HMAC is **hex**-encoded for this endpoint (the SDK handles both).

## Critical rule: payout currency must match the beneficiary

The payout `currency` must match **both**:

1. each beneficiary account's currency, and
2. the merchant credential currency configured for your profile.

A USD beneficiary rejects a KHR payout (and vice-versa) — PayWay returns
**HTTP 403 / `PTL147`** (or numeric code **`12`**, "Payment currency is not allowed").
The SDK enforces this client-side in sandbox (see `aba-payway-sandbox-beneficiaries`),
so a KHR payout to a seeded USD account throws before any API call.

```ts
// ✗ throws in sandbox: 500000001 is a USD account, but currency is KHR
await payway.payout.payout({ transactionId: 't', amount: 1000, currency: 'KHR', beneficiaries: [{ account: '500000001', amount: 1000 }] });
```

## Sandbox Facts (2026-08-25)
- Non-whitelisted account → HTTP 403, numeric **`37`** ("Payout accounts are not in whitelist"). Whitelist via `addBeneficiary`.
- Beneficiaries are RSA-encrypted; HMAC is hex-encoded for this endpoint.
- Use the seeded sandbox accounts/MIDs from `aba-payway-sandbox-beneficiaries` — any other account is rejected (even if well-formed).

## Error Handling
```ts
import { PayWayConfigError, PayWayAPIError } from 'aba-payway-ts';
import { PAYOUT_ERROR_CODES } from 'aba-payway-ts';
try {
  await payway.payout.payout(params);
} catch (error) {
  if (error instanceof PayWayConfigError) {
    console.error(error.message); // client-side: bad amount, currency/account mismatch (sandbox)
  } else if (error instanceof PayWayAPIError) {
    switch (error.paywayCode) {
      case '12':
      case PAYOUT_ERROR_CODES.CURRENCY_NOT_ALLOWED: // PTL147
        console.error('Currency mismatch: payout currency must match the beneficiary & merchant credential currency.');
        break;
      case '37':
      case PAYOUT_ERROR_CODES.ACCOUNT_NOT_WHITELISTED: // PTL146 / PTL-PAYOUT-37 / PTL46
        console.error('Beneficiary not whitelisted — call addBeneficiary() first.');
        break;
      case PAYOUT_ERROR_CODES.AMOUNT_MISMATCH: // PTL-PAYOUT-36
        console.error('Sum of beneficiary amounts must equal the payout amount.');
        break;
      case '1':
        console.error('Wrong Hash — check API key, HMAC field order, and hex vs base64.');
        break;
      default:
        console.error(`${error.paywayCode}: ${error.message}`);
    }
  }
}
```

### Payout error matrix
| Code | Meaning | Fix |
|---|---|---|
| `12` / `PTL147` | Payment currency not allowed | Payout currency must match beneficiary account currency **and** merchant credential currency (USD→USD, KHR→KHR) |
| `37` / `PTL146` / `PTL-PAYOUT-37` / `PTL46` | Beneficiary not whitelisted | Register the payee via `addBeneficiary()` (or the payment-link whitelist) first |
| `PTL-PAYOUT-36` | Payout amount mismatch | Sum of `beneficiaries[].amount` must equal the payout (transaction complete) amount |
| `1` | Wrong Hash | Check API key, HMAC field ordering, base64 vs hex encoding |
| `24` | Invalid Beneficiary Data | RSA-encrypted beneficiaries malformed — verify public key + account format |
| `415` (HTTP) | Unsupported Media Type | Direct payout API requires `Content-Type: application/json` (not form-encoded) |

## CLI
```bash
payway-sdk payout -t <txId> -a 10 -c USD -b "500000001:10"
payway-sdk sandbox-beneficiaries --currency USD   # list seeded test accounts
```

## Related Skills
- [Sandbox Beneficiaries](../aba-payway-sandbox-beneficiaries/SKILL.md)
- [SDK Configuration](../aba-payway-sdk-configuration/SKILL.md)
