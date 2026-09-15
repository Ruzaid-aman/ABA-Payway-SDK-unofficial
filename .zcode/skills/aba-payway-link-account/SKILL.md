---
name: aba-payway-link-account
description: Link an ABA PayWay account for future credential-on-file payments.
metadata:
  version: 1.3.0
---

# Link Account

`link-account` returns a QR code / ABA Mobile deeplink the customer scans to
select an account; the resulting token (`pwt`) is delivered to your
`callback_url` (the QR/deeplink expires in 10 minutes).

## Live-verified success shape (2026-09-15, §26 — AOF-enabled profile)
```json
{
  "status": { "code": "00", "message": "Success.", "trace_id": "…" },
  "data": {
    "qr_string": "ABAAOFmYj+WlOACIi17C44f5Hky…",   // ABAAOF-prefixed linking payload
    "deeplink": "abamobilebank://ababank.com?type=account_on_file&qrcode=…",
    "expire_in": 1789450458
  }
}
```
- The linking deeplink uses **`type=account_on_file`** — a distinct variant
  from payment QRs (`type=payway`). Use the gateway-supplied `data.deeplink`;
  do NOT build it with the payment deeplink helper.
- `expire_in` reads as an **absolute epoch (expiry instant, seconds)**, not a
  TTL — the ~10-minute window is the gap between response time and `expire_in`.
  The CLI renders the wall-clock deadline ("expires …Z (~N min left)").
- Undocumented flags (`CITO_FIX`, `CITR_FLEX`) answer `104 "Merchant not
  enabled token flag"` even on AOF-enabled profiles — stick to
  `CITI_FLEX | CITO_FLEX`.

CLI presents the QR end-to-end: PNG saved to
`payway-output/cof-link-account-<request-id>.png` (auto-opens on TTY;
`--open-image` forces, `--no-open-image` suppresses), `--json` envelope
gains `qrPngPath`.

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
payway-sdk cof link-account -r linkacct001 --ctid customerabc \
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
