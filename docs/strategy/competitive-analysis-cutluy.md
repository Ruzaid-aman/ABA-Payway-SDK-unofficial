# CutLuy vs ABA PayWay SDK, CLI, and Agent Skills

**Prepared:** 2026-08-21  
**Scope:** CutLuy public API documentation compared with the current `aba-payway-ts` repository.  
**Source of truth:** CutLuy's public docs were inspected directly; repository claims below are grounded in the current files. CutLuy capabilities that are not documented are treated as unknown, not absent.

## Executive conclusion

CutLuy is not beating this project on payment-domain breadth. It is beating us on the first-use experience: one resource (`payment`), one authentication concept (Bearer API key), one short create-and-pay path, a hosted checkout URL, explicit payment states, first-class webhooks, and copy-ready examples. Its documentation also teaches the user what to build around the API: QR rendering, countdowns, terminal states, polling boundaries, signature verification, and redirect behavior.

Our project is stronger as a PayWay platform toolkit: it exposes multiple PayWay domains, typed TypeScript APIs, native iOS/Android material, offline KHQR generation, sandbox probes, retry and rate-limit controls, credential profiles, a webhook development server, a test harness, and task-focused agent skills. Those capabilities are real advantages, but they are distributed across a large README, 15+ guide chapters, CLI commands, domain objects, examples, and skills. The result is capability-rich but decision-heavy.

**Strategic implication:** adopt CutLuy's opinionated entry path and documentation/product packaging without collapsing our broader PayWay coverage. The highest-return improvement is a thin “first successful payment” layer that sits above the existing SDK, CLI, and Skills.

## What CutLuy does better

### 1. It presents one coherent mental model

CutLuy says the API is organized around one resource: `payment`. The user learns create, retrieve, list, statuses, checkout, and webhooks as parts of one lifecycle. A create response immediately contains `id`, `status`, `qr_string`, `checkout_url`, timestamps, and expiry.

Our SDK exposes separate domains such as `checkout`, `qr`, `paymentLink`, `credentialsOnFile`, `preAuth`, `payout`, and `khqr`. That is appropriate for PayWay's actual surface area, but it makes the first decision harder: a new merchant must choose between checkout, QR API, payment link, offline KHQR, or another domain before seeing a working result. See [the domain overview](../guides/01-overview-and-concepts.md) and the `PayWay` façade in [src/client.ts](../../src/client.ts).

**Learning:** create a task-level abstraction, not another competing low-level domain: `payway.payments.create()` should be able to return a normalized “pay now” object while preserving access to the underlying PayWay response.

### 2. Its quickstart is shorter and outcome-oriented

CutLuy's quickstart is a small cURL request, followed by an explicit choice: redirect to `checkout_url` or render `qr_string`. It tells the user what happens after payment and where the webhook fits.

