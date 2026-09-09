---
name: aba-payway-hash
description: Verify ABA PayWay webhook signatures with timing-safe HMAC verification.
metadata:
  version: 1.4.0
---

# Hash and Webhooks

## Quick Start
```ts
const isValid = payway.verifyCallback(req.body, req.headers['x-payway-hmac-sha512'] as string);
```

The signature arrives in the `X-PAYWAY-HMAC-SHA512` header. Do not read it from `req.body.hash`.

## Error Handling
```ts
if (!isValid) return res.status(400).send('Invalid PayWay signature');
```

## Tools (scripts/)

- **`verify-callback.cjs`** — verify a real callback offline: `node scripts/verify-callback.cjs --body-file cb.json --sig "<header>"` (or pipe the raw body). Exit 0 = valid, 1 = INVALID (do not process). Uses the SDK's exact sorted-key → HMAC-SHA512 → Base64 → timing-safe algorithm.
- **`sign-request.cjs`** — build a correctly-signed request payload: `node scripts/sign-request.cjs --preset get-mc-ref --merchant-ref "INV-1"` (presets: `checkout`, `check-transaction`, `get-mc-ref`, `exchange-rate`, or `--fields a,b,c`). The fastest way to debug `status.code 1` (Wrong Hash). The `checkout` preset signs the sandbox-verified 27-field purchase order, with `ctid` after `items`; subscription payloads (`--ctid --token-flag CITR_FIX --frequency 1M`) sign correctly, while omitted fields hash as `''` so plain purchases are unchanged.
- **`mock-callback.cjs`** — send a correctly-signed fake callback to your local webhook: `node scripts/mock-callback.cjs --url http://localhost:3000/payway/callback --tran-id order-1 --amount 10`. Test handlers without the ABA Simulator app.

All scripts are dependency-free, read `PAYWAY_MERCHANT_ID`/`PAYWAY_API_KEY` from env (or flags), and export their functions for tests.

> **Prefer the first-class CLI (2026-09-10):** `payway-sdk webhook verify-callback`
> (one-shot check, `--record` for captured verdicts), `payway-sdk webhook trigger`
> (signed fixtures, all three callback contracts), and `payway-sdk webhook resend`
> (replay captured records) now cover these workflows natively with `--json` output;
> the scripts remain for checkout installs without the CLI on PATH.

## Related Skills
- [Check Transaction](../aba-payway-check-transaction/SKILL.md)

> **Scope (2026-09-06):** `verifyCallback` applies to the HMAC-signed checkout/webhook
> callbacks. It does **NOT** apply to payment-link pushbacks — those POST to the link's
> `return_url` with **no hash field** (live-verified: body is
> `{tran_id, status: 0, merchant_ref_no}` only). Verify payment-link payments via
> `check-transaction(tran_id)` instead. See
> [payment-link](../aba-payway-payment-link/SKILL.md) and `docs/17-payment-link.md` §17.6.
