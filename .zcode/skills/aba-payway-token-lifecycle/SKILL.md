---
name: aba-payway-token-lifecycle
description: Manage ABA PayWay stored tokens — renew, inspect details, remove, and track the 90-day expiry.
metadata:
  version: 1.1.0
---

# Token Lifecycle

Account tokens (CITI_FLEX/CITO_FLEX) expire **90 days** after linking, renewal,
or the last successful transaction (whichever is most recent). Card tokens
cannot be renewed. The token-management trio is UN-GATED since 2026-08-31
(the live-documented HMAC compositions were sandbox-verified on 2026-08-31).

## Quick Start
```ts
import { computeTokenExpiry, daysUntilTokenExpiry, TOKEN_VALIDITY_DAYS } from 'aba-payway-ts';

// 1. Renew an expiring ACCOUNT token (a callback is expected within 3 minutes;
//    if it never arrives, fall back to getTokenDetails).
const renewed = await payway.credentialsOnFile.renewToken({
  requestId: 'reqrenew001', ctid: 'customer123', paymentToken: pwt,
});

// 2. Inspect a token (takes ONLY requestId — no ctid/pwt). Use a request ID
//    from the SAME linkage you are inspecting (e.g. the original link request
//    or the latest renew) — the gateway resolves the token by that request.
const details = await payway.credentialsOnFile.getTokenDetails({ requestId: 'reqrenew001' });

// 3. Remove a token (IRREVERSIBLE — takes ctid + pwt, NO requestId;
//    future charges decline with purchase error 87; the ABA Mobile user is notified).
await payway.credentialsOnFile.removeToken({ ctid: 'customer123', paymentToken: pwt });

// Expiry helpers (90-day window):
const expiresAt = computeTokenExpiry(linkedAt);        // Date 90 days after the validity base
const daysLeft = daysUntilTokenExpiry(expiresAt);     // number — renew when low
// The validity base is whichever event is most recent: linking, renewal, or
// the last successful transaction — derive the expiry FROM that event and
// pass the derived expiry (not the event date itself) to daysUntilTokenExpiry.
```

## Per-endpoint param shapes (gateway-verified §16 — do NOT mix them)
| Operation | Params | Hash order |
|---|---|---|
| renew (account tokens only) | `requestId` + `ctid` + `paymentToken` | `ctid.request_time.pwt.merchant_id.request_id` |
| get details | `requestId` ONLY | `merchant_id.request_time.request_id` (no ctid/pwt anywhere) |
| remove (irreversible) | `ctid` + `paymentToken` (no requestId) | `merchant_id.ctid.request_time.pwt` |

`allowUnverifiedTokenOperations` is a deprecated escape hatch — the trio is
allowed by default; only an explicit `false` re-blocks.

## Error Hints
- `105` — token invalid or expired → re-link via linkAccount/linkCard, or renew.
- `104` — merchant not enabled for the token flag → check the merchant profile (live 2026-09-12 §24 LC-1: the link-card hosted page answers this when card tokenization is not enabled — ask ABA).
- `09` — token/ctid not found → wrong ctid or the token was removed.
- `1`/`01` — Wrong Hash → `PayWaySignatureError` carries the endpoint's hash-order hint.

> 📋 **§24 live fact (2026-09-12):** `removeToken` answers `00 Success` even for a
> NON-EXISTENT token — it cannot probe existence. Use `getTokenDetails()`
> (09 = not found) when you need to check whether a token is still present.

## CLI
```sh
payway-sdk cof token renew   -r reqrenew001  -c customer123 --token <pwt>
payway-sdk cof token details -r reqrenew001                  # requestId ONLY — use the linkage's known request ID
payway-sdk cof token remove  -c customer123  --token <pwt>     # NO requestId; irreversible
```

> Request IDs must match `[a-zA-Z0-9]{5,24}` — letters/digits only, no hyphens.
> The SDK validates locally and rejects invalid IDs before any network call.

## Error Handling
```ts
import { PayWayBusinessError } from 'aba-payway-ts';
try { await payway.credentialsOnFile.renewToken(params); }
catch (error) { if (error instanceof PayWayBusinessError) console.error(error.paywayCode, error.message); }
```

## Related Skills
- [Link Account](../aba-payway-link-account/SKILL.md)
- [Link Card](../aba-payway-link-card/SKILL.md)
- [Token Purchase](../aba-payway-token-purchase/SKILL.md)
- [Credentials on File](../aba-payway-cof/SKILL.md)
