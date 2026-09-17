# First-payment reference app

A portable, self-contained web app that teaches the **complete ABA PayWay payment lifecycle** with the [`aba-payway-ts`](../../README.md) SDK: order creation with server-side pricing, online KHQR + hosted-card payment tabs, HMAC-verified callbacks, idempotent fulfillment, partial refunds, missed-callback reconciliation, and late-payment resolution.

It runs in two modes with **identical verification/reconciliation code** — only the gateway differs:

| Mode | When | What happens |
|---|---|---|
| **demo** (default) | No credentials set | A local simulator plays the gateway: same wire shapes (snake_case envelopes, base64 callback URLs, signed pushbacks with `x-payway-hmac-sha512`), clearly labelled `SIMULATED`. No network egress. |
| **sandbox** | `PAYWAY_MERCHANT_ID` + `PAYWAY_API_KEY` set | Real `PayWay` SDK client against the PayWay sandbox. Callbacks need a PayWay-reachable host (see below). |

## Quick start (demo mode — zero credentials)

```bash
npm run setup   # builds + packs the SDK from this checkout → vendor/aba-payway-ts.tgz, installs it
npm start       # http://127.0.0.1:3000
```

Open the printed URL, pick a product, and use the teaching products to drive every lifecycle branch:

| Product | What it teaches |
|---|---|
| Coffee / T-Shirt / Book | A normal order that stays PENDING until a customer acts (scan nothing, watch the countdown). |
| Approve Demo | Payment approves ~300ms after QR creation; the signed callback arrives and the order fulfills exactly once. |
| Decline Demo | The gateway declines; the order marks `declined`; a retry mints a **new** transaction ID. |
| Late Payment Demo | Stays PENDING; approve the QR then press **Close payment** — the card session completes *after* closure and the order routes to `needs_resolution` (merchant must decide: fulfill or refund — never automatic). |
| Missed Callback Demo | Approves **without delivering any callback**; only the server-side status read (the poll) discovers it — the missed-callback reconciliation path. |

Every artifact in demo mode carries a `simulated: true` flag and the UI shows a SIMULATED banner.

## Sandbox mode

For a guided local exercise, see the [first-payment walkthrough](../../docs/guides/FIRST-PAYMENT-WALKTHROUGH.md).

1. Copy `.env.example` to `.env`, fill in your sandbox merchant ID and API key, and export the variables (`PAYWAY_ENV=sandbox` optional — sandbox is the default).
2. Set `PUBLIC_BASE_URL` to a host PayWay can reach (public HTTPS; for local tunnels set `ALLOW_PRIVATE_CALLBACK_HOSTS=1` — the SDK refuses loopback callback URLs by default, for good reason).
3. `npm start` and pay with real sandbox KHQR/cards.

Sandbox caveats that this app deliberately encodes:

- **Creation is never auto-retried.** A create call that fails at the network layer has an *unknown* outcome — the transaction may exist. Reconcile the same transaction ID (status endpoint / CLI `check-transaction`) before creating another payment; the store refuses a second attempt on the same order state anyway.
- **A verified callback is a signal, not proof.** Fulfillment uses the amount and currency from a server-side `checkTransaction` read, so a pushback missing or mangling amount fields can never mis-fulfill an order.
- **Closing is not cancellation proof.** No read API ever reports CLOSED; a close kills the QR channel but a hosted-card session can still complete later (W4/H7). Late approvals route to `needs_resolution`, never auto-refund.
- **Partial refunds are quantitative.** `REFUNDED` status alone is a coarse flag; the store tracks refunded totals and only marks `refunded` at full restitution.

## What the app proves (tested)

`src/__tests__/first-payment-examples.test.ts` in the SDK repository exercises all of this through the real HTTP surface (real server, real fetch, real signed callbacks):

- Fulfillment happens **at most once** across callback, callback replay, and poll.
- Wrong amount or currency **never** fulfills an order.
- Unsigned / bad-signature / tampered notifications **never** pay an order (401 + audit event).
- Paid orders **cannot** open new payment attempts (HTTP 409); retries always mint fresh transaction IDs.
- Late payment after closure → `needs_resolution`; merchant resolves explicitly (fulfill or refund).
- Missed callbacks reconcile through server-side status reads.
- Partial refunds are quantitative; over-refunding is rejected.
- Browser-supplied amounts are impossible — prices come from the server catalog only.

## Layout

```
src/
  store.ts      order store: orders, attempts, events, idempotent fulfillment, refund totals
  payments.ts   payment engine: sandbox (real SDK) + demo (simulator) modes, callback verification
  server.ts     zero-dependency HTTP server: routes + sanitized client payloads
  main.ts       entry point: mode selection + startup banner
public/
  index.html    the UI: QR tab, hosted-card tab, lifecycle panel (no framework)
scripts/
  setup.mjs     packs the SDK from this checkout into vendor/ and installs it
```

### Data boundary

The browser receives only: sanitized order fields (`sanitizeOrderForClient`), QR strings/images, and signed hosted forms. Credentials, raw gateway responses, and store internals never cross to the client. The hosted form renders inside a sandboxed iframe (`allow-scripts allow-forms`) so gateway-origin content can't touch merchant page state.

### Portability rules (why this app exists)

- **No directory junctions.** The SDK dependency is a real tarball (`vendor/aba-payway-ts.tgz`) produced by `npm run setup`; a published version can be substituted in `package.json`.
- **No repository-relative imports.** Everything imports `aba-payway-ts` or its own `./` modules.
- **Runtime deps: one package** (`aba-payway-ts`). TypeScript runs via Node's type stripping (`node --experimental-strip-types`); tests and typechecking live in the SDK repository.
- `npm ci` + `npm start` from the tarball-installed tree — the Task 7 acceptance flow.
