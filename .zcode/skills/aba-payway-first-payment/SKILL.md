---
name: aba-payway-first-payment
description: Start an ABA PayWay payment, choose QR or hosted checkout or payment link, verify it, and fulfill once.
metadata:
  version: 1.4.5
---

# ABA PayWay First Payment

## Quick Start

Use this skill for one first payment. For integrating PayWay into an existing merchant project, the separate aba-payway-integration skill inspects orders, authentication and storage and provides framework recipes. Choose one route, create one payment, verify it, and explain the next action. Read the installed package's QUICKSTART.md for setup. Keep all SDK code and credentials server-side.

Run the installed CLI with `npm exec -- payway-sdk`; bare `npx payway-sdk` resolves to a different package. In a source checkout, `npx tsx src/cli.ts` is also supported.

```sh
npm exec -- payway-sdk demo --check
npm exec -- payway-sdk init --mode sandbox --template first-payment
npm exec -- payway-sdk doctor --route online-qr
```

Before the diagnostic, follow the installed QUICKSTART.md: register at [ABA sandbox signup](https://sandbox.payway.com.kh/register-sandbox/), retrieve the Merchant ID and API Key from the registration email, and set sandbox credentials. ABA's [official onboarding](https://developer.payway.com.kh/) documents email delivery. Never request that users paste secrets into chat.

Use `npm exec -- payway-sdk setup-webhook --tunnel` in a separate terminal and keep it running. Configure the complete public HTTPS callback URL. Arrange ABA PAY test access with the user's ABA contact before creating a QR; hosted card checkout uses [ABA test cards](https://developer.payway.com.kh/resources-3305682f0). The demo is simulated and does not prove gateway readiness.

Follow the quickstart's shell-specific creation commands, which retain a unique transaction ID before submission. Show the saved QR, complete the sandbox payment, then query that same ID with `check-transaction` and `transaction-detail`. Match ID, amount, and currency before fulfillment. After a timeout, recover the existing attempt instead of generating another ID and submitting again.

## Choose One Route

| Need | Start with | Guide |
|---|---|---|
| Scan a QR | `generate-qr` | [QR](../aba-payway-qr/SKILL.md) |
| Hosted checkout | `checkout-form --payment-gate 0`; browser submits the signed form | [Purchase](../aba-payway-purchase/SKILL.md) |
| Shareable link | `payment-link create`; also needs an RSA key | [Payment link](../aba-payway-payment-link/SKILL.md) |

Load only the selected route. Subscription, COF, payout, and offline KHQR are separate workflows.

For a merchant's default checkout, read the installed `integration-ui` guide (`npm exec -- payway-sdk docs integration-ui`): expose all profile-enabled methods, use **ABA KHQR** / **Scan to pay with any banking app**, require linked policies and checkbox acceptance above Pay, and use the expected web plugin popup or approved full-screen app presentation. The signed-form helper and teaching demo do not supply complete policy/brand UI or Integration Team screen approval. Configure the web success continuation/app return, and clear purchased cart contents/show confirmation only after backend verification. Obtain ABA's checkout/KHQR screen review before production credentials.

## SDK Entry

Promote the existing server-side facade:

```ts
import { sdk, paymentArtifact } from 'aba-payway-ts';

const session = await sdk.initiate(
  { transactionId: 'order-001', amount: 3, currency: 'USD', paymentOption: 'abapay_khqr' },
  { merchantId: process.env.PAYWAY_MERCHANT_ID!, apiKey: process.env.PAYWAY_API_KEY!, environment: 'sandbox' },
);
const artifact = paymentArtifact(session);
```

Return only the artifact to the authorized customer, not session.raw. Persist the order and payment-attempt ID before calling the gateway. This snippet does not implement storage or fulfillment. The facade disables automatic create retries by default.

## Lifecycle and Verification

- `created`: artifact ready; show it and check the existing transaction.
- `pending`: unconfirmed; look it up again. Expiry and closure remain local policy.
- `approved`: verified approval; match stored order ID, amount, and currency, then fulfill once atomically.
- `failed`: confirmed rejection or cancellation; inspect before a fresh attempt.
- `unknown`: lookup the existing transaction before creating a replacement.

Use `paymentLifecycle(result.data?.payment_status)` for a first-payment view of a server-side lookup. Do not pass API status.code or callback payloads. PRE-AUTH and REFUNDED require their domain workflows. Legacy session and CLI machine statuses stay unchanged.

Signed online callbacks require route-correct HMAC verification. Payment-link pushbacks have no hash and require server-side lookup; offline KHQR uses a separate notification contract (confirmed: no signature on it — inquiry is the source of truth). Callbacks are single best-effort delivery with NO guaranteed retry (ABA-confirmed 2026-09-12). Browser redirects and missing callbacks prove nothing. Follow [webhook production](../aba-payway-webhook-production/SKILL.md) before fulfillment.

For sandbox card testing use the seeded test cards: CLI `payway-sdk sandbox-test-cards` or `listSandboxTestCards()` — approved MC `5156 8399 3770 6777` and Visa `4286 0900 0000 0206` (3DS), declined cards for error paths; sandbox-only, may rotate. ABA PAY / KHQR testing needs ABA Mobile Simulator accounts from the Integration Team (PIN `1234`, secret word `TEST1`; `payway-sdk docs setup`, served offline).

## Error Handling

Correct configuration errors before retrying. A create timeout is an unknown outcome, not failure: query the saved transaction ID first. Use unique attempt IDs and a database uniqueness constraint or atomic fulfillment guard; transaction IDs alone are not gateway idempotency.

For automation use `--output json` or `ndjson` on create commands, `--json` on status commands, and explicit `-y --no-polling --no-open-image` when a one-shot QR is needed. Exit 0 is command success, not payment approval. For recorded recovery use [journal](../aba-payway-journal/SKILL.md).

## Bundled Tool

Advanced local signing: `node scripts/checkout-payload.cjs --help` from this skill directory. The CLI handles the beginner path; do not ask the user to read audits, release notes, or handoff files.
