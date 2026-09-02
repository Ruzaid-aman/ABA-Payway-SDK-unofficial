---
name: aba-payway-transaction-list
description: List ABA PayWay transactions with date, amount, and status filters.
version: 1.2.0
---

# Transaction List

## Quick Start
```ts
const transactions = await payway.checkout.getTransactionList({
  fromDate: '2026-08-25 00:00:00',   // ⚠️ MUST be "YYYY-MM-DD HH:mm:ss"
  toDate:   '2026-08-25 23:59:59',
  status: 'APPROVED',                 // string enum, NOT the numeric code
});
```

This endpoint is capped at 50 requests per minute; cache dashboard results instead of live polling.

## Sandbox Facts
- Date filters accept **only** `"YYYY-MM-DD HH:mm:ss"` — compact (`20260825`),
  ISO-date, and epoch forms all fail with HTTP 403 code `49` "Invalid Start Date".
- **Date windows wider than 3 days are rejected** — the gateway answers HTTP 403
  ("Maximum date rang is allowed only 3 days", sandbox-verified 2026-08-31). The
  CLI **pre-validates locally** and exits 1 with a hint before any network call.
- **`pagination` above 1000 is rejected locally too** (CLI exit 1, no network).
- The array is the top-level `data` value; entries use `transaction_id`,
  `payment_status`, `original_amount`, `original_currency`.
- **Unpaid QR-only transactions are invisible to this endpoint** while
  check-transaction/detail see them — use check-transaction for unpaid-QR status.
- Duplicate merchant references are accepted by PayWay (links/transactions) —
  enforce uniqueness on your side.

## CLI Equivalent
```bash
payway-sdk transaction-list                 # defaults to today's window
payway-sdk transaction-list --from "2026-08-25 00:00:00" --to "2026-08-25 23:59:59" --status APPROVED
```

## Error Handling
```ts
import { PayWayAPIError } from 'aba-payway-ts';
try { await payway.checkout.getTransactionList({}); }
catch (error) { if (error instanceof PayWayAPIError) console.error(error.endpoint); }
```

## Related Skills
- [Transaction Detail](../aba-payway-transaction-detail/SKILL.md)
