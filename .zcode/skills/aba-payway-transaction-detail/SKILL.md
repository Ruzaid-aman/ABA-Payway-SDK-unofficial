---
name: aba-payway-transaction-detail
description: Retrieve detailed ABA PayWay transaction information safely.
version: 1.2.0
---

# Transaction Detail

## Quick Start
```ts
const detail = await payway.checkout.getTransactionDetail('order-123');
```

PayWay limits this endpoint to 10 requests per minute (not raisable). Do not poll it for every page refresh — use check-transaction (600 req/s) for status reads and reserve detail for reconciliation (`apv`, `bank_ref`, `payer_account`, operation history).

## Sandbox Facts (measured 2026-08-25)
- Response wraps data under `.data`; `status.code` is `"00"` on success.
- Useful fields: `payment_status`, `payment_status_code`, `payment_amount`,
  `refund_amount` (remaining refundable = `payment_amount − refund_amount`),
  `apv`, `payment_type`, `bank_ref`, `payer_account`, `transaction_operations`.
- Unknown/not-yet-indexed `tran_id` → HTTP **200** with `status.code 6` ("tran_id not found") — same shape as check-transaction, NOT a 403.
- **Creation lag:** a fresh transaction appears in check-transaction in <1s but takes ~5s to appear in detail. Poll status with check-transaction; call detail only after the payment is confirmed or for after-the-fact reads.
- **Strict-cap shape:** call #11 within a rolling minute returns HTTP **403** with NUMERIC body `status.code` 429 ("Rate limit exceeded...") and no rate-limit headers. The SDK maps this to typed `PayWayRateLimitError` (retryable) and paces retries from its own observed request window (1–10s) instead of failing opaquely.
- Latency ≈ check-transaction (~130–750ms warm).

## CLI Equivalent
```bash
payway-sdk transaction-detail -t <id> [--json]
payway-sdk transaction-detail -t <id> --wait 15   # retry the ~5s indexing lag every 2s
```

**`--json` error contract:** failures print a parseable envelope on stdout —
`{ "error": { "kind": "api", "exitCode": 2, "type": "…", "message": "…",
"paywayCode": "6", "httpStatus": 200, "retryable": false } }` — not the human
✗ block. The `Using profile: …` line may precede it (parse from the first `{`).

## Error Handling
```ts
import { PayWayRateLimitError } from 'aba-payway-ts';
try { await payway.checkout.getTransactionDetail('order-123'); }
catch (error) { if (error instanceof PayWayRateLimitError) console.error('Retry later'); }
```

## Related Skills
- [Check Transaction](../aba-payway-check-transaction/SKILL.md)
