# Express and Next.js payment recipes

Nine installed TypeScript assets provide service, scoped SQLite store, PayWay adapter, Express/Next handlers, exact money conversion, customer state, synthetic settlement matching and profile/gate evidence types. Copy only the needed server assets into the existing project; keep credentials and SDK code out of client bundles.

## Runtime and scope

Node >=22.12 is supported; built-in node:sqlite needs --experimental-sqlite on 22.12. SQLite is a one-host teaching adapter. Distributed/serverless merchants implement Store using their existing transactional DB, shared worker leases/endpoint budgets, migrations, backups and retention.

```ts
import { createIntegration } from './service.js';
import { SqliteStore } from './sqlite-store.js';
import { paywayGateway } from './payway-gateway.js';
const scope = { environment: 'sandbox' as const, merchantId: process.env.PAYWAY_MERCHANT_ID!, tenantId: 'merchant-tenant' };
const store = new SqliteStore('./private-payments-v2.sqlite', scope);
store.seed({ id: 'order-1', ownerId: 'customer-1', amountMinor: 300, currency: 'USD' });
const gateway = paywayGateway({
  merchantId: scope.merchantId, environment: scope.environment, apiKey: process.env.PAYWAY_API_KEY!,
  publicKeyPem: process.env.PAYWAY_RSA_PUBLIC_KEY, // Payment links require this key.
}, 'https://merchant.example/payments/callback', scope.tenantId);
const service = createIntegration(store, gateway, process.env.PAYWAY_API_KEY!);
```

Explicit scope must match the gateway. The omitted store scope is teaching-only; never use it with a real merchant. Orders, attempts, receipts, inbox and jobs use scoped keys. Every attempt snapshots trusted owner, amount/currency and creation time. Pricing updates cannot rewrite an existing submitted obligation.

**Recipe 1.1 migration:** amountMinor is USD cents and **whole KHR**, not hundredths of KHR. USD 3.01 is 301; KHR 301 is 301. Invalid precision/nonfinite/unsafe/negative prices fail without rounding. Existing teaching schema files require reviewed migration to version 2; startup refuses old schema rather than deleting records. Back up and preserve historical attempts/receipts. This changes recipe assets, not the public SDK API.

## Express

```ts
import express from 'express';
import { integrationRouter } from './express.js';
app.use(express.json({ limit: '64kb' }));
app.use(integrationRouter(service, req => req.user?.id));
```

Adapt to the existing authenticated request type. Allow provider callbacks without a customer session; protect create/status routes and apply the application's CSRF/session policy. POST /payments/create/qr, /hosted or /link with only {orderId}. Ignore client prices/user IDs. GET /payments/status/:attemptId returns owned persisted state **without provider calls**.

Callbacks durably enqueue a validated hint before responding. Default ACK is HTTP 200 text RECEIVEOK; a third factory parameter can override {status,body} after confirming the actual service/profile contract. ACK failure must not report successful acceptance. Default is dated-guidance based, not fresh bank verification. Bound callback bodies/queues at the actual deployment edge.

## Next.js

Remove .js from local TypeScript import specifiers when copying to Next's bundler; retain the SDK package import. Initialize once in a shared server module, never seed on each request.

```ts
import { nextIntegration } from './next';
const handlers = nextIntegration(service, async request => {
  const session = await existingSessionResolver(request);
  return session?.user.id;
});
// app/api/payments/qr/route.ts (also hosted/link)
export const runtime = 'nodejs';
export const POST = handlers.create('qr');
// callback route: export const POST = handlers.callback;
// owned GET route delegates to handlers.status(request, attemptId).
```

This uses the existing project session resolver; it does not implement login. Enforce body/queue limits in Next's deployed server/edge. A local SQLite file cannot coordinate multiple serverless hosts; replace Store accordingly.

## Verification and customer state

Creation returns only attemptId and the selected QR string, signed hosted form HTML or public link URL. Serve a hosted signed form as an owned browser document for POST to PayWay; it is not saved gateway HTML in an iframe.

