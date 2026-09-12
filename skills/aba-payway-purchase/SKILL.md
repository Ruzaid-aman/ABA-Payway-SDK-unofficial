---
name: aba-payway-purchase
description: Create a signed ABA PayWay checkout purchase with aba-payway-ts.
metadata:
  version: 1.4.0
---

# ABA PayWay Purchase

## Quick Start

For onboarding, start with [first payment](../aba-payway-first-payment/SKILL.md).
Use the shared lifecycle: `created`, `pending`, `approved`, `failed`, `unknown`.
Creation is not approval. Verify order ID, amount, and currency before fulfilling once.
A timeout means unknown; query the existing attempt before replacing it.
Expiry and closure remain local policy, even when the gateway reads PENDING.
See [webhook production](../aba-payway-webhook-production/SKILL.md) for callback trust and recovery.
Run the installed CLI as `npm exec -- payway-sdk`.

```ts
import { PayWay } from 'aba-payway-ts';
const payway = new PayWay();
const payload = payway.checkout.createTransaction({ transactionId: 'order-123', amount: 10, currency: 'USD' });
```

Post the returned signed payload from your server-rendered checkout form. Keep API credentials server-side.

> **Local vs. network:** `createTransaction()` (and `createCheckoutPayload()`) only **builds a LOCAL signed payload** — it performs no network request. By contrast, `purchase()` (and the agentic `create_checkout_purchase` tool) performs the actual **NETWORK request** to PayWay. Use the local builder when you want to render your own checkout form; use `purchase()` when you want the SDK to submit the payment.

## Two hosted routes — pick the shape you need

There is **no single `checkout_qr_url` default**. The 200 response body depends on the request shape (sandbox-verified 2026-08-25, §10b/W2-1):

| Route | Request | Response |
|---|---|---|
| **A: hosted URL (JSON)** | `paymentOption: 'abapay_khqr_deeplink'` + `viewType: 'hosted_view'` + `paymentGate: 0` | `PurchaseQrResponse` JSON that **includes `checkout_qr_url`** (plus `qr_string`/`abapay_deeplink`) |
| **B: hosted HTML page** | any option + `paymentGate: 0` **without** the deeplink+hosted_view combo (e.g. `cards`) | full hosted "PayWay - Checkout" HTML page as the BODY — no URL field; use `purchaseHosted()` for the typed result |

Route A — hosted URL, typed, no casts (SDK ≥ 1.5.0):

```ts
const res = await payway.checkout.purchase({
  transactionId: 'order-123', amount: 12.12, currency: 'USD',
  paymentOption: 'abapay_khqr_deeplink', viewType: 'hosted_view', paymentGate: 0,
  lifetime: 600, // MINUTES (min 3, max 43200) — 600 = a 10-hour window, NOT 10 minutes!
});
if ('qr_string' in res) {           // narrows to PurchaseQrResponse (Route A)
  const url = res.checkout_qr_url;  // string | undefined — hosted page, open in browser/app
}
```

Route B — hosted HTML, typed:

```ts
const page = await payway.checkout.purchaseHosted({
  transactionId: 'order-123', amount: 15, currency: 'USD', paymentOption: 'cards',
  returnUrl: 'https://example.com/payment-result',
}); // PurchaseHostedHtmlResult { hosted_checkout: true, content_type, html }
res.type(page.content_type).send(page.html); // Express — but see the CORS warning below
```

> ⚠️ **`lifetime` on the purchase/checkout path is MINUTES** (minimum 3 — the SDK
> throws below 3; the gateway would answer error 69). Only the **QR domain's**
> `lifetime` is seconds. A copied `lifetime: 600` "seconds" habit silently buys a
> 10-hour checkout window. On the CLI, prefer the explicit-units flag
> `--lifetime-minutes` (`--lifetime` remains a deprecated minutes alias).

> ⚠️ **Serving Route B's captured HTML from your own origin is NOT supported**:
> the page references relative `/_nuxt/*` assets and breaks with CORS/file-origin
> errors outside the gateway origin. For a browser-hosted flow, POST the signed
> form directly to the gateway (Route C below) instead of re-serving gateway HTML.

