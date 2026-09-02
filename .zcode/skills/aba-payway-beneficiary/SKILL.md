---
name: aba-payway-beneficiary
description: Manage the ABA PayWay payout beneficiary whitelist — add payees, update status, and test with seeded sandbox beneficiaries.
version: 1.0.0
---

# Beneficiary Whitelist

Split-payout money moves to whitelisted beneficiary accounts. Before sending a
payout (or a purchase/payment-link/pre-auth with `payout`), the receiving
account must be whitelisted — the gateway rejects unknown payees. Whitelist
operations are RSA-encrypted: they require `PAYWAY_RSA_PUBLIC_KEY`.

## Quick Start
```ts
// Add a beneficiary to the whitelist (payee = beneficiary bank account id)
await payway.payout.addBeneficiary({ payee: '000999888' });

// Deactivate (0) / reactivate (1)
await payway.payout.updateBeneficiaryStatus({ payee: '000999888', status: 1 });
```

## Payout key shapes — per endpoint (do NOT mix)
| Surface | Keys |
|---|---|
| `payout.payout({ beneficiaries })` (standalone domain) | `{ account, amount }` |
| `generate-qr --payout` | `{ account, amount }` |
| `generate-checkout --payout` / `cof charge --payout` | `{ acc, amt }` |
| pre-auth complete-payout | `{ acc, amt }` |
| `payment-link create --payout` | `{ acc, amt }` — total must equal the link amount |

## Sandbox testing
Seeded, sandbox-only test beneficiaries (never valid in production) are exported
from the package barrel:
```ts
import { listSandboxBeneficiaries, validateSandboxBeneficiary } from 'aba-payway-ts';

listSandboxBeneficiaries();                       // 9 fixtures: 6 USD accounts + 3 KHR MIDs
validateSandboxBeneficiary('500000001', 'USD', { sandbox: true }); // throws PayWayConfigError on violation
```
Validation always enforces: non-empty, digits only, length ∈ {9, 11, 15}; with
`sandbox: true` it also enforces the seeded allowlist + currency match. See
[Sandbox Beneficiaries](../aba-payway-sandbox-beneficiaries/SKILL.md).

## CLI
```sh
payway-sdk beneficiary add 000999888
payway-sdk beneficiary update-status 000999888 -s 1    # 0 = inactive, 1 = active
payway-sdk sandbox-beneficiaries                        # list the seeded fixtures
```

## Error Handling
```ts
import { PayWayConfigError, PayWayBusinessError } from 'aba-payway-ts';
try { await payway.payout.addBeneficiary({ payee: '000999888' }); }
catch (error) {
  if (error instanceof PayWayConfigError) console.error(error.message); // e.g. missing RSA key
  else if (error instanceof PayWayBusinessError) console.error(error.paywayCode);
}
```

## Related Skills
- [Payout](../aba-payway-payout/SKILL.md)
- [Sandbox Beneficiaries](../aba-payway-sandbox-beneficiaries/SKILL.md)
- [Payment Link](../aba-payway-payment-link/SKILL.md)
- [Pre-Auth](../aba-payway-pre-auth/SKILL.md)
