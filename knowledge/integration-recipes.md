# Express and Next.js payment recipes

The integration skill includes five source assets: service, SQLite teaching store, PayWay adapter, Express router and Next.js handler factory. Copy them into the merchant's server directory and adapt its authenticated session resolver and database. Keep all imports/server credentials outside client bundles.

## Runtime and installation

Use the existing supported Node runtime (>=22.12), TypeScript, and the reviewed SDK package. The SQLite teaching store uses Node's built-in `node:sqlite`; Node 22.12 requires `--experimental-sqlite`. It is optional: implement the Store interface with the project's existing transactional database for production, particularly distributed/serverless deployments. No new SDK/MCP public API is required.

```ts
import { createIntegration } from './service.js';
import { SqliteStore } from './sqlite-store.js';
import { paywayGateway } from './payway-gateway.js';

const store = new SqliteStore('./private-payments.sqlite');
// Seed from the server's catalog for a local test; production loads existing orders.
store.seed({ id: 'order-1', ownerId: 'customer-1', amountMinor: 300, currency: 'USD' });
const gateway = paywayGateway({
  merchantId: process.env.PAYWAY_MERCHANT_ID!,
  apiKey: process.env.PAYWAY_API_KEY!,
  environment: 'sandbox',
  // Required for payment links; omit for QR/hosted-only applications.
  publicKeyPem: process.env.PAYWAY_RSA_PUBLIC_KEY,
}, 'https://merchant.example/payments/callback');
const service = createIntegration(store, gateway, process.env.PAYWAY_API_KEY!);
```

Store prices as integer minor units in this recipe only; the adapter converts to PayWay decimal currency amounts. Do not send minor-unit integers directly to the PayWay API. The sample currency set is USD/KHR.

## Express

Mount after JSON parsing and the application's existing authentication middleware:

```ts
import express from 'express';
import { integrationRouter } from './express.js';
app.use(express.json({ limit: '64kb' }));
app.use(integrationRouter(service, req => req.user?.id));
```

Adapt the resolver's request type to the project's authenticated Express request type; the example does not implement login. The middleware must allow provider callbacks through without a customer session while protecting create/status routes.

POST `/payments/create/qr`, `/payments/create/hosted` or `/payments/create/link` with only `{orderId}`. Browser-supplied price/user IDs are ignored. GET `/payments/status/:attemptId` checks ownership and queries PayWay. POST `/payments/callback` accepts a verified delivery into the inbox and schedules reconciliation, returning HTTP 202.

## Next.js App Router

The assets use NodeNext `.js` relative import specifiers for compiled Express
applications. When copying TypeScript sources into Next.js, remove `.js` from
their local relative imports (for example `./service.js` becomes `./service`),
including imports in the shared initialization module. Keep the SDK package
import unchanged. Next's bundler resolves those local TypeScript files directly.

```ts
import { nextIntegration } from './next.js';
const handlers = nextIntegration(service, async request => {
  const session = await existingSessionResolver(request);
  return session?.user.id;
});
// app/api/payments/qr/route.ts (choose hosted/link for those endpoints)
export const runtime = 'nodejs';
export const POST = handlers.create('qr');
// app/api/payments/callback/route.ts
// export const POST = handlers.callback;
// An authenticated status route delegates to handlers.status(request, attemptId).
```

Use a shared server module to initialize the service. Do not initialize or reseed SQLite on every request. Next dev hot reload can recreate modules; production serverless instances cannot share a local SQLite file reliably. Use the existing merchant database in those deployments.

## Customer interaction

Return only `{attemptId, artifact}`, never the SDK's raw response. A QR artifact contains its QR string. A link artifact contains the hosted URL. For hosted checkout, serve the returned signed form HTML as a browser document so it submits to PayWay; it is not an iframe of a saved gateway page. Avoid exposing it through an unauthenticated arbitrary-order endpoint.

Creation does not mark an order paid. Maintain an authenticated status screen while a worker performs inquiry. The status result reuses SDK paymentLifecycle/paymentNextStep; approval still requires the stored identity, amount and currency checks. The SQLite adapter holds a unique fulfillment outbox row; the merchant's worker performs its actual shipping/email/stock update idempotently using the order ID as its downstream key.

## Durable recovery and worker

```ts
// Run in the merchant's existing scheduled worker; handle failures per attempt.
for (const id of service.pending()) {
  try { await service.reconcile(id); }
  catch { /* keep queued; retry inquiry with endpoint pacing, never create */ }
}
```

An unknown create returns its saved attempt ID and never resubmits on a duplicate create request. Reconcile QR/hosted by that ID. A payment-link create timeout can leave the link ID unknown; recover through merchant records/ABA rather than guessing a paid transaction ID or creating another link. Every created attempt is queued for inquiry, so missing callbacks do not prevent recovery. Retain the merchant's own pacing and local expiry policy; PENDING never proves a live QR.

For link payments the adapter inquires by the saved link ID and requires the returned ID/reference and currency to match the saved order. It supports one payment per exact-price link, requires exactly one completed transaction and zero refunds, and compares gross collected amount. It never trusts the unsigned body's amount/status/transaction association. Multi-payment links, discounts and partial payments require their domain reconciliation rules, not this one-order recipe.

The SQLite adapter is durable on a single host, with transactional inbox/reconciliation insertion and a unique fulfillment job per order. It does not implement a production database migration, retention, worker leasing or exactly-once external side effects. For production use the merchant's DB transactions, unique constraints, backups, bounded callback body/queues and idempotent worker.

## Acceptance scenarios

- All three flows in Express and Next.js, using server prices and actual session ownership.
- Unknown order, another user's order, unauthenticated create/status; no provider call or fulfillment.
- Callback signature invalid/missing, malformed/unknown reference, pending/declined/refunded/PRE-AUTH, wrong original amount/currency; no fulfillment.
- A link's unsigned forged notification; only a paid inquiry of the saved link can fulfill.
- Create timeout, process restart, concurrent duplicate notifications and concurrent inquiry; one saved attempt and one durable fulfillment job.
- Lost callback recovered by inquiry; received callback acknowledged without waiting for slow provider inquiry.
- SDK-backed synthetic fetch adapter: signed QR request, hosted form field generation, RSA payment-link request and trusted inquiry projections; no gateway payment is implied.

Use synthetic credentials/providers for offline checks and label them simulated. A successful simulation is not a gateway test. The merchant's own sandbox paid cycles, enabled-profile checks and go-live review remain required.
