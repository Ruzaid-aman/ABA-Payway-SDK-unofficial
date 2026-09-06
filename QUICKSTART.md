# ABA PayWay SDK quickstart

Use Node.js 20 or later. Complete these steps on a server or development machine; never place PayWay credentials in browser or mobile code.

## 1. Install

Until the package is published, build and install a tarball from a trusted checkout:

```bash
npm ci
npm run build
npm pack
cd ../your-application
npm install ../aba-payway-ts/aba-payway-ts-1.5.0.tgz
```

After publication, use `npm install aba-payway-ts`. Run the project-local CLI as `npm exec -- payway-sdk`. Avoid bare `npx payway-sdk`, which currently resolves to an unrelated package.

## 2. Explore without credentials

```bash
npm exec -- payway-sdk demo
```

The browser demo binds to `127.0.0.1`, creates only simulated payments, and never reads PayWay credentials. Its approval button teaches the boundary between payment creation and verified fulfillment. Use `npm exec -- payway-sdk demo --check` in CI.

## 3. Configure sandbox

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

## 4. Check the intended route

```bash
npm exec -- payway-sdk doctor --route online-qr
```

Use `--route hosted-checkout` when your first flow is a hosted checkout. Add `--live` only when you intend to make a real sandbox diagnostic request.

## 5. Create one online QR

POSIX shells:

```bash
npm exec -- payway-sdk generate-qr -a 3.00 -c USD -t order-001 \
  --callback-url https://your-public-host.example/payway/callback \
  -y --no-polling --output json
```

PowerShell:

```powershell
npm exec -- payway-sdk generate-qr -a 3.00 -c USD -t order-001 `
  --callback-url https://your-public-host.example/payway/callback `
  -y --no-polling --output json
```

The JSON envelope includes the transaction ID, creation outcome, saved QR path, and safe next action. If the request times out, the outcome is unknown: query `order-001` before creating another payment.

```bash
npm exec -- payway-sdk check-transaction -t order-001
npm exec -- payway-sdk transaction-detail -t order-001 --wait 10
```

## 6. Integrate the server

Run the generated starter:

```bash
node payway-first-payment.mjs
```

In your application, create payments on the server, return only the checkout artifact your client needs, and keep the merchant transaction ID with the order. Verify callbacks or query PayWay before fulfillment. Check the expected transaction ID, amount, and currency, then apply fulfillment exactly once.

For hosted checkout, generate a signed form locally and let the browser submit directly to PayWay:

```bash
npm exec -- payway-sdk checkout-form -a 5.00 -t order-002 --payment-gate 0 --auto-submit --out checkout.html
```

Exit codes are `0` for completed command work, `1` for input/configuration, `2` for a PayWay API rejection, and `3` for network, rate-limit, or timeout failures. See the [one-page guide](https://github.com/antigravity-google/aba-payway-ts/blob/v1.5.0/docs/QUICK-START-1-PAGER.md) for lifecycle rules and the [documentation index](https://github.com/antigravity-google/aba-payway-ts/blob/v1.5.0/docs/README.md) for deeper guides.
