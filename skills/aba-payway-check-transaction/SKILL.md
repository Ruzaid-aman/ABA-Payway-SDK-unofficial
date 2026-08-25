---
name: aba-payway-check-transaction
description: Check the current status of an ABA PayWay transaction.
version: 1.1.0
---

# Check Transaction

## Quick Start
```ts
const result = await payway.checkout.checkTransaction('order-123');
```

This endpoint is capped at 600 requests per second. Prefer verified webhooks for fulfillment decisions.

## Sandbox Facts
- Unknown `tran_id` → HTTP **200** with `status.code 6` ("tran_id not found") — not a 403.
- Closed-but-unpaid transactions keep reporting `PENDING` (not CANCELLED).
- Status codes: `0` APPROVED · `2` PENDING · `3` DECLINED · `4` REFUNDED · `7` CANCELLED (`PAYMENT_STATUS_CODES`).

## CLI Equivalents
```bash
payway-sdk check-transaction -t <id>          # one-shot, human output
payway-sdk check-transaction -t <id> --json   # structured for agents
payway-sdk poll-transaction -t <id> --json    # watch until terminal status;
                                              # emits {"event":"poll"|"terminal"|"aborted"} lines,
                                              # exit 0 terminal / 2 API error / 3 timeout
```

## Error Handling
```ts
import { PayWayBusinessError } from 'aba-payway-ts';
try { await payway.checkout.checkTransaction('order-123'); }
catch (error) { if (error instanceof PayWayBusinessError) console.error(error.paywayCode); }
```

## Tools (scripts/)

- **`decode-status.cjs`** — paste any PayWay callback/API response JSON and get a human verdict: status-code meaning, terminal vs non-terminal, gateway/PTL error-code hints, key fields.
  ```sh
  node scripts/decode-status.cjs --body '{"payment_status_code":0,...}'
  cat response.json | node scripts/decode-status.cjs
  ```

## Related Skills
- [Hash and Webhooks](../aba-payway-hash/SKILL.md)
