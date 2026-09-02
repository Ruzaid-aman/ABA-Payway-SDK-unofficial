---
name: aba-payway-link-account
description: Link an ABA PayWay account for future credential-on-file payments.
version: 1.3.0
---

# Link Account

`link-account` returns a QR code / ABA Mobile deeplink the customer scans to
select an account; the resulting token (`pwt`) is delivered to your
`callback_url` (the QR/deeplink expires in 10 minutes).

## Quick Start
```ts
// requestId/ctid must match the gateway rule [a-zA-Z0-9]{5,24} — no hyphens.
// v1.3.6 (live-docs parity): ctid, tokenFlag, and currency are REQUIRED.
const result = await payway.credentialsOnFile.linkAccount({
  requestId: 'linkacct001',
  ctid: 'customerabc',          // your customer token identifier
  tokenFlag: 'CITI_FLEX',        // CITI_FLEX | CITO_FLEX (live-documented)
  currency: 'USD',              // profile-enabled currency (required)
  callbackUrl: 'https://merchant.example/payway/callback',
  returnDeeplink: { ios_scheme: 'myapp://linked', android_scheme: 'myapp://linked' }, // optional app deeplink
});
// result carries the QR/deeplink for the customer; the pwt arrives via callback.
```

The callback URL must be public HTTPS. Store returned credential identifiers securely.

Hash order (§16-verified, merchant_id first):
`merchant_id.request_time.ctid.return_deeplink.callback_url.request_id.token_flag.currency`.
`returnDeeplink` (SDK) / `--return-deeplink` (CLI, JSON-or-string) is optional
but IS a hash position — it is base64-encoded before hashing.

CLI:
```sh
npx tsx src/cli.ts cof link-account -r linkacct001 --ctid customerabc \
  --token-flag CITI_FLEX --currency USD --callback-url https://merchant.example/payway/callback \
  --return-deeplink '{"ios_scheme":"myapp://linked","android_scheme":"myapp://linked"}'
```

## Error Handling
```ts
import { PayWayConfigError } from 'aba-payway-ts';
try { await payway.credentialsOnFile.linkAccount(params); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); }
```
Malformed payloads get HTTP 400 code `"04"` with a per-field `errors{}` map in
`error.rawBody.status.errors`.

## Related Skills
- [Token Purchase](../aba-payway-token-purchase/SKILL.md)
- [Link Card](../aba-payway-link-card/SKILL.md)
