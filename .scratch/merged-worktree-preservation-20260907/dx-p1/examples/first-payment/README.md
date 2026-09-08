# ABA PayWay first-payment reference app

This standalone Node.js example teaches the full payment lifecycle with online QR and hosted-card routes. It keeps pricing and credentials on the server, persists orders and payment attempts, verifies value before fulfillment, applies fulfillment once, blocks duplicate creates after an ambiguous outcome, and sends late approvals to merchant resolution.

## Run the credential-free demo

```bash
npm ci
npm start
```

Open `http://127.0.0.1:3000`. Demo mode is the default and does not import the SDK, load ABA credentials, or contact an external payment network.

The demo lets you:

- create a server-priced order;
- choose online QR or hosted card;
- observe `PENDING` before simulated approval;
- reconcile a missed callback;
- see fulfillment remain at one when verification repeats;
- record a partial refund;
- close locally and route a later approval to `RESOLUTION_REQUIRED`.

Order state is stored atomically in `data/orders.json`. The file is plaintext and is excluded from Git. Replace the JSON store with your transactional database before production use.

## Run against ABA sandbox

The SDK is not yet published, so it is not pinned in this example's lockfile. Install the official package after release or a tarball built from a trusted checkout:

```bash
npm install aba-payway-ts
```

For a local release candidate:

```bash
# In the SDK checkout
npm run build
npm pack

# In this example directory; adjust the tarball path if needed
npm install ../../aba-payway-ts-1.5.0.tgz
```

Copy `.env.example` to `.env`, load it with your deployment environment or shell, and set:

```dotenv
PAYWAY_EXAMPLE_MODE=sandbox
PAYWAY_ENV=sandbox
PAYWAY_MERCHANT_ID=your-merchant-id
PAYWAY_API_KEY=your-api-key
PUBLIC_BASE_URL=https://your-public-host.example
```

`PUBLIC_BASE_URL` must be the public HTTPS origin registered for your ABA sandbox profile. The online callback route is `/api/payway/callback`. This example uses the documented `X-PAYWAY-HMAC-SHA512` header and removes any body `hash` before SDK verification.

## Safety contracts shown in code

- The browser submits only `productId`; [`src/order-store.ts`](./src/order-store.ts) owns price and currency.
- [`src/payment-service.ts`](./src/payment-service.ts) stores a `SUBMITTING` attempt before the create call. A network or timeout error becomes `PAYMENT_OUTCOME_UNKNOWN`, which blocks another create until reconciliation.
- [`src/app.ts`](./src/app.ts) returns sanitized payment artifacts. It never returns credentials, signatures, or raw PayWay responses.
- A signed online callback and a status/detail lookup may fulfill. `/api/payway/khqr-notification` is captured as unverified and cannot mark an order paid because offline ABA KHQR notification semantics are separate.
- Approved payments must match the stored transaction, amount, and currency. Fulfillment and refund IDs are idempotent.
- Local closure is advisory. A later approval becomes `RESOLUTION_REQUIRED`; the app does not auto-refund it.

## Verify the example

```bash
npm test
npm run build
```

The lifecycle suite covers callback replay, repeated status reconciliation, amount and currency mismatch, unverified notification, ambiguous submission, late approval after closure, partial/full refund, and durable reload.

This is reference code for learning and adaptation. Before production, use a transactional database, authenticated merchant operations, CSRF protection, structured observability, a durable job queue, and your own inventory/fulfillment transaction.
