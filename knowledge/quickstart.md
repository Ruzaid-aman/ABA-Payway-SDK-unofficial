# ABA PayWay SDK quickstart

Use Node.js 22.12 or later. Complete these steps on a server or development machine; never place PayWay credentials in browser or mobile code.

This community SDK integrates ABA PayWay into JavaScript/TypeScript applications. Use the CLI below to learn the flow, then the server SDK to implement it. Agent skills are optional. Start with the simulated demo, obtain ABA credentials, prepare a callback, create and complete a sandbox payment, then verify its outcome.

## Payment lifecycle

**Create -> show the artifact -> verify -> fulfill once.**

`created` means an artifact is ready; `pending` means payment is unconfirmed; `approved` means verified approval; `failed` means a confirmed rejection or cancellation; `unknown` means look up the existing transaction before retrying creation. Expiry and closure are local policy: gateway reads may remain PENDING. PRE-AUTH and REFUNDED need their advanced domain flows.

## 1. Install

Until the package is published, build and install a tarball from a trusted checkout:

```bash
npm ci
npm run build
npm pack
cd ../your-application
npm install /absolute/path/to/the/generated/aba-payway-ts-<version>.tgz
```

Run the first three commands in the SDK checkout. Replace the application directory and tarball path with your actual paths (quote paths containing spaces). To explore directly in the checkout, skip `cd` and `npm install` and continue below.

After publication, use `npm install aba-payway-ts`. Run the project-local CLI as `npm exec -- payway-sdk`. Avoid bare `npx payway-sdk`, which currently resolves to an unrelated package.

## 2. Explore without credentials

```bash
npm exec -- payway-sdk demo
```

The browser demo binds to `127.0.0.1`, creates only simulated payments, and never reads PayWay credentials. Its approval button teaches the boundary between payment creation and verified fulfillment. Use `npm exec -- payway-sdk demo --check` in CI.

## 3. Get and configure sandbox credentials

