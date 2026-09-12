# PayWay Documentation

## Start Here

Follow the [quickstart](payway-sdk docs quickstart) to install, try the credential-free demo, and create your first sandbox payment. Read only the route you choose; the full reference is optional.

| Your next question | Read next |
|---|---|
| What is this project, and should I use SDK, CLI, or skills? | Project introduction |
| How do I go from zero to a verified test payment? | [Quickstart](payway-sdk docs quickstart) — the canonical beginner path |
| How do I get ABA sandbox keys or configure profiles? | [Credentials and setup](payway-sdk docs setup) |
| How do I receive a callback on my development machine? | [Webhook setup](payway-sdk docs webhook-setup) |
| How do I test my callback receiver without the ABA Simulator? | [Local webhook workbench](payway-sdk docs webhook-setup) — signed fixture triggers, forwarding, resend, verify |
| How do verification and recovery work in an application? | [Runnable simulated walkthrough](payway-sdk docs first-payment-walkthrough) |

The [one-page lifecycle reference](payway-sdk docs quickstart-1-page) is a reminder after onboarding. Numbered chapters are topic references; you do not need to read them sequentially.

The journey is **create -> show the artifact -> verify -> fulfill once**. Creation never proves payment.

## Choose Route

| Customer experience | Guide | Readiness |
|---|---|---|
| Scan an online QR | [QR payments](payway-sdk docs qr-handling) | Server credentials and a public HTTPS callback |
| Generate offline KHQR invoice batches | [QR payments — Offline KHQR](payway-sdk docs qr-handling) | ABA-issued KHQR fields, explicit validity, batch manifest, notification and inquiry recovery |
| Pay on a hosted page | [Web checkout](payway-sdk docs web-implementation) | Server credentials; signed browser form POST |
| Open a shareable payment link | [Payment links](payway-sdk docs payment-link) | Server credentials, RSA key, public HTTPS callback |

For platform details: [Native](payway-sdk docs native-apps), [WebView](payway-sdk docs webviews), [Telegram](payway-sdk docs telegram-mini-app), [deep links](payway-sdk docs deep-linking), [UI customization](payway-sdk docs ui-customization).
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

Use [callbacks and webhooks](payway-sdk docs callbacks-webhooks), [webhook setup](payway-sdk docs webhook-setup), and the reference app for verification and idempotent fulfillment. Payment-link pushbacks are unsigned; verify them through a status lookup.

## Go Production

Follow the [deployment checklist](payway-sdk docs deployment-checklist) and support scope. Keep credentials in a server secret manager. Saved CLI profiles store plaintext credentials and are intended for protected development machines.

Use the [SDK and CLI reference](payway-sdk docs sdk-cli-reference) when you need additional options, [merchant scenarios](payway-sdk docs merchant-scenarios) for broader requirements, [account/token lifecycle](payway-sdk docs link-lifecycle) for recurring payments, and [settlement, payouts, FX, and disputes](payway-sdk docs settlement-disputes) for what happens after the payment is approved.

## Troubleshoot

Start with [error handling](payway-sdk docs errors-and-debugging) or [setup and profiles](payway-sdk docs setup). After a timeout, check the existing transaction ID before creating a replacement. Missing callbacks do not prove non-payment.

For recorded operations, use the opt-in [transaction journal and reconciliation](payway-sdk docs transaction-journal). For terms and background, see [concepts](payway-sdk docs overview), glossary, and [code examples](payway-sdk docs code-snippets).

## Diagram Library

Standalone, GitHub-rendered diagrams covering the flows every integrator needs:

- Payment lifecycle — initiation → payment → return-URL vs trusted webhook → fulfillment (companion to [Chapter 3](payway-sdk docs web-implementation)).
- Callback flow — HMAC-verified online callback vs the unverified offline KHQR route (companion to [Chapter 11](payway-sdk docs callbacks-webhooks)).
- Link / unlink state machine — CoF token states and the SDK methods that transition them (companion to [Chapter 9](payway-sdk docs link-lifecycle)).
- Platform decision tree — which chapter for which app platform.

Each flow chapter also opens with an inline "Flow at a glance" sequence diagram (enforced by the docs acceptance bar, `src/__tests__/docs-acceptance-bar.test.ts`).

## Coding Agents

For a runnable local exercise covering artifacts, verification and recovery, use
the [first-payment walkthrough](payway-sdk docs first-payment-walkthrough).

Start with the [first-payment skill](../skills/aba-payway-first-payment/SKILL.md), then [webhook production](../skills/aba-payway-webhook-production/SKILL.md). Browse [all skills](../skills/README.md) or the [agent CLI guide](payway-sdk docs agentic-cli-guide) as needed.

## Maintainer and Evidence

These materials support maintenance and investigation; they are not onboarding prerequisites.

- Contributing, handoff, release readiness, release checklist, versioning.
- Sandbox findings, [close-transaction evidence](payway-sdk docs close-transaction-findings), open questions.
- [Error-code registry (generated)](payway-sdk docs error-codes) — every `explain`-known code as versioned JSON; regenerate with `npm run gen:error-registry`.
- Integration gaps & consolidated ABA questions (2026-09-12 scan: what the docs cannot answer developers + the prioritized send-to-ABA list).
- Historical project status, [agent setup playbook](payway-sdk docs agent-setup-playbook), callback capture recipe.
- Competitive analyses: Stripe/Razorpay CLI + npm ecosystem audit with the P0→Wave-2 roadmap (webhook workbench shipped 2026-09-10, re-audited with live evidence), CutLuy comparison, Canadia Bank portal comparison (2026-09-11: portal-polish leader, non-runnable samples — generated per-flow diagrams and a published error-code registry are the adoptable patterns), Stripe-standard DX audit.