## CLI flag set (generate-checkout)
`generate-checkout` forwards the full purchase param surface:
`--ctid --token-flag --frequency --type --firstname --lastname --email --phone --items --shipping --lifetime-minutes <minutes> --custom-fields --return-params --skip-success-page --view-type --continue-success-url --payout --additional-params --google-pay-token --return-deeplink --payment-gate <0|1> --payment-option`.

- `--payout` is JSON `[{acc, amt}]` or string (purchase-path keys — NOT the standalone payout domain's `{account, amount}`).
- `--additional-params` is a object or string; `--return-deeplink` is JSON `{ios_scheme, android_scheme}` or string (both base64-encoded before hashing).
- `--google-pay-token` is required by the gateway when `--payment-option google_pay` (the SDK throws without it).
- `--payment-gate 0` returns the hosted HTML page in the response (Route B); the CLI prints/records it as an artifact rather than a URL. For browser navigation use `checkout-form --payment-gate 0`, which renders the local signed form that POSTs directly to the gateway.

### Card-payment response matrix (`paymentOption: 'cards'`, sandbox-verified 2026-08-25)
| Request | Response |
|---|---|
| `cards` (no gate, or gate 1) via `purchase()` | JSON PurchaseQrResponse — but with **KHQR data** (qr_string/abapay_deeplink), no checkout URL |
| `cards` + `paymentGate: 0` via `purchase()`/`purchaseHosted()` | the hosted card-checkout page as **HTML** (`PurchaseHostedHtmlResult`) — transaction IS created, but you cannot re-serve that HTML from your own origin (relative `/_nuxt/*` assets → CORS/file-origin errors) |

**Correct card integration (official):** build the signed payload LOCALLY with `checkout.createTransaction({ paymentOption: 'cards', ... })`, embed all fields as hidden inputs in a `<form method="POST" target="aba_webservice" action="…/v1/payments/purchase">`, load `<script src="https://checkout.payway.com.kh/plugins/checkout2-0.js" defer></script>`, and call `AbaPayway.checkout()` on submit — PayWay's HTML renders in a modal (iframe POST, no CORS). The SDK's `getCheckoutFormHtml()` / CLI `checkout-form` build exactly this form. Docs: https://developer.payway.com.kh/ecommerce-checkout-3158159f0

## Error Handling
```ts
import { PayWayConfigError } from 'aba-payway-ts';
try { payway.checkout.createTransaction({ transactionId: 'order-123', amount: 10 }); }
catch (error) { if (error instanceof PayWayConfigError) console.error(error.message); }
```

## Tools

The purchase flow needs no bundled scripts — the CLI covers the whole lifecycle:

```sh
# Create + auto-poll a checkout (lifetime in MINUTES):
payway-sdk generate-checkout -a 12.12 -c USD --return-url https://example.com/r --lifetime-minutes 5 -y
# Hosted checkout URL (checkout_qr_url) — Route A (deeplink + hosted_view + gate 0):
#   payway.checkout.purchase({ ..., paymentOption: 'abapay_khqr_deeplink', viewType: 'hosted_view', paymentGate: 0 })
# Hosted HTML page — Route B, or local browser form:
#   payway.checkout.purchaseHosted({ ... })  |  payway-sdk checkout-form -a 10 -o form.html
# Card integration — local form (official pattern, no API call):
payway-sdk checkout-form -a 10 -o form.html
# Close an unpaid transaction, then verify:
payway-sdk close-transaction -t <txId> -y && payway-sdk check-transaction -t <txId>
```

> Repo-clone note: `scripts/checkout-link-poll.ts`, `scripts/checkout-cards-close.ts`,
> and `scripts/close-transaction-verify.ts` exist in the SDK repository's `scripts/`
> directory (development probes, not shipped in the npm package) — the CLI commands
> above are the supported equivalents.

## Related Skills
- [Configuration](../aba-payway-sdk-configuration/SKILL.md)
- [Check Transaction](../aba-payway-check-transaction/SKILL.md)
