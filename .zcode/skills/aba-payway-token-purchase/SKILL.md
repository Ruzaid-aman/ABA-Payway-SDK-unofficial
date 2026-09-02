---
name: aba-payway-token-purchase
description: Charge a stored ABA PayWay credential token.
version: 1.2.0
---

# Token Purchase

## Quick Start
```ts
// v1.3.6: requestId is NO LONGER SENT on the CoF payment path (deprecated —
// verified live; the binding layer no longer requires it).
const result = await payway.credentialsOnFile.payment({
  transactionId: 'order-123',   // [a-zA-Z0-9-]{1,20}
  amount: 10,
  paymentToken: 'stored-token', // the pwt from link-account/link-card
  currency: 'USD',              // defaults USD; KHR floor is 100
  ctid: 'customerabc',          // optional on repeat charges
  tokenFlag: 'CITU_FLEX',       // CITU_FLEX|MITU_FLEX|MITU_FIX|MITR_FLEX|MITR_FIX
});
// Hash order (§16-verified): request_time.merchant_id.tran_id.amount.currency.
// items.ctid.pwt.first_name.last_name.email.phone.purchase_type.callback_url.
// custom_fields.return_params.payout.token_flag.shipping_fee
```

Never log or expose the payment token to browsers.

CLI: `npx tsx src/cli.ts cof charge -t order-123 -a 10.00 --token <pwt>`

## Error Handling
```ts
import { PayWayBusinessError } from 'aba-payway-ts';
try { await payway.credentialsOnFile.payment(params); }
catch (error) { if (error instanceof PayWayBusinessError) console.error(error.message); }
```

## Related Skills
- [Link Account](../aba-payway-link-account/SKILL.md)
- [Link Card](../aba-payway-link-card/SKILL.md)
