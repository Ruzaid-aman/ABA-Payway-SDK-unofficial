---
name: aba-payway-transaction-by-merchant-ref
description: Retrieve ABA PayWay transactions by merchant reference through the SDK or CLI.
version: 1.1.0
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
