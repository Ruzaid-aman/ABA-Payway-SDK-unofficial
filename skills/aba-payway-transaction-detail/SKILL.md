---
name: aba-payway-transaction-detail
description: Retrieve detailed ABA PayWay transaction information safely.
version: 1.1.0
---

# Transaction Detail

## Quick Start
```ts
const detail = await payway.checkout.getTransactionDetail('order-123');
```

PayWay limits this endpoint to 10 requests per minute. Do not poll it for every page refresh.

## Sandbox Facts
- Response wraps data under `.data`; `status.code` is `"00"` on success.
- Useful fields: `payment_status`, `payment_status_code`, `payment_amount`,
  `refund_amount` (remaining refundable = `payment_amount − refund_amount`),
  `apv`, `payment_type`.
- Unknown `tran_id` → HTTP 403 `PTL36` "Transaction not found or is invalid".

## CLI Equivalent
```bash
payway-sdk transaction-detail -t <id> [--json]
```

## Error Handling
```ts
import { PayWayRateLimitError } from 'aba-payway-ts';
try { await payway.checkout.getTransactionDetail('order-123'); }
catch (error) { if (error instanceof PayWayRateLimitError) console.error('Retry later'); }
```

## Related Skills
- [Check Transaction](../aba-payway-check-transaction/SKILL.md)