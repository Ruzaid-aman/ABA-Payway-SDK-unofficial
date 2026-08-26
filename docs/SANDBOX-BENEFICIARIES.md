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

## Validation rules
- **Both environments:** digits only; length ∈ {9, 11, 15}.
- **Sandbox only:** id must be a seeded value; currency must match the entry
  (USD accounts → USD, MIDs → KHR). Otherwise → `PayWayConfigError`
  (`not a known sandbox beneficiary` / `currency mismatch`).
- **Production:** only the structural format is checked (real whitelists are
  per-merchant at PayWay).

## Where it is enforced
- `validateBeneficiaries` (utils) — used by the `payout` domain.
- `paymentLink.create` payout block.
- `preAuth.completeWithPayout` payout block.

## CLI
```bash
payway-sdk sandbox-beneficiaries --currency USD
```
