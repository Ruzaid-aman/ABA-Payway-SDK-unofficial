# ABA PayWay SDK quickstart

This guide targets Node.js 20 or later and `aba-payway-ts` 1.5.0.

## Install the package under test

Until `aba-payway-ts` is published, build a local tarball from a trusted checkout:

```bash
npm ci
npm run build
npm pack
```

Then install the generated `aba-payway-ts-1.5.0.tgz` in your application. After the package is published, install it with `npm install aba-payway-ts` and run its CLI unambiguously with `npm exec --package=aba-payway-ts -- payway-sdk`.

## Preview the SDK without credentials

```js
import { server } from 'aba-payway-ts';

const session = server.test('qr_string', {
  transactionId: 'demo-order-001',
  amount: 5,
});

console.log(session.responseType, session.responsePayload);
```

This is simulated local output. It does not create a PayWay transaction or prove payment.

## Configure sandbox credentials

Keep credentials on the server. Never ship them in browser or mobile code.

```dotenv
PAYWAY_ENV=sandbox
PAYWAY_MERCHANT_ID=your-merchant-id
PAYWAY_API_KEY=your-api-key
PAYWAY_CALLBACK_URL=https://your-public-host.example/payway/callback
```

Validate the resolved environment and a real sandbox round trip:

```bash
payway-sdk doctor --live
```

## Create and verify a payment

Create an online QR and save its image:

```bash
payway-sdk generate-qr -a 5.00 -c USD -t order-001 --callback-url https://your-public-host.example/payway/callback --no-polling
payway-sdk check-transaction -t order-001
```

For automation, use the versioned result envelope:

```bash
payway-sdk generate-checkout -a 5.00 -c USD -t order-002 --output json --no-polling
payway-sdk generate-checkout -a 5.00 -c USD -t order-003 --output ndjson --save-image ./order-003.png
```

Exit codes are `0` for completed command work, `1` for input/configuration, `2` for a PayWay API rejection, and `3` for network, rate-limit, or wait timeout. A create transport failure has an unknown outcome: check the same transaction ID before creating another payment.

## Hosted browser checkout

Generate a signed browser form locally and submit it in the browser so the hosted page keeps its gateway origin:

```bash
payway-sdk checkout-form -a 5.00 -t order-004 --payment-gate 0 --auto-submit --out checkout.html
```

Do not treat a local timer, a rendered QR, or a successful create response as proof of payment. Fulfill an order only after a verified callback or transaction status check confirms the expected amount and currency.
