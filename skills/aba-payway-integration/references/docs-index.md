# PayWay Documentation

## Start Here

Follow the [quickstart](quickstart.md) to install, try the credential-free demo, and create your first sandbox payment. Read only the route you choose; the full reference is optional.

| Your next question | Read next |
|---|---|
| What is this project, and should I use SDK, CLI, or skills? | Project introduction |
| How do I go from zero to a verified test payment? | [Quickstart](quickstart.md) — the canonical beginner path |
| How do I get ABA sandbox keys or configure profiles? | [Credentials and setup](setup.md#how-to-get-sandbox-credentials) |
| How do I receive a callback on my development machine? | [Webhook setup](webhook-setup.md#quick-start) |
| How do I test my callback receiver without the ABA Simulator? | [Local webhook workbench](webhook-setup.md#local-webhook-workbench) — signed fixture triggers, forwarding, resend, verify |
| How do verification and recovery work in an application? | [Runnable simulated walkthrough](first-payment-walkthrough.md) |

The [one-page lifecycle reference](quickstart-1-page.md) is a reminder after onboarding. Numbered chapters are topic references; you do not need to read them sequentially.

The journey is **create -> show the artifact -> verify -> fulfill once**. Creation never proves payment.

## Choose Route

| Customer experience | Guide | Readiness |
|---|---|---|
| Scan an online QR | [QR payments](qr-handling.md) | Server credentials and a public HTTPS callback |
| Generate offline KHQR invoice batches | [QR payments — Offline KHQR](qr-handling.md#official-aba-khqr-offline-generation-no-api-call-required) | ABA-issued KHQR fields, explicit validity, batch manifest, notification and inquiry recovery |
| Pay on a hosted page | [Web checkout](web-implementation.md) | Server credentials; signed browser form POST |
| Open a shareable payment link | [Payment links](payment-link.md) | Server credentials, RSA key, public HTTPS callback |

For platform details: [Native](native-apps.md), [WebView](webviews.md), [Telegram](telegram-mini-app.md), [deep links](deep-linking.md), [UI customization](ui-customization.md).
Offline KHQR has separate merchant configuration and notification rules; see the QR guide before choosing it.

## Verify Payment

| Lifecycle | Meaning and next action |
|---|---|
| `created` | An artifact is ready. Show it to the customer and retain the transaction ID. |
| `pending` | Payment is not yet confirmed. Query the existing transaction again. |
| `approved` | A server-side lookup or verified callback confirms approval. Match order ID, amount, and currency; fulfill once atomically. |
| `failed` | A confirmed rejection or cancellation. Inspect the reason before a fresh attempt. |
| `unknown` | Missing, ambiguous, or unsupported result. Look up the existing transaction before replacing it. |

These are first-payment terms. Legacy session `completed` and gateway statuses remain available unchanged. PRE-AUTH and REFUNDED require their domain workflows; neither is approval to fulfill a new order. Local expiry and closure do not become remote failure: gateway reads can remain PENDING. For what `close-transaction` really does per channel and the local `closed` flag policy, see [close transaction](close-transaction.md).

Use [callbacks and webhooks](callbacks-webhooks.md), [webhook setup](webhook-setup.md), and the reference app for verification and idempotent fulfillment. Payment-link pushbacks are unsigned; verify them through a status lookup.

## Go Production

For project-level integration use [merchant integration](agent-integration.md), [profile/onboarding/gates](integration-onboarding.md), [contracts/callbacks](integration-contracts.md), [UI/mobile](integration-ui.md), [advanced operations](integration-operations.md) and [receipt-to-bank evidence](integration-finance.md). Load only the selected journey. Code, fixture, sandbox, production and settlement acceptance are separate stages.

Follow the [deployment checklist](deployment-checklist.md) and [support scope](support.md). Keep credentials in a server secret manager. Saved CLI profiles store plaintext credentials and are intended for protected development machines.

Use the [SDK and CLI reference](sdk-cli-reference.md) when you need additional options, [merchant scenarios](merchant-scenarios.md) for broader requirements, [account/token lifecycle](link-lifecycle.md) for recurring payments, and [settlement, payouts, FX, and disputes](settlement-disputes.md) for what happens after the payment is approved.

## Troubleshoot

Start with [error handling](errors-and-debugging.md) or [setup and profiles](setup.md). After a timeout, check the existing transaction ID before creating a replacement. Missing callbacks do not prove non-payment.

For recorded operations, use the [transaction journal and reconciliation](transaction-journal.md) and the unified [storage service facade](storage-service.md) (one API over the journal, link tokens, and webhook captures). For terms and background, see [concepts](overview.md), glossary, and [code examples](code-snippets.md).

For API timestamps, expiry values, transaction-list windows, and callback datetime parsing, use the [API datetime and timezone reference](api-datetime-timezones.md). PayWay mixes UTC, UTC+7, epoch seconds, and naive values; apply the endpoint-specific rule instead of a global timezone assumption.

## Diagram Library

Standalone, GitHub-rendered diagrams covering the flows every integrator needs:

- Payment lifecycle — initiation → payment → return-URL vs trusted webhook → fulfillment (companion to [Chapter 3](web-implementation.md)).
- Callback flow — HMAC-verified online callback vs the unverified offline KHQR route (companion to [Chapter 11](callbacks-webhooks.md)).
- Link / unlink state machine — CoF token states and the SDK methods that transition them (companion to [Chapter 9](link-lifecycle.md)).
- Platform decision tree — which chapter for which app platform.

Each flow chapter also opens with an inline "Flow at a glance" sequence diagram (enforced by the docs acceptance bar, `src/__tests__/docs-acceptance-bar.test.ts`).

## Coding Agents

For integration into an existing merchant project, start with the
[integration journey and capability matrix](agent-integration.md)
and [Express/Next.js recipes](integration-recipes.md), supported by the
self-contained integration skill.

For a runnable local exercise covering artifacts, verification and recovery, use
the [first-payment walkthrough](first-payment-walkthrough.md).

Start with the first-payment skill, then webhook production. Browse all skills or the [agent CLI guide](agentic-cli-guide.md) as needed.

For tool-based integration without skills: expose the [MCP server](sdk-cli-reference.md#mcp-server) (`payway-sdk mcp`, read-only by default) to any MCP host, serve the offline knowledge base with `payway-sdk docs`, and point agents at the generated llms.txt index.

## Maintainer and Evidence

These materials support maintenance and investigation; they are not onboarding prerequisites.

- [Contributing](contributing.md), handoff, release readiness, release checklist, versioning, maintenance plan.
- Sandbox findings, close-transaction evidence, open questions.
- [Error-code registry (generated)](error-codes.json) — every `explain`-known code as versioned JSON; regenerate with `npm run gen:error-registry`.
- Integration gaps & consolidated ABA questions (2026-09-12 scan: what the docs cannot answer developers + the prioritized send-to-ABA list).
- Publishing-DX audit (2026-09-29) — docs/skills/AI developer-experience audit plus the webhook-vs-postman and SDK/CLI evidence dossiers (gate logs and the consumer smoke-install evidence live in `.scratch/publishing-dx-audit-2026-09-29/`; the reproducible install tree itself is gitignored).
- Historical project status: PROJECT_STATUS, [agent setup playbook](agent-setup-playbook.md), callback capture recipe.
- Competitive analyses: Stripe/Razorpay CLI + npm ecosystem audit with the P0→Wave-2 roadmap (webhook workbench shipped 2026-09-10, re-audited with live evidence), CutLuy comparison, Canadia Bank portal comparison (2026-09-11: portal-polish leader, non-runnable samples — generated per-flow diagrams and a published error-code registry are the adoptable patterns), Stripe-standard DX audit.
