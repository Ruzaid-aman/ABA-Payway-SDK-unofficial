---
name: aba-payway-link-card
description: Link a payment card for ABA PayWay credential-on-file payments.
version: 1.1.0
---

# Link Card

## Quick Start
```ts
const result = await payway.credentialsOnFile.linkCard({
  requestId: 'link-123',
  ctid: 'customer-abc',
  tokenFlag: 'CITR_FLEX',      // CITI_FLEX|CITO_FLEX|CITO_FIX|CITR_FLEX
  frequency: '1M',             // 1W|1M|2M — required
  currency: 'USD',             // server-required; defaults to USD
  returnUrl: 'https://merchant.example/return',
});
```

Use a public HTTPS return URL and retain the returned token only on the server.

## Sandbox Facts (2026-08-25)
- Success returns an **HTTP 200 HTML page** (hosted card-entry checkout), not JSON — redirect/embed it.
- Form-urlencoded only (SDK handles it); `ctid`, `currency`, `frequency` are binding-required.
- Sandbox does not verify the hash on this endpoint — do not treat that as a security control.

## Error Handling
```ts
import { PayWayConfigError } from 'aba-payway-ts';
try { await payway.credentialsOnFile.linkCard(params); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); }
```
Malformed payloads get HTTP 400 code `"04"` with a per-field `errors{}` map in
`error.rawBody.status.errors`.

## Related Skills
- [Token Purchase](../aba-payway-token-purchase/SKILL.md)