---
name: aba-payway-transaction-close
description: Close an ABA PayWay transaction after processing it.
version: 1.1.0
---

# Close Transaction

## Quick Start
```ts
const result = await payway.checkout.closeTransaction('order-123');
```

Only close a transaction after your order system has reconciled its PayWay status.

## Sandbox Facts
- Success returns `{"status":{"code":"00","message":"Success!"}}`.
- A closed-but-unpaid transaction **keeps reporting PENDING** via check/list —
  track "closed" in your own state; do not infer it from PayWay.
- Nonexistent `tran_id` → HTTP 403, numeric code `5` "Transaction not found".
- The CLI prompts before voiding; pass `-y/--force` for scripts/agents:
  `payway-sdk close-transaction -t <id> -y`.

## Error Handling
```ts
import { PayWayBusinessError } from 'aba-payway-ts';
try { await payway.checkout.closeTransaction('order-123'); }
catch (error) { if (error instanceof PayWayBusinessError) console.error(error.message); }
```

## Related Skills
- [Check Transaction](../aba-payway-check-transaction/SKILL.md)
