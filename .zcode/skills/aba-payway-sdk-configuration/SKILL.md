---
name: aba-payway-sdk-configuration
description: Configure aba-payway-ts with explicit options or PAYWAY environment variables.
version: 1.2.0
---

# SDK Configuration

## Quick Start
```ts
import { PayWay } from 'aba-payway-ts';
const payway = new PayWay();
```

Set `PAYWAY_MERCHANT_ID` and `PAYWAY_API_KEY`. Optional values are `PAYWAY_RSA_PUBLIC_KEY`, `PAYWAY_BASE_URL`, `PAYWAY_ENV` (named `sandbox` or `production`; a URL value is honored as base URL; takes precedence over `PAYWAY_SANDBOX`), `PAYWAY_SANDBOX`, `PAYWAY_TIMEOUT`, `PAYWAY_LOG_LEVEL` (`debug|info|warn|error`), `PAYWAY_STRICT_VALIDATION` (`1`/`true`), and `DEBUG_PAYWAY`. Explicit constructor options take precedence over all environment variables. Use `debug: true` only in controlled environments; logs redact secrets.

Offline KHQR merchant data comes from `PAYWAY_KHQR_BAKONG_ID`, `PAYWAY_KHQR_ABA_MERCHANT_ID`, `PAYWAY_KHQR_ACQUIRER_NAME`, `PAYWAY_KHQR_MERCHANT_CATEGORY_CODE`, `PAYWAY_KHQR_MERCHANT_NAME`, `PAYWAY_KHQR_MERCHANT_CITY` (or the `khqr` config object / a CLI profile).

Constructor-only / validation options:
- `strictValidation: true` (or `PAYWAY_STRICT_VALIDATION=1`) — escalates every advisory warning (length caps, enum membership, payout-total mismatches, image limits) to `PayWayConfigError`. Default is advisory: warn once.
- `allowPrivateCallbackHosts: true` — permits private/loopback callback hosts (local dev); rejected by default.
- Resilience/observability (see docs/12): `logLevel`, `logFormat: 'json'`, `backoffJitter: 'full'`, `circuitBreaker: { failureThreshold, resetTimeoutMs }`.
- `allowUnverifiedTokenOperations` — **DEPRECATED escape hatch, default ALLOWED**: the token trio (renew/get-details/remove) was un-gated 2026-08-31 after its live-documented HMAC compositions were sandbox-verified (SANDBOX-FINDINGS §16). Setting it explicitly to `false` re-blocks; you never need to set it to `true`.

## Error Handling
```ts
import { PayWay, PayWayConfigError } from 'aba-payway-ts';
try { new PayWay(); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); }
```

## Related Skills
- [Purchase](../aba-payway-purchase/SKILL.md)
- [Token Lifecycle](../aba-payway-token-lifecycle/SKILL.md)
