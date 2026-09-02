---
name: aba-payway-sandbox-beneficiaries
description: Seeded sandbox-only beneficiary accounts and test MIDs for PayWay payout / split-payout testing.
version: 1.2.0
---

# Sandbox Beneficiaries (test fixtures)

Seeded, sandbox-only test accounts and MIDs the SDK uses to validate payout /
split-payout calls. They are **never valid in production** — enforcement is gated
behind `environment: 'sandbox'`.

Both helpers are exported from the package barrel (v1.5.0; previously
package-internal — the import below used to fail at runtime).

## Quick Start
```ts
import { listSandboxBeneficiaries, validateSandboxBeneficiary } from 'aba-payway-ts';

// All 9 seeded fixtures (6 USD accounts + 3 KHR MIDs)
listSandboxBeneficiaries();

// Validation (sandbox only enforces the allowlist + currency match)
validateSandboxBeneficiary('500000001', 'USD', { sandbox: true }); // ok
validateSandboxBeneficiary('500000001', 'KHR', { sandbox: true }); // currency mismatch
```

## Accounts (USD, 9-digit)
```
500000001, 500000002, 002094060, 111111111, 002092621, 000471132
```

## Test MIDs (KHR, 15-digit)
```
323080111554956, 325012214045630, 325012214063221
```

## How it is enforced
- **Both environments:** beneficiary id must be digits only and 9, 11, or 15 digits.
- **Sandbox only:** the id must be one of the seeded values AND its currency must
  match (USD accounts → USD, MIDs → KHR). Otherwise throws `PayWayConfigError`
  (`not a known sandbox beneficiary` / `currency mismatch`) before the request is sent.
- **Production:** only the structural format is checked; real whitelists are managed by PayWay per merchant.

## The payout currency rule
A payout's `currency` must match the beneficiary account currency **and** the
merchant credential currency. A KHR payout to a USD account is rejected — the SDK
throws `currency mismatch` in sandbox *before* the network call; in production
PayWay returns **HTTP 403 / `PTL147`** (or numeric **`12`**). Use the seeded
accounts for their currency: USD accounts with `currency: 'USD'`, test MIDs with
`currency: 'KHR'`. The full error matrix (`PTL147` / `37` / `PTL146` /
`PTL-PAYOUT-37` / `PTL46` / `PTL-PAYOUT-36` / `1` / `415`) lives in the
[Payout](../aba-payway-payout/SKILL.md) skill and `docs/12-error-handling-and-debugging.md`.

## CLI
```bash
payway-sdk sandbox-beneficiaries            # list all
payway-sdk sandbox-beneficiaries --currency USD
payway-sdk sandbox-beneficiaries --json
```

## Error Handling
```ts
import { PayWayConfigError } from 'aba-payway-ts';
try { validateSandboxBeneficiary('999999999', 'USD', { sandbox: true }); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); }
```

## Related Skills
- [Payout](../aba-payway-payout/SKILL.md)
- [Payment Link](../aba-payway-payment-link/SKILL.md)
- [Pre-Auth](../aba-payway-pre-auth/SKILL.md)
