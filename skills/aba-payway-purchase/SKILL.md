---
name: aba-payway-purchase
description: Create a signed ABA PayWay checkout purchase with aba-payway-ts.
version: 1.2.0
---

# ABA PayWay Purchase

## Quick Start
```ts
import { PayWay } from 'aba-payway-ts';
const payway = new PayWay();
const payload = payway.checkout.createTransaction({ transactionId: 'order-123', amount: 10, currency: 'USD' });
```

Post the returned signed payload from your server-rendered checkout form. Keep API credentials server-side.

> **Local vs. network:** `createTransaction()` (and `createCheckoutPayload()`) only **builds a LOCAL signed payload** — it performs no network request. By contrast, `purchase()` (and the agentic `create_checkout_purchase` tool) performs the actual **NETWORK request** to PayWay. Use the local builder when you want to render your own checkout form; use `purchase()` when you want the SDK to submit the payment.

## Getting a hosted checkout link (checkout_qr_url)
Sandbox-verified (2026-08-25): calling `purchase()` (JSON) with `paymentOption: 'abapay_khqr_deeplink'` returns a JSON `PurchaseQrResponse`, but `checkout_qr_url` is only present when you also send `viewType: 'hosted_view'` and `paymentGate: 0`. Without gate 0 you get only `qrString` / `qrImage` / `abapay_deeplink`.

```ts
const res = await payway.checkout.purchase({
  transactionId: 'order-123', amount: 12.12, currency: 'USD',
  paymentOption: 'abapay_khqr_deeplink', viewType: 'hosted_view', paymentGate: 0,
  lifetime: 600, // seconds
});
const url = (res as any).checkout_qr_url; // hosted page — open in browser/app
```

Caution: POSTing the same payload as a browser form with `payment_gate=0` answers with an HTML page instead of JSON — that's why `generate-checkout` CLI omits it.

## Error Handling
```ts
import { PayWayConfigError } from 'aba-payway-ts';
try { payway.checkout.createTransaction({ transactionId: 'order-123', amount: 10 }); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); }
```

## Tools (scripts/)

- **`checkout-link-poll.ts`** — one-command live flow: creates ONE online transaction via `checkout.purchase`, extracts + auto-opens the hosted checkout URL in the default browser, then polls status every 5s for 10 minutes.
  ```sh
  npx tsx scripts/checkout-link-poll.ts           # 12.12 USD, 600s lifetime, 10-min poll
  npx tsx scripts/checkout-link-poll.ts 5 KHR     # custom amount/currency
  ```
  Artifacts land in `test-logs/checkout-link/<txId>-*` (response JSON, checkout URL). Requires `PAYWAY_MERCHANT_ID` and `PAYWAY_API_KEY` in `.env`.

## Related Skills
- [Configuration](../aba-payway-sdk-configuration/SKILL.md)
- [Check Transaction](../aba-payway-check-transaction/SKILL.md)
