---
name: aba-payway-transaction-by-merchant-ref
description: Retrieve ABA PayWay transactions by merchant reference through the SDK or CLI.
version: 1.2.0
---

# Get transactions by merchant reference

Use this workflow when the user supplies a `merchant_ref` and asks to find the corresponding ABA PayWay transactions. Do not substitute the date-filtered transaction-list API.

## Quick Start

```ts
const result = await payway.khqr.getTransactionsByMerchantRef('INV-12345678');
console.log(result.data);
```

## CLI

```sh
payway-sdk get-transactions-by-ref --merchant-ref INV-12345678
```

The command reads `PAYWAY_MERCHANT_ID` and `PAYWAY_API_KEY`, signs the request, and prints the PayWay JSON response.

## Error Handling

- Report a missing or empty merchant reference before making a request.
- Report missing `PAYWAY_MERCHANT_ID` or `PAYWAY_API_KEY` with the CLI credential guidance.
- Preserve and report PayWay API errors; do not treat a non-success status as an empty transaction list.

## Constraints

- The merchant reference must be non-empty.
- PayWay returns at most 50 matching historical transactions.
- Limit requests to 10 per minute.

## Tools (scripts/)

- **`reconcile.cjs`** — cron-ready reconciliation fallback job (the missed-callback safety net for portal-generated static QRs — see [Customer Module QR](../aba-payway-customer-qr/SKILL.md)): signs and calls `get-transactions-by-mc-ref`, dedupes by `transaction_id`, tracks a watermark file so each run prints only NEW transactions, optional CSV append and watch mode.
  ```sh
  node scripts/reconcile.cjs --merchant-ref "dt-one-8989" --env sandbox          # one-shot
  node scripts/reconcile.cjs --merchant-ref "dt-one-8989" --watch --interval 300 --csv payments.csv
  ```
  Rate limit (10/min) and pagination constraints are enforced. Exit codes: **0** success (even with no new rows) · **1** API/network failure (clean message, no stack trace) · **2** usage error / missing credentials. Credentials come from `--merchant-id/--api-key`, `PAYWAY_MERCHANT_ID`/`PAYWAY_API_KEY`, or a `.env` in the cwd (loaded automatically; exported env wins).

