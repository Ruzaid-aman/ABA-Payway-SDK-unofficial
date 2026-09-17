# PayWay Documentation

## Start Here

Follow the [quickstart](../QUICKSTART.md) to install, try the credential-free demo, and create your first sandbox payment. Read only the route you choose; the full reference is optional.

| Your next question | Read next |
|---|---|
| What is this project, and should I use SDK, CLI, or skills? | [Project introduction](../README.md) |
| How do I go from zero to a verified test payment? | [Quickstart](../QUICKSTART.md) — the canonical beginner path |
| How do I get ABA sandbox keys or configure profiles? | [Credentials and setup](./guides/02-prerequisites-and-setup.md#how-to-get-sandbox-credentials) |
| How do I receive a callback on my development machine? | [Webhook setup](./guides/16-webhook-setup-guide.md#quick-start) |
| How do I test my callback receiver without the ABA Simulator? | [Local webhook workbench](./guides/16-webhook-setup-guide.md#local-webhook-workbench) — signed fixture triggers, forwarding, resend, verify |
| How do verification and recovery work in an application? | [Runnable simulated walkthrough](./guides/FIRST-PAYMENT-WALKTHROUGH.md) |

The [one-page lifecycle reference](./guides/QUICK-START-1-PAGER.md) is a reminder after onboarding. Numbered chapters are topic references; you do not need to read them sequentially.

The journey is **create -> show the artifact -> verify -> fulfill once**. Creation never proves payment.

## Choose Route

| Customer experience | Guide | Readiness |
|---|---|---|
| Scan an online QR | [QR payments](./guides/07-qr-code-handling.md) | Server credentials and a public HTTPS callback |
| Generate offline KHQR invoice batches | [QR payments — Offline KHQR](./guides/07-qr-code-handling.md#official-aba-khqr-offline-generation-no-api-call-required) | ABA-issued KHQR fields, explicit validity, batch manifest, notification and inquiry recovery |
| Pay on a hosted page | [Web checkout](./guides/03-web-implementation.md) | Server credentials; signed browser form POST |
| Open a shareable payment link | [Payment links](./guides/17-payment-link.md) | Server credentials, RSA key, public HTTPS callback |

For platform details: [Native](./guides/04-native-app-implementation.md), [WebView](./guides/05-webview-implementation.md), [Telegram](./guides/06-telegram-mini-app.md), [deep links](./guides/08-deep-linking.md), [UI customization](./guides/10-ui-customization.md).
Offline KHQR has separate merchant configuration and notification rules; see the QR guide before choosing it.

## Verify Payment

| Lifecycle | Meaning and next action |
|---|---|
| `created` | An artifact is ready. Show it to the customer and retain the transaction ID. |
| `pending` | Payment is not yet confirmed. Query the existing transaction again. |
| `approved` | A server-side lookup or verified callback confirms approval. Match order ID, amount, and currency; fulfill once atomically. |
| `failed` | A confirmed rejection or cancellation. Inspect the reason before a fresh attempt. |
| `unknown` | Missing, ambiguous, or unsupported result. Look up the existing transaction before replacing it. |

These are first-payment terms. Legacy session `completed` and gateway statuses remain available unchanged. PRE-AUTH and REFUNDED require their domain workflows; neither is approval to fulfill a new order. Local expiry and closure do not become remote failure: gateway reads can remain PENDING.

Use [callbacks and webhooks](./guides/11-callbacks-and-webhooks.md), [webhook setup](./guides/16-webhook-setup-guide.md), and the [reference app](../examples/first-payment/README.md) for verification and idempotent fulfillment. Payment-link pushbacks are unsigned; verify them through a status lookup.

## Go Production

Follow the [deployment checklist](./guides/13-deployment-checklist.md) and [support scope](../SUPPORT.md). Keep credentials in a server secret manager. Saved CLI profiles store plaintext credentials and are intended for protected development machines.

Use the [SDK and CLI reference](./reference/SDK-AND-CLI-REFERENCE.md) when you need additional options, [merchant scenarios](./guides/15-merchant-scenario-requirements.md) for broader requirements, [account/token lifecycle](./guides/09-link-unlink-renew-lifecycle.md) for recurring payments, and [settlement, payouts, FX, and disputes](./guides/20-settlement-and-disputes.md) for what happens after the payment is approved.

## Troubleshoot

Start with [error handling](./guides/12-error-handling-and-debugging.md) or [setup and profiles](./guides/02-prerequisites-and-setup.md). After a timeout, check the existing transaction ID before creating a replacement. Missing callbacks do not prove non-payment.

For recorded operations, use the [transaction journal and reconciliation](./guides/18-transaction-journal.md) and the unified [storage service facade](./guides/21-storage-service.md) (one API over the journal, link tokens, and webhook captures). For terms and background, see [concepts](./guides/01-overview-and-concepts.md), [glossary](./reference/glossary.md), and [code examples](./guides/14-appendix-code-snippets.md).

For API timestamps, expiry values, transaction-list windows, and callback datetime parsing, use the [API datetime and timezone reference](./guides/22-api-datetime-and-timezones.md). PayWay mixes UTC, UTC+7, epoch seconds, and naive values; apply the endpoint-specific rule instead of a global timezone assumption.

## Diagram Library

Standalone, GitHub-rendered diagrams covering the flows every integrator needs:

- [Payment lifecycle](./diagrams/payment-lifecycle.md) — initiation → payment → return-URL vs trusted webhook → fulfillment (companion to [Chapter 3](./guides/03-web-implementation.md)).
- [Callback flow](./diagrams/callback-flow.md) — HMAC-verified online callback vs the unverified offline KHQR route (companion to [Chapter 11](./guides/11-callbacks-and-webhooks.md)).
- [Link / unlink state machine](./diagrams/link-unlink-state-machine.md) — CoF token states and the SDK methods that transition them (companion to [Chapter 9](./guides/09-link-unlink-renew-lifecycle.md)).
- [Platform decision tree](./diagrams/platform-decision-tree.md) — which chapter for which app platform.

Each flow chapter also opens with an inline "Flow at a glance" sequence diagram (enforced by the docs acceptance bar, `src/__tests__/docs-acceptance-bar.test.ts`).

## Coding Agents

For a runnable local exercise covering artifacts, verification and recovery, use
the [first-payment walkthrough](./guides/FIRST-PAYMENT-WALKTHROUGH.md).

Start with the [first-payment skill](../skills/aba-payway-first-payment/SKILL.md), then [webhook production](../skills/aba-payway-webhook-production/SKILL.md). Browse [all skills](../skills/README.md) or the [agent CLI guide](./guides/AGENTIC-PAYWAY-CLI-USER-GUIDE.md) as needed.

For tool-based integration without skills: expose the [MCP server](./reference/SDK-AND-CLI-REFERENCE.md#mcp-server) (`payway-sdk mcp`, read-only by default) to any MCP host, serve the offline knowledge base with `payway-sdk docs`, and point agents at the generated [llms.txt](../llms.txt) index.

## Maintainer and Evidence

These materials support maintenance and investigation; they are not onboarding prerequisites.

- [Contributing](../CONTRIBUTING.md), [handoff](../HANDOFF.md), [release readiness](./project/RELEASE-READINESS.md), [release checklist](./project/RELEASE_CHECKLIST.md), [versioning](./project/VERSIONING.md), [maintenance plan](./project/MAINTENANCE.md).
- [Sandbox findings](./internal/SANDBOX-FINDINGS.md), [close-transaction evidence](./internal/CLOSE-TRANSACTION-FINDINGS.md), [open questions](../audit-results/four-pillars/ABA-OPEN-QUESTIONS.md).
- [Error-code registry (generated)](./error-codes.json) — every `explain`-known code as versioned JSON; regenerate with `npm run gen:error-registry`.
- [Integration gaps & consolidated ABA questions](./internal/INTEGRATION-GAPS-AND-ABA-QUESTIONS.md) (2026-09-12 scan: what the docs cannot answer developers + the prioritized send-to-ABA list).
- Historical project status: [PROJECT_STATUS](./project/PROJECT_STATUS.md), [agent setup playbook](./guides/AGENT-SETUP-PLAYBOOK.md), [callback capture recipe](./recipes/callback-capture-recipe.md).
- Competitive analyses: [Stripe/Razorpay CLI + npm ecosystem audit with the P0→Wave-2 roadmap](./strategy/competitive-analysis-cli-stripe-razorpay.md) (webhook workbench shipped 2026-09-10, re-audited with live evidence), [CutLuy comparison](./strategy/competitive-analysis-cutluy.md), [Canadia Bank portal comparison](./strategy/competitive-analysis-canadia.md) (2026-09-11: portal-polish leader, non-runnable samples — generated per-flow diagrams and a published error-code registry are the adoptable patterns), [Stripe-standard DX audit](./strategy/STRIPE-STANDARD-DX-AUDIT.md).