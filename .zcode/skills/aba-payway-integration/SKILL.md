---
name: aba-payway-integration
description: Integrate, test, review, or troubleshoot ABA PayWay in a merchant project. Inspect existing orders, authentication and storage; select the payment flow; implement server-side verification, fulfillment and recovery. TypeScript/JavaScript recipes cover Express and Next.js. Use workflow-specific references for COF, subscriptions, QR, refunds, payouts and partner capabilities.
metadata:
  version: 1.0.0
---

# ABA PayWay Merchant Integration

Community-maintained guidance for merchant coding agents. This skill is usable by itself; references and recipe assets are included. Other languages receive documented API guidance, not a claim of tested language support. MCP is optional.

## Quick Start

Inspect the project before changing it: framework/runtime, existing payment providers, server-owned orders/prices, authentication, database transactions, workers, and test commands. Keep the merchant's architecture and explicit choices. Infer what is available; ask only about unresolved choices that affect the integration.

Read [integration journey and capability matrix](references/agent-integration.md). Select one flow and read its references; do not load the whole library.

| Merchant need | Read |
|---|---|
| Online QR | [QR handling](references/qr-handling.md) |
| Browser hosted checkout | [Web implementation](references/web-implementation.md) |
| Shareable payment link | [Payment link](references/payment-link.md) |
| Offline KHQR / printed Customer QR | [QR handling](references/qr-handling.md), [Customer QR](references/customer-module-qr.md) |
| Link account/card, token lifecycle, recurring charges | [COF](references/link-lifecycle.md), relevant operation in [SDK/CLI reference](references/sdk-cli-reference.md) |
| Refund / pre-auth / payout / beneficiary / split | Relevant operation in [SDK/CLI reference](references/sdk-cli-reference.md), [settlement boundaries](references/settlement-disputes.md) |
| Status, recovery, reconciliation | [Journal](references/transaction-journal.md), [Customer QR](references/customer-module-qr.md), [closure policy](references/close-transaction.md) |
| Soundbox / partner activation / exchange rate | Relevant operation in [SDK/CLI reference](references/sdk-cli-reference.md) and the capability matrix |
| Mobile or webview presentation | [Native guidance](references/native-apps.md), [webviews](references/webviews.md), [deep links](references/deep-linking.md); native SDKs are not validated by these TS recipes |

For a new project read [setup](references/setup.md) and [quickstart](references/quickstart.md). For implementation read [framework recipes](references/integration-recipes.md) and [callbacks](references/callbacks-webhooks.md). Copy and adapt only the assets needed for the selected flow.

```sh
# After installing a reviewed tarball, or the approved published package:
npm exec -- payway-sdk skills add codex --only aba-payway-integration
npm exec -- payway-sdk skills doctor --agent codex
npm exec -- payway-sdk docs agent-integration
```

## Implement and Verify

- Keep SDK calls, signing keys and raw gateway responses on the server. Retrieve price/currency and authorize order ownership there. Return only the customer's QR, signed hosted form or hosted link.
- Save a unique attempt before submission. Gateway transaction IDs are not idempotency keys. After a lost response, query the saved attempt; never blindly repeat a charge/create.
- Use confirmed SDK symbols and endpoint-specific units/field shapes from the local reference. Do not invent APIs or port another provider's signing/retry rules.
- Signed online callbacks use SDK verification. Payment-link and offline/printed KHQR notifications are unsigned hints; query PayWay and bind the result to the saved order. Redirects and missing callbacks prove nothing.
- Compare the original transaction currency and amount due with the stored order; payer debit can differ in currency. PRE-AUTH is not captured payment. Durably record acceptance and enqueue fulfillment atomically with a unique order/job constraint.
- Reconcile missing callbacks and uncertain outcomes. Remote PENDING is not proof of a live QR; expiry/closure also need local order policy.
- Use the merchant's test commands, then [recipe acceptance scenarios](references/integration-recipes.md). Distinguish simulated/offline tests, dated sandbox evidence, blocked enablement, and production prerequisites.

Finish with changed files, executed checks, unresolved blockers and the next concrete action. For deployment read [go-live checklist](references/deployment-checklist.md). Installing a skill does not authorize gateway mutations, deployment or publication.

## Error Handling

Read [errors and debugging](references/errors-and-debugging.md). Gather masked errors, endpoint, attempt ID and correlation/trace IDs; use inquiry and existing CLI diagnostics before proposing another payment. Correct local validation failures; resolve gateway business rejections; respect rate limits. Treat transport failures during mutation as unknown outcomes.

Never request secrets in chat or log full request bodies. Merchant/profile enablement failures are external prerequisites, not signing bugs to work around. Report unconfirmed behavior as unconfirmed and preserve exact evidence in the merchant's private environment.
