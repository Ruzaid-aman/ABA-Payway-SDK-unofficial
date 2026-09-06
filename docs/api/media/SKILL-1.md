---
name: aba-payway-first-payment
description: Choose the right first-payment route (QR, checkout, subscription, or payment link) for an ABA PayWay integration and handle the result safely.
version: 1.3.0
---

# ABA PayWay First Payment

## Quick Start

If the request is about a first payment flow, an online QR, checking a QR
payment, or fetching transaction detail after a payment, load this skill first.
It is the route-selection and command-sequencing entrypoint.

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

## CLI Readiness First

Before running first-payment commands in the CLI:

- Run `payway-sdk doctor`.
- For **online QR**, require `PAYWAY_MERCHANT_ID`, `PAYWAY_API_KEY`, and a public HTTPS `PAYWAY_CALLBACK_URL`.
- If the callback is missing locally, run `payway-sdk setup-webhook --tunnel`.

Exact manual CLI sequence for the QR path:

```sh
payway-sdk generate-qr -a 3.00 -c USD
payway-sdk check-transaction -t <id>
payway-sdk transaction-detail -t <id>
```

When the manual CLI generates an **online QR**, it should save the QR PNG by
default to `payway-output/<transaction-id>.png` and show the QR in the terminal
when possible. Use `--save-image <path>` to override the file location, or
`--no-save-image` to opt out for a one-off run.

## Route decision matrix

Pick exactly one route for a first payment. Each route has different readiness
requirements and a different result-handling contract.

| Route | Best for | Requires | Produces | Confirmation |
|---|---|---|---|---|
| **Checkout** (`createTransaction` / `create_checkout_purchase`) | Card / ABA Pay on a website | `merchantId`, `apiKey`, `amount`, `currency`, `transactionId` | Signed payload / checkout URL to redirect the customer | Webhook callback (trusted source of truth) |
| **Subscription** (`checkout.purchase` + `ctid`/`tokenFlag`/`frequency`) | Recurring billing on a card/ABA account | Checkout requirements + `ctid` (customer token id) + `tokenFlag: 'CITR_FIX'` + `frequency` (1W\|1M\|2M) | First charge + registered subscription token | Webhook callback |
| **Online QR** (`generate_online_qr`) | In-person / app scan | `callbackUrl` (webhook) + network connectivity to PayWay | `qrString` / `qrImage` | Webhook callback **or** poll (sandbox verification only) |
| **Offline KHQR** (`generate_offline_khqr`) | Static/dynamic local QR, no API call | Merchant data configured (`khqr` config) | Local QR string only | **Never** confirms payment — you must reconcile via the offline KHQR notification route |
| **Payment Link** (`create_payment_link`) | Shareable link via WhatsApp/email | `publicKeyPem` (RSA), `title`, `amount`, `merchantRefNo`, `returnUrl` | Shareable URL | Webhook callback |

> **Subscription route (v1.3.6+):** `payway.checkout.purchase({ ..., ctid: 'customer123', tokenFlag: 'CITR_FIX', frequency: '1M' })` — CLI: `payway-sdk generate-checkout -a 9.99 --ctid customer123 --token-flag CITR_FIX --frequency 1M --return-url <url>`. Only `CITR_FIX` is supported on the purchase path; other linking flags go through the CoF link endpoints. See [Subscription](../aba-payway-subscription/SKILL.md).

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

- Checkout: `amount`, `currency`, `transactionId`, optional `returnUrl`/`cancelUrl` — plus the full B6 optional set: `firstname`/`lastname`/`email`/`phone`, `items`, `shipping`, `lifetime` (**minutes**, min 3), `customFields`, `returnParams`, `skipSuccessPage`, `viewType`, `continueSuccessUrl`, and (v1.5.0 CLI) `payout` `[{acc, amt}]`, `additionalParams`, `googlePayToken`, `returnDeeplink`. CLI: `payway-sdk generate-checkout --help` for the full flag list.
- Subscription (Checkout + trio): `ctid`, `tokenFlag: 'CITR_FIX'`, `frequency` (`1W`|`1M`|`2M`).
- Online QR: `amount`, `currency`, `callbackUrl`, `transactionId` (generated if absent), optional `paymentOption`/`template` — plus the 9 live-documented optional params (v1.3.6+): `firstName`, `lastName`, `email`, `phone`, `items`, `returnDeeplink`, `customFields`, `returnParams`, `payout` (`[{account, amount}]` — the QR domain's key shape, unlike the purchase path's `{acc, amt}`). CLI flags: `--first-name --last-name --email --phone --items --return-deeplink --custom-fields --return-params --payout`.
- Offline KHQR: `amount?`, `currency`, `merchantRef` (required — it is your reference, not a PayWay `tran_id`).
- Payment Link: `title`, `amount`, `currency`, `merchantRefNo`, `returnUrl`, optional `description`/`paymentLimit`/`expiredDate` + `payout` `[{acc, amt}]` (total must equal the amount; v1.5.0) and `image` (JPG/JPEG/PNG ≤3MB).

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
  substitute for the webhook. Plain CLI `generate-qr` and `generate-checkout`
  **poll by default** (`--no-polling` to disable); only the `agent` REPL
  *offers* polling and never auto-polls.

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

## Tools (scripts/)

- **`checkout-payload.cjs`** — fastest first payment: builds the locally-signed checkout payload (exact SDK 27-field signing order/formatting) and can emit a ready-to-open HTML auto-post form. No network call.
  ```sh
  # Credentials required: pass --merchant-id/--api-key or export PAYWAY_MERCHANT_ID / PAYWAY_API_KEY first
  # (the script does NOT load .env). Missing creds → exit 2.
  node scripts/checkout-payload.cjs --tran-id order-123 --amount 10 --currency USD \
      --return-url https://example.com/success --html checkout.html
  # Subscription registration (signs ctid + token_flag + frequency correctly):
  node scripts/checkout-payload.cjs --tran-id order-124 --amount 9.99 --currency USD \
      --ctid customer123 --token-flag CITR_FIX --frequency 1M
  ```
  `--lifetime` is **minutes** (min 3). Open `checkout.html` in a browser to pay in sandbox. The webhook callback remains the only proof of payment.