Register through the official [ABA sandbox signup](https://sandbox.payway.com.kh/register-sandbox/). ABA's [onboarding guide](https://developer.payway.com.kh/) says credentials are sent to your registered email. Retrieve your sandbox Merchant ID and API Key there; the SDK does not generate them. If the email is missing, check spam/junk and follow up through your ABA integration contact or the official portal. Delivery times are not guaranteed here.

Online QR and basic checkout need the Merchant ID and API Key. Payment links and other encrypted operations also require an ABA-issued RSA public key. See the packaged guidance via the CLI: `payway-sdk docs setup` (or the local `knowledge/setup.md`). Official links checked 2026-09-08.

Before choosing online QR, arrange ABA PAY sandbox testing access with your ABA integration contact. For hosted card checkout, ABA supplies [test cards and 3DS instructions](https://developer.payway.com.kh/resources-3305682f0). The simulated demo cannot pay a gateway QR.

Create a starter and `.env.example` without replacing existing files:

```bash
npm exec -- payway-sdk init --mode sandbox --template first-payment
```

Set the values in your server environment.

POSIX shells:

```bash
export PAYWAY_ENV=sandbox
export PAYWAY_MERCHANT_ID=your-merchant-id
export PAYWAY_API_KEY=your-api-key
export PAYWAY_CALLBACK_URL=https://your-public-host.example/payway/callback
```

PowerShell:

```powershell
$env:PAYWAY_ENV = 'sandbox'
$env:PAYWAY_MERCHANT_ID = 'your-merchant-id'
$env:PAYWAY_API_KEY = 'your-api-key'
$env:PAYWAY_CALLBACK_URL = 'https://your-public-host.example/payway/callback'
```

Profiles are also supported. The CLI resolves `--profile`, then `PAYWAY_PROFILE`, then the saved default, then project and ambient environment values. It reports the selected source and endpoint without printing secrets.

## 4. Prepare a callback and check your route

A callback is a server-to-server payment notification. For local development, open another terminal in the same project and run:

```bash
npm exec -- payway-sdk setup-webhook --tunnel --non-interactive
```

The listener binds locally, creates a temporary tunnel, and verifies the public callback before saving `PAYWAY_CALLBACK_URL`. For Customer Module QR payments, give ABA the dedicated route ending in `/aba-payway-khqr-webhook`, not the online-checkout route. Inspect or stop an SDK-owned development receiver with `npm exec -- payway-sdk webhook status` and `npm exec -- payway-sdk webhook stop`.

Keep that terminal running. Follow its tunnel setup instructions and copy the complete public HTTPS URL, including `/aba-payway-webhook`. In your payment terminal, replace `PAYWAY_CALLBACK_URL` from step 3 with that URL. A localhost URL is not reachable by ABA. See [webhook setup and tunnel prerequisites](payway-sdk docs webhook-setup) if the tunnel cannot start. This listener captures deliveries for development; it is not an order-fulfillment service.

To check a receiver before any real payment, run it against the captured deliveries: add `--forward-to http://localhost:<your-app-port>/webhooks/aba` to the command above, then in a third terminal run `npm exec -- payway-sdk webhook trigger --event payment.approved`. The receiver gets a correctly-signed fixture callback in seconds — no ABA Simulator and no sandbox payment. Fixture callbacks are synthetic; never fulfill on them. Details: [Local Webhook Workbench](payway-sdk docs search local-webhook-workbench).

Online QR is the default below. For a hosted payment page, use `doctor --route hosted-checkout` and the signed form command in step 6. For a shareable link, follow the [payment-link guide](payway-sdk docs payment-link); it additionally needs an RSA key.

Check the intended route:

```bash
npm exec -- payway-sdk doctor --route online-qr
```

Use `--route hosted-checkout` when your first flow is a hosted checkout. Add `--live` only when you intend to make a real sandbox diagnostic request.

## 5. Create one online QR

POSIX shells:

```bash
PAYWAY_TEST_TRANSACTION_ID="$(node -e 'process.stdout.write(require("node:crypto").randomUUID().replaceAll("-", "").slice(0, 20))')"
echo "$PAYWAY_TEST_TRANSACTION_ID"
npm exec -- payway-sdk generate-qr -a 3.00 -c USD -t "$PAYWAY_TEST_TRANSACTION_ID" \
  --callback-url "$PAYWAY_CALLBACK_URL" \
  -y --no-polling --no-open-image --output json
```

PowerShell:

```powershell
$paywayTestTransactionId = [guid]::NewGuid().ToString('N').Substring(0, 20)
$paywayTestTransactionId
npm exec -- payway-sdk generate-qr -a 3.00 -c USD -t "$paywayTestTransactionId" `
  --callback-url "$env:PAYWAY_CALLBACK_URL" `
  -y --no-polling --no-open-image --output json
```

The JSON envelope includes the transaction ID, creation outcome, saved QR path,
safe next action, `correlationId`, and any gateway `traceId`. If the request
times out, the outcome is unknown: recover and query the original ID before creating another payment.

These commands print and retain a unique ID before submitting the payment. Save it with your test notes; in an application, persist the attempt ID before submission. Do not rerun the creation block to check progress. A new attempt needs a fresh ID, but an ambiguous attempt must first be reconciled using its original ID.

Open the saved QR image and pay promptly using the sandbox testing method arranged with ABA. Do not assume your everyday banking app can pay a sandbox QR. If you lack test access, return to the simulated demo or use hosted checkout with ABA's test cards.

### Verify the payment

Replace `YOUR_TRANSACTION_ID` below with the ID from creation:

```bash
npm exec -- payway-sdk check-transaction -t YOUR_TRANSACTION_ID
npm exec -- payway-sdk transaction-detail -t YOUR_TRANSACTION_ID --wait 10
```

Success means a server-side lookup confirms approval and transaction detail matches your saved ID, USD currency, and 3.00 amount. A saved image, exit code 0, or callback arrival alone does not prove payment. If still pending, query the same ID again; if a callback is missing, use lookup to reconcile. Fulfill an application order only once after matching those details.

### If setup or payment fails

| Symptom | Next action |
|---|---|
| Missing or rejected credentials | Recheck the sandbox email and selected CLI profile/environment; see the setup guide. |
| Callback never arrives | Keep the tunnel running, check the complete URL, and query the transaction. See webhook setup. |
| Sandbox certificate-chain error | See [TLS troubleshooting](payway-sdk docs errors-and-debugging); keep any sandbox workaround scoped to that command, never global or production. |
| Timeout or unknown result | Recover the original transaction ID and query it before replacing the attempt. |
| QR cannot be paid | Check ABA test access and scan promptly; a pending record does not establish QR payability. |

## 6. Integrate the server

Follow the [runnable first-payment walkthrough](payway-sdk docs first-payment-walkthrough) to see an artifact, verification, duplicate delivery, and recovery in the reference app.

Use the existing `sdk.initiate` facade for a purchase QR or deeplink. All of this code runs on your server:

```ts
import { sdk, PayWay, paymentArtifact, paymentLifecycle } from 'aba-payway-ts';

const config = {
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  environment: 'sandbox' as const,
};
const order = { transactionId: 'order-003', amount: 3, currency: 'USD' as const };
// Persist this order and reserve its payment attempt before initiating.
const session = await sdk.initiate({
  ...order,
  paymentOption: 'abapay_khqr',
  returnUrl: process.env.PAYWAY_CALLBACK_URL!,
}, config);
const artifact = paymentArtifact(session); // Return only this to the authorized customer.

// Later, in a server-side status or callback handler:
const payway = new PayWay(config);
const result = await payway.checkout.checkTransaction(order.transactionId);
const state = paymentLifecycle(result.data?.payment_status);
if (state === 'approved') {
  // Match verified transaction detail to the stored ID, amount, and currency.
  // Atomically mark paid and enqueue fulfillment once in your database.
}
```

This is the SDK call sequence, not a database implementation. The [reference app](payway-sdk docs first-payment-walkthrough) supplies a complete verification and fulfillment example. Keep the full session and raw gateway response server-side. `paymentArtifact` selects render fields; it does not verify payment or sanitize arbitrary HTML.

The facade defaults to no automatic create retry. Reserve each attempt in durable storage; PayWay transaction IDs alone do not provide idempotency. After an ambiguous response, query the saved ID before creating a replacement. Signed online callbacks use `payway.verifyCallback` with the route's signing contract; payment-link pushbacks are unsigned and require lookup. Never fulfill from a browser redirect.



Alternatively, run the generated starter:

```bash
node payway-first-payment.mjs
```

In your application, create payments on the server, return only the checkout artifact your client needs, and keep the merchant transaction ID with the order. Verify callbacks or query PayWay before fulfillment. Check the expected transaction ID, amount, and currency, then apply fulfillment exactly once.

For hosted checkout, generate a signed form locally and let the browser submit directly to PayWay:

```bash
npm exec -- payway-sdk checkout-form -a 5.00 -t order-002 --payment-gate 0 --auto-submit --out checkout.html
```

Exit codes are `0` for completed command work, `1` for input/configuration, `2` for a PayWay API rejection, and `3` for network, rate-limit, or timeout failures. Saved CLI profiles contain plaintext credentials; use a server secret manager and explicit SDK configuration for deployment. See the one-page guide for lifecycle rules, [Transaction Journal](payway-sdk docs transaction-journal) for audit/reconciliation commands, and the [documentation index](payway-sdk docs docs-index) for deeper guides.
