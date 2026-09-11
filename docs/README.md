# PayWay Documentation

## Start Here

Follow the [quickstart](../QUICKSTART.md) to install, try the credential-free demo, and create your first sandbox payment. Read only the route you choose; the full reference is optional.

| Your next question | Read next |
|---|---|
| What is this project, and should I use SDK, CLI, or skills? | [Project introduction](../README.md) |
| How do I go from zero to a verified test payment? | [Quickstart](../QUICKSTART.md) — the canonical beginner path |
| How do I get ABA sandbox keys or configure profiles? | [Credentials and setup](./02-prerequisites-and-setup.md#how-to-get-sandbox-credentials) |
| How do I receive a callback on my development machine? | [Webhook setup](./16-webhook-setup-guide.md#quick-start) |
| How do verification and recovery work in an application? | [Runnable simulated walkthrough](./FIRST-PAYMENT-WALKTHROUGH.md) |

The [one-page lifecycle reference](./QUICK-START-1-PAGER.md) is a reminder after onboarding. Numbered chapters are topic references; you do not need to read them sequentially.

The journey is **create -> show the artifact -> verify -> fulfill once**. Creation never proves payment.

## Choose Route

| Customer experience | Guide | Readiness |
|---|---|---|
| Scan an online QR | [QR payments](./07-qr-code-handling.md) | Server credentials and a public HTTPS callback |
| Pay on a hosted page | [Web checkout](./03-web-implementation.md) | Server credentials; signed browser form POST |
| Open a shareable payment link | [Payment links](./17-payment-link.md) | Server credentials, RSA key, public HTTPS callback |

For platform details: [Native](./04-native-app-implementation.md), [WebView](./05-webview-implementation.md), [Telegram](./06-telegram-mini-app.md), [deep links](./08-deep-linking.md), [UI customization](./10-ui-customization.md).
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

Use [callbacks and webhooks](./11-callbacks-and-webhooks.md), [webhook setup](./16-webhook-setup-guide.md), and the [reference app](../examples/first-payment/README.md) for verification and idempotent fulfillment. Payment-link pushbacks are unsigned; verify them through a status lookup.

## Go Production

Follow the [deployment checklist](./13-deployment-checklist.md) and [support scope](../SUPPORT.md). Keep credentials in a server secret manager. Saved CLI profiles store plaintext credentials and are intended for protected development machines.

Use the [SDK and CLI reference](./SDK-AND-CLI-REFERENCE.md) when you need additional options, [merchant scenarios](./15-merchant-scenario-requirements.md) for broader requirements, and [account/token lifecycle](./09-link-unlink-renew-lifecycle.md) for recurring payments.

## Troubleshoot

Start with [error handling](./12-error-handling-and-debugging.md) or [setup and profiles](./02-prerequisites-and-setup.md). After a timeout, check the existing transaction ID before creating a replacement. Missing callbacks do not prove non-payment.

For recorded operations, use the opt-in [transaction journal and reconciliation](./18-transaction-journal.md). For terms and background, see [concepts](./01-overview-and-concepts.md), [glossary](./glossary.md), and [code examples](./14-appendix-code-snippets.md).

## Coding Agents

For a runnable local exercise covering artifacts, verification and recovery, use
the [first-payment walkthrough](./FIRST-PAYMENT-WALKTHROUGH.md).

Start with the [first-payment skill](../skills/aba-payway-first-payment/SKILL.md), then [webhook production](../skills/aba-payway-webhook-production/SKILL.md). Browse [all skills](../skills/README.md) or the [agent CLI guide](./AGENTIC-PAYWAY-CLI-USER-GUIDE.md) as needed.

## Maintainer and Evidence

These materials support maintenance and investigation; they are not onboarding prerequisites.

- [Contributing](../CONTRIBUTING.md), [handoff](../HANDOFF.md), [release readiness](./RELEASE-READINESS.md), [release checklist](./RELEASE_CHECKLIST.md), [versioning](./VERSIONING.md).
- [Sandbox findings](./SANDBOX-FINDINGS.md), [close-transaction evidence](./CLOSE-TRANSACTION-FINDINGS.md), [open questions](../audit-results/four-pillars/ABA-OPEN-QUESTIONS.md).
- [Error-code registry (generated)](./error-codes.json) — every `explain`-known code as versioned JSON; regenerate with `npm run gen:error-registry`.
- [Historical project status](./PROJECT_STATUS.md), [agent setup playbook](./AGENT-SETUP-PLAYBOOK.md), [callback capture recipe](./agents/callback-capture-recipe.md).
