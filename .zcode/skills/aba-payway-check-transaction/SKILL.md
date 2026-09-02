---
name: aba-payway-check-transaction
description: Check the current status of an ABA PayWay transaction.
version: 1.3.0
---

# Check Transaction

## Quick Start
```ts
const result = await payway.checkout.checkTransaction('order-123');
```

This endpoint is capped at 600 requests per second. Prefer verified webhooks for fulfillment decisions.

## Sandbox Facts
- Unknown `tran_id` → HTTP **200** with `status.code 6` ("tran_id not found") — not a 403.
- **Creation grace period (2026-08-25):** the very first `checkTransaction` right after creating a transaction can return code 6 for a few seconds before the transaction is visible. `pollTransactionStatus()` recognizes this and yields `paymentStatus: 'NOT_FOUND'` WITHOUT counting it toward `maxConsecutiveErrors` — so poll loops don't abort on propagation delay. If the ID never appears, polling ends via the max-duration abort.
- Closed-but-unpaid transactions keep reporting `PENDING` (not CANCELLED).
- **check vs detail (measured 2026-08-25):** check-transaction sees a fresh transaction in <1s; `getTransactionDetail` takes ~5s and is capped at 10/min — use check for status polling, detail only for reconciliation (`apv`, `bank_ref`, operation history).
- **Strict-cap shape:** exceeding an endpoint's documented cap returns HTTP 403 with NUMERIC body code 429 ("Rate limit exceeded...") and no rate-limit headers. The SDK maps this to typed `PayWayRateLimitError` (retryable) and paces retries from its own observed window. Latencies: both endpoints answer in ~130-750ms.
- Status codes: `0` APPROVED · `2` PENDING · `3` DECLINED · `4` REFUNDED · `7` CANCELLED (`PAYMENT_STATUS_CODES`). Poller-only status: `NOT_FOUND` (code 6 during grace period).
- Sandbox-verified live runs (2026-08-25): QR $31.11 USD → APPROVED on poll #8 (~37s); checkout-link $12.12 USD → 1× NOT_FOUND, then PENDING ×4 → APPROVED (~32s).

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

For end-to-end live flows use the CLI itself (the repo's `scripts/online-qr-poll.ts` / `scripts/checkout-link-poll.ts` are development probes, not shipped in the npm package):

```sh
payway-sdk generate-qr -a 5 -c USD --callback-url <url> -y   # online QR + auto-poll
payway-sdk generate-checkout -a 5 -c USD --return-url <url> # checkout link + auto-poll
```

## Related Skills
- [Hash and Webhooks](../aba-payway-hash/SKILL.md)
