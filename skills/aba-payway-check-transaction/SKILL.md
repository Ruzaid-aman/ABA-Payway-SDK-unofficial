---
name: aba-payway-check-transaction
description: Check the current status of an ABA PayWay transaction.
version: 1.2.0
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

- **`online-qr-poll.ts`** — end-to-end: generate ONE online QR (default $31.11 USD, 600s lifetime), save/open PNG, then poll every 5s for up to 10 minutes via `pollTransactionStatus`.
  ```sh
  npx tsx scripts/online-qr-poll.ts [amount] [currency]
  ```

- **`checkout-link-poll.ts`** — end-to-end: create a transaction (`checkout.purchase` with `paymentGate: 0`), auto-open the hosted `checkout_qr_url`, then poll every 5s for up to 10 minutes.
  ```sh
  npx tsx scripts/checkout-link-poll.ts [amount] [currency]
  ```

## Related Skills
- [Hash and Webhooks](../aba-payway-hash/SKILL.md)
