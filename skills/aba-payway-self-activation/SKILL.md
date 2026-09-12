---
name: aba-payway-self-activation
description: Use when onboarding a new PayWay merchant as a PARTNER — the spec-derived self-activation endpoints (new-merchant, credential-info, mc-info) authenticated with PAYWAY_PARTNER_ID / PAYWAY_PARTNER_API_KEY and RSA-encrypted request_data, NOT regular merchant credentials.
metadata:
  version: 1.0.0
---

# Self-Activation (Partner Merchant Onboarding)

The online-self-activation trio lets an integrated **partner** provision and
inspect PayWay sub-merchants. These endpoints authenticate the PARTNER (not a
merchant): they require `PAYWAY_PARTNER_ID` + `PAYWAY_PARTNER_API_KEY` (falls
back to `PAYWAY_API_KEY`) + `PAYWAY_RSA_PUBLIC_KEY`, and are **spec-derived —
NOT live-verified** (a merchant sandbox cannot exercise them).

## Quick Start (CLI)

```sh
# Provision a new sub-merchant (returns registration/credential payload)
payway-sdk self-activation new-merchant --pushback-url <url> --redirect-url <url> \
  --register-ref req-1 --currency USD

# Inspect a pending registration by its register-ref
payway-sdk self-activation credential-info --register-ref req-1

# Look up an activated merchant (HMAC is SHA-512 here — the other two use SHA-256)
payway-sdk self-activation mc-info --merchant-key <key> --request-time <YYYYMMDDHHmmss>
```

## SDK equivalents

```ts
import { PayWay } from 'aba-payway-ts';
const payway = new PayWay(); // partner credentials via env or constructor
await payway.selfActivation.newMerchant({ pushbackUrl, redirectUrl, registerRef, currency: 'USD' });
await payway.selfActivation.credentialInfo({ registerRef: 'req-1' });
await payway.selfActivation.mcInfo({ merchantKey, requestTime: '20260912120000' });
```

## Auth & signing facts

- Transport: `requestWithPartnerAuth` — partner id + partner HMAC key; no
  merchant_id in the envelope. `request_data` is RSA-encrypted.
- HMAC is **SHA-256** for new-merchant and credential-info, but **SHA-512** for
  get-mc-credential-info — per the spec's own inconsistency. The SDK handles
  each; hand-rolled signers must match per endpoint.
- `register_ref` is YOUR correlation id (echoed by credential-info).

## Error Handling

All failures surface as `PayWayAPIError`/`PayWayConfigError` with the standard
fields (`paywayCode`, `correlationId`, `toJSON()`). Because the trio is
spec-derived, gateway codes are not yet catalogued — capture the raw response
and report unexpected codes to the ABA integration team. `payway-sdk explain`
covers all live-verified codes only.

## Related Skills
- [SDK Configuration](../aba-payway-sdk-configuration/SKILL.md) (partner env vars, RSA key)
- [Agent CLI](../aba-payway-agent/SKILL.md) (the 14-tool catalog)