Status separates rawStatus, verified payment status, verification outcome and fulfillmentQueued. REVIEW is returned for rejected identity/money/currency evidence. Repeated approval remains verified; late pending cannot downgrade a posted receipt. fulfillmentQueued means this resolver inserted a durable job, **not** that shipping/email/stock finished. It is true only on the reconciliation that inserted the job; customer GET and duplicate reconciliation return false. Use a separate field/record for durable job existence or delivery status. Use customer-state.ts and [UI/mobile acceptance](../../knowledge/integration-ui.md) for safe messaging/actions.

Callback identity must match the saved route/reference. Paid callback replays are durably recorded without reopening active inquiry. Late create completion/error cannot overwrite a worker's committed paid/review decision or clear review recovery. Always read persisted verified state before displaying a restored payment interaction.

Persist before submission. Repeating a create restores the existing ready artifact; pending/unknown/review cannot create a replacement. A deliberate create after authoritative DECLINED makes a new attempt and retains history. Local countdown/close/browser cancellation alone never unlocks another charge. Additional genuine late receipts are retained with one order fulfillment and an explicit additional-receipt review outcome.

## Worker and inquiry

```ts
// Existing scheduled backend worker; do not expose as a public customer action.
for (const id of service.pending()) {
  try { await service.reconcile(id); }
  catch { /* retain queued; back off and diagnose masked errors; never recreate */ }
}
```

The merchant scheduler must apply a bounded processing window, jitter/backoff and distributed lease/budget. The service coalesces concurrent lookup for one attempt in one process. Customer polling only reads durable state.

For QR/hosted, use Check Transaction during its seven-day window. Pending/declined need no historical detail. An approved current result lacks original currency, so paced detail enriches identity/original currency/amount before acceptance. Old attempts use detail directly. The adapter spaces detail calls conservatively per process; shared MID/endpoint limits across hosts require shared coordination. Verified core payments stop active inquiry; refunds/holds/settlement use separate operation workflows.

A lost create retains its saved ID and never resubmits. A lost link response may lack data.id: recover with ABA/merchant records; no made-up query or new replacement link. Every attempt is already queued, so missing callbacks do not prevent recovery.

## Payment-link limit

The adapter queries the saved link ID/reference, requires exactly one completed payment, zero refunds and matching original total/currency. It ignores unsigned notification amount/status. Its link-total receipt key is an internal aggregate identity, **not a gateway receipt ID or bank settlement proof**. Reusable links, partial/discounted payments and excess receipts need their own ledger/association contract.

## Evidence, finance and production

Use evidence.ts to create masked profiles and gate records with timezone-aware ISO timestamps; passed gates need evidence, G5/G6 need production evidence and ABA's approved rule. settlement.ts requires a nonempty merchant-normalized synthetic batch, explicit scope/operation/batch/currency and bank reference, deduplicates identical rows and rejects conflicting rows. It does not retrieve ABA reports, prove export completeness or implement currency conversion. Read [finance evidence](../../knowledge/integration-finance.md).

SQLite version 2 demonstrates durable scoped attempts, receipt posting, inbox/reconciliation and one outbox job. It is not a complete production ledger, schema migration, token vault, refund/capture/payout adapter, retention system, worker lease or exactly-once external fulfillment. Follow [advanced controls](../../knowledge/integration-operations.md) when the selected flow needs them.

## Acceptance

Test all three routes in Express/Next with owned server prices; signed/unsigned policies; malformed/unknown/tampered callbacks; mismatched approval returning REVIEW; repeated/late evidence; immutable price; safe decline replacement; unknown-no-replay; currency scales; scoped isolation; restart/concurrent receipt/outbox; local customer reads; current-versus-history routing; confirmed ACK and durable-failure behavior.

Add relevant UI/device/advanced/finance scenarios. Fixture, handler and synthetic signing checks prove local behavior only. Real sandbox/production/settlement stages remain unrun until explicitly executed under their approved contracts.
