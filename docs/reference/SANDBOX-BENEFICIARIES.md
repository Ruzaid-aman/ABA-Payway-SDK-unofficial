# Sandbox Beneficiary Accounts & Test MIDs (Payout Testing)

Sandbox-only fixtures the SDK uses to validate payout / split-payout calls. **Never
use these in production** — sandbox enforcement is gated behind
`environment: 'sandbox'`.

## Seeded accounts (USD, 9-digit)
| Account | Currencies |
|---|---|
| `500000001` | USD |
| `500000002` | USD |
| `002094060` | USD |
| `111111111` | USD |
| `002092621` | USD |
| `000471132` | USD |

## Test MIDs (KHR, 15-digit)
| MID | Currencies |
|---|---|
| `323080111554956` | KHR |
| `325012214045630` | KHR |
| `325012214063221` | KHR |

## The #1 payout rule: currency must match the beneficiary

The payout `currency` must match **both** the beneficiary account currency **and**
the merchant credential currency. A KHR payout to a USD account is rejected — in
sandbox the SDK throws a client-side `PayWayConfigError` (`currency mismatch`)
**before any network call**; in production PayWay returns
**HTTP 403 / `PTL147`** (or numeric code **`12`**, "Payment currency is not allowed").

Use the seeded accounts for their currency: USD accounts with `currency: 'USD'`,
test MIDs with `currency: 'KHR'`.

## Validation rules
- **Both environments:** digits only; length ∈ {9, 11, 15}.
- **Sandbox only:** id must be a seeded value; currency must match the entry
  (USD accounts → USD, MIDs → KHR). Otherwise → `PayWayConfigError`
  (`not a known sandbox beneficiary` / `currency mismatch`).
- **Production:** only the structural format is checked (real whitelists are
  per-merchant at PayWay; currency/whitelist rejections arrive as API errors — see
  the payout error matrix in `docs/12-error-handling-and-debugging.md`).

## Where it is enforced
- `payway.payout.payout()` — `src/domains/payout.ts`
- `payway.preAuth.completeWithPayout()` — `src/domains/pre-auth.ts`

Both call `validateSandboxBeneficiary(account, currency, { sandbox })` for each
beneficiary. (The shared `validateBeneficiaries` helper enforces the non-empty /
positive-amount / sum-to-total rules; sandbox allowlist + currency is layered on
top by the two domains above.)

## CLI
```bash
payway-sdk sandbox-beneficiaries --currency USD     # list seeded USD accounts
payway-sdk sandbox-beneficiaries --currency KHR     # list seeded KHR test MIDs
payway-sdk sandbox-beneficiaries --json
payway-sdk payout -t <txId> -a 10 -c USD -b "500000001:10"   # payout command
```

## Programmatic access
```ts
import { listSandboxBeneficiaries, validateSandboxBeneficiary } from 'aba-payway-ts';

listSandboxBeneficiaries();                                  // all 9 fixtures
validateSandboxBeneficiary('500000001', 'USD', { sandbox: true });  // ok
validateSandboxBeneficiary('500000001', 'KHR', { sandbox: true });  // currency mismatch
```
