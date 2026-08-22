---
name: aba-payway-first-payment
description: Choose the right first-payment route (QR, checkout, or payment link) for an ABA PayWay integration and handle the result safely.
version: 1.1.0
---

# ABA PayWay First Payment

## Quick Start

For the simplest first payment on a website, build a signed checkout payload
locally and let your frontend POST it to PayWay's hosted checkout:

```ts
import { PayWay } from 'aba-payway-ts';

const payway = new PayWay({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
});

// createTransaction builds a LOCAL signed payload — no network call.
const payload = payway.checkout.createTransaction({
  transactionId: `order-${Date.now()}`,
  amount: 10,
  currency: 'USD',
  returnUrl: 'https://example.com/success',
});

// Render an HTML form posting `payload` fields to PayWay's checkout URL.
```

## Route decision matrix

Pick exactly one route for a first payment. Each route has different readiness
requirements and a different result-handling contract.

| Route | Best for | Requires | Produces | Confirmation |
|---|---|---|---|---|
| **Checkout** (`createTransaction` / `create_checkout_purchase`) | Card / ABA Pay on a website | `merchantId`, `apiKey`, `amount`, `currency`, `transactionId` | Signed payload / checkout URL to redirect the customer | Webhook callback (trusted source of truth) |
| **Online QR** (`generate_online_qr`) | In-person / app scan | `callbackUrl` (webhook) + network connectivity to PayWay | `qrString` / `qrImage` | Webhook callback **or** poll (sandbox verification only) |
| **Offline KHQR** (`generate_offline_khqr`) | Static/dynamic local QR, no API call | Merchant data configured (`khqr` config) | Local QR string only | **Never** confirms payment — you must reconcile via the offline KHQR notification route |
| **Payment Link** (`create_payment_link`) | Shareable link via WhatsApp/email | `publicKeyPem` (RSA), `title`, `amount`, `merchantRefNo`, `returnUrl` | Shareable URL | Webhook callback |

### Readiness requirements

- **Checkout** is ready whenever `merchantId` + `apiKey` resolve from the selected
  profile. No RSA key required.
- **Online QR** requires a reachable `callbackUrl` (a public HTTPS endpoint or an
  ngrok tunnel during local dev) and live connectivity to the PayWay API.
- **Offline KHQR** requires ABA-issued merchant data to be configured in
  `new PayWay({ khqr: ... })`, the `PAYWAY_KHQR_*` env vars, or a CLI profile.
  Generation is local only — it performs **no** PayWay API call and gives **no**
  payment status.
- **Payment Link** requires the RSA public key (`publicKeyPem`) because PayWay
  encrypts the merchant payload.

### Required inputs per route

- Checkout: `amount`, `currency`, `transactionId`, optional `returnUrl`/`cancelUrl`.
- Online QR: `amount`, `currency`, `callbackUrl`, `transactionId` (generated if absent), optional `paymentOption`/`template`.
- Offline KHQR: `amount?`, `currency`, `merchantRef` (required — it is your reference, not a PayWay `tran_id`).
- Payment Link: `title`, `amount`, `currency`, `merchantRefNo`, `returnUrl`, optional `description`/`paymentLimit`/`expiredDate`.

### Result handling

- Render or deliver the produced artifact (form, QR string, or link) to the
  customer. Do **not** treat the redirect or QR display as proof of payment.
- Always wait for the **webhook callback** and verify its HMAC signature
  (`payway.verifyCallback`) before marking an order paid.
- For sandbox smoke-testing you may `poll`/`check_transaction` by `transactionId`,
  but polling is a convenience only — the webhook remains authoritative.

### Polling vs. webhook (important distinction)

- **Webhook** is a server-to-server PayWay POST, cryptographically signed, and is
  the trusted final source of truth.
- **Polling** (`check_transaction` / `poll_transaction`) is a read-only lookup you
  initiate. It is useful in sandbox or for reconciliation, but it is not a
  substitute for the webhook. The agentic CLI *offers* polling after an online QR
  is created and never auto-polls.

## User-facing explanations

When explaining to a non-technical stakeholder:

- "Checkout" = a hosted payment page the customer is redirected to.
- "QR" = a scannable code (online QR reaches PayWay; offline KHQR is generated on
  your server and must be reconciled separately).
- "Payment link" = a URL you send the customer; they pay on PayWay's page.
- None of these confirm the payment by themselves — PayWay tells *your server*
  (via the webhook) when the money actually arrives.

## Error Handling

```ts
import { PayWayConfigError, PayWayBusinessError } from 'aba-payway-ts';

try {
  const payload = payway.checkout.createTransaction({
    transactionId: `order-${Date.now()}`,
    amount: 10,
    currency: 'USD',
  });
} catch (error) {
  if (error instanceof PayWayConfigError) {
    // Missing/invalid inputs (e.g. bad transactionId, missing amount). Fix config.
    console.error('Config error:', error.message);
  } else if (error instanceof PayWayBusinessError) {
    // PayWay rejected the signed request (wrong hash, invalid merchant, etc.).
    console.error('Business error:', error.paywayCode, error.message);
  }
}
```

A route that is not "ready" (e.g. online QR without a `callbackUrl`, or payment
link without an RSA key) should fail fast with a `PayWayConfigError` before any
network call. See also [aba-payway-agent](../aba-payway-agent/SKILL.md) for the
agentic, risk-gated path to choose and run these routes.

## Related Skills

- [Agentic CLI](../aba-payway-agent/SKILL.md)
- [Purchase](../aba-payway-purchase/SKILL.md)
- [Configuration](../aba-payway-sdk-configuration/SKILL.md)
- [Offline QR](../aba-payway-offline-qr/SKILL.md)
- [Check Transaction](../aba-payway-check-transaction/SKILL.md)
