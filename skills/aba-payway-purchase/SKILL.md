---
name: aba-payway-purchase
description: Create a signed ABA PayWay checkout purchase with aba-payway-ts.
version: 1.3.0
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

Caution: POSTing the same payload as a browser form with `payment_gate=0` answers with an HTML page instead of JSON — that's why `generate-checkout` CLI deliberately omits a `--payment-gate` flag (the SDK-only `purchase({ paymentGate: 0 })` JSON path is the supported route; the omission is documented in the command's help text).

## CLI flag set (generate-checkout)
`generate-checkout` forwards the full purchase param surface:
`--ctid --token-flag --frequency --type --firstname --lastname --email --phone --items --shipping --lifetime <minutes> --custom-fields --return-params --skip-success-page --view-type --continue-success-url --payout --additional-params --google-pay-token --return-deeplink`.

- `--payout` is JSON `[{acc, amt}]` or string (purchase-path keys — NOT the standalone payout domain's `{account, amount}`).
- `--additional-params` is a JSON object or string; `--return-deeplink` is JSON `{ios_scheme, android_scheme}` or string (both base64-encoded before hashing).
- `--google-pay-token` is required by the gateway when `--payment-option google_pay` (the SDK throws without it).
- `--payment-gate` is deliberately absent (see Caution above); `paymentGate` remains SDK-only.

### Card-payment response matrix (`paymentOption: 'cards'`, sandbox-verified 2026-08-25)
| Request | Response |
|---|---|
| `cards` (no gate, or gate 1) via `purchase()` | JSON PurchaseQrResponse — but with **KHQR data** (qrString/deeplink), no checkout URL |
| `cards` + `paymentGate: 0` via `purchase()` | the hosted card-checkout page as **HTML** — transaction IS created, but you cannot render that response from a static page (relative `/_nuxt/*` assets → CORS/file-origin errors) |

**Correct card integration (official):** build the signed payload LOCALLY with `checkout.createTransaction({ paymentOption: 'cards', ... })`, embed all fields as hidden inputs in a `<form method="POST" target="aba_webservice" action="…/v1/payments/purchase">`, load `<script src="https://checkout.payway.com.kh/plugins/checkout2-0.js" defer></script>`, and call `AbaPayway.checkout()` on submit — PayWay's HTML renders in a modal (iframe POST, no CORS). Docs: https://developer.payway.com.kh/ecommerce-checkout-3158159f0

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

- **`checkout-cards-close.ts`** — card-payment lifecycle using the OFFICIAL web integration: builds the payload locally (`createTransaction`), generates a checkout2-0.js modal page, waits for server-side creation, then delegates to the closer/verifier.
  ```sh
  npx tsx scripts/checkout-cards-close.ts [amount] [currency]
  ```

- **`close-transaction-verify.ts`** — reusable close + verify tool (CLI or import): closes a transaction (tolerant of already-closed/unknown IDs — sandbox re-closing returns code 00 again) and reads status twice so you see the settled view.
  ```sh
  npx tsx scripts/close-transaction-verify.ts <txId>              # close + verify
  npx tsx scripts/close-transaction-verify.ts <txId> --status-only
  ```
  Exports `closeOrReport()`, `statusOf()`, `closeAndVerify()` for other scripts.

## Related Skills
- [Configuration](../aba-payway-sdk-configuration/SKILL.md)
- [Check Transaction](../aba-payway-check-transaction/SKILL.md)