Our README has a strong security architecture and many runnable examples, but the path is longer and immediately introduces environment configuration, server-only constraints, rate limits, retries, multiple API domains, and PayWay-specific terminology. The material is useful for production readiness but not optimized for the first five minutes. See [README.md](../../README.md#quick-start) and [docs/README.md](../README.md).

**Learning:** lead with one copy-paste scenario, then progressively disclose security, configuration, provider quirks, and advanced domains.

### 3. It makes the UI handoff a first-class API result

Every CutLuy payment has a hosted, branded, mobile-friendly checkout page with QR, countdown, live status, deep links, success/failure redirects, and a documented status-state UX. It also provides a standalone SVG renderer for any valid KHQR payload, with immutable caching and validation.

Our project supports hosted checkout, QR generation, offline KHQR, examples, and a webhook setup server, but the user must assemble the UI behavior across SDK calls, examples, and documentation. The deployment checklist even identifies expiry countdowns as something the integrator must remember. See [docs/13-deployment-checklist.md](../guides/13-deployment-checklist.md) and [docs/07-qr-code-handling.md](../guides/07-qr-code-handling.md).

**Learning:** ship a canonical QR/payment presentation component or framework-neutral renderer contract with status panels, expiry, amount, currency, and accessibility guidance. Make it available through the SDK and CLI, not only as prose.

### 4. It explains the payment state machine at the point of use

CutLuy documents five statuses (`pending`, `scanned`, `paid`, `expired`, `failed`), terminality, webhook event mapping, and the rule to stop polling on terminal status. Its UI guidance explicitly warns against leaving a paid or expired QR visible.

Our docs correctly treat webhooks as the trusted source of truth and expose polling helpers, but the state model is spread across provider-specific concepts and callback guidance. See [docs/11-callbacks-and-webhooks.md](../guides/11-callbacks-and-webhooks.md) and the polling implementation in [src/cli.ts](../../src/cli.ts).

**Learning:** publish a single lifecycle diagram and a normalized status contract that is shared by SDK return types, CLI output, examples, tests, and Agent Skills.

### 5. Its docs are unusually operational for a small API

The CutLuy docs include idempotent replay behavior, webhook retry policy, resend/test-event controls, raw-body signature verification, timestamp freshness, error codes, rate-limit headers, payload caps, and concrete UI decisions. The “Copy prompt for AI” control is also a useful bridge from documentation to agent-assisted implementation.

Our project has deeper operational material—retry configuration, rate-limit throttling, sanitized diagnostics, sandbox probes, release checks, webhook storage, and a full webhook setup guide—but those features are not presented as one integrated happy path. See [README.md](../../README.md#rate-limiting-configuration), [docs/16-webhook-setup-guide.md](../guides/16-webhook-setup-guide.md), and [SECURITY.md](../../SECURITY.md).

**Learning:** add a “production behavior” panel to every major workflow: retries, idempotency, webhook source of truth, replay handling, rate limits, and failure recovery.

### 6. It is opinionated about local developer ergonomics

CutLuy supplies language tabs for cURL, Node.js, PHP/Laravel, and Python, and gives users a directly usable QR image URL. This reduces the amount of setup needed before a developer can see a result.

Our package is TypeScript-first, with backend and frontend examples plus native SDK folders, but the CLI is primarily an operational/development tool rather than a “generate an integration artifact” tool. It has strong commands such as `init`, `doctor`, profiles, QR generation, test/demo, and webhook setup; the opportunity is to connect those commands into a single guided flow. See [README.md](../../README.md#cli-commands) and [src/cli.ts](../../src/cli.ts).

## Where our project is stronger

| Dimension | Our current advantage | Evidence |
|---|---|---|
| Provider coverage | Multiple PayWay domains: checkout, QR, KHQR, payment links, payouts, pre-auth, credentials-on-file, refunds, and transaction operations | [src/client.ts](../../src/client.ts), [docs/01-overview-and-concepts.md](../guides/01-overview-and-concepts.md) |
| Type safety | Published TypeScript SDK and generated API types | [package.json](../../package.json), [src/types.ts](../../src/types.ts) |
| Reliability controls | Exponential retries, endpoint-aware throttling, rate-limit parsing, response hooks, and typed error categories | [src/client.ts](../../src/client.ts), [README.md](../../README.md#retry-configuration) |
| Local/offline capability | Offline EMVCo KHQR generation without a PayWay call | [src/khqr-offline.ts](../../src/khqr-offline.ts), [skills/aba-payway-offline-qr/SKILL.md](../../skills/aba-payway-offline-qr/SKILL.md) |
| CLI operations | Init, doctor, config, profiles, QR/checkout flows, validation, status references, webhook setup, and skill management | [src/cli.ts](../../src/cli.ts) |
| Agent assistance | A broad set of task-focused skills with quick starts, error handling, constraints, and related skills | [skills/README.md](../../skills/README.md), [skills/](../../skills) |
| Mobile/platform reach | iOS and Android SDK material plus web, WebView, and Telegram guidance | [sdk/ios/](../../sdk/ios), [sdk/android/](../../sdk/android), [docs/README.md](../README.md) |
| Verification depth | Sandbox probes, contract tests, webhook tests, coverage artifacts, and release checklists | [scripts/](../../scripts), [src/__tests__/](../../src/__tests__), [docs/RELEASE_CHECKLIST.md](../project/RELEASE_CHECKLIST.md) |

CutLuy's simplicity is partly enabled by a narrower product: USD-only documented amounts, one store/payment-link model, one primary payment resource, and a smaller set of documented operations. We should copy the packaging and defaults, not assume that reducing PayWay's real breadth is acceptable.

## Gaps and risks in CutLuy's documented solution

These are gaps in the public documentation or visible product contract, not claims about private implementation.

- No documented SDK package, CLI, or Agent Skill distribution. The docs show language snippets but do not show an installable client, generated types, project doctor, or agent workflow.
- The documented API is narrow: no refunds, payouts, pre-authorization, saved credentials, transaction detail lifecycle, or multi-provider abstraction is shown.
- `idempotency_key` is supported in the create body/header, but the public docs do not explain key retention duration, conflict behavior when the payload changes, or a formal idempotency error contract.
- Webhook delivery is well described, but the docs do not show a first-party verification helper, event deduplication recipe, event delivery log schema, or a framework-neutral receiver package.
- Pagination is not documented for `GET /v1/payments`; listing only exposes `status` and `limit`.
- The docs emphasize USD and a fixed five-minute expiry. That is friendly for the target flow but less adaptable to markets, currencies, or merchant-specific expiry requirements.
- The docs state that the SVG renderer is safe to hot-link and cached immutably, but they do not show SDK/CLI helpers for local rendering, accessibility metadata, or fallback behavior when an image service is unavailable.
- The “Copy prompt for AI” feature is promising, but the page does not describe versioning, prompt provenance, security boundaries, or how generated code stays aligned with API changes.

## Competitive opportunities for our SDK, CLI, and Agent Skills

### P0: Create a “first payment” product path

Add a top-level quickstart built around one normalized flow:

```ts
const payment = await payway.payments.create({
  amount: 1.5,
  referenceId: 'order_1024',
  presentation: 'checkout', // or 'qr'
});
```

The result should expose a stable `id`, normalized `status`, `checkoutUrl`/QR data, `expiresAt`, and a provider response escape hatch. Internally it can delegate to the best PayWay domain for the selected payment method. This is an additive façade; existing domain APIs remain available for advanced use.

Add a matching CLI command such as:

```text
payway-sdk quickstart --amount 1.50 --reference order_1024 --output json
```

It should validate credentials, print the chosen environment/profile, generate a checkout or QR artifact, show the next webhook step, and support machine-readable output. Reuse the existing `doctor`, profiles, QR, polling, and webhook components instead of creating parallel implementations.

### P0: Rebuild the docs around progressive disclosure

Make the docs landing page answer four questions in order:

1. What payment path should I choose?
2. What is the smallest working server-side example?
3. What should I render or redirect to the customer?
4. What event makes an order paid, and how do I verify it?

Keep the current deep guides as reference material. Add a comparison table for hosted checkout, online QR, offline KHQR, payment links, and advanced operations. Add language tabs or generated examples for cURL, TypeScript, Python, and PHP where the API semantics are shared.

### P1: Make the lifecycle contract portable

Define a normalized payment lifecycle document and type set used by:

- SDK result types and errors;
- CLI JSON and human output;
- webhook examples and test fixtures;
- Agent Skills;
- UI examples and QR state handling.

Include terminal states, trusted-source rules, polling guidance, duplicate-event handling, expiry, and retry semantics. This will turn our existing scattered operational knowledge into a visible product advantage.

### P1: Upgrade Agent Skills from endpoint recipes to decision support

The current skills are useful and concise, but most are endpoint-oriented: quick start, error handling, related skills. Add a small number of journey skills that choose among existing endpoints:

- `aba-payway-first-payment` — asks only for amount, currency, platform, and hosted-vs-embedded preference;
- `aba-payway-webhook-production` — produces raw-body verification, deduplication, persistence, and fulfillment guidance;
- `aba-payway-qr-ui` — generates a status-aware QR UI with expiry and accessibility behavior;
- `aba-payway-debug-integration` — maps CLI doctor output, sanitized logs, API error codes, rate limits, and webhook evidence to next actions.

Give every skill a compatibility/version field, prerequisites, expected outputs, failure modes, and links to the exact SDK/CLI command it uses. Add a tested “skill doctor” fixture that checks examples against the current public façade.

### P1: Turn the CLI into an integration workbench

The existing CLI already has the right ingredients. Improve composition and discoverability:

- `quickstart` for the first payment;
- `render-qr` for local SVG/PNG generation and inspection;
- `webhooks test`, `webhooks replay`, and `webhooks inspect` for deterministic local workflows;
- `--output json` on operational commands;
- `doctor --fix` only for safe, local, reversible setup tasks;
- a final next-step block after `init`, `generate-qr`, and `setup-webhook`.

This is where we can outperform a docs-only competitor: every documented path should be executable, inspectable, and testable locally.

### P2: Package UI and webhook primitives

CutLuy's strongest product lesson is that payment integration does not end at the API call. Provide framework-neutral primitives first—QR payload validation, SVG rendering, countdown/status model, terminal-state reducer, webhook signature verifier, and idempotent event-store interfaces—then add optional web/React/native examples. The primitives should not expose secrets or encourage client-side use of server credentials.

### P2: Add an AI handoff contract

The “Copy prompt for AI” idea is worth adopting, but make it safer and more durable. Generate a versioned prompt/skill bundle from the same API schema and examples used by the docs. Include the SDK version, supported commands, credential-safety rules, and a bounded task objective. Test the prompt against representative integration tasks so it is not merely a prose copy button.

## Recommended product positioning

> **CutLuy:** the fastest opinionated path from a KHQR payment request to a hosted customer experience.  
> **ABA PayWay SDK:** the typed, testable integration platform for the full PayWay payment lifecycle, with a fast path for the common case.

Do not position us as “more features” alone. Position us as “production breadth with a guided path.” CutLuy demonstrates that a smaller API can feel more complete when it owns the first-use journey, customer presentation, lifecycle vocabulary, and operational handoff.

## Suggested validation plan

Before implementation, benchmark both products with the same five tasks and record time, ambiguity, and number of files/commands touched:

1. Create a $1.50 KHQR payment.
2. Show a customer-safe QR/checkout experience.
3. Receive and verify a paid event.
4. Handle expiry, duplicate delivery, and a transient provider failure.
5. Ask an AI coding agent to implement the flow from the official docs.

Success should be measured by time-to-first-valid-payment, time-to-correct-webhook-handler, number of provider-specific concepts exposed, CLI commands required, and whether the resulting integration passes a contract test. This will test the real competitive gap—developer effort—rather than merely comparing endpoint counts.

## Sources and evidence

- [CutLuy API documentation](https://cutluy.com/docs#introduction) — directly inspected 2026-08-21.
- [Current SDK README](../../README.md).
- [Current SDK/domain overview](../guides/01-overview-and-concepts.md).
- [Current long-form documentation index](../README.md).
- [Current CLI](../../src/cli.ts).
- [Current TypeScript client](../../src/client.ts).
- [Current Agent Skills](../../skills/README.md).
- [Current webhook setup guide](../guides/16-webhook-setup-guide.md).

## Caveat about repository state

The checkout was already dirty when this analysis began, with unrelated modifications and untracked files. This report is a new file only; no existing user changes were intentionally modified.
